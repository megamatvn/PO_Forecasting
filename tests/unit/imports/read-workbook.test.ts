import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createForecastWorkbookFixture } from "../../fixtures/forecast-workbook";
import {
  assertImportFile,
  readForecastWorkbook,
} from "@/features/imports/server/read-workbook";
import {
  ForecastSheetNotFoundError,
  ForecastSheetSelectionRequiredError,
} from "@/features/imports/server/detect-forecast-sheet";

const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/forecast-import.synthetic.xlsx",
);

describe("readForecastWorkbook", () => {
  it("detects a renamed forecast sheet by structure and captures 2026 demand/receipts", async () => {
    const result = await readForecastWorkbook(await createForecastWorkbookFixture({
      forecastSheetName: "Kế hoạch ETX 2026",
    }));
    const { rows } = result;

    expect(rows).toHaveLength(13);
    expect(result.sourceSheetName).toBe("Kế hoạch ETX 2026");
    expect(rows.find((row) => row.rawSku === "ET-015150")?.monthlyDemand).toHaveLength(12);
    expect(rows.find((row) => row.rawSku === "ET-015150")?.monthlyDemand?.[0]).toEqual({
      demandMonth: "2026-01-01",
      demandQty: 227,
    });
    expect(rows.find((row) => row.rawSku === "ET-015150")?.purchaseReceipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ qty: 1002, status: "received" }),
      ]),
    );
  });

  it("marks malformed demand cells instead of silently converting them to zero", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(await createForecastWorkbookFixture()).buffer);
    workbook.getWorksheet("Sales")!.getCell("E58").value = "not-a-number";

    const { rows } = await readForecastWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    const demand = rows.find((row) => row.rawSku === "ET-015150")?.monthlyDemand?.[0];

    expect(demand).toMatchObject({ demandQty: 0, invalid: true });
  });

  it("rounds fractional demand to whole units and preserves the source value", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(await createForecastWorkbookFixture()).buffer);
    workbook.getWorksheet("Sales")!.getCell("E58").value = 227.5;

    const { rows } = await readForecastWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    const demand = rows.find((row) => row.rawSku === "ET-015150")?.monthlyDemand?.[0];

    expect(demand).toEqual({
      demandMonth: "2026-01-01",
      demandQty: 228,
      roundedFrom: 227.5,
    });
  });

  it("reads SKU, Ex Price and current stock from the forecast layout", async () => {
    const { rows, sourceSheetName } = await readForecastWorkbook(await readFile(fixturePath));

    expect(sourceSheetName).toBe("Forecast 5M");

    expect(rows).toContainEqual(
      expect.objectContaining({
        rowNumber: 8,
        rawSku: "ET-015150",
        productName: "Xịt men 150ml",
        exPrice: "2.71",
        currentStock: 32,
      }),
    );
  });

  it("reads dynamic PO source values without trusting imported Amount", async () => {
    const { rows } = await readForecastWorkbook(await readFile(fixturePath));
    const greenTreatment = rows.find((row) => row.rawSku === "ET-015027");

    expect(greenTreatment?.purchaseWaves.at(-1)).toEqual({
      waveNumber: 6,
      qty: 100,
      focQty: 0,
      importedAmount: "0.00",
    });
  });

  it("rejects macro-enabled files before parsing", () => {
    expect(() => assertImportFile("forecast.xlsm", 100)).toThrow(
      "Không hỗ trợ file Excel có macro",
    );
  });

  it("keeps a populated product row with a missing SKU for validation", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(await readFile(fixturePath)).buffer);
    workbook.getWorksheet("Forecast 5M")!.getCell("D7").value = null;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { rows } = await readForecastWorkbook(buffer);

    expect(rows).toContainEqual(
      expect.objectContaining({ rowNumber: 7, rawSku: "", productName: "Đặc trị xanh" }),
    );
  });

  it("requires an explicit selection when multiple sheets match the forecast structure", async () => {
    const buffer = await createForecastWorkbookFixture({
      forecastSheetName: "Kế hoạch ETX 2026",
      additionalForecastSheetNames: ["Kế hoạch ETX 2027"],
    });

    await expect(readForecastWorkbook(buffer)).rejects.toMatchObject({
      name: "ForecastSheetSelectionRequiredError",
      candidates: expect.arrayContaining([
        expect.objectContaining({ sheetName: "Kế hoạch ETX 2026" }),
        expect.objectContaining({ sheetName: "Kế hoạch ETX 2027" }),
      ]),
    } satisfies Partial<ForecastSheetSelectionRequiredError>);
  });

  it("accepts an explicitly selected candidate only when it is structurally valid", async () => {
    const buffer = await createForecastWorkbookFixture({
      forecastSheetName: "Kế hoạch ETX 2026",
      additionalForecastSheetNames: ["Kế hoạch ETX 2027"],
    });

    await expect(readForecastWorkbook(buffer, "Kế hoạch ETX 2027")).resolves.toMatchObject({
      sourceSheetName: "Kế hoạch ETX 2027",
      rows: expect.arrayContaining([expect.objectContaining({ rawSku: "ET-015025" })]),
    });
    await expect(readForecastWorkbook(buffer, "Sales")).rejects.toBeInstanceOf(
      ForecastSheetNotFoundError,
    );
  });

  it("reports missing headers when no populated sheet has a forecast structure", async () => {
    const workbook = new ExcelJS.Workbook();
    const invalid = workbook.addWorksheet("Dữ liệu tạm");
    invalid.getCell("D5").value = "Code";
    invalid.getCell("E5").value = "Product Name";

    await expect(
      readForecastWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).rejects.toMatchObject({
      name: "ForecastSheetNotFoundError",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          sheetName: "Dữ liệu tạm",
          missingHeaders: expect.arrayContaining(["Ex Price", "Current Stock"]),
        }),
      ]),
    } satisfies Partial<ForecastSheetNotFoundError>);
  });
});
