import Decimal from "decimal.js";
import { seedEvidence } from "../scripts/demo-evidence";
import { hash } from "bcryptjs";
import { db } from "../src/server/db";
import { execute, type Tx } from "../src/server/resourceos";
import type { Principal } from "../src/server/auth";
const tenant = "AXIOM-DEMO";
const future = (days: number) => new Date(Date.now() + days * 86400000);
async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_SEED !== "true"
  )
    throw new Error("Demo seeding is disabled in production.");
  if (await db.organization.findFirst({ where: { tenantId: tenant } })) {
    console.log("Existing demonstration data preserved.");
    return;
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 16)
    throw new Error("Set a strong DEMO_PASSWORD in the private .env.");
  const passwordHash = await hash(password, 12);
  const principals: Record<string, Principal> = {};
  const cargoIds: string[] = [];
  await db.$transaction(
    async (tx: Tx) => {
      const specs = [
        ["Aurora Basin Energy", "PRODUCER"],
        ["Meridian Fields", "PRODUCER"],
        ["Cobalt Coast Resources", "PRODUCER"],
        ["Northstar Trading", "TRADER"],
        ["Atlas Commodities", "TRADER"],
        ["Harbor One Terminal", "TERMINAL"],
        ["Delta Terminal", "TERMINAL"],
        ["Veritas Lab", "INSPECTOR"],
        ["Spectrum Inspection", "INSPECTOR"],
        ["Resource Authority", "REGULATOR"],
        ["Public Treasury", "TREASURY"],
      ];
      const orgs = [];
      for (const [name, type] of specs)
        orgs.push(
          await tx.organization.create({
            data: {
              tenantId: tenant,
              name: `${name} · DEMO`,
              type,
              jurisdiction: "Fictional Republic of Aster",
              registration: `DEMO-ORG-${orgs.length + 1}`,
              beneficialOwners:
                "Fictional beneficial-owner declaration — reviewed for demo",
              verified: true,
            },
          }),
        );
      const users = [
        ["admin", "System Administrator", 9, "ADMIN"],
        ["operator", "Amara Okoro", 0, "OPERATOR"],
        ["operator2", "Noah Mensah", 1, "OPERATOR"],
        ["inspector", "Leila Haddad", 7, "INSPECTOR"],
        ["compliance", "Elena Costa", 9, "COMPLIANCE"],
        ["regulator", "Daniel Nwosu", 9, "REGULATOR"],
        ["treasury", "Maya Chen", 10, "TREASURY"],
        ["auditor", "Owen Diallo", 9, "AUDITOR"],
      ] as const;
      for (const [key, name, index, role] of users) {
        const u = await tx.user.create({
          data: {
            name,
            email: `${key}@axiom.demo`,
            passwordHash,
            memberships: {
              create: { organizationId: orgs[index].id, roles: [role] },
            },
          },
        });
        principals[key] = {
          id: u.id,
          name: u.name,
          email: u.email,
          organizationId: orgs[index].id,
          organizationName: orgs[index].name,
          tenantId: tenant,
          roles: [role],
        };
      }
      await tx.policy.create({ data: { tenantId: tenant } });
      const assets = [];
      for (let i = 0; i < 3; i++) {
        await tx.license.create({
          data: {
            organizationId: orgs[i].id,
            reference: `DEMO-LIC-${i + 1}`,
            expiresAt: future(365),
            verified: true,
          },
        });
        assets.push(
          await tx.resourceAsset.create({
            data: {
              organizationId: orgs[i].id,
              name: `Aster Field ${i + 1} · DEMO`,
              location: ["Northern Basin", "Meridian Shelf", "Cobalt Coast"][i],
              authorized: true,
            },
          }),
        );
      }
      const buyers = [];
      for (let i = 0; i < 2; i++)
        buyers.push(
          await tx.counterparty.create({
            data: {
              tenantId: tenant,
              name: orgs[i + 3].name,
              type: "BUYER",
              jurisdiction: "Fictional Aster Trade Zone",
              registration: `DEMO-BUYER-${i + 1}`,
              beneficialOwners: "Fictional holdings — demo attestation",
              verified: true,
            },
          }),
        );
      for (let i = 0; i < 12; i++) {
        const producer = i < 3 ? 0 : i % 3;
        const quantity = (20000 + i * 2500).toString();
        const value = new Decimal(quantity).times(75).toString();
        const b = await tx.productionBatch.create({
          data: {
            resourceId: `RID-DEMO-${String(i + 1).padStart(4, "0")}`,
            organizationId: orgs[producer].id,
            assetId: assets[producer].id,
            grade: "Aster Light 34 API",
            quantity: "100000",
            storage: "Origin tank A",
            productionDate: new Date(Date.now() - (12 - i) * 86400000),
          },
        });
        await tx.custodyEvent.create({
          data: {
            batchId: b.id,
            fromLocation: "Origin tank A",
            toLocation: "Harbor One Terminal",
            quantity: "75000",
            actorId: principals.operator.id,
            reference: `DEMO-TRANSFER-${i + 1}`,
          },
        });
        const c = await tx.cargo.create({
          data: {
            reference: `AX-${new Date().getUTCFullYear()}-${String(i + 1).padStart(4, "0")}`,
            organizationId: orgs[producer].id,
            createdBy:
              producer === 1 ? principals.operator2.id : principals.operator.id,
            grade: "Aster Light 34 API",
            quantity,
            value,
            terminal: i % 2 ? "Delta Terminal" : "Harbor One Terminal",
            vessel: `MV Aster ${i + 1} · DEMO`,
            shipmentDate: future(30 + i),
            testOnly: i === 11,
            status: i > 8 ? "DRAFT" : "UNDER_REVIEW",
            createdAt: new Date(Date.now() - (12 - i) * 86400000),
          },
        });
        cargoIds.push(c.id);
        await tx.cargoAllocation.create({
          data: {
            cargoId: c.id,
            batchId: b.id,
            location: "Harbor One Terminal",
            quantity,
          },
        });
        if (i < 10)
          await tx.tradeContract.create({
            data: {
              cargoId: c.id,
              buyerId: buyers[i % 2].id,
              reference: `DEMO-CONTRACT-${i + 1}`,
              quantity,
              price: "75",
              incoterm: "FOB",
              paymentTerms: "Documentary settlement — simulated only",
              status: i === 5 ? "DECLARED" : "ACCEPTED",
              reviewerId: principals.compliance.id,
            },
          });
        if (i !== 1 && i < 9)
          await tx.inspection.create({
            data: {
              cargoId: c.id,
              inspectorId: principals.inspector.id,
              inspectorOrganizationId: orgs[7].id,
              measuredQuantity: i === 6 ? "10000" : quantity,
              quality: "API 34; sulphur 0.2% — fictional laboratory results",
              samplingReference: `DEMO-SAMPLE-${i + 1}`,
              reportReference: `DEMO-QQ-${i + 1}`,
              status: "ACCEPTED",
              expiresAt: future(60),
            },
          });
        if (i < 9) {
          for (const kind of ["POP", "POF"])
            await tx.verificationDecision.create({
              data: {
                cargoId: c.id,
                kind,
                status: i === 1 && kind === "POF" ? "REJECTED" : "ACCEPTED",
                evidenceReference: `DEMO-${kind}-${i + 1}`,
                reviewerId: principals.compliance.id,
                reason:
                  "Fictional documentary attestation, no external bank connection",
                expiresAt: future(60),
              },
            });
          await tx.insuranceRecord.create({
            data: {
              cargoId: c.id,
              reference: `DEMO-INS-${i + 1}`,
              insurer: "Aster Mutual · DEMO",
              coverage: value,
              expiresAt: future(60),
              status: "ACCEPTED",
              reviewerId: principals.compliance.id,
            },
          });
          await tx.guaranteeRecord.create({
            data: {
              cargoId: c.id,
              reference: `DEMO-GUAR-${i + 1}`,
              institution: "Aster Guarantee House · DEMO",
              amount: new Decimal(value).times(".01").toFixed(2),
              expiresAt: future(i === 4 ? -1 : 60),
              status: "ACCEPTED",
              reviewerId: principals.compliance.id,
            },
          });
          await tx.treasuryDeposit.create({
            data: {
              cargoId: c.id,
              rate: ".01",
              required: new Decimal(value).times(".01").toFixed(2),
              declared: new Decimal(value).times(".01").toFixed(2),
              confirmed:
                i === 7 ? "0" : new Decimal(value).times(".01").toFixed(2),
              evidenceReference: `DEMO-DEPOSIT-${i + 1}`,
              reviewerId: principals.treasury.id,
            },
          });
          await tx.fiscalAssessment.create({
            data: {
              cargoId: c.id,
              royaltyRate: ".05",
              dutyRate: ".02",
              otherRate: "0",
              assessed: new Decimal(value).times(".07").toFixed(2),
              documentedPaid:
                i === 8 ? "0" : new Decimal(value).times(".07").toFixed(2),
              reviewerId: principals.treasury.id,
              evidenceReference: `DEMO-FISCAL-${i + 1}`,
            },
          });
        }
        await tx.auditEvent.create({
          data: {
            tenantId: tenant,
            organizationId: orgs[producer].id,
            actorId: principals.operator.id,
            action: "DEMO_CARGO_CREATED",
            targetId: c.id,
            metadata: {
              demo: true,
              reference: c.reference,
              scenario:
                i === 0
                  ? "A: eligible release"
                  : i === 1
                    ? "B: missing inspection and rejected POF"
                    : i === 2
                      ? "C: authorization invalidated"
                      : "Demonstration portfolio",
            },
          },
        });
      }
    },
    { timeout: 60000 },
  );
  await seedEvidence();
  for (const cargoId of cargoIds)
    await execute(principals.regulator, "evaluate", { cargoId });
  for (const index of [0, 2]) {
    await execute(principals.regulator, "approve", {
      cargoId: cargoIds[index],
      reason: "Independent fictional demonstration approval",
    });
    await execute(principals.operator, "release", { cargoId: cargoIds[index] });
  }
  await execute(principals.compliance, "decision", {
    cargoId: cargoIds[2],
    kind: "POF",
    status: "REJECTED",
    evidenceReference: "DEMO-POF-REVOKED",
    reason: "Scenario C: material evidence withdrawn after release",
    expiresAt: future(30).toISOString(),
  });
  console.log(
    "Seed complete: 11 organizations, 8 accounts, 12 cargos and scenarios A/B/C. Password remains private in the configured environment.",
  );
}
main().finally(() => db.$disconnect());
