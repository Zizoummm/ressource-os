import { dataDirectory } from "./runtime";
import { randomBytes } from "node:crypto";
import { ValveLab, SimulatorGateway, type Actor } from "./valve-lab";
import { db } from "./db";
import { cargoScope, type Principal } from "./auth";
import { assess, cargoInclude } from "./arrs";
const shared = globalThis as typeof globalThis & {
  resourceLabs?: Map<string, ValveLab>;
};
export async function resourceLab(user: Principal) {
  shared.resourceLabs ??= new Map();
  let lab = shared.resourceLabs.get(user.tenantId);
  if (!lab) {
    const key = randomBytes(32);
    lab = new ValveLab(
      key,
      new SimulatorGateway(key),
      `${dataDirectory()}/valve-${Buffer.from(user.tenantId).toString("hex")}.jsonl`,
    );
    shared.resourceLabs.set(user.tenantId, lab);
  }
  const policy = await db.policy.findUniqueOrThrow({
    where: { tenantId: user.tenantId },
  });
  const cargos = await db.cargo.findMany({
    where: { ...cargoScope(user), testOnly: true },
    include: cargoInclude,
  });
  for (const c of cargos) {
    const evaluation = assess(c, policy);
    lab.cargoes.set(c.id, {
      id: c.id,
      organization: c.organizationId,
      testOnly: true,
      version: c.version,
      requirements: Object.fromEntries(
        evaluation.conditions.map((r) => [r.key, r.passed]),
      ),
      approval: evaluation.approval
        ? {
            actor: {
              id: evaluation.approval.actorId,
              organization: c.organizationId,
              role: "approver",
            },
            version: c.version,
            expiresAt: evaluation.approval.expiresAt.getTime(),
          }
        : undefined,
    });
  }
  const actor: Actor = {
    id: user.id,
    organization: user.organizationId,
    role: user.roles.includes("OPERATOR")
      ? "operator"
      : user.roles.includes("REGULATOR")
        ? "approver"
        : "auditor",
  };
  return { lab, actor, cargos };
}
