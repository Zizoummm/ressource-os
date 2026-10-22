import { PDFDocument, StandardFonts } from "pdf-lib";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { storage } from "../src/server/storage";
export async function seedEvidence() {
  const inspector = await db.user.findUniqueOrThrow({
    where: { email: "inspector@axiom.demo" },
  });
  const cargos = await db.cargo.findMany({
    where: {
      reference: { startsWith: "AX-" },
      organization: { tenantId: "AXIOM-DEMO" },
    },
    include: { documents: true, contract: true, inspections: true },
  });
  for (const c of cargos) {
    if (c.documents.some((d) => d.reference === `DEMO-PACK-${c.reference}`))
      continue;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let y = 780;
    for (const line of [
      "AXIOM RESOURCEOS - FICTIONAL SUPPORTING EVIDENCE",
      "DEMO - NOT AN AUTHENTIC INSPECTION OR COMMERCIAL DOCUMENT",
      `Cargo: ${c.reference}`,
      `Contract: ${c.contract?.reference ?? "Not yet submitted"}`,
      `Q&Q report: ${c.inspections[0]?.reportReference ?? "No inspection - cargo remains blocked"}`,
      `Declared quantity: ${c.quantity} bbl`,
      `Declared value: ${c.value} USD`,
      "This generated file does not independently verify any condition.",
      "ARRS uses the separately reviewed underlying records.",
    ]) {
      page.drawText(line, { x: 40, y, font, size: 10 });
      y -= 30;
    }
    const bytes = Buffer.from(await pdf.save()),
      key = randomUUID();
    await storage.put(key, bytes);
    await db.$transaction(async (tx) => {
      const document = await tx.evidenceDocument.create({
        data: {
          cargoId: c.id,
          uploadedBy: inspector.id,
          filename: `${c.reference}-DEMO-evidence.pdf`,
          storageKey: key,
          contentType: "application/pdf",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          reference: `DEMO-PACK-${c.reference}`,
          provenance: "SIMULATED",
          status: "SUBMITTED",
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: "AXIOM-DEMO",
          organizationId: c.organizationId,
          actorId: inspector.id,
          action: "DEMO_SUPPORTING_FILE_GENERATED",
          targetId: document.id,
          metadata: {
            cargoId: c.id,
            provenance: "SIMULATED",
            note: "Synthetic supporting index only; does not modify controlling evidence or verification.",
          },
        },
      });
    });
  }
}
if (process.argv[1]?.endsWith("demo-evidence.ts"))
  seedEvidence().finally(() => db.$disconnect());
