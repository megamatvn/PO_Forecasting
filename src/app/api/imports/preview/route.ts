import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildImportPreview } from "@/features/imports/server/build-preview";
import {
  ForecastSheetNotFoundError,
  ForecastSheetSelectionRequiredError,
} from "@/features/imports/server/detect-forecast-sheet";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const IMPORT_BUCKET = "po-forecast-imports";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const brandIdSchema = z.string().regex(UUID_PATTERN);

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { code, message, ...extra, correlationId: randomUUID() },
    { status },
  );
}

function safeFileName(fileName: string): string {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-160);

  return normalized || "forecast-import.xlsx";
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "type" in value &&
    typeof value.type === "string" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

function isUserFacingWorkbookError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    [
      "Không hỗ trợ",
      "Chỉ hỗ trợ",
      "Kích thước",
      "Không nhận diện được sheet kế hoạch",
    ].some((prefix) => error.message.startsWith(prefix))
  );
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "invalid_form", "Dữ liệu tải lên không hợp lệ.");
  }

  const brandIdResult = brandIdSchema.safeParse(formData.get("brandId"));
  const fileValue = formData.get("file");
  const sourceSheetNameValue = formData.get("sourceSheetName");
  const sourceSheetName = typeof sourceSheetNameValue === "string" && sourceSheetNameValue.trim()
    ? sourceSheetNameValue.trim()
    : undefined;

  if (!brandIdResult.success || !isUploadedFile(fileValue)) {
    return errorResponse(
      400,
      "invalid_request",
      "Vui lòng chọn nhãn hàng và file Excel hợp lệ.",
    );
  }

  const brandId = brandIdResult.data;
  const file = fileValue;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
  }

  const { data: canAdminister, error: permissionError } = await supabase.rpc(
    "can_administer_brand",
    { p_brand_id: brandId },
  );

  if (permissionError) {
    return errorResponse(
      500,
      "permission_check_failed",
      "Không thể kiểm tra quyền truy cập lúc này.",
    );
  }

  if (!canAdminister) {
    return errorResponse(
      403,
      "forbidden",
      "Bạn không có quyền nhập dữ liệu cho nhãn hàng này.",
    );
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, canonical_sku")
    .eq("brand_id", brandId)
    .eq("is_active", true);

  if (productsError || !products) {
    return errorResponse(
      500,
      "master_data_unavailable",
      "Không thể tải danh mục SKU của nhãn hàng.",
    );
  }

  const productIds = products.map((product) => product.id);
  const { data: aliases, error: aliasesError } = productIds.length
    ? await supabase
        .from("sku_aliases")
        .select("alias_sku, product_id")
        .in("product_id", productIds)
    : { data: [], error: null };

  if (aliasesError || !aliases) {
    return errorResponse(
      500,
      "master_data_unavailable",
      "Không thể tải bảng quy đổi SKU.",
    );
  }

  const canonicalSkuByProductId = new Map(
    products.map((product) => [product.id, product.canonical_sku]),
  );
  const aliasMap = new Map(
    products.map((product) => [product.canonical_sku, product.canonical_sku]),
  );

  for (const alias of aliases) {
    const canonicalSku = canonicalSkuByProductId.get(alias.product_id);
    if (canonicalSku) {
      aliasMap.set(alias.alias_sku, canonicalSku);
    }
  }

  let buffer: Buffer;
  let preview;

  try {
    buffer = Buffer.from(await file.arrayBuffer());
    preview = await buildImportPreview({
      buffer,
      fileName: file.name,
      sourceSheetName,
      aliases: aliasMap,
      knownCanonicalSkus: new Set(canonicalSkuByProductId.values()),
    });
  } catch (error) {
    if (error instanceof ForecastSheetSelectionRequiredError) {
      return errorResponse(409, "sheet_selection_required", error.message, {
        candidates: error.candidates,
      });
    }
    if (error instanceof ForecastSheetNotFoundError) {
      return errorResponse(422, "invalid_workbook", error.message, {
        diagnostics: error.diagnostics,
      });
    }
    if (isUserFacingWorkbookError(error)) {
      return errorResponse(422, "invalid_workbook", error.message);
    }

    return errorResponse(
      500,
      "preview_failed",
      "Không thể đọc file Excel. Vui lòng thử lại.",
    );
  }

  const { data: existingBatch, error: duplicateCheckError } = await supabase
    .from("import_batches")
    .select("id, status")
    .eq("brand_id", brandId)
    .eq("checksum", preview.checksum)
    .maybeSingle();

  if (duplicateCheckError) {
    return errorResponse(
      500,
      "duplicate_check_failed",
      "Không thể kiểm tra lịch sử nhập dữ liệu.",
    );
  }

  if (existingBatch) {
    return NextResponse.json(
      {
        code: "duplicate_import",
        message: "File này đã được nhập trước đó.",
        batchId: existingBatch.id,
        status: existingBatch.status,
      },
      { status: 409 },
    );
  }

  const storagePath = `${brandId}/${preview.checksum}/${safeFileName(file.name)}`;
  const bucket = supabase.storage.from(IMPORT_BUCKET);
  const { error: uploadError } = await bucket.upload(storagePath, buffer, {
    contentType:
      file.type ||
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });

  if (uploadError) {
    return errorResponse(
      500,
      "upload_failed",
      "Không thể lưu file nguồn. Vui lòng thử lại.",
    );
  }

  const { data: batchId, error: stagingError } = await supabase.rpc(
    "stage_import_batch",
    {
      p_brand_id: brandId,
      p_file_name: file.name,
      p_file_size: buffer.byteLength,
      p_storage_path: storagePath,
      p_checksum: preview.checksum,
      p_source_sheet_name: preview.sourceSheetName,
      p_rows: preview.rows,
      p_issues: preview.issues,
    },
  );

  if (stagingError || !batchId) {
    await bucket.remove([storagePath]);
    return errorResponse(
      500,
      "staging_failed",
      "Không thể lưu bản xem trước. File nguồn đã được thu hồi.",
    );
  }

  return NextResponse.json({ batchId, ...preview }, { status: 201 });
}
