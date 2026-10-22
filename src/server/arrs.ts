import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const cargoInclude = {
  organization: { include: { licenses: true } },
  allocations: {
    include: {
      batch: { include: { asset: true, movements: true, allocations: true } },
    },
  },
  inspections: true,
  contract: { include: { buyer: true } },
  insurance: true,
  guarantee: true,
  deposit: true,
  fiscal: true,
  decisions: true,
  documents: true,
  approvals: true,
  tokens: true,
  risks: true,
} satisfies Prisma.CargoInclude;
export type CargoRecord = Prisma.CargoGetPayload<{
  include: typeof cargoInclude;
}>;
export type Condition = {
  key: string;
  name: string;
  passed: boolean;
  evidence: string;
  reviewer: string;
  verifiedAt: string | null;
  reason: string;
};
export function assess(
  c: CargoRecord,
  policy: {
    discrepancyRate: Prisma.Decimal | Decimal | string | number;
    depositRate: Prisma.Decimal | Decimal | string | number;
    royaltyRate?: Prisma.Decimal;
    dutyRate?: Prisma.Decimal;
    otherRate?: Prisma.Decimal;
  },
  now = new Date(),
) {
  const conditions: Condition[] = [];
  const add = (
    key: string,
    name: string,
    passed: boolean,
    evidence: string,
    reviewer = "",
    verifiedAt: Date | null = null,
    reason = "Required evidence is missing, rejected or expired.",
  ) =>
    conditions.push({
      key,
      name,
      passed,
      evidence,
      reviewer,
      verifiedAt: verifiedAt?.toISOString() ?? null,
      reason: passed ? "" : reason,
    });
  const decision = (kind: string) =>
    c.decisions.find(
      (d) => d.kind === kind && d.status === "ACCEPTED" && d.expiresAt > now,
    );
  add(
    "identity",
    "Producer identity verified",
    c.organization.verified,
    c.organization.registration,
    "Registry",
  );
  add(
    "origin",
    "Origin and license valid",
    c.organization.licenses.some((l) => l.verified && l.expiresAt > now) &&
      c.allocations.length > 0 &&
      c.allocations.every((a) => a.batch.asset.authorized),
    c.organization.licenses.map((l) => l.reference).join(", "),
    "Registry",
  );
  const allocated = c.allocations.reduce(
    (n, a) => n.plus(a.quantity.toString()),
    new Decimal(0),
  );
  add(
    "quantity",
    "Sufficient traceable resource quantity",
    allocated.eq(c.quantity.toString()) &&
      c.allocations.every((a) =>
        a.batch.quantity.gte(
          a.batch.allocations.reduce(
            (n, x) => n.plus(x.quantity),
            new Prisma.Decimal(0),
          ),
        ),
      ),
    `${allocated.toFixed(6)} / ${c.quantity} bbl`,
    "ResourceChain",
  );
  const custody = c.allocations.every((a) => {
    const b = a.batch;
    const balances: Record<string, Decimal> = {
      [b.storage]: new Decimal(b.quantity.toString()),
    };
    for (const m of [...b.movements].sort(
      (x, y) => +x.createdAt - +y.createdAt,
    )) {
      balances[m.fromLocation] = (
        balances[m.fromLocation] ?? new Decimal(0)
      ).minus(m.quantity.toString());
      balances[m.toLocation] = (balances[m.toLocation] ?? new Decimal(0)).plus(
        m.quantity.toString(),
      );
      if (balances[m.fromLocation].lt(0)) return false;
    }
    for (const allocation of b.allocations)
      balances[allocation.location] = (
        balances[allocation.location] ?? new Decimal(0)
      ).minus(allocation.quantity.toString());
    return Object.values(balances).every((v) => v.gte(0));
  });
  add(
    "custody",
    "Chain of custody coherent",
    c.allocations.length > 0 && custody,
    c.allocations.map((a) => a.batch.resourceId).join(", "),
    "ResourceChain",
  );
  const inspection = [...c.inspections].sort(
    (a, b) => +b.inspectedAt - +a.inspectedAt,
  )[0];
  const variance = inspection
    ? new Decimal(inspection.measuredQuantity.toString())
        .minus(c.quantity.toString())
        .abs()
        .div(c.quantity.toString())
    : new Decimal(1);
  add(
    "inspection",
    "Independent Q&Q accepted",
    !!inspection &&
      inspection.status === "ACCEPTED" &&
      inspection.inspectorOrganizationId !== c.organizationId &&
      inspection.expiresAt > now &&
      variance.lte(policy.discrepancyRate.toString()),
    inspection?.reportReference ?? "No inspection",
    inspection?.inspectorId,
    inspection?.inspectedAt,
    `Independent accepted Q&Q required; variance ${variance.times(100).toFixed(2)}%.`,
  );
  add(
    "counterparties",
    "Buyer and seller verified",
    !!c.contract?.buyer.verified && c.organization.verified,
    c.contract?.buyer.name ?? "No buyer",
    "Compliance",
  );
  add(
    "contract",
    "Trade contract accepted",
    c.contract?.status === "ACCEPTED" &&
      c.contract.quantity.eq(c.quantity) &&
      new Decimal(c.contract.quantity.toString())
        .times(c.contract.price.toString())
        .toDecimalPlaces(2)
        .eq(c.value.toString()),
    c.contract?.reference ?? "No contract",
    c.contract?.reviewerId ?? "",
    c.contract?.updatedAt ?? null,
    "Contract must be accepted and match cargo quantity/value.",
  );
  const pop = decision("POP"),
    pof = decision("POF");
  add(
    "documents",
    "POP / POF documentary checks accepted",
    !!pop && !!pof,
    [pop?.evidenceReference, pof?.evidenceReference].filter(Boolean).join(", "),
    pop?.reviewerId ?? "",
    pop?.updatedAt ?? null,
  );
  add(
    "insurance",
    "Insurance requirements satisfied",
    !!c.insurance &&
      c.insurance.status === "ACCEPTED" &&
      c.insurance.expiresAt > now &&
      c.insurance.coverage.gte(c.value),
    c.insurance?.reference ?? "No insurance",
    c.insurance?.reviewerId,
  );
  add(
    "guarantee",
    "Guarantee requirements satisfied",
    !!c.guarantee &&
      c.guarantee.status === "ACCEPTED" &&
      c.guarantee.expiresAt > now &&
      c.guarantee.amount.gte(
        new Prisma.Decimal(c.value).mul(policy.depositRate.toString()),
      ),
    c.guarantee?.reference ?? "No guarantee",
    c.guarantee?.reviewerId,
  );
  const required = new Decimal(c.value.toString())
    .times(policy.depositRate.toString())
    .toDecimalPlaces(2);
  add(
    "deposit",
    "Treasury deposit independently documented",
    !!c.deposit &&
      c.deposit.required.eq(required.toString()) &&
      c.deposit.confirmed.gte(required.toString()),
    `${c.deposit?.confirmed ?? 0} / ${required.toFixed(2)} ${c.currency} · ${c.deposit?.evidenceReference ?? "No evidence"}`,
    c.deposit?.reviewerId,
    c.deposit?.updatedAt,
  );
  add(
    "fiscal",
    "Fiscal requirements documented",
    !!c.fiscal &&
      c.fiscal.documentedPaid.gte(c.fiscal.assessed) &&
      (!policy.royaltyRate || c.fiscal.royaltyRate.eq(policy.royaltyRate)) &&
      (!policy.dutyRate || c.fiscal.dutyRate.eq(policy.dutyRate)) &&
      (!policy.otherRate || c.fiscal.otherRate.eq(policy.otherRate)),
    c.fiscal
      ? `${c.fiscal.documentedPaid} / ${c.fiscal.assessed} ${c.currency} · ${c.fiscal.evidenceReference}`
      : "No assessment",
    c.fiscal?.reviewerId,
    c.fiscal?.updatedAt,
  );
  add(
    "shipment",
    "Terminal and shipment information complete",
    !!c.terminal && !!c.vessel && c.shipmentDate > now,
    `${c.terminal} · ${c.vessel} · ${c.shipmentDate.toISOString().slice(0, 10)}`,
  );
  const eligible = conditions.every((c) => c.passed);
  const approval = [...c.approvals]
    .reverse()
    .find(
      (a) =>
        a.version === c.version &&
        a.decision === "APPROVED" &&
        a.actorId !== c.createdBy &&
        a.expiresAt > now,
    );
  return {
    eligible,
    conditions,
    approval: approval ?? null,
    blocking: conditions.filter((c) => !c.passed),
    status: !eligible ? "BLOCKED" : approval ? "APPROVED" : "ELIGIBLE",
  };
}
export function financials(
  value: string,
  depositRate: string,
  royalty: string,
  duty: string,
  other: string,
) {
  const v = new Decimal(value);
  return {
    deposit: v.times(depositRate).toFixed(2),
    royalty: v.times(royalty).toFixed(2),
    duty: v.times(duty).toFixed(2),
    other: v.times(other).toFixed(2),
    total: v.times(new Decimal(royalty).plus(duty).plus(other)).toFixed(2),
  };
}
