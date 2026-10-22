import { currentUser, AppError } from "../../../server/auth";
export async function GET() {
  try {
    return Response.json(await currentUser(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: "Sign in required" },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
