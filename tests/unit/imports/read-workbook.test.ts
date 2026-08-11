import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  assertImportFile,
  readForecastWorkbook,
} from "@/features/imports/server/read-workbook";

const fixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/forecast-import.synthetic.xlsx",
);

describe("readForecastWorkbook", () => {
  it("reads SKU, Ex Price and current stock from the Forecast 5M layout", async () => {
    const rows = await readForecastWorkbook(await readFile(fixturePath));

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
    const rows = await readForecastWorkbook(await readFile(fixturePath));
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

    const rows = await readForecastWorkbook(buffer);

    expect(rows).toContainEqual(
      expect.objectContaining({ rowNumber: 7, rawSku: "", productName: "Đặc trị xanh" }),
    );
  });
});
