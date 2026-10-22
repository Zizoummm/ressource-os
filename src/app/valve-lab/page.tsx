"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Valve, Cargo, Audit, Actor } from "../../server/valve-lab";
type State = {
  actor: Actor;
  valves: Valve[];
  cargoes: (Cargo & { reference: string })[];
  events: Audit[];
};
export default function ValvePage() {
  const [state, setState] = useState<State>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await fetch("/api/valve-lab");
    if (r.ok) setState(await r.json());
    else
      setMessage(
        "Sign in to ResourceOS with an operator account to use the laboratory.",
      );
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(data: object) {
    setBusy(true);
    try {
      const r = await fetch("/api/valve-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      setMessage(r.ok ? "Laboratory operation recorded." : d.error);
      await refresh();
    } catch {
      setMessage("Connection lost. Position unknown; inspect locally.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content" style={{ maxWidth: 1100 }}>
      <Link href="/">← ResourceOS / ARRS Control Center</Link>
      <div className="page-heading" style={{ marginTop: 28 }}>
        <div>
          <p className="eyebrow">SUPERVISED LOW-PRESSURE WATER EXPERIMENT</p>
          <h1>ValveLab</h1>
          <p>
            ResourceOS cargo eligibility and independent approval, connected to
            a laboratory simulator.
          </p>
        </div>
        <span className="demo-label">SIMULATOR ONLY</span>
      </div>
      <div className="info-note">
        No physical hardware is connected. Interlocks and position sensors are
        simulated. A real installation requires independent local safety
        controls and a hardwired emergency stop.
      </div>
      {message && (
        <p className="alert" role="status">
          {message}
        </p>
      )}
      <div className="toolbar">
        <button onClick={refresh}>Refresh status</button>
        <span>{state?.actor.role}</span>
      </div>
      {state && (
        <>
          <section className="card">
            <div className="card-title">
              <h2>Register laboratory valve & network controller</h2>
            </div>
            <form
              className="upload-form"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void action({
                  action: "register",
                  ...Object.fromEntries(data),
                });
              }}
            >
              <label>
                Valve ID
                <input name="valveId" required pattern="[A-Za-z0-9_-]{1,64}" />
              </label>
              <label>
                Controller ID
                <input
                  name="controller"
                  required
                  pattern="[A-Za-z0-9_-]{1,64}"
                />
              </label>
              <label>
                ResourceOS test cargo
                <select name="cargoId" required>
                  {state.cargoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.reference}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={
                  busy ||
                  state.actor.role !== "operator" ||
                  !state.cargoes.length
                }
              >
                Register simulator
              </button>
            </form>
            <p className="info-note">
              Create a cargo marked “Laboratory test cargo” in ResourceOS.
              Complete its requirements and obtain independent approval in ARRS
              before Release.
            </p>
          </section>
          {state.valves.map((v) => (
            <section className="card" key={v.id}>
              <div className="card-title">
                <div>
                  <h2>
                    {v.id} / {v.controller}
                  </h2>
                  <p>
                    {state.cargoes.find((c) => c.id === v.cargoId)?.reference}
                  </p>
                </div>
                <strong>{v.status}</strong>
              </div>
              <div style={{ padding: 24 }}>
                <p>
                  Connectivity:{" "}
                  {v.connected ? "SIMULATOR CONNECTED" : "DISCONNECTED"} ·
                  Position: {v.position}
                </p>
                <p className="muted">
                  Independent approval:{" "}
                  {state.cargoes.find((c) => c.id === v.cargoId)?.approval
                    ? "Recorded"
                    : "Required"}
                </p>
                <p className="muted">
                  Interlocks:{" "}
                  {Object.entries(v.interlocks)
                    .map(([k, ok]) => `${k}: ${ok ? "PASS" : "BLOCKED"}`)
                    .join(" · ")}
                </p>
                <div className="toolbar" style={{ marginTop: 20 }}>
                  <button
                    className="primary"
                    disabled={busy || state.actor.role !== "operator"}
                    onClick={() => action({ action: "OPEN", valveId: v.id })}
                  >
                    Release
                  </button>
                  <button
                    disabled={busy || state.actor.role !== "operator"}
                    onClick={() => action({ action: "CLOSE", valveId: v.id })}
                  >
                    Close
                  </button>
                  <button
                    className="danger"
                    disabled={state.actor.role !== "operator"}
                    onClick={() => action({ action: "estop", valveId: v.id })}
                  >
                    Simulate emergency stop
                  </button>
                </div>
              </div>
            </section>
          ))}
          <section className="card">
            <div className="card-title">
              <h2>Laboratory command journal</h2>
            </div>
            <div className="audit-list">
              {[...state.events].reverse().map((e, i) => (
                <details key={i}>
                  <summary>
                    {new Date(e.timestamp).toISOString()} · {e.type}
                  </summary>
                  <pre>{JSON.stringify(e.data, null, 2)}</pre>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
