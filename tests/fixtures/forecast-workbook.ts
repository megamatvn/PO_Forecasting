import ExcelJS from "exceljs";

const products = [
  ["ET-015025", "Đặc trị xanh", 4.25, 10],
  ["ET-015150", "Xịt men 150ml", 2.71, 32],
  ["ET-015027", "Đặc trị xanh (alias)", 4.25, 10],
  ["ET-015001", "Sản phẩm 001", 3.1, 20],
  ["ET-015002", "Sản phẩm 002", 3.2, 20],
  ["ET-015003", "Sản phẩm 003", 3.3, 20],
  ["ET-015004", "Sản phẩm 004", 3.4, 20],
  ["ET-015005", "Sản phẩm 005", 3.5, 20],
  ["ET-015006", "Sản phẩm 006", 3.6, 20],
  ["ET-015007", "Sản phẩm 007", 3.7, 20],
  ["ET-015008", "Sản phẩm 008", 3.8, 20],
  ["ET-015009", "Sản phẩm 009", 3.9, 20],
  ["ET-015010", "Sản phẩm 010", 4.0, 20],
] as const;

interface ForecastWorkbookFixtureOptions {
  forecastSheetName?: string;
  additionalForecastSheetNames?: readonly string[];
}

function populateForecastSheet(forecast: ExcelJS.Worksheet): void {
  forecast.getCell("C5").value = "No";
  forecast.getCell("D5").value = "Code";
  forecast.getCell("E5").value = "Product Name";
  forecast.getCell("F5").value = "Ex Price";
  forecast.getCell("G5").value = "PO 2026";
  forecast.getCell("H5").value = "Amount";
  forecast.getCell("L5").value = "PO #1";
  forecast.getCell("O5").value = "PO #2";
  forecast.getCell("S5").value = "Current Stock";
  forecast.getCell("U5").value = "PO #3";
  forecast.getCell("X5").value = "PO #4";
  forecast.getCell("AA5").value = "PO #5";
  forecast.getCell("AD5").value = "PO #6";
  [12, 15, 21, 24, 27, 30].forEach((column) => {
    forecast.getCell(6, column).value = "Qty";
    forecast.getCell(6, column + 1).value = "FOC";
    forecast.getCell(6, column + 2).value = "Amount";
  });

  products.forEach(([sku, name, exPrice, currentStock], index) => {
    const row = index + 7;
    forecast.getCell(`D${row}`).value = sku;
    forecast.getCell(`E${row}`).value = name;
    forecast.getCell(`F${row}`).value = exPrice;
    forecast.getCell(`G${row}`).value = 1200;
    forecast.getCell(`H${row}`).value = exPrice * 1200;
    forecast.getCell(`L${row}`).value = 0;
    forecast.getCell(`M${row}`).value = 0;
    forecast.getCell(`N${row}`).value = 0;
    forecast.getCell(`S${row}`).value = currentStock;
    if (sku === "ET-015027") {
      forecast.getCell(`AD${row}`).value = 100;
      forecast.getCell(`AF${row}`).value = 0;
    }
  });
  // Repeated header from the source workbook; the parser must not import the
  // second historical table below the canonical Forecast 5M block.
  forecast.getCell("D21").value = "Code";
}

export async function createForecastWorkbookFixture(
  options: ForecastWorkbookFixtureOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const forecast = workbook.addWorksheet(options.forecastSheetName ?? "Forecast 5M");
  populateForecastSheet(forecast);

  for (const sheetName of options.additionalForecastSheetNames ?? []) {
    populateForecastSheet(workbook.addWorksheet(sheetName));
  }

  const sales = workbook.addWorksheet("Sales");
  sales.getCell("C55").value = "2. Sale Forecast 2026";
  for (let month = 1; month <= 12; month += 1) {
    sales.getCell(56, 4 + month).value = month;
  }
  products.forEach(([sku], index) => {
    const row = index + 57;
    sales.getCell(row, 3).value = sku;
    for (let month = 1; month <= 12; month += 1) {
      sales.getCell(row, 4 + month).value = sku === "ET-015150" ? 227 : 10;
    }
  });

  const purchased = workbook.addWorksheet("Purchased");
  purchased.getCell("A3").value = "Ngày hạch toán";
  purchased.getCell("B3").value = "Ngày chứng từ";
  purchased.getCell("G3").value = "Mã nhà cung cấp";
  purchased.getCell("H3").value = "Tên nhà cung cấp";
  purchased.getCell("K3").value = "Mã hàng";
  purchased.getCell("O3").value = "Số lượng mua";
  purchased.getCell("AN3").value = "Loại chứng từ";
  purchased.getCell("A4").value = new Date("2026-01-05T00:00:00Z");
  purchased.getCell("B4").value = new Date("2026-01-20T00:00:00Z");
  purchased.getCell("C4").value = "NK-004";
  purchased.getCell("G4").value = "COOPER";
  purchased.getCell("H4").value = "COOPER France";
  purchased.getCell("K4").value = "ET-015150";
  purchased.getCell("O4").value = 1002;
  purchased.getCell("AN4").value = "Mua hàng nhập kho";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
