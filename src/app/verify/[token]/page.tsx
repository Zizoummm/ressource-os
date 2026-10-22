import { verifyToken } from "../../../server/resourceos";
export const dynamic = "force-dynamic";
export default async function Verify({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await verifyToken(token);
  return (
    <main className="verification">
      <div className="wordmark">
        AXIOM <span>ResourceOS</span>
      </div>
      <p className="eyebrow">INDEPENDENT TOKEN VERIFICATION</p>
      <h1 className={result.status === "VALID" ? "positive" : "negative"}>
        {result.status}
      </h1>
      <p>Signed demonstration authorization</p>
      {"reference" in result && (
        <p>
          Cargo reference: {result.reference}
          <br />
          Expires: {result.expiresAt?.toISOString()}
        </p>
      )}
      <aside>
        DEMO — This token has no legal customs, banking or Treasury effect.
        Commercial and financial evidence is not exposed on this page.
      </aside>
      <a href="/">Return to ResourceOS</a>
    </main>
  );
}
