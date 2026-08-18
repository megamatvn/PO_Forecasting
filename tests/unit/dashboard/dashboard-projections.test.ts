import { describe, expect, it } from "vitest";
import type { BrandCapabilityAccess, CurrentAccessV2 } from "@/features/auth/access-types";
import {
  projectRoleDashboard,
  type DashboardProjectionInput,
} from "@/features/dashboard/server/load-role-dashboard";

const brand: BrandCapabilityAccess = {
  id: "10000000-0000-0000-0000-000000000001",
  code: "ETX",
  name: "Etiaxil",
  capabilities: ["view_approved_plan", "create_purchase_proposal"],
  sources: ["direct"],
};

const baseAccess: CurrentAccessV2 = {
  userId: "90000000-0000-0000-0000-000000000101",
  displayName: "Người dùng thử",
  tier: "manager",
  isAdministrator: false,
  capabilities: [],
  supervisorId: null,
  executiveId: null,
  brands: [brand],
};

const baselineLine = {
  brandId: brand.id,
  brandCode: "ETX",
  brandName: "Etiaxil",
  planningYear: 2026,
  revisionId: "30000000-0000-0000-0000-000000000001",
  revisionStatus: "approved" as const,
  productId: "20000000-0000-0000-0000-000000000001",
  sku: "ET-015025",
  productName: "Đặc trị xanh",
  annualPaidQty: 100,
  annualFocQty: 20,
  openingStock: 10,
  exPrice: "2.50",
  baselineAmount: "250.00",
  allocatedPaidQty: 40,
  allocatedFocQty: 5,
  allocatedAmount: "100.00",
};

const projection: DashboardProjectionInput = {
  baselineLines: [
    baselineLine,
    { ...baselineLine, revisionStatus: "pending_executive", productId: "20000000-0000-0000-0000-000000000002", sku: "ET-PENDING", baselineAmount: "900.00" },
  ],
  waves: [
    {
      id: "40000000-0000-0000-0000-000000000001",
      brandId: brand.id,
      brandCode: "ETX",
      planningYear: 2026,
      revisionStatus: "approved",
      waveNumber: 1,
      status: "ordered",
      orderMonth: "2026-01",
      arrivalMonth: "2026-02",
      officialPoNumber: "PO-2026-001",
      orderedAt: "2026-01-10",
      supplierConfirmedAt: null,
      receivedAt: null,
      plannedUnits: 120,
      usedUnits: 40,
      amount: "100.00",
    },
  ],
  proposals: [
    {
      id: "50000000-0000-0000-0000-000000000001",
      brandId: brand.id,
      planningYear: 2026,
      status: "approved",
      ownerId: "90000000-0000-0000-0000-000000000104",
      assignedManagerId: baseAccess.userId,
      assignedExecutiveId: "90000000-0000-0000-0000-000000000102",
      neededMonth: "2026-03",
      requestedUnits: 60,
      referenceAmount: "150.00",
      overPlan: true,
      routeReason: "over_plan",
      updatedAt: "2026-01-12T09:00:00.000Z",
    },
    {
      id: "50000000-0000-0000-0000-000000000002",
      brandId: brand.id,
      planningYear: 2026,
      status: "draft",
      ownerId: "90000000-0000-0000-0000-000000000999",
      assignedManagerId: null,
      assignedExecutiveId: null,
      neededMonth: "2026-04",
      requestedUnits: 100,
      referenceAmount: "250.00",
      overPlan: false,
      routeReason: null,
      updatedAt: "2026-01-12T09:00:00.000Z",
    },
  ],
  governance: {
    activeUsersWithoutSupervisor: 2,
    brandsWithoutActivePolicy: 1,
    pendingNotificationOutbox: 3,
  },
};

describe("V2 dashboard projections", () => {
  it("uses only the approved baseline and requested brand/year", () => {
    const result = projectRoleDashboard(baseAccess, brand.id, 2026, projection);

    expect(result.canViewBaseline).toBe(true);
    expect(result.metrics.find((metric) => metric.key === "baseline")?.amount).toBe("250,00 €");
    expect(result.metrics.find((metric) => metric.key === "approved_proposals")?.amount).toBe("150,00 €");
    expect(result.context).toMatchObject({ brandId: brand.id, planningYear: 2026, brandCode: "ETX" });
    expect(result.metrics.find((metric) => metric.key === "baseline")?.context).not.toContain("900");
  });

  it("does not expose another user's private draft to a leader without baseline access", () => {
    const leader: CurrentAccessV2 = {
      ...baseAccess,
      tier: "leader",
      userId: "90000000-0000-0000-0000-000000000104",
      brands: [{ ...brand, capabilities: ["create_purchase_proposal"], sources: ["direct"] }],
    };

    const result = projectRoleDashboard(leader, brand.id, 2026, projection);

    expect(result.canViewBaseline).toBe(false);
    expect(result.metrics.every((metric) => metric.amount === "—")).toBe(true);
    expect(result.actions.some((action) => action.kind === "private_draft")).toBe(false);
    expect(result.actions.some((action) => action.id === "50000000-0000-0000-0000-000000000001")).toBe(false);
  });

  it("shows manager over-plan work, wave progress and governance signals only in scope", () => {
    const result = projectRoleDashboard(baseAccess, brand.id, 2026, projection);

    expect(result.actions.some((action) => action.kind === "over_plan")).toBe(true);
    expect(result.waves[0]).toMatchObject({ progress: 33, status: "ordered" });
    expect(result.exceptions.some((exception) => exception.id === "governance-users")).toBe(false);
  });

  it("does not keep rejected over-plan proposals in the active exception metric", () => {
    const rejected = {
      ...projection.proposals[0],
      id: "50000000-0000-0000-0000-000000000003",
      status: "rejected",
    };
    const result = projectRoleDashboard(baseAccess, brand.id, 2026, {
      ...projection,
      proposals: [...projection.proposals, rejected],
    });

    expect(result.metrics.find((metric) => metric.key === "over_plan")?.amount).toBe("150,00 €");
  });

  it("shows administrator governance signals without treating them as plan metrics", () => {
    const administrator: CurrentAccessV2 = {
      ...baseAccess,
      tier: "executive",
      isAdministrator: true,
      capabilities: ["administer_system"],
      brands: [],
    };
    const result = projectRoleDashboard(administrator, brand.id, 2026, projection);

    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "governance-users", severity: "warning" }),
      expect.objectContaining({ id: "governance-policy", severity: "warning" }),
    ]));
    expect(result.metrics.find((metric) => metric.key === "baseline")?.amount).toBe("250,00 €");
  });
});
