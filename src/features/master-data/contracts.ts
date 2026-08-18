import { z } from "zod";

export interface BrandOptionDTO { id: string; code: string; name: string; isActive: boolean; warning?: string | null }
export interface ProductOptionDTO { id: string; brandId: string; canonicalSku: string; name: string; isActive: boolean; aliases: string[]; warning?: string | null }

export const brandInputSchema = z.object({
  code: z.string().trim().min(1, "Mã nhãn hàng là bắt buộc.").max(32),
  name: z.string().trim().min(1, "Tên nhãn hàng là bắt buộc.").max(160),
  idempotencyKey: z.string().uuid(),
});

export const productInputSchema = z.object({
  brandId: z.string().uuid(),
  sku: z.string().trim().min(1, "Mã SKU là bắt buộc.").max(80),
  name: z.string().trim().min(1, "Tên sản phẩm là bắt buộc.").max(240),
  aliases: z.array(z.string().trim().min(1).max(80)).default([]),
  idempotencyKey: z.string().uuid(),
});

export function normalizeCode(value: string): string { return value.trim().toUpperCase(); }
export function normalizeSku(value: string): string { return value.trim().toUpperCase(); }

export function mapBrandDto(row: Record<string, unknown>): BrandOptionDTO {
  return {
    id: String(row.id ?? row.brand_id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
    warning: row.warning == null ? null : String(row.warning),
  };
}

export function mapProductDto(row: Record<string, unknown>): ProductOptionDTO {
  const aliases = Array.isArray(row.aliases) ? row.aliases.map(String) : [];
  return {
    id: String(row.id ?? row.product_id),
    brandId: String(row.brandId ?? row.brand_id),
    canonicalSku: String(row.canonicalSku ?? row.canonical_sku ?? ""),
    name: String(row.name ?? ""),
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
    aliases,
    warning: row.warning == null ? null : String(row.warning),
  };
}
