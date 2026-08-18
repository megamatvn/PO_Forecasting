import { describe, expect, it } from "vitest";
import { annualLineInputSchema } from "@/features/annual-plans/contracts";
import { organizationAssignmentSchema } from "@/features/organization/contracts";
import { proposalInputSchema } from "@/features/proposals/contracts";
import { apiError } from "@/lib/api/contract";
import { parseJson } from "@/lib/api/parse-request";
import { createIdempotencyKey } from "@/lib/idempotency";

describe("V2 contracts", () => {
  const currentYear = new Date().getFullYear();

  it("rejects negative commercial quantities", () => {
    expect(annualLineInputSchema.safeParse({
      productId: crypto.randomUUID(),
      exPrice: "1.75",
      paidQty: -1,
      expectedFoc: 0,
      openingStock: 0,
    }).success).toBe(false);
  });

  it("requires a supervisor for active Leader and Manager assignments", () => {
    expect(organizationAssignmentSchema.safeParse({
      tier: "leader",
      isActive: true,
      supervisorId: null,
    }).success).toBe(false);
  });

  it("requires at least one positive proposal line", () => {
    expect(proposalInputSchema.safeParse({
      brandId: crypto.randomUUID(), planningYear: currentYear,
      neededMonth: `${currentYear}-03`, reason: "Bổ sung bán hàng", lines: [],
    }).success).toBe(false);
  });

  it("rejects calendar-invalid planning months", () => {
    expect(proposalInputSchema.safeParse({
      brandId: crypto.randomUUID(), planningYear: currentYear,
      neededMonth: `${currentYear}-02-31`, reason: "Bổ sung bán hàng", lines: [{
        productId: crypto.randomUUID(), requestedQty: 1,
      }],
    }).success).toBe(false);
  });

  it("returns the canonical API error shape", async () => {
    const response = apiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", "corr-123", true, {
      reason: ["Lý do chưa đủ dài."],
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu không hợp lệ.",
        fieldErrors: { reason: ["Lý do chưa đủ dài."] },
        retryable: true,
        correlationId: "corr-123",
      },
    });
  });

  it("parses valid JSON and returns null for malformed JSON", async () => {
    await expect(parseJson<{ value: number }>(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ value: 7 }),
    }))).resolves.toEqual({ value: 7 });
    await expect(parseJson(new Request("http://localhost", {
      method: "POST", body: "{malformed",
    }))).resolves.toBeNull();
  });

  it("creates UUID idempotency keys", () => {
    expect(createIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
