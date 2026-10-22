import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "./db";
import {
  AppError,
  requireRole,
  cargoScope,
  isProducer,
  type Principal,
} from "./auth";
import { assess, cargoInclude, financials } from "./arrs";
export type Tx = Prisma.TransactionClient;
const text = z.string().trim().min(1).max(500);
const amount = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,6})?$/)
  .refine((v) => new Decimal(v).gte(0));
const positive = amount.refine((v) => new Decimal(v).gt(0));
const date = z.string().datetime({ offset: true });
const schemas = {
  user: z.object({
    name: text,
    email: z.string().email(),
    password: z.string().min(16).max(128),
    organizationId: text,
    role: z.enum([
      "ADMIN",
      "OPERATOR",
      "INSPECTOR",
      "COMPLIANCE",
      "REGULATOR",
      "TREASURY",
      "AUDITOR",
    ]),
  }),
  userActive: z.object({ id: text, active: z.boolean() }),
  assetVerify: z.object({ id: text, authorized: z.boolean() }),
  organization: z.object({
    name: text,
    type: z.enum([
      "PRODUCER",
      "TRADER",
      "INSPECTOR",
      "TERMINAL",
      "REGULATOR",
      "TREASURY",
    ]),
    jurisdiction: text,
    registration: text,
    beneficialOwners: text,
  }),
  organizationVerify: z.object({ id: text, verified: z.boolean() }),
  license: z.object({
    organizationId: text,
    reference: text,
    expiresAt: date,
    verified: z.boolean(),
  }),
  asset: z.object({ organizationId: text, name: text, location: text }),
  batch: z.object({
    assetId: text,
    grade: text,
    quantity: positive,
    storage: text,
    productionDate: date,
  }),
  transfer: z.object({
    batchId: text,
    fromLocation: text,
    toLocation: text,
    quantity: positive,
    reference: text,
  }),
  cargo: z.object({
    reference: text,
    organizationId: text,
    grade: text,
    quantity: positive,
    value: positive,
    terminal: text,
    vessel: text,
    shipmentDate: date,
    testOnly: z.boolean().default(false),
  }),
  cargoEdit: z.object({
    cargoId: text,
    terminal: text,
    vessel: text,
    shipmentDate: date,
    reason: text,
  }),
  allocate: z.object({
    cargoId: text,
    batchId: text,
    location: text,
    quantity: positive,
  }),
  counterparty: z.object({
    name: text,
    type: z.enum(["BUYER", "SELLER", "TRADER"]),
    jurisdiction: text,
    registration: text,
    beneficialOwners: text,
  }),
  counterpartyVerify: z.object({ id: text, verified: z.boolean() }),
  contract: z.object({
    cargoId: text,
    buyerId: text,
    reference: text,
    quantity: positive,
    price: positive,
    incoterm: text,
    paymentTerms: text,
  }),
  contractReview: z.object({
    cargoId: text,
    status: z.enum(["ACCEPTED", "REJECTED", "NEEDS_EVIDENCE"]),
    reason: text,
  }),
  inspection: z.object({
    cargoId: text,
    measuredQuantity: positive,
    quality: text,
    samplingReference: text,
    reportReference: text,
    status: z.enum(["SUBMITTED", "ACCEPTED", "REJECTED"]),
    expiresAt: date,
  }),
  decision: z.object({
    cargoId: text,
    kind: z.enum(["POP", "POF"]),
    provenance: z
      .enum(["SIMULATED", "MANUAL_ATTESTATION"])
      .default("MANUAL_ATTESTATION"),
    status: z.enum(["ACCEPTED", "REJECTED", "NEEDS_EVIDENCE"]),
    evidenceReference: text,
    reason: text,
    expiresAt: date,
  }),
  insurance: z.object({
    cargoId: text,
    reference: text,
    insurer: text,
    coverage: positive,
    expiresAt: date,
    status: z.enum(["ACCEPTED", "REJECTED"]),
  }),
  guarantee: z.object({
    cargoId: text,
    reference: text,
    institution: text,
    amount: positive,
    expiresAt: date,
    status: z.enum(["ACCEPTED", "REJECTED"]),
  }),
  deposit: z.object({
    cargoId: text,
    declared: amount,
    confirmed: amount,
    evidenceReference: text,
  }),
  fiscal: z.object({
    cargoId: text,
    documentedPaid: amount,
    evidenceReference: text,
  }),
  approve: z.object({ cargoId: text, reason: text }),
  release: z.object({ cargoId: text }),
  revoke: z.object({ cargoId: text, reason: text }),
  evaluate: z.object({ cargoId: text }),
  documentReview: z.object({
    documentId: text,
    status: z.enum(["ACCEPTED", "REJECTED"]),
    reason: text,
  }),
  policy: z.object({
    depositRate: z
      .string()
      .refine(
        (v) =>
          /^0\.\d+$/.test(v) &&
          new Decimal(v).gte(".005") &&
          new Decimal(v).lte(".02"),
      ),
    royaltyRate: amount.refine((v) => new Decimal(v).lte(1)),
    dutyRate: amount.refine((v) => new Decimal(v).lte(1)),
    otherRate: amount.refine((v) => new Decimal(v).lte(1)),
    discrepancyRate: amount.refine((v) => new Decimal(v).lte(".1")),
    tokenMinutes: z.number().int().min(1).max(60),
  }),
};
export async function audit(
  tx: Tx,
  u: Principal,
  action: string,
  targetId: string,
  metadata: unknown,
) {
  await tx.auditEvent.create({
    data: {
      tenantId: u.tenantId,
      organizationId: u.organizationId,
      actorId: u.id,
      action,
      targetId,
      metadata: JSON.parse(JSON.stringify(metadata)),
    },
  });
}
/** Record rejected HTTP operations after their domain transaction rolls back. */
export async function recordRejection(
  user: Principal | undefined,
  operation: unknown,
  target: unknown,
  error: unknown,
  responseStatus?: number,
) {
  if (!user) return;
  const knownOperation =
    typeof operation === "string" &&
    (Object.hasOwn(schemas, operation) ||
      [
        "upload",
        "VALVELAB_REQUEST",
        "register",
        "OPEN",
        "CLOSE",
        "estop",
      ].includes(operation));
  const targetId =
    typeof target === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(target)
      ? target
      : "request";
  try {
    await audit(db, user, "OPERATION_REJECTED", targetId, {
      operation: knownOperation ? operation : "INVALID_REQUEST",
      reason: error instanceof AppError ? error.message : "OPERATION_FAILED",
      status:
        responseStatus ??
        (error instanceof AppError
          ? error.status
          : ["P2002", "P2034"].includes(
                (error as { code?: string })?.code ?? "",
              )
            ? 409
            : 500),
    });
  } catch {
    // The request is already failing; never log its body, credentials or database error.
    console.error("Could not persist the rejected-operation audit event.");
  }
}
export async function invalidate(
  tx: Tx,
  u: Principal,
  cargoId: string,
  reason: string,
) {
  await tx.releaseToken.updateMany({
    where: { cargoId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.cargo.update({
    where: { id: cargoId },
    data: { version: { increment: 1 }, status: "UNDER_REVIEW" },
  });
  await audit(tx, u, "AUTHORIZATION_INVALIDATED", cargoId, { reason });
}
async function lockCargo(tx: Tx, u: Principal, id: string) {
  await tx.$queryRaw`SELECT id FROM "Cargo" WHERE id=${id} FOR UPDATE`;
  const c = await tx.cargo.findFirst({
    where: { id, ...cargoScope(u) },
    include: cargoInclude,
  });
  if (!c) throw new AppError("Cargo not found.", 404);
  return c;
}
async function ownedOrg(tx: Tx, u: Principal, id: string) {
  const org = await tx.organization.findFirst({
    where: {
      id,
      tenantId: u.tenantId,
      ...(isProducer(u) ? { id: u.organizationId } : {}),
    },
  });
  if (!org) throw new AppError("Organization not accessible.", 403);
  return org;
}
export async function policyFor(tx: Tx, tenantId: string) {
  return tx.policy.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
}
function secret() {
  const key = process.env.DRT_SECRET;
  if (!key || key.length < 32)
    throw new AppError("Release signing key is not configured.", 503);
  return key;
}
function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}
export function signRelease(payload: {
  id: string;
  cargoId: string;
  version: number;
  issuer: string;
  iat: number;
  exp: number;
  demo: true;
}) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body)}`;
}
export async function verifyToken(token: string) {
  try {
    if (token.length > 3000) return { status: "INVALID" };
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra) return { status: "INVALID" };
    const expected = Buffer.from(signature(body));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return { status: "INVALID" };
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    const record = await db.releaseToken.findUnique({
      where: { id: p.id },
      include: { cargo: { include: cargoInclude } },
    });
    if (
      !record ||
      record.token !== token ||
      record.cargoId !== p.cargoId ||
      record.version !== p.version
    )
      return { status: "INVALID" };
    if (record.revokedAt || record.cargo.version !== record.version)
      return { status: "REVOKED", demo: true };
    if (record.expiresAt <= new Date() || p.exp <= Date.now())
      return { status: "EXPIRED", demo: true };
    const policy = await db.policy.findUniqueOrThrow({
      where: { tenantId: record.cargo.organization.tenantId },
    });
    if (!assess(record.cargo, policy).eligible)
      return { status: "REVOKED", demo: true };
    return {
      status: "VALID",
      demo: true,
      reference: record.cargo.reference,
      issuedAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    return { status: "INVALID" };
  }
}
export async function execute(user: Principal, action: string, input: unknown) {
  if (!Object.hasOwn(schemas, action)) throw new AppError("Unknown action.");
  const parsed = schemas[action as keyof typeof schemas].safeParse(input);
  if (!parsed.success)
    throw new AppError(
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  // Each discriminated action has its own Zod schema above; database writes use explicit fields.
  const p = parsed.data as Record<string, any>;
  return db.$transaction(
    async (tx) => {
      let result: unknown = { ok: true };
      const now = new Date();
      if (action === "policy") {
        requireRole(user, "ADMIN");
        const previous = await policyFor(tx, user.tenantId);
        await tx.policy.update({ where: { tenantId: user.tenantId }, data: p });
        const cargos = await tx.cargo.findMany({
          where: { organization: { tenantId: user.tenantId } },
          select: { id: true },
        });
        for (const c of cargos)
          await invalidate(tx, user, c.id, "Demonstration policy changed");
        await audit(tx, user, "POLICY_CHANGED", user.tenantId, {
          before: previous,
          after: p,
        });
        return { ok: true };
      }
      if (action === "user") {
        requireRole(user, "ADMIN");
        await ownedOrg(tx, user, p.organizationId);
        const passwordHash = await hash(p.password, 12);
        result = await tx.user.create({
          data: {
            name: p.name,
            email: p.email.toLowerCase(),
            passwordHash,
            memberships: {
              create: { organizationId: p.organizationId, roles: [p.role] },
            },
          },
          select: { id: true, name: true, email: true },
        });
        delete p.password;
      } else if (action === "userActive") {
        requireRole(user, "ADMIN");
        if (p.id === user.id)
          throw new AppError("You cannot disable your own account.");
        const target = await tx.user.findFirst({
          where: {
            id: p.id,
            memberships: {
              some: { organization: { tenantId: user.tenantId } },
            },
          },
        });
        if (!target) throw new AppError("User not found.", 404);
        result = await tx.user.update({
          where: { id: p.id },
          data: { active: p.active },
          select: { id: true, active: true },
        });
        if (!p.active) await tx.session.deleteMany({ where: { userId: p.id } });
      } else if (action === "assetVerify") {
        requireRole(user, "REGULATOR");
        const asset = await tx.resourceAsset.findFirst({
          where: { id: p.id, organization: { tenantId: user.tenantId } },
          include: { batches: { include: { allocations: true } } },
        });
        if (!asset) throw new AppError("Asset not found.", 404);
        result = await tx.resourceAsset.update({
          where: { id: asset.id },
          data: { authorized: p.authorized },
        });
        for (const id of new Set(
          asset.batches.flatMap((b) => b.allocations.map((a) => a.cargoId)),
        ))
          await invalidate(tx, user, id, "Asset authorization changed");
      } else if (action === "organization") {
        requireRole(user, "ADMIN");
        result = await tx.organization.create({
          data: {
            name: p.name,
            type: p.type,
            jurisdiction: p.jurisdiction,
            registration: p.registration,
            beneficialOwners: p.beneficialOwners,
            tenantId: user.tenantId,
          },
        });
      } else if (action === "organizationVerify") {
        requireRole(user, "COMPLIANCE", "REGULATOR");
        await ownedOrg(tx, user, p.id);
        result = await tx.organization.update({
          where: { id: p.id },
          data: { verified: p.verified },
        });
        for (const c of await tx.cargo.findMany({
          where: { organizationId: p.id },
        }))
          await invalidate(tx, user, c.id, "Producer verification changed");
      } else if (action === "license") {
        requireRole(user, "REGULATOR");
        await ownedOrg(tx, user, p.organizationId);
        result = await tx.license.create({
          data: {
            organizationId: p.organizationId,
            reference: p.reference,
            expiresAt: new Date(p.expiresAt),
            verified: p.verified,
          },
        });
        for (const c of await tx.cargo.findMany({
          where: { organizationId: p.organizationId },
        }))
          await invalidate(tx, user, c.id, "License changed");
      } else if (action === "asset") {
        requireRole(user, "OPERATOR", "ADMIN");
        await ownedOrg(tx, user, p.organizationId);
        result = await tx.resourceAsset.create({
          data: {
            organizationId: p.organizationId,
            name: p.name,
            location: p.location,
            authorized: false,
          },
        });
      } else if (action === "batch") {
        requireRole(user, "OPERATOR");
        const asset = await tx.resourceAsset.findFirst({
          where: {
            id: p.assetId,
            organization: { tenantId: user.tenantId },
            organizationId: user.organizationId,
          },
        });
        if (!asset) throw new AppError("Asset not accessible.", 403);
        result = await tx.productionBatch.create({
          data: {
            resourceId: `RID-${randomUUID().slice(0, 12).toUpperCase()}`,
            organizationId: asset.organizationId,
            assetId: asset.id,
            grade: p.grade,
            quantity: p.quantity,
            storage: p.storage,
            productionDate: new Date(p.productionDate),
          },
        });
      } else if (action === "transfer") {
        requireRole(user, "OPERATOR");
        await tx.$queryRaw`SELECT id FROM "ProductionBatch" WHERE id=${p.batchId} FOR UPDATE`;
        const b = await tx.productionBatch.findFirst({
          where: { id: p.batchId, organizationId: user.organizationId },
          include: { movements: true, allocations: true },
        });
        if (!b) throw new AppError("Batch not accessible.", 403);
        if (p.fromLocation === p.toLocation)
          throw new AppError("Choose a different destination.");
        let balance = new Decimal(
          b.storage === p.fromLocation ? b.quantity.toString() : "0",
        );
        for (const m of b.movements) {
          if (m.fromLocation === p.fromLocation)
            balance = balance.minus(m.quantity.toString());
          if (m.toLocation === p.fromLocation)
            balance = balance.plus(m.quantity.toString());
        }
        for (const a of b.allocations)
          if (a.location === p.fromLocation)
            balance = balance.minus(a.quantity.toString());
        if (balance.lt(p.quantity))
          throw new AppError(
            "Insufficient unallocated quantity at source location.",
          );
        result = await tx.custodyEvent.create({
          data: {
            batchId: b.id,
            fromLocation: p.fromLocation,
            toLocation: p.toLocation,
            quantity: p.quantity,
            reference: p.reference,
            actorId: user.id,
          },
        });
        for (const cargoId of new Set(b.allocations.map((a) => a.cargoId)))
          await invalidate(tx, user, cargoId, "Custody movement added");
      } else if (action === "cargo") {
        requireRole(user, "OPERATOR");
        await ownedOrg(tx, user, p.organizationId);
        result = await tx.cargo.create({
          data: {
            reference: p.reference,
            organizationId: user.organizationId,
            createdBy: user.id,
            grade: p.grade,
            quantity: p.quantity,
            value: p.value,
            terminal: p.terminal,
            vessel: p.vessel,
            shipmentDate: new Date(p.shipmentDate),
            testOnly: p.testOnly,
          },
        });
      } else if (action === "counterparty") {
        requireRole(user, "COMPLIANCE");
        result = await tx.counterparty.create({
          data: {
            name: p.name,
            type: p.type,
            jurisdiction: p.jurisdiction,
            registration: p.registration,
            beneficialOwners: p.beneficialOwners,
            tenantId: user.tenantId,
          },
        });
      } else if (action === "counterpartyVerify") {
        requireRole(user, "COMPLIANCE");
        const cp = await tx.counterparty.findFirst({
          where: { id: p.id, tenantId: user.tenantId },
        });
        if (!cp) throw new AppError("Counterparty not found.", 404);
        result = await tx.counterparty.update({
          where: { id: cp.id },
          data: { verified: p.verified },
        });
        for (const c of await tx.tradeContract.findMany({
          where: { buyerId: cp.id },
        }))
          await invalidate(
            tx,
            user,
            c.cargoId,
            "Counterparty verification changed",
          );
      } else if (action === "documentReview") {
        requireRole(user, "COMPLIANCE", "INSPECTOR");
        const d = await tx.evidenceDocument.findFirst({
          where: { id: p.documentId, cargo: cargoScope(user) },
        });
        if (!d) throw new AppError("Document not found.", 404);
        if (d.uploadedBy === user.id)
          throw new AppError("Independent reviewer required.", 403);
        await lockCargo(tx, user, d.cargoId);
        result = await tx.evidenceDocument.update({
          where: { id: d.id },
          data: { status: p.status },
        });
        await invalidate(tx, user, d.cargoId, "Evidence review changed");
      } else {
        const c = await lockCargo(tx, user, p.cargoId);
        const policy = await policyFor(tx, user.tenantId);
        if (action === "allocate") {
          requireRole(user, "OPERATOR");
          await tx.$queryRaw`SELECT id FROM "ProductionBatch" WHERE id=${p.batchId} FOR UPDATE`;
          const b = await tx.productionBatch.findFirst({
            where: { id: p.batchId, organizationId: c.organizationId },
            include: { allocations: true, movements: true },
          });
          if (!b) throw new AppError("Batch not accessible.", 403);
          let balance = new Decimal(
            b.storage === p.location ? b.quantity.toString() : "0",
          );
          for (const m of b.movements) {
            if (m.fromLocation === p.location)
              balance = balance.minus(m.quantity.toString());
            if (m.toLocation === p.location)
              balance = balance.plus(m.quantity.toString());
          }
          for (const a of b.allocations)
            if (a.location === p.location)
              balance = balance.minus(a.quantity.toString());
          if (
            balance.lt(p.quantity) ||
            c.allocations
              .reduce((n, a) => n.plus(a.quantity.toString()), new Decimal(0))
              .plus(p.quantity)
              .gt(c.quantity.toString())
          )
            throw new AppError(
              "Allocation exceeds available batch or cargo quantity.",
            );
          result = await tx.cargoAllocation.create({
            data: {
              cargoId: c.id,
              batchId: b.id,
              location: p.location,
              quantity: p.quantity,
            },
          });
          await invalidate(tx, user, c.id, "Resource allocation changed");
        } else if (action === "cargoEdit") {
          requireRole(user, "OPERATOR");
          const before = {
            terminal: c.terminal,
            vessel: c.vessel,
            shipmentDate: c.shipmentDate,
          };
          result = await tx.cargo.update({
            where: { id: c.id },
            data: {
              terminal: p.terminal,
              vessel: p.vessel,
              shipmentDate: new Date(p.shipmentDate),
            },
          });
          await invalidate(tx, user, c.id, p.reason);
          await audit(tx, user, "CARGO_CORRECTED", c.id, { before, after: p });
        } else if (action === "contract") {
          requireRole(user, "OPERATOR");
          const buyer = await tx.counterparty.findFirst({
            where: { id: p.buyerId, tenantId: user.tenantId },
          });
          if (!buyer) throw new AppError("Buyer not accessible.");
          const data = {
            buyerId: buyer.id,
            reference: p.reference,
            quantity: p.quantity,
            price: p.price,
            incoterm: p.incoterm,
            paymentTerms: p.paymentTerms,
            status: "DECLARED",
            reviewerId: null,
          };
          result = await tx.tradeContract.upsert({
            where: { cargoId: c.id },
            create: { cargoId: c.id, ...data },
            update: data,
          });
          await invalidate(tx, user, c.id, "Trade contract changed");
        } else if (action === "contractReview") {
          requireRole(user, "COMPLIANCE");
          if (!c.contract) throw new AppError("Add a contract first.");
          result = await tx.tradeContract.update({
            where: { cargoId: c.id },
            data: { status: p.status, reviewerId: user.id },
          });
          await invalidate(tx, user, c.id, p.reason);
        } else if (action === "inspection") {
          requireRole(user, "INSPECTOR");
          if (
            user.organizationId === c.organizationId ||
            user.id === c.createdBy
          )
            throw new AppError(
              "Inspection must be independent of the producer.",
              403,
            );
          result = await tx.inspection.create({
            data: {
              cargoId: c.id,
              inspectorId: user.id,
              inspectorOrganizationId: user.organizationId,
              measuredQuantity: p.measuredQuantity,
              quality: p.quality,
              samplingReference: p.samplingReference,
              reportReference: p.reportReference,
              status: p.status,
              expiresAt: new Date(p.expiresAt),
            },
          });
          await invalidate(tx, user, c.id, "Q&Q inspection changed");
        } else if (action === "decision") {
          requireRole(user, "COMPLIANCE");
          const data = {
            status: p.status,
            evidenceReference: p.evidenceReference,
            reason: p.reason,
            expiresAt: new Date(p.expiresAt),
            reviewerId: user.id,
            provenance: p.provenance,
          };
          result = await tx.verificationDecision.upsert({
            where: { cargoId_kind: { cargoId: c.id, kind: p.kind } },
            create: { cargoId: c.id, kind: p.kind, ...data },
            update: data,
          });
          await invalidate(tx, user, c.id, `${p.kind} review changed`);
        } else if (action === "insurance") {
          requireRole(user, "COMPLIANCE");
          const data = {
            reference: p.reference,
            insurer: p.insurer,
            coverage: p.coverage,
            expiresAt: new Date(p.expiresAt),
            status: p.status,
            reviewerId: user.id,
          };
          result = await tx.insuranceRecord.upsert({
            where: { cargoId: c.id },
            create: { cargoId: c.id, ...data },
            update: data,
          });
          await invalidate(tx, user, c.id, "Insurance changed");
        } else if (action === "guarantee") {
          requireRole(user, "COMPLIANCE");
          const data = {
            reference: p.reference,
            institution: p.institution,
            amount: p.amount,
            expiresAt: new Date(p.expiresAt),
            status: p.status,
            reviewerId: user.id,
          };
          result = await tx.guaranteeRecord.upsert({
            where: { cargoId: c.id },
            create: { cargoId: c.id, ...data },
            update: data,
          });
          await invalidate(tx, user, c.id, "Guarantee changed");
        } else if (action === "deposit") {
          requireRole(user, "TREASURY");
          if (new Decimal(p.confirmed).gt(p.declared))
            throw new AppError(
              "Confirmed amount cannot exceed declared deposit.",
            );
          const data = {
            rate: policy.depositRate,
            required: new Decimal(c.value.toString())
              .times(policy.depositRate.toString())
              .toFixed(2),
            declared: p.declared,
            confirmed: p.confirmed,
            evidenceReference: p.evidenceReference,
            reviewerId: user.id,
          };
          result = await tx.treasuryDeposit.upsert({
            where: { cargoId: c.id },
            create: { cargoId: c.id, ...data },
            update: data,
          });
          await invalidate(tx, user, c.id, "Deposit attestation changed");
        } else if (action === "fiscal") {
          requireRole(user, "TREASURY");
          const f = financials(
            c.value.toString(),
            policy.depositRate.toString(),
            policy.royaltyRate.toString(),
            policy.dutyRate.toString(),
            policy.otherRate.toString(),
          );
          const data = {
            royaltyRate: policy.royaltyRate,
            dutyRate: policy.dutyRate,
            otherRate: policy.otherRate,
            assessed: f.total,
            documentedPaid: p.documentedPaid,
            reviewerId: user.id,
            evidenceReference: p.evidenceReference,
          };
          result = await tx.fiscalAssessment.upsert({
            where: { cargoId: c.id },
            create: { cargoId: c.id, ...data },
            update: data,
          });
          await invalidate(tx, user, c.id, "Fiscal assessment changed");
        } else if (action === "evaluate") {
          requireRole(
            user,
            "OPERATOR",
            "INSPECTOR",
            "COMPLIANCE",
            "REGULATOR",
            "TREASURY",
            "ADMIN",
          );
          const evaluation = assess(c, policy);
          await tx.riskFlag.updateMany({
            where: { cargoId: c.id, kind: { not: "duplicate-document" } },
            data: { resolved: true },
          });
          for (const condition of evaluation.blocking)
            await tx.riskFlag.upsert({
              where: { cargoId_kind: { cargoId: c.id, kind: condition.key } },
              create: {
                cargoId: c.id,
                kind: condition.key,
                reason: condition.reason,
              },
              update: { reason: condition.reason, resolved: false },
            });
          await tx.cargo.update({
            where: { id: c.id },
            data: { status: evaluation.status },
          });
          result = evaluation;
        } else if (action === "approve") {
          requireRole(user, "REGULATOR");
          if (
            user.id === c.createdBy ||
            user.organizationId === c.organizationId
          )
            throw new AppError(
              "Approval requires an independent authorizing officer.",
              403,
            );
          const evaluation = assess(c, policy);
          if (!evaluation.eligible)
            throw new AppError(
              "ARRS blocked: " +
                evaluation.blocking.map((x) => x.name).join(", "),
            );
          await tx.approval.updateMany({
            where: { cargoId: c.id, version: c.version, decision: "APPROVED" },
            data: { decision: "SUPERSEDED" },
          });
          result = await tx.approval.create({
            data: {
              cargoId: c.id,
              version: c.version,
              actorId: user.id,
              decision: "APPROVED",
              reason: p.reason,
              expiresAt: new Date(now.getTime() + 24 * 3600000),
            },
          });
          await tx.cargo.update({
            where: { id: c.id },
            data: { status: "APPROVED" },
          });
        } else if (action === "release") {
          requireRole(user, "OPERATOR", "REGULATOR");
          const evaluation = assess(c, policy);
          if (!evaluation.eligible || !evaluation.approval)
            throw new AppError(
              "Eligible cargo and current independent approval are required.",
            );
          if (evaluation.approval.actorId === user.id)
            throw new AppError(
              "The release requester must be different from its approver.",
              403,
            );
          await tx.releaseToken.updateMany({
            where: { cargoId: c.id, revokedAt: null, expiresAt: { lte: now } },
            data: { revokedAt: now },
          });
          const existing = await tx.releaseToken.findFirst({
            where: {
              cargoId: c.id,
              version: c.version,
              revokedAt: null,
              expiresAt: { gt: now },
            },
          });
          if (existing) return { token: existing.token };
          const id = randomUUID(),
            expiresAt = new Date(now.getTime() + policy.tokenMinutes * 60000);
          const token = signRelease({
            id,
            cargoId: c.id,
            version: c.version,
            issuer: "AXIOM-DEMO",
            iat: now.getTime(),
            exp: expiresAt.getTime(),
            demo: true,
          });
          result = await tx.releaseToken.create({
            data: {
              id,
              cargoId: c.id,
              version: c.version,
              issuerId: user.id,
              token,
              expiresAt,
            },
          });
          await tx.cargo.update({
            where: { id: c.id },
            data: { status: "RELEASED" },
          });
        } else if (action === "revoke") {
          requireRole(user, "REGULATOR");
          await invalidate(tx, user, c.id, p.reason);
          await tx.cargo.update({
            where: { id: c.id },
            data: { status: "REVOKED" },
          });
        }
      }
      await audit(
        tx,
        user,
        action.toUpperCase(),
        p.cargoId ?? p.id ?? (result as { id?: string })?.id ?? "registry",
        { input: p, result },
      );
      return result;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15000,
    },
  );
}
export async function stateFor(user: Principal) {
  const policy = await db.policy.findUniqueOrThrow({
    where: { tenantId: user.tenantId },
  });
  const [cargoes, organizations, batches, counterparties, auditEvents, users] =
    await Promise.all([
      db.cargo.findMany({
        where: cargoScope(user),
        include: cargoInclude,
        orderBy: { createdAt: "desc" },
      }),
      db.organization.findMany({
        where: {
          tenantId: user.tenantId,
          ...(isProducer(user) ? { id: user.organizationId } : {}),
        },
        include: { licenses: true, assets: true },
      }),
      db.productionBatch.findMany({
        where: {
          organization: { tenantId: user.tenantId },
          ...(isProducer(user) ? { organizationId: user.organizationId } : {}),
        },
        include: { asset: true, movements: true, allocations: true },
        orderBy: { createdAt: "desc" },
      }),
      db.counterparty.findMany({ where: { tenantId: user.tenantId } }),
      db.auditEvent.findMany({
        where: {
          tenantId: user.tenantId,
          ...(isProducer(user) ? { organizationId: user.organizationId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      user.roles.includes("ADMIN")
        ? db.user.findMany({
            where: {
              memberships: {
                some: { organization: { tenantId: user.tenantId } },
              },
            },
            select: {
              id: true,
              name: true,
              email: true,
              active: true,
              memberships: { select: { roles: true, organizationId: true } },
            },
          })
        : Promise.resolve([]),
    ]);
  return {
    user,
    policy,
    organizations,
    batches,
    counterparties,
    users,
    auditEvents,
    cargoes: cargoes.map((c) => {
      const evaluation = assess(c, policy);
      const token = c.tokens.find(
        (t) =>
          !t.revokedAt && t.expiresAt > new Date() && t.version === c.version,
      );
      return {
        ...c,
        evaluation,
        displayStatus:
          token && evaluation.eligible
            ? "RELEASED"
            : c.status === "REVOKED"
              ? "REVOKED"
              : c.status === "RELEASED" &&
                  c.tokens.some(
                    (t) =>
                      t.version === c.version &&
                      !t.revokedAt &&
                      t.expiresAt <= new Date(),
                  )
                ? "EXPIRED"
                : c.status === "DRAFT"
                  ? "DRAFT"
                  : evaluation.status,
      };
    }),
  };
}
