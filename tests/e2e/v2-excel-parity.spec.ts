import { expect, test } from "@playwright/test";
import { createPurchasePlanningV2Workbook } from "../fixtures/purchase-planning-v2-workbook";
import {
  CURRENT_PLANNING_YEAR,
  buildAnnualLine,
  buildWave,
  createAnnualPlanDraft,
  createV2Scenario,
  requireV2Local,
  saveAnnualPlanScope,
} from "./v2-support";

test.describe("Purchase Planning V2 Excel parity", () => {
  test("Excel-created draft equals the manual canonical DTO", async ({ browser }) => {
    requireV2Local();
    const scenario = await createV2Scenario(browser, "excel-parity");
    try {
      const managerPage = await scenario.session("manager");
      const draft = await createAnnualPlanDraft(managerPage, scenario.brand.id);
      const scope = await saveAnnualPlanScope(
        managerPage,
        draft.revisionId,
        draft.lockVersion,
      );

      const line = buildAnnualLine(scenario.products[0]!.id, {
        paidQty: 100,
        expectedFoc: 20,
        openingStock: 9,
      });
      const wave = buildWave(scenario.products[0]!.id, {
        allocations: [
          {
            productId: line.productId,
            paidQty: line.paidQty,
            focQty: line.expectedFoc,
            exPrice: line.exPrice,
          },
        ],
      });
      const workbook = await createPurchasePlanningV2Workbook({
        revisionId: draft.revisionId,
        lockVersion: scope.lockVersion,
        brand: {
          id: scenario.brand.id,
          code: scenario.brand.code,
          name: scenario.brand.name,
        },
        planningYear: CURRENT_PLANNING_YEAR,
        lines: [
          {
            productId: line.productId,
            sku: scenario.products[0]!.canonicalSku,
            name: scenario.products[0]!.name,
            exPrice: line.exPrice,
            paidQty: line.paidQty,
            expectedFoc: line.expectedFoc,
            openingStock: line.openingStock,
          },
        ],
        waves: [
          {
            id: wave.id,
            sequence: wave.sequence,
            orderMonth: wave.orderMonth,
            arrivalMonth: wave.arrivalMonth,
            allocations: [
              {
                productId: line.productId,
                sku: scenario.products[0]!.canonicalSku,
                paidQty: line.paidQty,
                focQty: line.expectedFoc,
                exPrice: line.exPrice,
              },
            ],
          },
        ],
      });

      const previewResponse = await managerPage.request.post(
        `/api/v2/annual-plans/${draft.revisionId}/excel-preview`,
        {
          multipart: {
            file: {
              name: "annual-plan.xlsx",
              mimeType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              buffer: workbook,
            },
          },
        },
      );
      const previewText = await previewResponse.text();
      expect(previewResponse.status(), previewText).toBe(201);
      const previewBody = JSON.parse(previewText) as {
        data: {
          importSessionId: string;
          checksum: string;
          lockVersion: number;
          canApply: boolean;
          lines: Array<{
            productId: string;
            sku: string;
            name: string;
            exPrice: string;
            paidQty: number;
            expectedFoc: number;
            openingStock: number;
          }>;
          waves: Array<{
            id: string;
            sequence: number;
            orderMonth: string;
            arrivalMonth: string;
            allocations: Array<{
              productId: string;
              paidQty: number;
              focQty: number;
              exPrice: string;
            }>;
          }>;
        };
      };

      expect(previewBody.data.canApply).toBe(true);
      expect(
        previewBody.data.lines.map((value) => ({
          productId: value.productId,
          sku: value.sku,
          name: value.name,
          exPrice: value.exPrice,
          paidQty: value.paidQty,
          expectedFoc: value.expectedFoc,
          openingStock: value.openingStock,
        })),
      ).toEqual([
        {
          productId: line.productId,
          sku: scenario.products[0]!.canonicalSku,
          name: scenario.products[0]!.name,
          exPrice: line.exPrice,
          paidQty: line.paidQty,
          expectedFoc: line.expectedFoc,
          openingStock: line.openingStock,
        },
      ]);
      expect(
        previewBody.data.waves.map((value) => ({
          sequence: value.sequence,
          orderMonth: value.orderMonth,
          arrivalMonth: value.arrivalMonth,
          allocations: value.allocations.map((allocation) => ({
            productId: allocation.productId,
            paidQty: allocation.paidQty,
            focQty: allocation.focQty,
            exPrice: allocation.exPrice,
          })),
        })),
      ).toEqual([
        {
          sequence: wave.sequence,
          orderMonth: wave.orderMonth,
          arrivalMonth: wave.arrivalMonth,
          allocations: [
            {
              productId: line.productId,
              paidQty: line.paidQty,
              focQty: line.expectedFoc,
              exPrice: line.exPrice,
            },
          ],
        },
      ]);

      const applyResponse = await managerPage.request.post(
        `/api/v2/annual-plans/${draft.revisionId}/excel-apply`,
        {
          headers: { "content-type": "application/json" },
          data: {
            importSessionId: previewBody.data.importSessionId,
            checksum: previewBody.data.checksum,
            lockVersion: previewBody.data.lockVersion,
            replaceSections: ["lines", "waves"],
            idempotencyKey: crypto.randomUUID(),
            payload: previewBody.data,
          },
        },
      );
      expect(applyResponse.status()).toBe(200);

      await managerPage.goto(`/annual-plans/${draft.revisionId}?step=lines`);
      await expect(managerPage.getByRole("combobox", { name: "SKU dòng 1" })).toHaveValue(line.productId);
    } finally {
      await scenario.cleanup();
    }
  });
});
