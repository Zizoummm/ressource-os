import { limitedBody } from "../../../../server/request";
import {
  currentUser,
  checkOrigin,
  AppError,
  cargoScope,
  type Principal,
} from "../../../../server/auth";
import {
  execute,
  stateFor,
  verifyToken,
  recordRejection,
} from "../../../../server/resourceos";
import { upload, download, dossier } from "../../../../server/documents";
import { db } from "../../../../server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof AppError)
    return Response.json({ error: e.message }, { status: e.status });
  const code = (e as { code?: string })?.code;
  if (code === "P2002")
    return Response.json(
      { error: "That reference already exists." },
      { status: 409 },
    );
  if (code === "P2034")
    return Response.json(
      { error: "Concurrent change detected. Refresh and retry." },
      { status: 409 },
    );
  console.error(
    "ResourceOS operation failed",
    e instanceof Error ? e.name : "unknown",
  );
  return Response.json(
    { error: "Operation could not be completed." },
    { status: 500 },
  );
}
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    if (path[0] === "verify" && path[1])
      return Response.json(await verifyToken(path[1]), {
        headers: { "Cache-Control": "no-store" },
      });
    const user = await currentUser();
    if (path[0] === "state")
      return Response.json(await stateFor(user), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path[0] === "documents" && path[1]) {
      const { document, bytes } = await download(user, path[1]);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": document.contentType,
          "Content-Disposition": `attachment; filename="${document.filename}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      });
    }
    if (path[0] === "dossier" && path[1])
      return new Response(new Uint8Array(await dossier(user, path[1])), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="AXIOM-DEMO-EVP.pdf"',
          "Cache-Control": "no-store",
        },
      });
    if (path[0] === "fiscal.csv") {
      const cargos = await db.cargo.findMany({
        where: cargoScope(user),
        include: { fiscal: true, deposit: true },
      });
      const escape = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const rows = [
        [
          "Cargo",
          "Currency",
          "Declared value",
          "Assessed",
          "Documented paid",
          "Outstanding",
          "Deposit confirmed",
        ],
        ...cargos.map((c) => [
          c.reference,
          c.currency,
          c.value,
          c.fiscal?.assessed ?? 0,
          c.fiscal?.documentedPaid ?? 0,
          c.fiscal && c.fiscal.assessed.gt(c.fiscal.documentedPaid)
            ? c.fiscal.assessed.sub(c.fiscal.documentedPaid).toString()
            : 0,
          c.deposit?.confirmed ?? 0,
        ]),
      ];
      return new Response(
        rows.map((r) => r.map(escape).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition":
              'attachment; filename="demo-fiscal-assessments.csv"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    throw new AppError("Not found.", 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  let principal: Principal | undefined;
  let operation: unknown = "request";
  let target: unknown = "request";
  try {
    checkOrigin(request);
    const user = await currentUser();
    principal = user;
    const { path } = await context.params;
    if (path[0] === "upload") {
      operation = "upload";
      const bytes = await limitedBody(request, 6 * 1024 * 1024);
      const data = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      }).formData();
      const file = data.get("file");
      target = data.get("cargoId");
      if (!(file instanceof File)) throw new AppError("Select a file.");
      return Response.json(
        await upload(
          user,
          String(data.get("cargoId") ?? ""),
          file,
          String(data.get("reference") ?? ""),
        ),
      );
    }
    if (path[0] === "action") {
      const raw = new TextDecoder().decode(await limitedBody(request, 20000));
      if (raw.length > 20000) throw new AppError("Request too large.");
      const { action, data } = JSON.parse(raw);
      operation = action;
      target = data?.cargoId ?? data?.documentId ?? data?.id;
      return Response.json(await execute(user, action, data));
    }
    throw new AppError("Not found.", 404);
  } catch (e) {
    await recordRejection(principal, operation, target, e);
    return failure(e);
  }
}
