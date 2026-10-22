import { appOrigin } from "./runtime";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { storage } from "./storage";
import { AppError, requireRole, cargoScope, type Principal } from "./auth";
import { audit, invalidate } from "./resourceos";
import { cargoInclude, assess, financials } from "./arrs";
export async function upload(
  user: Principal,
  cargoId: string,
  file: File,
  reference: string,
) {
  requireRole(user, "OPERATOR", "INSPECTOR", "COMPLIANCE", "TREASURY");
  if (!reference || reference.length > 200)
    throw new AppError("Evidence reference required.");
  if (file.size === 0 || file.size > 5 * 1024 * 1024)
    throw new AppError("Evidence must be between 1 byte and 5 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const valid =
    file.type === "application/pdf"
      ? buffer.subarray(0, 5).toString() === "%PDF-"
      : file.type === "image/png"
        ? buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.type === "image/jpeg"
          ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
          : false;
  if (!valid)
    throw new AppError(
      "Only PDF, PNG and JPEG files with matching signatures are accepted.",
    );
  const key = randomUUID();
  const cargo = await db.cargo.findFirst({
    where: { id: cargoId, ...cargoScope(user) },
  });
  if (!cargo) throw new AppError("Cargo not found.", 404);
  await storage.put(key, buffer);
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Cargo" WHERE id=${cargoId} FOR UPDATE`;
        const document = await tx.evidenceDocument.create({
          data: {
            cargoId,
            uploadedBy: user.id,
            filename: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120),
            storageKey: key,
            contentType: file.type,
            size: file.size,
            sha256: createHash("sha256").update(buffer).digest("hex"),
            reference,
            provenance: "SELF_DECLARED",
          },
        });
        const duplicates = await tx.evidenceDocument.count({
          where: {
            reference,
            cargo: { organization: { tenantId: user.tenantId } },
          },
        });
        if (duplicates > 1)
          await tx.riskFlag.upsert({
            where: { cargoId_kind: { cargoId, kind: "duplicate-document" } },
            create: {
              cargoId,
              kind: "duplicate-document",
              reason: "Duplicate documentary reference; review required.",
            },
            update: { resolved: false },
          });
        await invalidate(tx, user, cargoId, "Supporting evidence added");
        await audit(tx, user, "DOCUMENT_UPLOADED", document.id, {
          cargoId,
          reference,
          sha256: document.sha256,
          provenance: document.provenance,
        });
        return document;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    await storage.remove(key);
    throw e;
  }
}
export async function download(user: Principal, id: string) {
  const d = await db.evidenceDocument.findFirst({
    where: { id, cargo: cargoScope(user) },
  });
  if (!d) throw new AppError("Document not found.", 404);
  return { document: d, bytes: await storage.get(d.storageKey) };
}
export async function dossier(user: Principal, id: string) {
  const c = await db.cargo.findFirst({
    where: { id, ...cargoScope(user) },
    include: cargoInclude,
  });
  if (!c) throw new AppError("Cargo not found.", 404);
  const policy = await db.policy.findUniqueOrThrow({
    where: { tenantId: user.tenantId },
  });
  const evaluation = assess(c, policy);
  const f = financials(
    c.value.toString(),
    policy.depositRate.toString(),
    policy.royaltyRate.toString(),
    policy.dutyRate.toString(),
    policy.otherRate.toString(),
  );
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage();
  let y = 780;
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, " ");
  function line(value: string, heading = false) {
    const text = clean(value);
    const chunks = text.match(/.{1,92}(?:\s|$)|.{1,92}/g) ?? [""];
    for (const chunk of chunks) {
      if (y < 65) {
        page = pdf.addPage();
        y = 780;
      }
      page.drawText(chunk, {
        x: 45,
        y,
        size: heading ? 13 : 10,
        font: heading ? bold : font,
        color: rgb(0.09, 0.15, 0.24),
      });
      y -= heading ? 24 : 16;
    }
  }
  line("AXIOM RESOURCEOS - EXPORT VERIFICATION PACK", true);
  line("DEMONSTRATION ONLY - no legal customs, banking or Treasury effect");
  line(`Generated ${new Date().toISOString()}`);
  line(`Cargo ${c.reference} | authorization version ${c.version}`, true);
  line(`Producer: ${c.organization.name} / ${c.organization.registration}`);
  line(
    `Grade: ${c.grade} | Quantity: ${c.quantity} bbl | Value: ${c.value} ${c.currency}`,
  );
  line(
    `Terminal: ${c.terminal} | Vessel: ${c.vessel} | Shipment: ${c.shipmentDate.toISOString()}`,
  );
  line("Origin and custody", true);
  for (const a of c.allocations) {
    line(
      `${a.batch.resourceId} / ${a.batch.asset.name} / ${a.quantity} bbl at ${a.location}`,
    );
    for (const m of a.batch.movements)
      line(
        `${m.createdAt.toISOString()} ${m.fromLocation} -> ${m.toLocation}: ${m.quantity} bbl; ${m.reference}`,
      );
  }
  line("Commercial and inspection summary", true);
  line(
    `Buyer: ${c.contract?.buyer.name ?? "Missing"} | Contract: ${c.contract?.reference ?? "Missing"} (${c.contract?.status ?? "PENDING"})`,
  );
  for (const i of c.inspections)
    line(
      `Q&Q ${i.reportReference}: ${i.status}, measured ${i.measuredQuantity}, ${i.quality}, inspector ${i.inspectorId}`,
    );
  line("Insurance, guarantee and fiscal assessment", true);
  line(
    `Insurance ${c.insurance?.reference ?? "Missing"} | Guarantee ${c.guarantee?.reference ?? "Missing"}`,
  );
  line(
    `Deposit required ${f.deposit}; declared ${c.deposit?.declared ?? 0}; documented confirmed ${c.deposit?.confirmed ?? 0}`,
  );
  line(
    `Fictional rates: royalty ${policy.royaltyRate}, duty ${policy.dutyRate}, other ${policy.otherRate}`,
  );
  line(
    `Assessed ${f.total}; documented paid ${c.fiscal?.documentedPaid ?? 0}; no live Treasury reconciliation`,
  );
  line("ARRS compliance checklist", true);
  for (const r of evaluation.conditions) {
    line(`${r.passed ? "PASS" : "BLOCKED"}: ${r.name}`);
    line(
      `Evidence ${r.evidence}; reviewer ${r.reviewer}; ${r.verifiedAt ?? "No review date"}`,
    );
    if (!r.passed) line(r.reason);
  }
  line("Final approvals and documentary index", true);
  for (const a of c.approvals)
    line(
      `${a.decision}: ${a.actorId}, version ${a.version}, ${a.createdAt.toISOString()}; ${a.reason}`,
    );
  for (const d of c.documents)
    line(
      `${d.reference}: ${d.filename} | ${d.provenance} / ${d.status} | SHA256 ${d.sha256}`,
    );
  for (const d of c.decisions)
    line(
      `${d.kind}: ${d.status} | ${d.provenance} | ${d.evidenceReference} | reviewer ${d.reviewerId}`,
    );
  const token = c.tokens.find(
    (t) => !t.revokedAt && t.expiresAt > new Date() && t.version === c.version,
  );
  if (token && evaluation.eligible) {
    line("Signed demonstration release token", true);
    line(`Token ${token.id}; expires ${token.expiresAt.toISOString()}`);
    const url = `${appOrigin()}/verify/${encodeURIComponent(token.token)}`;
    if (y < 220) {
      page = pdf.addPage();
      y = 780;
    }
    const qr = await pdf.embedPng(await QRCode.toBuffer(url));
    page.drawImage(qr, { x: 45, y: y - 140, width: 140, height: 140 });
    y -= 160;
    line("Scan to check current VALID / EXPIRED / REVOKED / INVALID status.");
  } else line("No current valid release token.");
  const events = await db.auditEvent.findMany({
    where: { tenantId: user.tenantId, targetId: c.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  line("Audit references", true);
  for (const e of events)
    line(`${e.id} | ${e.createdAt.toISOString()} | ${e.action} | ${e.actorId}`);
  for (const p of pdf.getPages()) {
    p.drawText("DEMO", {
      x: 160,
      y: 350,
      size: 90,
      font: bold,
      rotate: degrees(30),
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.12,
    });
    p.drawText(
      "Fictional demonstration data. Application audit is not tamper-proof storage.",
      { x: 45, y: 30, size: 8, font },
    );
  }
  await audit(db, user, "DOSSIER_GENERATED", c.id, { version: c.version });
  return pdf.save();
}
