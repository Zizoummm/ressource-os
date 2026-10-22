import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  execute,
  verifyToken,
  signRelease,
  stateFor,
} from "../src/server/resourceos";
import { dossier, upload, download } from "../src/server/documents";
import type { Principal } from "../src/server/auth";
const suffix = randomUUID().slice(0, 8);
const future = new Date(Date.now() + 90 * 86400000).toISOString();
async function actor(email: string): Promise<Principal> {
  const u = await db.user.findUniqueOrThrow({
    where: { email },
    include: { memberships: { include: { organization: true } } },
  });
  const m = u.memberships[0];
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    tenantId: m.organization.tenantId,
    roles: m.roles,
  };
}
let assertions = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  assertions++;
  console.log(`PASS ${name}`);
}
async function main() {
  const op = await actor("operator@axiom.demo"),
    op2 = await actor("operator2@axiom.demo"),
    reg = await actor("regulator@axiom.demo"),
    ins = await actor("inspector@axiom.demo"),
    comp = await actor("compliance@axiom.demo"),
    treasury = await actor("treasury@axiom.demo");
  const asset = (await execute(op, "asset", {
    organizationId: op.organizationId,
    name: `Integration field ${suffix}`,
    location: "Demo fixture",
  })) as { id: string };
  await execute(reg, "assetVerify", { id: asset.id, authorized: true });
  const batch = (await execute(op, "batch", {
    assetId: asset.id,
    grade: "TEST",
    quantity: "1000",
    storage: "Origin",
    productionDate: new Date().toISOString(),
  })) as { id: string };
  await execute(op, "transfer", {
    batchId: batch.id,
    fromLocation: "Origin",
    toLocation: "Terminal",
    quantity: "500",
    reference: `MOVE-${suffix}`,
  });
  const cargo = (await execute(op, "cargo", {
    reference: `TEST-A-${suffix}`,
    organizationId: op.organizationId,
    grade: "TEST",
    quantity: "100",
    value: "7500",
    terminal: "Terminal",
    vessel: "MV Demo Test",
    shipmentDate: future,
  })) as { id: string };
  const cargoId = cargo.id;
  await test("organization isolation blocks another producer", async () => {
    await assert.rejects(
      () =>
        execute(op2, "allocate", {
          cargoId,
          batchId: batch.id,
          location: "Terminal",
          quantity: "100",
        }),
      /not found/,
    );
    const state = await stateFor(op2);
    assert(!state.cargoes.some((c) => c.id === cargoId));
  });
  await test("allocation cannot exceed available cargo or batch quantity", async () => {
    await assert.rejects(
      () =>
        execute(op, "allocate", {
          cargoId,
          batchId: batch.id,
          location: "Terminal",
          quantity: "501",
        }),
      /exceeds/,
    );
    await execute(op, "allocate", {
      cargoId,
      batchId: batch.id,
      location: "Terminal",
      quantity: "100",
    });
    await assert.rejects(
      () =>
        execute(op, "transfer", {
          batchId: batch.id,
          fromLocation: "Terminal",
          toLocation: "Elsewhere",
          quantity: "401",
          reference: "OVERDRAW",
        }),
      /Insufficient/,
    );
  });
  await test("scenario B blocks release before mandatory evidence", async () => {
    await assert.rejects(
      () => execute(op, "release", { cargoId }),
      /Eligible cargo/,
    );
    const state = await stateFor(op);
    const c = state.cargoes.find((c) => c.id === cargoId)!;
    assert.equal(c.evaluation.eligible, false);
    assert(c.evaluation.blocking.some((b) => b.key === "inspection"));
  });
  const buyer = await db.counterparty.findFirstOrThrow({
    where: { tenantId: op.tenantId, verified: true },
  });
  await execute(op, "contract", {
    cargoId,
    buyerId: buyer.id,
    reference: `CONTRACT-${suffix}`,
    quantity: "100",
    price: "75",
    incoterm: "FOB",
    paymentTerms: "Demonstration documentary terms",
  });
  await execute(comp, "contractReview", {
    cargoId,
    status: "ACCEPTED",
    reason: "Independent documentary review",
  });
  await test("producer cannot self-inspect or self-approve", async () => {
    await assert.rejects(
      () =>
        execute({ ...op, roles: ["INSPECTOR"] }, "inspection", {
          cargoId,
          measuredQuantity: "100",
          quality: "Test water",
          samplingReference: "sample",
          reportReference: "report",
          status: "ACCEPTED",
          expiresAt: future,
        }),
      /independent/,
    );
    await assert.rejects(
      () =>
        execute({ ...op, roles: ["REGULATOR"] }, "approve", {
          cargoId,
          reason: "Self approval",
        }),
      /independent/,
    );
  });
  await execute(ins, "inspection", {
    cargoId,
    measuredQuantity: "100",
    quality: "Fictional grade test",
    samplingReference: `SAMPLE-${suffix}`,
    reportReference: `QQ-${suffix}`,
    status: "ACCEPTED",
    expiresAt: future,
  });
  for (const kind of ["POP", "POF"])
    await execute(comp, "decision", {
      cargoId,
      kind,
      status: "ACCEPTED",
      evidenceReference: `${kind}-${suffix}`,
      reason: "Simulated independent evidence",
      expiresAt: future,
    });
  await execute(comp, "insurance", {
    cargoId,
    reference: `INS-${suffix}`,
    insurer: "Demo insurer",
    coverage: "7500",
    expiresAt: future,
    status: "ACCEPTED",
  });
  await execute(comp, "guarantee", {
    cargoId,
    reference: `GUAR-${suffix}`,
    institution: "Demo guarantee house",
    amount: "75",
    expiresAt: future,
    status: "ACCEPTED",
  });
  await execute(treasury, "deposit", {
    cargoId,
    declared: "75",
    confirmed: "75",
    evidenceReference: `DEP-${suffix}`,
  });
  await execute(treasury, "fiscal", {
    cargoId,
    documentedPaid: "525",
    evidenceReference: `FISCAL-${suffix}`,
  });
  await test("eligibility does not replace independent final approval", async () => {
    const state = await stateFor(op);
    assert.equal(
      state.cargoes.find((c) => c.id === cargoId)!.evaluation.eligible,
      true,
    );
    await assert.rejects(
      () => execute(op, "release", { cargoId }),
      /independent approval/,
    );
  });
  let token = "";
  await test("scenario A issues one signed token after independent approval", async () => {
    await execute(reg, "approve", {
      cargoId,
      reason: "Independent approval for integration scenario A",
    });
    await assert.rejects(
      () => execute(reg, "release", { cargoId }),
      /different from its approver/,
    );
    const a = (await execute(op, "release", { cargoId })) as { token: string };
    const b = (await execute(op, "release", { cargoId })) as { token: string };
    assert.equal(a.token, b.token);
    token = a.token;
    assert.equal((await verifyToken(token)).status, "VALID");
    assert.equal(
      (await verifyToken(token.slice(0, -3) + "bad")).status,
      "INVALID",
    );
    const stored = await db.releaseToken.count({
      where: { cargoId, revokedAt: null },
    });
    assert.equal(stored, 1);
  });
  await test("PDF dossier generated from verified records", async () => {
    const pdf = await dossier(op, cargoId);
    assert(Buffer.from(pdf).subarray(0, 5).equals(Buffer.from("%PDF-")));
    assert(pdf.length > 5000);
    await assert.rejects(() => dossier(op2, cargoId), /not found/);
  });
  await test("scenario C revokes previous token after material evidence change", async () => {
    await execute(comp, "decision", {
      cargoId,
      kind: "POF",
      status: "REJECTED",
      evidenceReference: `REVOKED-${suffix}`,
      reason: "Scenario C controlling evidence withdrawn",
      expiresAt: future,
    });
    assert.equal((await verifyToken(token)).status, "REVOKED");
    await assert.rejects(
      () => execute(op, "release", { cargoId }),
      /Eligible cargo/,
    );
  });
  await test("expired token is distinguished from invalid token", async () => {
    const c = await db.cargo.findUniqueOrThrow({ where: { id: cargoId } });
    const id = randomUUID(),
      expiresAt = new Date(Date.now() - 1000);
    const expired = signRelease({
      id,
      cargoId,
      version: c.version,
      issuer: "AXIOM-DEMO",
      iat: Date.now() - 60000,
      exp: expiresAt.getTime(),
      demo: true,
    });
    await db.releaseToken.create({
      data: {
        id,
        cargoId,
        version: c.version,
        issuerId: reg.id,
        token: expired,
        expiresAt,
      },
    });
    assert.equal((await verifyToken(expired)).status, "EXPIRED");
  });
  await test("protected evidence requires independent review and tenant access", async () => {
    const pdf = await dossier(op, cargoId);
    const file = new File([new Uint8Array(pdf)], "integration.pdf", {
      type: "application/pdf",
    });
    const d = await upload(op, cargoId, file, `DOC-${suffix}`);
    assert.equal(d.status, "SUBMITTED");
    await assert.rejects(() => download(op2, d.id), /not found/);
    await assert.rejects(
      () =>
        execute({ ...op, roles: ["COMPLIANCE"] }, "documentReview", {
          documentId: d.id,
          status: "ACCEPTED",
          reason: "Self review",
        }),
      /Independent/,
    );
    await execute(comp, "documentReview", {
      documentId: d.id,
      status: "ACCEPTED",
      reason: "Independent review",
    });
    const stored = await download(op, d.id);
    assert.equal(stored.bytes.length, pdf.length);
    await assert.rejects(
      () =>
        upload(
          op,
          cargoId,
          new File(["bad"], "fake.pdf", { type: "application/pdf" }),
          "INVALID",
        ),
      /signatures/,
    );
  });
  await test("audit and custody are append-only in PostgreSQL", async () => {
    const event = await db.auditEvent.findFirstOrThrow({
      where: { targetId: cargoId },
    });
    await assert.rejects(
      () =>
        db.auditEvent.update({
          where: { id: event.id },
          data: { action: "TAMPERED" },
        }),
      /Append-only/,
    );
    const movement = await db.custodyEvent.findFirstOrThrow({
      where: { batchId: batch.id },
    });
    await assert.rejects(
      () => db.custodyEvent.delete({ where: { id: movement.id } }),
      /Append-only/,
    );
  });
  await test("concurrent allocations conserve volume", async () => {
    const b = (await execute(op, "batch", {
      assetId: asset.id,
      grade: "TEST",
      quantity: "100",
      storage: "Concurrency tank",
      productionDate: new Date().toISOString(),
    })) as { id: string };
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const c = (await execute(op, "cargo", {
        reference: `RACE-${i}-${suffix}`,
        organizationId: op.organizationId,
        grade: "TEST",
        quantity: "80",
        value: "6000",
        terminal: "Terminal",
        vessel: "MV Demo",
        shipmentDate: future,
      })) as { id: string };
      ids.push(c.id);
    }
    const results = await Promise.allSettled(
      ids.map((id) =>
        execute(op, "allocate", {
          cargoId: id,
          batchId: b.id,
          location: "Concurrency tank",
          quantity: "80",
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const sum = await db.cargoAllocation.aggregate({
      where: { batchId: b.id },
      _sum: { quantity: true },
    });
    assert.equal(sum._sum.quantity?.toString(), "80");
  });
  console.log(`${assertions} database integration checks passed.`);
}
main().finally(() => db.$disconnect());
