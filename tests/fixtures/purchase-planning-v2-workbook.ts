import ExcelJS from "exceljs";
import type {
  ExcelTemplateContext,
  ExcelTemplateLine,
  ExcelTemplateWave,
} from "@/features/annual-plans/excel/template";

export const fixtureBrand = {
  id: "90000000-0000-4000-8000-000000000010",
  code: "ET",
  name: "Etiaxil",
} as const;

export const fixtureRevisionId = "90000000-0000-4000-8000-000000000302";

export const fixtureProduct = {
  id: "90000000-0000-4000-8000-000000000101",
  brandId: fixtureBrand.id,
  sku: "ET-015025",
  name: "Đặc trị xanh",
  isActive: true,
  aliases: ["ET-015026", "ET-015027"],
} as const;

export const fixtureLines: ExcelTemplateLine[] = [
  {
    productId: fixtureProduct.id,
    sku: fixtureProduct.sku,
    name: fixtureProduct.name,
    exPrice: "1.75",
    paidQty: 100,
    expectedFoc: 20,
    openingStock: 12,
  },
];

export const fixtureWaves: ExcelTemplateWave[] = [
  {
    id: "90000000-0000-4000-8000-000000000401",
    sequence: 1,
    orderMonth: "2026-03",
    arrivalMonth: "2026-04",
    allocations: [
      { productId: fixtureProduct.id, sku: fixtureProduct.sku, paidQty: 100, focQty: 20, exPrice: "1.75" },
    ],
  },
];

export function fixtureTemplateContext(overrides: Partial<ExcelTemplateContext> = {}): ExcelTemplateContext {
  return {
    revisionId: fixtureRevisionId,
    lockVersion: 3,
    brand: fixtureBrand,
    planningYear: 2026,
    lines: fixtureLines,
    waves: fixtureWaves,
    ...overrides,
  };
}

export async function createPurchasePlanningV2Workbook(
  overrides: Partial<ExcelTemplateContext> = {},
): Promise<Buffer> {
  const workbook = await import("@/features/annual-plans/excel/template").then(({ createAnnualPlanExcelTemplate }) => createAnnualPlanExcelTemplate(fixtureTemplateContext(overrides)));
  return Buffer.from(workbook);
}

export async function loadFixtureWorkbook(overrides: Partial<ExcelTemplateContext> = {}): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(await createPurchasePlanningV2Workbook(overrides)).buffer);
  return workbook;
}
