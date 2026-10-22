import { limitedBody } from "../../../server/request";
import {
  currentUser,
  checkOrigin,
  AppError,
  requireRole,
  cargoScope,
  type Principal,
} from "../../../server/auth";
import { resourceLab } from "../../../server/valve-resourceos";
import { db } from "../../../server/db";
import { assess, cargoInclude } from "../../../server/arrs";
import { audit, recordRejection } from "../../../server/resourceos";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await currentUser();
    const { lab, actor, cargos } = await resourceLab(user);
    const ids = new Set(cargos.map((c) => c.id));
    const valves = [...lab.valves.values()].filter((v) => ids.has(v.cargoId));
    const valveIds = new Set(valves.map((v) => v.id));
    const events = lab.events.filter((e) => {
      const d = e.data as {
        valveId?: string;
        valve?: { id: string };
        command?: { valveId: string };
      };
      return valveIds.has(d.valveId ?? d.valve?.id ?? d.command?.valveId ?? "");
    });
    return Response.json(
      {
        actor,
        mode: "SIMULATOR ONLY",
        valves,
        cargoes: cargos.map((c) => ({
          ...lab.cargoes.get(c.id),
          reference: c.reference,
        })),
        events: events.slice(-100),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : "Laboratory unavailable" },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
export async function POST(request: Request) {
  let principal: Principal | undefined;
  let operation: unknown = "VALVELAB_REQUEST";
  let target: unknown = "request";
  try {
    checkOrigin(request);
    const user = await currentUser();
    principal = user;
    const raw = new TextDecoder().decode(await limitedBody(request, 4096));
    if (raw.length > 4096) throw new AppError("Request too large.");
    const body = JSON.parse(raw);
    operation = body.action;
    target = body.valveId;
    requireRole(user, "OPERATOR");
    const { lab, actor, cargos } = await resourceLab(user);
    if (body.action === "register") {
      if (!cargos.some((c) => c.id === body.cargoId))
        throw new AppError("Accessible test cargo required.", 403);
      lab.register(actor, body.valveId, body.controller, body.cargoId);
    } else if (["OPEN", "CLOSE", "estop"].includes(body.action)) {
      const valve = lab.valves.get(body.valveId);
      if (!valve || !cargos.some((c) => c.id === valve.cargoId))
        throw new AppError("Valve not found.", 404);
      if (body.action === "estop") lab.emergencyStop(actor, body.valveId);
      else if (body.action === "CLOSE")
        await lab.command(actor, body.valveId, "CLOSE");
      else
        await db
          .$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Cargo" WHERE id=${valve.cargoId} FOR UPDATE`;
            const c = await tx.cargo.findFirst({
              where: { id: valve.cargoId, ...cargoScope(user), testOnly: true },
              include: cargoInclude,
            });
            if (!c) throw new AppError("Test cargo not found.");
            const policy = await tx.policy.findUniqueOrThrow({
              where: { tenantId: user.tenantId },
            });
            const evaluation = assess(c, policy);
            if (!evaluation.eligible || !evaluation.approval)
              throw new AppError(
                "ARRS eligibility and independent current approval required.",
              );
            // Consume persisted approval before attempting OPEN; a failed attempt also requires fresh approval.
            await tx.approval.update({
              where: { id: evaluation.approval.id },
              data: { decision: "CONSUMED_BY_LAB" },
            });
            await audit(tx, user, "LAB_OPEN_ATTEMPT", c.id, {
              valveId: valve.id,
              approvalId: evaluation.approval.id,
            });
            return c.id;
          })
          .then(async () => {
            await lab.command(actor, body.valveId, "OPEN");
          });
    } else
      throw new AppError(
        "Use ARRS Control Center to record independent cargo approval.",
      );
    await audit(db, user, "VALVELAB_COMMAND", body.valveId, {
      action: body.action,
      mode: "SIMULATOR",
    });
    return Response.json({ ok: true });
  } catch (e) {
    await recordRejection(
      principal,
      operation,
      target,
      e,
      e instanceof AppError ? e.status : 400,
    );
    return Response.json(
      { error: e instanceof Error ? e.message : "Laboratory command failed" },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
