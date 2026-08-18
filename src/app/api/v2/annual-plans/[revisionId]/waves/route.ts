import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { monthSchema } from "@/features/annual-plans/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allocationSchema = z.object({ productId: z.string().uuid(), paidQty: z.number().int().nonnegative(), focQty: z.number().int().nonnegative(), exPrice: z.string().regex(/^\d+(?:\.\d{1,6})?$/) });
const waveSchema = z.object({ id: z.string().trim().min(1), sequence: z.number().int().positive(), orderMonth: monthSchema, arrivalMonth: monthSchema, allocations: z.array(allocationSchema) });
const saveWavesSchema = z.object({ lockVersion: z.number().int().nonnegative(), waves: z.array(waveSchema).min(1), idempotencyKey: z.string().uuid() }).superRefine((value, ctx) => {
  const sequences = new Set<number>();
  const ids = new Set<string>();
  for (const [index, wave] of value.waves.entries()) {
    if (sequences.has(wave.sequence)) ctx.addIssue({ code: "custom", path: ["waves", index, "sequence"], message: "Số thứ tự đợt mua bị lặp." });
    sequences.add(wave.sequence);
    if (ids.has(wave.id)) ctx.addIssue({ code: "custom", path: ["waves", index, "id"], message: "Mã đợt mua bị lặp." });
    ids.add(wave.id);
    if (wave.arrivalMonth < wave.orderMonth) ctx.addIssue({ code: "custom", path: ["waves", index, "arrivalMonth"], message: "Tháng hàng về không được trước tháng đặt." });
    const products = new Set<string>();
    for (const [allocationIndex, allocation] of wave.allocations.entries()) {
      if (products.has(allocation.productId)) ctx.addIssue({ code: "custom", path: ["waves", index, "allocations", allocationIndex, "productId"], message: "Một SKU chỉ được xuất hiện một lần trong mỗi đợt mua." });
      products.add(allocation.productId);
    }
  }
});

function fail(status: number, code: string, message: string, correlationId: string, fieldErrors?: Record<string, string[]>) { return apiError(status, code, message, correlationId, status >= 500, fieldErrors); }
function mapError(error: { code?: string | null; message?: string | null } | null | undefined): [number, string, string] {
  const message = error?.message ?? "";
  if (message.includes("LOCK_CONFLICT")) return [409, "ANNUAL_PLAN_LOCK_CONFLICT", "Bản kế hoạch đã thay đổi. Hãy tải lại trước khi lưu tiếp."];
  if (message.includes("DRAFT_FORBIDDEN") || error?.code === "42501") return [403, "ANNUAL_PLAN_DRAFT_FORBIDDEN", "Bạn không có quyền chỉnh sửa đợt mua trong bản nháp này."];
  if (message.includes("ALLOCATION_MISMATCH")) return [422, "PURCHASE_WAVE_ALLOCATION_MISMATCH", "Tổng Qty và FOC của các đợt mua phải khớp kế hoạch năm."];
  if (message.includes("MONTH_INVALID") || message.includes("SEQUENCE_INVALID")) return [422, "PURCHASE_WAVE_INVALID", "Tháng hoặc thứ tự đợt mua chưa hợp lệ."];
  return [422, "PURCHASE_WAVE_SAVE_FAILED", "Không thể lưu phân bổ các đợt mua."];
}

function isUuid(value: string): boolean { return z.string().uuid().safeParse(value).success; }

export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const correlationId = randomUUID();
  const { revisionId } = await params;
  if (!isUuid(revisionId)) return fail(422, "VALIDATION_ERROR", "Mã bản kế hoạch không hợp lệ.", correlationId);
  const parsed = saveWavesSchema.safeParse(await parseJson<unknown>(request));
  if (!parsed.success) return fail(422, "VALIDATION_ERROR", "Phân bổ đợt mua chưa hợp lệ.", correlationId, { form: [parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ."] });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", correlationId);
  const waves = parsed.data.waves.map((wave) => ({
    waveId: isUuid(wave.id) ? wave.id : null,
    waveNumber: wave.sequence,
    orderMonth: `${wave.orderMonth}-01`,
    arrivalMonth: `${wave.arrivalMonth}-01`,
    allocations: wave.allocations,
  }));
  const { data, error } = await supabase.rpc("save_purchase_wave_allocations_v2", {
    p_revision_id: revisionId,
    p_expected_lock_version: parsed.data.lockVersion,
    p_waves: waves,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) { const [status, code, message] = mapError(error); return fail(status, code, message, correlationId); }
  const result = (data ?? {}) as Record<string, unknown>;
  const submittedBySequence = new Map(parsed.data.waves.map((wave) => [wave.sequence, wave]));
  const canonicalWaves = Array.isArray(result.waves) ? result.waves.map((value) => {
    const row = value as { id?: string; sequence?: number; orderMonth?: string; arrivalMonth?: string; neededMonth?: string; allocations?: unknown[] };
    const source = submittedBySequence.get(Number(row.sequence));
    return {
      id: String(row.id ?? source?.id ?? ""),
      sequence: Number(row.sequence ?? source?.sequence ?? 0),
      name: source?.id ? `PO #${Number(row.sequence ?? source.sequence)}` : `PO #${Number(row.sequence ?? 0)}`,
      orderMonth: String(row.orderMonth ?? row.neededMonth ?? source?.orderMonth ?? "").slice(0, 7),
      arrivalMonth: String(row.arrivalMonth ?? row.neededMonth ?? source?.arrivalMonth ?? "").slice(0, 7),
      status: "planned" as const,
      canDelete: true,
      allocations: Array.isArray(row.allocations) ? row.allocations : source?.allocations ?? [],
    };
  }) : parsed.data.waves.map((wave) => ({ ...wave, name: `PO #${wave.sequence}`, status: "planned" as const, canDelete: true }));
  return NextResponse.json({ ok: true, data: { revisionId, lockVersion: Number(result.lockVersion ?? parsed.data.lockVersion + 1), paidQty: Number(result.paidQty ?? 0), focQty: Number(result.focQty ?? 0), waves: canonicalWaves }, correlationId }, { status: 200 });
}
