import { cookies } from "next/headers";
import { db } from "../../../../server/db";
import { digest, checkOrigin, AppError } from "../../../../server/auth";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const store = await cookies();
    const token = store.get("resourceos_session")?.value;
    if (token) await db.session.deleteMany({ where: { id: digest(token) } });
    store.delete("resourceos_session");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: "Request rejected" },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
