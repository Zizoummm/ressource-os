import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "../src/server/db";

const emails = [
  "admin",
  "operator",
  "operator2",
  "inspector",
  "compliance",
  "regulator",
  "treasury",
  "auditor",
].map((name) => `${name}@axiom.demo`);
class RecoveryConfigurationError extends Error {}

/** Explicit recovery only: never reset credentials automatically during ordinary startup. */
export async function syncDemoPasswords() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new RecoveryConfigurationError(
      "Recovery is restricted to an explicitly enabled demonstration environment (ALLOW_DEMO_SEED=true).",
    );
  }
  const password = process.env.DEMO_PASSWORD;
  if (
    !password ||
    password.length < 16 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new RecoveryConfigurationError(
      "Configure DEMO_PASSWORD with at least 16 characters and at most 72 UTF-8 bytes in the service Environment settings.",
    );
  }
  const passwordHash = await hash(password, 12);
  return db.$transaction(
    async (tx) => {
      const accounts = await tx.user.findMany({
        where: {
          email: { in: emails },
          memberships: { some: { organization: { tenantId: "AXIOM-DEMO" } } },
        },
        select: {
          id: true,
          email: true,
          memberships: {
            select: {
              organizationId: true,
              organization: { select: { tenantId: true } },
            },
          },
        },
      });
      if (accounts.length !== emails.length) {
        throw new RecoveryConfigurationError(
          "The expected eight demonstration accounts were not found. Recovery stopped without changing accounts; check the database and seed logs.",
        );
      }
      const ids = accounts.map((account) => account.id);
      await tx.user.updateMany({
        where: { id: { in: ids } },
        data: { passwordHash },
      });
      const sessions = await tx.session.deleteMany({
        where: { userId: { in: ids } },
      });
      const admin = accounts.find(
        (account) => account.email === "admin@axiom.demo",
      )!;
      const membership = admin.memberships.find(
        (m) => m.organization.tenantId === "AXIOM-DEMO",
      )!;
      await tx.auditEvent.create({
        data: {
          tenantId: "AXIOM-DEMO",
          organizationId: membership.organizationId,
          actorId: "SYSTEM_DEMO_PASSWORD_RECOVERY",
          action: "DEMO_PASSWORDS_SYNCHRONIZED",
          targetId: "AXIOM-DEMO",
          metadata: {
            accounts: accounts.map((a) => a.email),
            revokedSessions: sessions.count,
            note: "Explicit operator recovery from service environment; account activation and business records preserved.",
          },
        },
      });
      return { accounts: accounts.length, revokedSessions: sessions.count };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function main() {
  try {
    const result = await syncDemoPasswords();
    console.log(
      `Demonstration passwords synchronized for ${result.accounts} accounts. Previous sessions revoked. Business records and activation flags preserved. No password values were logged.`,
    );
  } catch (error) {
    console.error(
      error instanceof RecoveryConfigurationError
        ? error.message
        : "Password recovery failed. Check database connectivity and retry; no credentials were logged.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1]?.endsWith("sync-demo-passwords.ts")) void main();
