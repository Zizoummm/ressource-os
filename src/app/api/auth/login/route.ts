import { limitedBody } from "../../../../server/request";
import { z } from "zod";
import { login, checkOrigin, AppError } from "../../../../server/auth";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { email, password } = z
      .object({
        email: z.string().email().max(200),
        password: z.string().min(1).max(256),
      })
      .parse(
        JSON.parse(new TextDecoder().decode(await limitedBody(request, 4096))),
      );
    await login(email, password);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : "Invalid login request." },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
