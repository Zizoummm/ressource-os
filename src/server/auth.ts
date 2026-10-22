import { appOrigin } from "./runtime";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { db } from "./db";
export const roles = [
  "ADMIN",
  "OPERATOR",
  "INSPECTOR",
  "COMPLIANCE",
  "REGULATOR",
  "TREASURY",
  "AUDITOR",
] as const;
export type Role = (typeof roles)[number];
export type Principal = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  tenantId: string;
  roles: string[];
};
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function requireRole(user: Principal, ...allowed: string[]) {
  if (!user.roles.some((r) => allowed.includes(r)))
    throw new AppError("Your role cannot perform this operation.", 403);
}
export const isProducer = (user: Principal) =>
  user.roles.includes("OPERATOR") &&
  !user.roles.some((r) =>
    [
      "ADMIN",
      "REGULATOR",
      "COMPLIANCE",
      "INSPECTOR",
      "TREASURY",
      "AUDITOR",
    ].includes(r),
  );
export function cargoScope(user: Principal) {
  return {
    organization: { tenantId: user.tenantId },
    ...(isProducer(user) ? { organizationId: user.organizationId } : {}),
  };
}
export async function currentUser(): Promise<Principal> {
  const token = (await cookies()).get("resourceos_session")?.value;
  if (!token) throw new AppError("Sign in to continue.", 401);
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: {
      user: { include: { memberships: { include: { organization: true } } } },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    throw new AppError("Session expired. Sign in again.", 401);
  const m = session.user.memberships[0];
  if (!m) throw new AppError("No organization membership.", 403);
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    tenantId: m.organization.tenantId,
    roles: m.roles,
  };
}
const attempts = new Map<string, { count: number; reset: number }>();
export async function login(email: string, password: string) {
  const key = email.toLowerCase();
  const entry = attempts.get(key);
  if (entry && entry.reset > Date.now() && entry.count >= 10)
    throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
  attempts.set(key, {
    count: (entry && entry.reset > Date.now() ? entry.count : 0) + 1,
    reset:
      entry && entry.reset > Date.now() ? entry.reset : Date.now() + 900000,
  });
  const user = await db.user.findUnique({ where: { email: key } });
  const valid = await compare(
    password,
    user?.passwordHash ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5rWZOvF1KEBgqWVyXOL0LKRQBAavMpi",
  );
  if (!user?.active || !valid)
    throw new AppError("Invalid email or password.", 401);
  attempts.delete(key);
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      id: digest(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  (await cookies()).set("resourceos_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: appOrigin().startsWith("https://"),
    path: "/",
    maxAge: 8 * 3600,
  });
}
export function checkOrigin(request: Request) {
  const expected = appOrigin();
  if (request.headers.get("origin") !== expected)
    throw new AppError("Invalid request origin.", 403);
}
