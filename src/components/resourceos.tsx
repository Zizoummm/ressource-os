"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Box,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  Fingerprint,
  Globe,
  Landmark,
  Layers3,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  Ship,
  Waypoints,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import QRCode from "qrcode";
import Decimal from "decimal.js";
import { Button } from "./ui/button";
import { messages } from "../lib/i18n";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
// API values are serialized Prisma records (Decimal and Date become strings).
type Row = Record<string, any>;
type State = {
  user: Row;
  policy: Row;
  organizations: Row[];
  batches: Row[];
  counterparties: Row[];
  users: Row[];
  auditEvents: Row[];
  cargoes: Row[];
};
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string | boolean;
};
type FormSpec = { action: string; title: string; fields: Field[] };
const icons = [
  BarChart3,
  Fingerprint,
  Waypoints,
  ClipboardCheck,
  Globe,
  Landmark,
  ShieldCheck,
  ShieldAlert,
  FileCheck2,
  Settings2,
];
const money = (v: unknown) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(BigInt(new Decimal(String(v ?? 0)).toFixed(0)));
const number = (v: unknown) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number(v ?? 0),
  );
const when = (v: string) =>
  new Date(v).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`status-pill ${["RELEASED", "ACCEPTED", "APPROVED", "ELIGIBLE", "VERIFIED", "VALID"].includes(value) ? "good" : ["BLOCKED", "REJECTED", "REVOKED", "EXPIRED"].includes(value) ? "bad" : "neutral"}`}
    >
      <i />
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
export default function ResourceOS() {
  const [state, setState] = useState<State>();
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState<FormSpec>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [qr, setQr] = useState("");
  const selected = state?.cargoes.find((c) => c.id === selectedId);
  const token = selected?.tokens.find(
    (t: Row) =>
      !t.revokedAt &&
      new Date(t.expiresAt) > new Date() &&
      t.version === selected.version,
  );
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    setQr("");
    if (token?.token)
      void QRCode.toDataURL(
        `${window.location.origin}/verify/${encodeURIComponent(token.token)}`,
        { width: 170, margin: 1 },
      ).then(setQr);
  }, [token?.token]);
  async function refresh() {
    try {
      const r = await fetch("/api/resource/state");
      if (r.status === 401) {
        setState(undefined);
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setState(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const can = (...roles: string[]) =>
    state?.user.roles.some((r: string) => roles.includes(r));
  async function action(action: string, data: Row) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/resource/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setForm(undefined);
      setNotice("Saved. Authorization and audit records updated.");
      await refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    const data = new FormData(e.currentTarget);
    const payload: Row = {};
    for (const field of form.fields) {
      const v = data.get(field.name);
      payload[field.name] =
        field.type === "checkbox"
          ? v === "on"
          : field.type === "datetime-local"
            ? new Date(String(v)).toISOString()
            : field.type === "number"
              ? Number(v)
              : v;
    }
    await action(form.action, payload);
  }
  function open(actionName: string, cargo = selected) {
    if (!state) return;
    setError("");
    const options = (rows: Row[], label: string) =>
      rows.map((r) => ({ value: r.id, label: r[label] }));
    const cargoField: Field = {
      name: "cargoId",
      label: "Cargo",
      options: options(state.cargoes, "reference"),
      value: cargo?.id,
    };
    const org: Field = {
      name: "organizationId",
      label: "Organization",
      options: options(state.organizations, "name"),
      value: state.user.organizationId,
    };
    const expiry: Field = {
      name: "expiresAt",
      label: "Valid until",
      type: "datetime-local",
      value: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 16),
    };
    const decision: Field = {
      name: "status",
      label: "Decision",
      options: ["ACCEPTED", "REJECTED", "NEEDS_EVIDENCE"].map((v) => ({
        value: v,
        label: v,
      })),
    };
    const f = (name: string, label: string, value?: string): Field => ({
      name,
      label,
      value,
    });
    const definitions: Record<string, { title: string; fields: Field[] }> = {
      organization: {
        title: "Register organization",
        fields: [
          f("name", "Legal name"),
          {
            name: "type",
            label: "Organization type",
            options: [
              "PRODUCER",
              "TRADER",
              "INSPECTOR",
              "TERMINAL",
              "REGULATOR",
              "TREASURY",
            ].map((v) => ({ value: v, label: v })),
          },
          f("jurisdiction", "Jurisdiction"),
          f("registration", "Registration reference"),
          f("beneficialOwners", "Beneficial-owner declaration"),
        ],
      },
      license: {
        title: "Record verified license",
        fields: [
          org,
          f("reference", "License reference"),
          expiry,
          {
            name: "verified",
            label: "Independently verified",
            type: "checkbox",
          },
        ],
      },
      asset: {
        title: "Register resource asset",
        fields: [
          org,
          f("name", "Asset / field name"),
          f("location", "Declared location"),
        ],
      },
      batch: {
        title: "Register production batch",
        fields: [
          {
            name: "assetId",
            label: "Resource asset",
            options: options(
              state.organizations.flatMap((o) => o.assets),
              "name",
            ),
          },
          f("grade", "Product grade", "Aster Light 34 API"),
          f("quantity", "Quantity (bbl)"),
          f("storage", "Initial storage location"),
          {
            name: "productionDate",
            label: "Production date",
            type: "datetime-local",
            value: new Date().toISOString().slice(0, 16),
          },
        ],
      },
      transfer: {
        title: "Record custody transfer",
        fields: [
          {
            name: "batchId",
            label: "Resource batch",
            options: options(state.batches, "resourceId"),
          },
          f("fromLocation", "Source location"),
          f("toLocation", "Destination location"),
          f("quantity", "Quantity (bbl)"),
          f("reference", "Transfer evidence reference"),
        ],
      },
      cargo: {
        title: "Create export cargo",
        fields: [
          f("reference", "Unique cargo reference"),
          org,
          f("grade", "Product grade", "Aster Light 34 API"),
          f("quantity", "Quantity (bbl)"),
          f("value", "Declared value (USD)"),
          f("terminal", "Loading terminal"),
          f("vessel", "Vessel reference"),
          {
            name: "shipmentDate",
            label: "Expected shipment",
            type: "datetime-local",
            value: new Date(Date.now() + 30 * 86400000)
              .toISOString()
              .slice(0, 16),
          },
          {
            name: "testOnly",
            label: "Laboratory test cargo",
            type: "checkbox",
          },
        ],
      },
      cargoEdit: {
        title: "Correct shipment records",
        fields: [
          cargoField,
          f("terminal", "Terminal", cargo?.terminal),
          f("vessel", "Vessel", cargo?.vessel),
          {
            name: "shipmentDate",
            label: "Shipment date",
            type: "datetime-local",
            value: cargo?.shipmentDate.slice(0, 16),
          },
          f("reason", "Correction reason (invalidates authorization)"),
        ],
      },
      allocate: {
        title: "Allocate traceable volume",
        fields: [
          cargoField,
          {
            name: "batchId",
            label: "Source batch",
            options: options(state.batches, "resourceId"),
          },
          f("location", "Source storage location", "Harbor One Terminal"),
          f("quantity", "Quantity (bbl)"),
        ],
      },
      counterparty: {
        title: "Register counterparty",
        fields: [
          f("name", "Legal name"),
          {
            name: "type",
            label: "Type",
            options: ["BUYER", "SELLER", "TRADER"].map((v) => ({
              value: v,
              label: v,
            })),
          },
          f("jurisdiction", "Jurisdiction"),
          f("registration", "Registration reference"),
          f("beneficialOwners", "Beneficial-owner declaration"),
        ],
      },
      contract: {
        title: "Submit commercial contract",
        fields: [
          cargoField,
          {
            name: "buyerId",
            label: "Buyer",
            options: options(state.counterparties, "name"),
          },
          f("reference", "Contract reference"),
          f("quantity", "Contracted quantity (bbl)", cargo?.quantity),
          f("price", "Price per bbl (USD)", "75"),
          f("incoterm", "Incoterm", "FOB"),
          f("paymentTerms", "Payment terms"),
        ],
      },
      contractReview: {
        title: "Review trade contract",
        fields: [cargoField, decision, f("reason", "Review rationale")],
      },
      inspection: {
        title: "Record independent Q&Q inspection",
        fields: [
          cargoField,
          f("measuredQuantity", "Measured quantity (bbl)", cargo?.quantity),
          f("quality", "Quality results"),
          f("samplingReference", "Sampling reference"),
          f("reportReference", "Inspection report reference"),
          {
            ...decision,
            options: ["SUBMITTED", "ACCEPTED", "REJECTED"].map((v) => ({
              value: v,
              label: v,
            })),
          },
          expiry,
        ],
      },
      decision: {
        title: "Review documentary evidence",
        fields: [
          cargoField,
          {
            name: "kind",
            label: "Requirement",
            options: [
              { value: "POP", label: "Proof of Product" },
              { value: "POF", label: "Proof of Funds" },
            ],
          },
          {
            name: "provenance",
            label: "Evidence provenance",
            options: [
              { value: "SIMULATED", label: "Simulated demonstration evidence" },
              {
                value: "MANUAL_ATTESTATION",
                label: "Recorded manual attestation",
              },
            ],
          },
          decision,
          f("evidenceReference", "Supporting evidence reference"),
          f("reason", "Review rationale"),
          expiry,
        ],
      },
      insurance: {
        title: "Record insurance review",
        fields: [
          cargoField,
          f("reference", "Certificate reference"),
          f("insurer", "Insurer"),
          f("coverage", "Coverage amount (USD)", cargo?.value),
          expiry,
          { ...decision, options: decision.options?.slice(0, 2) },
        ],
      },
      guarantee: {
        title: "Record guarantee review",
        fields: [
          cargoField,
          f("reference", "Guarantee reference"),
          f("institution", "Issuing institution"),
          f("amount", "Guaranteed amount (USD)"),
          expiry,
          { ...decision, options: decision.options?.slice(0, 2) },
        ],
      },
      deposit: {
        title: "Record documentary deposit confirmation",
        fields: [
          cargoField,
          f("declared", "Declared deposit (USD)"),
          f("confirmed", "Independently documented amount (USD)"),
          f("evidenceReference", "Treasury evidence reference"),
        ],
      },
      fiscal: {
        title: "Assess fiscal requirements",
        fields: [
          cargoField,
          f("documentedPaid", "Amount documented as paid (USD)", "0"),
          f("evidenceReference", "Supporting fiscal evidence"),
        ],
      },
      approve: {
        title: "Independent final approval",
        fields: [cargoField, f("reason", "Authorization rationale")],
      },
      revoke: {
        title: "Revoke cargo authorization",
        fields: [cargoField, f("reason", "Revocation reason")],
      },
      policy: {
        title: "Configure fictional demonstration policy",
        fields: [
          f(
            "depositRate",
            "Deposit fraction (0.005–0.02)",
            state.policy.depositRate,
          ),
          f("royaltyRate", "Royalty fraction", state.policy.royaltyRate),
          f("dutyRate", "Export duty fraction", state.policy.dutyRate),
          f("otherRate", "Other charges fraction", state.policy.otherRate),
          f(
            "discrepancyRate",
            "Allowed Q&Q discrepancy fraction",
            state.policy.discrepancyRate,
          ),
          {
            name: "tokenMinutes",
            label: "Token validity (minutes)",
            type: "number",
            value: String(state.policy.tokenMinutes),
          },
        ],
      },
      user: {
        title: "Create organization account",
        fields: [
          f("name", "Full name"),
          { name: "email", label: "Email", type: "email" },
          {
            name: "password",
            label: "Initial password (at least 16 characters)",
            type: "password",
          },
          org,
          {
            name: "role",
            label: "Role",
            options: [
              "ADMIN",
              "OPERATOR",
              "INSPECTOR",
              "COMPLIANCE",
              "REGULATOR",
              "TREASURY",
              "AUDITOR",
            ].map((v) => ({ value: v, label: v })),
          },
        ],
      },
    };
    const spec = definitions[actionName];
    if (spec) setForm({ action: actionName, ...spec });
  }
  async function uploadFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const formData = new FormData(e.currentTarget);
      const r = await fetch("/api/resource/upload", {
        method: "POST",
        body: formData,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNotice(
        "Evidence stored as self-declared. Independent review remains required.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <div className="wordmark">
          AXIOM <span>ResourceOS</span>
        </div>
        <p>Loading your operational workspace…</p>
      </div>
    );
  if (!state)
    return (
      <div className="login-screen">
        <section className="login-story">
          <div className="wordmark">
            AXIOM <span>ResourceOS</span>
          </div>
          <p className="eyebrow">RESOURCE INTELLIGENCE. SOVEREIGN CONTROL.</p>
          <h1>
            Every resource.
            <br />
            Every movement.
            <br />
            <em>Accountable.</em>
          </h1>
          <p>
            One connected workspace for resource traceability, independent
            verification and controlled export authorization.
          </p>
          <div className="login-proof">
            <ShieldCheck size={22} /> Deterministic authorization · Complete
            audit trail
          </div>
          <small>CONTROLLED DEMONSTRATION · FICTIONAL RECORDS</small>
        </section>
        <section className="login-box">
          <div className="login-card">
            <LockKeyhole className="login-icon" size={26} />
            <h2>Welcome to ResourceOS</h2>
            <p>Sign in to your institutional workspace.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const data = new FormData(e.currentTarget);
                  const r = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(Object.fromEntries(data)),
                  });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error);
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="operator@axiom.demo"
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <Button className="primary full" disabled={busy}>
                Sign in to workspace <ArrowRight size={16} />
              </Button>
            </form>
            <p className="login-hint">
              Development accounts and local credentials are documented in the
              setup guide.
            </p>
          </div>
        </section>
      </div>
    );
  const visible = state.cargoes.filter((c) =>
    `${c.reference} ${c.organization.name} ${c.vessel}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const total = state.cargoes
    .reduce((n, c) => n.plus(c.value), new Decimal(0))
    .toString();
  const blocked = state.cargoes.filter((c) => !c.evaluation.eligible).length;
  const released = state.cargoes.filter(
    (c) => c.displayStatus === "RELEASED",
  ).length;
  const assessed = state.cargoes
    .reduce((n, c) => n.plus(c.fiscal?.assessed ?? 0), new Decimal(0))
    .toString();
  const distribution = Object.entries(
    state.cargoes.reduce(
      (a: Record<string, number>, c) => ({
        ...a,
        [c.displayStatus]: (a[c.displayStatus] ?? 0) + 1,
      }),
      {},
    ),
  ).map(([name, value]) => ({ name, value }));
  const production = Object.values(
    state.batches.reduce((a: Record<string, Row>, b) => {
      const date = when(b.productionDate);
      a[date] ??= { date, volume: 0 };
      a[date].volume += Number(b.quantity);
      return a;
    }, {}),
  ).reverse();
  const terminals = Object.values(
    state.cargoes.reduce((a: Record<string, Row>, c) => {
      a[c.terminal] ??= { name: c.terminal, volume: 0 };
      a[c.terminal].volume += Number(c.quantity);
      return a;
    }, {}),
  );
  const failureData = Object.entries(
    state.cargoes
      .flatMap((c) => c.evaluation.blocking)
      .reduce(
        (a: Record<string, number>, r: Row) => ({
          ...a,
          [r.key]: (a[r.key] ?? 0) + 1,
        }),
        {},
      ),
  ).map(([name, value]) => ({ name, value: Number(value) }));
  const revenueData = state.cargoes
    .filter((c) => c.fiscal)
    .map((c) => ({ name: c.reference, value: Number(c.fiscal.assessed) }))
    .slice(0, 12);
  const buyerData = Object.values(
    state.cargoes
      .filter((c) => c.contract)
      .reduce((a: Record<string, Row>, c) => {
        const name = c.contract.buyer.name;
        a[name] ??= { name, value: 0 };
        a[name].value += Number(c.quantity);
        return a;
      }, {}),
  );
  const actionButton = (actionName: string, label: string, allowed: string[]) =>
    can(...allowed) && (
      <button onClick={() => open(actionName)} disabled={busy}>
        <Plus size={14} />
        {label}
      </button>
    );
  const cargoTable = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cargo / origin</th>
            <th>Product & volume</th>
            <th>Declared value</th>
            <th>Shipment</th>
            <th>ARRS status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c.id} onClick={() => setSelectedId(c.id)}>
              <td>
                <strong>{c.reference}</strong>
                <small>{c.organization.name}</small>
              </td>
              <td>
                {c.grade}
                <small>{number(c.quantity)} bbl</small>
              </td>
              <td className="mono">{money(c.value)}</td>
              <td>
                {c.terminal}
                <small>{when(c.shipmentDate)}</small>
              </td>
              <td>
                <Badge value={c.displayStatus} />
              </td>
              <td>
                <ArrowRight size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!visible.length && (
        <Empty>No cargos match your search. Register a cargo to begin.</Empty>
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="wordmark" href="/">
          AXIOM <span>ResourceOS</span>
        </a>
        <div className="workspace-label">
          <Globe size={15} />
          <div>
            Aster National Workspace<small>Controlled demonstration</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-caption">OPERATIONS</p>
        <nav>
          {messages.en.navigation.map((name, i) => {
            const Icon = icons[i];
            return (
              <button
                key={name}
                className={module === i ? "active" : ""}
                onClick={() => {
                  setModule(i);
                  setQuery("");
                  setSelectedId(undefined);
                }}
              >
                <Icon size={18} />
                {name}
                {i === 6 && (
                  <span className="nav-count">
                    {state.cargoes.filter((c) => c.evaluation.eligible).length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <a href="/valve-lab">
            <Activity size={17} />
            ValveLab <span>LAB</span>
          </a>
          <p>
            <i /> Database connected
          </p>
          <small>AXIOM RESOURCEOS · MVP 1.0</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            {messages.en.navigation[module]}
          </div>
          <div className="topbar-right">
            <span className="demo-label">DEMO ENVIRONMENT</span>
            <button
              className="icon-button"
              title="Refresh data"
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar">
              {state.user.name
                .split(" ")
                .map((s: string) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div className="user-label">
              {state.user.name}
              <small>{state.user.roles.join(" / ")}</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setState(undefined);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">NATIONAL RESOURCE OVERSIGHT</p>
              <h1>{messages.en.navigation[module]}</h1>
              <p>
                {
                  [
                    "A clear view of resources, trade and authorization readiness.",
                    "Identify every producer, asset and production batch.",
                    "Follow custody from the origin to the export cargo.",
                    "Independent evidence. Measured quantities. Accountable decisions.",
                    "Know your counterparties and verify every commercial condition.",
                    "Transparent demonstration assessments and documentary confirmations.",
                    "Calculated eligibility. Independent approval. Controlled release.",
                    "Deterministic risk signals from your underlying records.",
                    "Protected evidence and complete cargo verification dossiers.",
                    "Manage institutional identities and demonstration rules.",
                  ][module]
                }
              </p>
            </div>
            <div className="heading-actions">
              {[0, 3, 6].includes(module) &&
                actionButton("cargo", "New cargo", ["OPERATOR"])}
              <button className="subtle" onClick={refresh}>
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {module === 0 && (
            <>
              <div className="metrics">
                <Metric
                  title="DECLARED EXPORT VALUE"
                  value={money(total)}
                  detail={`${state.cargoes.length} cargos in portfolio`}
                  icon={<Globe />}
                />
                <Metric
                  title="TRACEABLE PRODUCTION"
                  value={`${number(state.batches.reduce((n, b) => n + Number(b.quantity), 0))}`}
                  detail="barrels · petroleum vertical"
                  icon={<Layers3 />}
                />
                <Metric
                  title="RELEASE AUTHORIZATIONS"
                  value={String(released).padStart(2, "0")}
                  detail={`${state.cargoes.filter((c) => c.evaluation.eligible).length} cargos meet automatic eligibility`}
                  icon={<ShieldCheck />}
                />
                <Metric
                  title="COMPLIANCE BLOCKERS"
                  value={String(blocked).padStart(2, "0")}
                  detail="cargos requiring attention"
                  icon={<ShieldAlert />}
                  warn
                />
              </div>
              <div className="charts-grid">
                <section className="card">
                  <CardTitle
                    title="Production visibility"
                    subtitle="Registered production · barrels"
                  />
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={production}>
                        <defs>
                          <linearGradient
                            id="volumeFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#4c90e8"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="100%"
                              stopColor="#4c90e8"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#26303d" vertical={false} />
                        <XAxis
                          dataKey="date"
                          stroke="#7a8799"
                          fontSize={10}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#7a8799"
                          fontSize={10}
                          tickFormatter={(v) => `${v / 1000}k`}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#15202d",
                            border: "1px solid #344458",
                          }}
                        />
                        <Area
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="volume"
                          stroke="#68a7fc"
                          strokeWidth={2}
                          fill="url(#volumeFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card">
                  <CardTitle
                    title="Authorization readiness"
                    subtitle="Current calculated cargo status"
                  />
                  <div className="chart donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          isAnimationActive={false}
                          data={distribution}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={65}
                          outerRadius={88}
                          paddingAngle={5}
                        >
                          {distribution.map((_, i) => (
                            <Cell
                              key={i}
                              fill={
                                ["#547fb9", "#d4a563", "#58b9a4", "#805fb1"][
                                  i % 4
                                ]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#15202d",
                            border: "1px solid #344458",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="legend">
                    {distribution.map((d, i) => (
                      <span key={d.name}>
                        <i
                          style={{
                            background: [
                              "#547fb9",
                              "#d4a563",
                              "#58b9a4",
                              "#805fb1",
                            ][i % 4],
                          }}
                        />
                        {d.name} <b>{Number(d.value)}</b>
                      </span>
                    ))}
                  </div>
                </section>
              </div>
              <section className="card">
                <CardTitle
                  title="Cargo operations"
                  subtitle="Live records · select a cargo to inspect its evidence"
                  trailing={
                    <button
                      className="text-button"
                      onClick={() => setModule(6)}
                    >
                      Open ARRS <ArrowRight size={14} />
                    </button>
                  }
                />
                {cargoTable}
              </section>
              <div className="mini-metrics">
                <span>
                  <b>
                    {
                      state.organizations.filter((o) => o.type === "PRODUCER")
                        .length
                    }
                  </b>{" "}
                  Registered producers
                </span>
                <span>
                  <b>{state.organizations.flatMap((o) => o.assets).length}</b>{" "}
                  Resource assets
                </span>
                <span>
                  <b>{money(assessed)}</b> Indicative public revenue
                </span>
              </div>
            </>
          )}
          {module === 1 && (
            <>
              <div className="toolbar">
                {actionButton("organization", "Organization", ["ADMIN"])}
                {actionButton("license", "License", ["REGULATOR"])}
                {actionButton("asset", "Resource asset", ["OPERATOR", "ADMIN"])}
                {actionButton("batch", "Production batch", ["OPERATOR"])}
              </div>
              <section className="card">
                <CardTitle
                  title="Institutional registry"
                  subtitle="ResourceID · organization verification and licenses"
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Type</th>
                        <th>Registration</th>
                        <th>Licenses</th>
                        <th>Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.organizations.map((o) => (
                        <tr key={o.id}>
                          <td>
                            <strong>{o.name}</strong>
                            <small>{o.jurisdiction}</small>
                          </td>
                          <td>{o.type}</td>
                          <td className="mono">{o.registration}</td>
                          <td>
                            {o.licenses.map((l: Row) => (
                              <small key={l.id}>
                                {l.reference} · {when(l.expiresAt)}
                              </small>
                            ))}
                          </td>
                          <td>
                            <Badge
                              value={o.verified ? "VERIFIED" : "PENDING"}
                            />
                            {can("COMPLIANCE", "REGULATOR") && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  action("organizationVerify", {
                                    id: o.id,
                                    verified: !o.verified,
                                  })
                                }
                              >
                                {o.verified ? "Revoke" : "Verify"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card">
                <CardTitle
                  title="Resource assets"
                  subtitle="Origin authorization is recorded by a regulator"
                />
                <div className="asset-grid">
                  {state.organizations.flatMap((o) =>
                    o.assets.map((a: Row) => (
                      <article key={a.id}>
                        <Box size={20} />
                        <h3>{a.name}</h3>
                        <p>{a.location}</p>
                        <small>{o.name}</small>
                        <Badge value={a.authorized ? "VERIFIED" : "PENDING"} />
                        {can("REGULATOR") && (
                          <button
                            onClick={() =>
                              action("assetVerify", {
                                id: a.id,
                                authorized: !a.authorized,
                              })
                            }
                          >
                            {a.authorized
                              ? "Revoke authorization"
                              : "Authorize origin"}
                          </button>
                        )}
                      </article>
                    )),
                  )}
                </div>
              </section>
              <BatchTable batches={state.batches} />
            </>
          )}
          {module === 2 && (
            <>
              <div className="toolbar">
                {actionButton("transfer", "Record custody movement", [
                  "OPERATOR",
                ])}
                {actionButton("allocate", "Allocate to cargo", ["OPERATOR"])}
              </div>
              <BatchTable batches={state.batches} />
              <section className="card">
                <CardTitle
                  title="Chain-of-custody timeline"
                  subtitle="Append-only movements, linked to a unique ResourceID"
                />
                <div className="timeline">
                  {state.batches.flatMap((b) =>
                    b.movements.map((m: Row) => (
                      <div className="timeline-event" key={m.id}>
                        <span className="timeline-dot" />
                        <small>{when(m.createdAt)}</small>
                        <strong>
                          {m.fromLocation} <ArrowRight size={13} />{" "}
                          {m.toLocation}
                        </strong>
                        <p>
                          {number(m.quantity)} bbl · {b.resourceId} ·{" "}
                          {m.reference}
                        </p>
                      </div>
                    )),
                  )}
                </div>
              </section>
            </>
          )}
          {[3, 6].includes(module) && (
            <>
              <div className="arrs-banner">
                <ShieldCheck size={28} />
                <div>
                  <strong>
                    {module === 6
                      ? "Authorization built on evidence"
                      : "Independent cargo verification"}
                  </strong>
                  <p>
                    {module === 6
                      ? "Every mandatory condition must pass. A separate authorizing officer approves before a signed release token can be issued."
                      : "Uploading evidence does not verify it. Independent Q&Q, reviewed documents and quantity reconciliation determine readiness."}
                  </p>
                </div>
                <span>DEMO RULES</span>
              </div>
              <div className="toolbar">
                <div className="search">
                  <Search size={15} />
                  <input
                    aria-label="Search cargos"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search cargo, producer or vessel…"
                  />
                </div>
                {actionButton("inspection", "Q&Q inspection", ["INSPECTOR"])}
                {actionButton("decision", "Review POP / POF", ["COMPLIANCE"])}
              </div>
              <section className="card">{cargoTable}</section>
            </>
          )}
          {module === 4 && (
            <>
              <div className="toolbar">
                {actionButton("counterparty", "Counterparty", ["COMPLIANCE"])}
                {actionButton("contract", "Submit contract", ["OPERATOR"])}
                {actionButton("contractReview", "Review contract", [
                  "COMPLIANCE",
                ])}
                {actionButton("decision", "Review POP / POF", ["COMPLIANCE"])}
                {actionButton("insurance", "Insurance", ["COMPLIANCE"])}
                {actionButton("guarantee", "Guarantee", ["COMPLIANCE"])}
              </div>
              <section className="card">
                <CardTitle
                  title="Counterparty register"
                  subtitle="Identity and beneficial ownership · documentary verification"
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Counterparty</th>
                        <th>Jurisdiction</th>
                        <th>Ownership declaration</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.counterparties.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                            <small>{c.registration}</small>
                          </td>
                          <td>{c.jurisdiction}</td>
                          <td>{c.beneficialOwners}</td>
                          <td>
                            <Badge
                              value={c.verified ? "VERIFIED" : "PENDING"}
                            />
                            {can("COMPLIANCE") && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  action("counterpartyVerify", {
                                    id: c.id,
                                    verified: !c.verified,
                                  })
                                }
                              >
                                {c.verified ? "Revoke" : "Verify"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card">
                <CardTitle
                  title="Commercial contracts"
                  subtitle="Declared terms and independent acceptance"
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cargo / contract</th>
                        <th>Buyer</th>
                        <th>Quantity</th>
                        <th>Price / terms</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.cargoes
                        .filter((c) => c.contract)
                        .map((c) => (
                          <tr key={c.id} onClick={() => setSelectedId(c.id)}>
                            <td>
                              <strong>{c.reference}</strong>
                              <small>{c.contract.reference}</small>
                            </td>
                            <td>{c.contract.buyer.name}</td>
                            <td>{number(c.contract.quantity)} bbl</td>
                            <td>
                              {money(c.contract.price)} / bbl
                              <small>{c.contract.incoterm}</small>
                            </td>
                            <td>
                              <Badge value={c.contract.status} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {module === 5 && (
            <>
              <div className="metrics">
                <Metric
                  title="PUBLIC REVENUE ASSESSED"
                  value={money(assessed)}
                  detail="fictional demonstration rates"
                  icon={<Landmark />}
                />
                <Metric
                  title="DOCUMENTED AS PAID"
                  value={money(
                    state.cargoes
                      .reduce(
                        (n, c) => n.plus(c.fiscal?.documentedPaid ?? 0),
                        new Decimal(0),
                      )
                      .toString(),
                  )}
                  detail="manual evidence attestations"
                  icon={<FileCheck2 />}
                />
                <Metric
                  title="DEPOSITS CONFIRMED"
                  value={money(
                    state.cargoes
                      .reduce(
                        (n, c) => n.plus(c.deposit?.confirmed ?? 0),
                        new Decimal(0),
                      )
                      .toString(),
                  )}
                  detail="documentary confirmations only"
                  icon={<ShieldCheck />}
                />
                <Metric
                  title="DEPOSIT RULE"
                  value={`${new Decimal(state.policy.depositRate).times(100).toString()}%`}
                  detail="configurable fictional requirement"
                  icon={<Settings2 />}
                />
              </div>
              <div className="toolbar">
                {actionButton("deposit", "Confirm deposit", ["TREASURY"])}
                {actionButton("fiscal", "Fiscal assessment", ["TREASURY"])}
                <a className="button" href="/api/resource/fiscal.csv">
                  <ArrowDownToLine size={15} />
                  Export CSV
                </a>
              </div>
              <div className="info-note">
                No payments or live Treasury reconciliation. Required, declared
                and independently documented amounts remain distinct.
              </div>
              <section className="card">
                <CardTitle
                  title="Fiscal & deposit ledger"
                  subtitle={`Fictional rates: royalty ${new Decimal(state.policy.royaltyRate).times(100).toString()}% · duty ${new Decimal(state.policy.dutyRate).times(100).toString()}% · other ${new Decimal(state.policy.otherRate).times(100).toString()}%`}
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cargo</th>
                        <th>Assessed</th>
                        <th>Documented paid</th>
                        <th>Outstanding</th>
                        <th>Deposit required / confirmed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.cargoes.map((c) => (
                        <tr key={c.id} onClick={() => setSelectedId(c.id)}>
                          <td>
                            <strong>{c.reference}</strong>
                            <small>{money(c.value)} declared</small>
                          </td>
                          <td>{money(c.fiscal?.assessed)}</td>
                          <td>{money(c.fiscal?.documentedPaid)}</td>
                          <td>
                            {money(
                              Decimal.max(
                                0,
                                new Decimal(c.fiscal?.assessed ?? 0).minus(
                                  c.fiscal?.documentedPaid ?? 0,
                                ),
                              ).toString(),
                            )}
                          </td>
                          <td>
                            {money(c.deposit?.required)}
                            <small>
                              {money(c.deposit?.confirmed)} confirmed
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {module === 7 && (
            <>
              <div className="charts-grid">
                <section className="card">
                  <CardTitle
                    title="Export volume by terminal"
                    subtitle="Declared cargo quantities · bbl"
                  />
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={terminals}>
                        <CartesianGrid stroke="#26303d" vertical={false} />
                        <XAxis dataKey="name" stroke="#7a8799" fontSize={10} />
                        <YAxis stroke="#7a8799" fontSize={10} />
                        <Tooltip contentStyle={{ background: "#15202d" }} />
                        <Bar
                          isAnimationActive={false}
                          dataKey="volume"
                          fill="#5a8fc5"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="card">
                  <CardTitle
                    title="Risk methodology"
                    subtitle="Transparent, deterministic signals"
                  />
                  <div className="risk-summary">
                    <ShieldAlert size={42} />
                    <h2>
                      {state.cargoes.reduce(
                        (n, c) => n + c.evaluation.blocking.length,
                        0,
                      )}{" "}
                      blocking conditions
                    </h2>
                    <p>
                      Expired licenses, missing inspections, quantity
                      discrepancies, unverified counterparties and outstanding
                      fiscal evidence.
                    </p>
                    <small>
                      Calculated directly from records. No AI fraud model.
                    </small>
                  </div>
                </section>
              </div>
              <div className="charts-grid">
                <DataBars
                  title="Compliance failure categories"
                  subtitle="Current mandatory conditions that block release"
                  data={failureData}
                />
                <DataBars
                  title="Top counterparties by cargo volume"
                  subtitle="Declared allocation to commercial buyers · barrels"
                  data={buyerData}
                />
              </div>
              <DataBars
                title="Assessed government revenue"
                subtitle="Fictional public revenue assessment per cargo · USD"
                data={revenueData}
              />
              <section className="card">
                <CardTitle
                  title="Compliance exception register"
                  subtitle="Select a cargo to resolve the underlying requirement"
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cargo</th>
                        <th>Condition</th>
                        <th>Blocking reason</th>
                        <th>Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.cargoes.flatMap((c) =>
                        [
                          ...c.evaluation.blocking,
                          ...c.risks
                            .filter(
                              (r: Row) =>
                                !r.resolved &&
                                !c.evaluation.blocking.some(
                                  (b: Row) => b.key === r.kind,
                                ),
                            )
                            .map((r: Row) => ({
                              key: r.kind,
                              name: "Documentary risk flag",
                              reason: r.reason,
                            })),
                        ].map((b: Row) => (
                          <tr
                            key={`${c.id}-${b.key}`}
                            onClick={() => setSelectedId(c.id)}
                          >
                            <td>{c.reference}</td>
                            <td>{b.name}</td>
                            <td>{b.reason}</td>
                            <td>
                              <Badge value="BLOCKED" />
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {module === 8 && (
            <>
              <section className="card">
                <CardTitle
                  title="Protected evidence library"
                  subtitle="Self-declared uploads require independent review"
                />
                {can("OPERATOR", "INSPECTOR", "COMPLIANCE", "TREASURY") && (
                  <form className="upload-form" onSubmit={uploadFile}>
                    <label>
                      Cargo
                      <select name="cargoId">
                        {state.cargoes.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.reference}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Evidence reference
                      <input name="reference" required maxLength={200} />
                    </label>
                    <label>
                      PDF, PNG or JPEG · up to 5 MB
                      <input
                        name="file"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Upload evidence
                    </button>
                  </form>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Cargo</th>
                        <th>Provenance</th>
                        <th>Review</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {state.cargoes.flatMap((c) =>
                        c.documents.map((d: Row) => (
                          <tr key={d.id}>
                            <td>
                              <a href={`/api/resource/documents/${d.id}`}>
                                {d.filename}
                              </a>
                              <small>{d.reference}</small>
                            </td>
                            <td>{c.reference}</td>
                            <td>{d.provenance}</td>
                            <td>
                              <Badge value={d.status} />
                            </td>
                            <td>
                              {can("COMPLIANCE", "INSPECTOR") && (
                                <>
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      action("documentReview", {
                                        documentId: d.id,
                                        status: "ACCEPTED",
                                        reason:
                                          "Independent documentary review",
                                      })
                                    }
                                  >
                                    Accept
                                  </button>
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      action("documentReview", {
                                        documentId: d.id,
                                        status: "REJECTED",
                                        reason:
                                          "Evidence rejected after review",
                                      })
                                    }
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                  {!state.cargoes.some((c) => c.documents.length) && (
                    <Empty>
                      No evidence files uploaded yet. Recorded demo attestations
                      appear in each cargo dossier.
                    </Empty>
                  )}
                </div>
              </section>
              <section className="card">
                <CardTitle
                  title="Export Verification Packs"
                  subtitle="Generated from the same records used by ARRS · DEMO watermark"
                />
                <div className="dossier-grid">
                  {state.cargoes.map((c) => (
                    <article key={c.id}>
                      <FileCheck2 size={24} />
                      <h3>{c.reference}</h3>
                      <p>{c.organization.name}</p>
                      <Badge value={c.displayStatus} />
                      <a
                        className="button"
                        href={`/api/resource/dossier/${c.id}`}
                      >
                        <ArrowDownToLine size={14} />
                        Generate PDF dossier
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {module === 9 && (
            <>
              <div className="toolbar">
                {actionButton("policy", "Demonstration policy", ["ADMIN"])}
                {actionButton("user", "Create account", ["ADMIN"])}
              </div>
              <section className="card">
                <CardTitle
                  title="Institutional accounts"
                  subtitle="Role-based access and organization membership"
                />
                {state.users.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Roles</th>
                          <th>Account</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.users.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.name}</strong>
                              <small>{u.email}</small>
                            </td>
                            <td>
                              {u.memberships
                                .flatMap((m: Row) => m.roles)
                                .join(", ")}
                            </td>
                            <td>
                              <Badge
                                value={u.active ? "VERIFIED" : "REVOKED"}
                              />
                              {u.id !== state.user.id && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    action("userActive", {
                                      id: u.id,
                                      active: !u.active,
                                    })
                                  }
                                >
                                  {u.active ? "Disable" : "Enable"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>
                    Account administration requires the System Administrator
                    role.
                  </Empty>
                )}
              </section>
              <section className="card">
                <CardTitle
                  title="Application audit trail"
                  subtitle="Append-only application records · not cryptographically tamper-proof storage"
                />
                <div className="audit-list">
                  {state.auditEvents.map((a) => (
                    <details key={a.id}>
                      <summary>
                        <span className="audit-dot" />
                        <strong>{a.action.replaceAll("_", " ")}</strong>
                        <span>{when(a.createdAt)}</span>
                        <small className="mono">
                          {a.targetId.slice(0, 14)}
                        </small>
                      </summary>
                      <pre>
                        {JSON.stringify(
                          {
                            id: a.id,
                            actor: a.actorId,
                            organization: a.organizationId,
                            timestamp: a.createdAt,
                            metadata: a.metadata,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                </div>
              </section>
            </>
          )}
          <footer className="content-footer">
            <span>
              AXIOM ResourceOS <i>•</i> Resource Intelligence. Sovereign
              Control.
            </span>
            <span>All demonstration entities and evidence are fictional.</span>
          </footer>
        </main>
      </div>
      {selected && (
        <div
          className="drawer-backdrop"
          onClick={() => setSelectedId(undefined)}
        >
          <section
            className="cargo-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">CARGO CONTROL RECORD</p>
                <h2>{selected.reference}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close cargo details"
                onClick={() => setSelectedId(undefined)}
              >
                <X />
              </button>
            </div>
            <Badge value={selected.displayStatus} />
            <p>
              {selected.organization.name} · authorization version{" "}
              {selected.version}
            </p>
            <div className="detail-grid">
              <div>
                <small>DECLARED VOLUME</small>
                <strong>{number(selected.quantity)} bbl</strong>
              </div>
              <div>
                <small>DECLARED VALUE</small>
                <strong>{money(selected.value)}</strong>
              </div>
              <div>
                <small>TERMINAL</small>
                <strong>{selected.terminal}</strong>
              </div>
              <div>
                <small>VESSEL</small>
                <strong>{selected.vessel}</strong>
              </div>
            </div>
            <div className="drawer-actions">
              {actionButton("allocate", "Allocate", ["OPERATOR"])}
              {actionButton("cargoEdit", "Correct shipment", ["OPERATOR"])}
              {actionButton("inspection", "Inspect", ["INSPECTOR"])}
              {actionButton("contract", "Contract", ["OPERATOR"])}
              {actionButton("contractReview", "Review contract", [
                "COMPLIANCE",
              ])}
              {actionButton("decision", "POP / POF", ["COMPLIANCE"])}
              {actionButton("insurance", "Insurance", ["COMPLIANCE"])}
              {actionButton("guarantee", "Guarantee", ["COMPLIANCE"])}
              {actionButton("deposit", "Deposit", ["TREASURY"])}
              {actionButton("fiscal", "Fiscal", ["TREASURY"])}
            </div>
            <h3>ARRS eligibility checklist</h3>
            <p className="muted">
              {
                selected.evaluation.conditions.filter((c: Row) => c.passed)
                  .length
              }{" "}
              of {selected.evaluation.conditions.length} automatic conditions
              satisfied
            </p>
            <div className="requirements">
              {selected.evaluation.conditions.map((c: Row) => (
                <details key={c.key}>
                  <summary>
                    <span
                      className={c.passed ? "condition-pass" : "condition-fail"}
                    >
                      {c.passed ? <Check size={13} /> : <X size={13} />}
                    </span>
                    {c.name}
                    <span className="requirement-state">
                      {c.passed ? "PASS" : "BLOCKED"}
                    </span>
                  </summary>
                  <p>{c.evidence || "No supporting evidence recorded"}</p>
                  <small>
                    Reviewer: {c.reviewer || "Pending"} · Last verification:{" "}
                    {c.verifiedAt ? when(c.verifiedAt) : "Not recorded"}
                  </small>
                  {!c.passed && <p className="negative">{c.reason}</p>}
                </details>
              ))}
            </div>
            <div className="approval-block">
              <LockKeyhole size={20} />
              <div>
                <strong>14. Independent final approval</strong>
                <p>
                  {selected.evaluation.approval
                    ? `Approved by ${selected.evaluation.approval.actorId} · ${when(selected.evaluation.approval.createdAt)}`
                    : "An independent regulator must approve the current version."}
                </p>
              </div>
            </div>
            <div className="drawer-actions">
              {can("REGULATOR") && (
                <button
                  className="primary"
                  disabled={busy || !selected.evaluation.eligible}
                  onClick={() => open("approve")}
                >
                  Record approval
                </button>
              )}
              {can("OPERATOR", "REGULATOR") && (
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !selected.evaluation.eligible ||
                    !selected.evaluation.approval ||
                    selected.evaluation.approval.actorId === state.user.id
                  }
                  onClick={() => action("release", { cargoId: selected.id })}
                >
                  Issue release token
                </button>
              )}
              {can("REGULATOR") && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => open("revoke")}
                >
                  Revoke
                </button>
              )}
              <button
                disabled={
                  busy ||
                  !can(
                    "OPERATOR",
                    "INSPECTOR",
                    "COMPLIANCE",
                    "REGULATOR",
                    "TREASURY",
                    "ADMIN",
                  )
                }
                onClick={() => action("evaluate", { cargoId: selected.id })}
              >
                Re-evaluate
              </button>
              <a
                className="button"
                href={`/api/resource/dossier/${selected.id}`}
              >
                <ArrowDownToLine size={14} />
                PDF dossier
              </a>
            </div>
            {token && selected.evaluation.eligible && (
              <div className="token-card">
                {qr && (
                  <img
                    src={qr}
                    alt="Release token verification QR code"
                    width={140}
                    height={140}
                  />
                )}
                <div>
                  <Badge value="VALID" />
                  <h3>Digital Release Token</h3>
                  <p>Expires {new Date(token.expiresAt).toLocaleString()}</p>
                  <a
                    href={`/verify/${encodeURIComponent(token.token)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open independent verification <ArrowRight size={13} />
                  </a>
                  <small>DEMONSTRATION AUTHORIZATION</small>
                </div>
              </div>
            )}
            <h3>Traceability & inspection history</h3>
            {selected.allocations.map((a: Row) => (
              <div className="detail-record" key={a.id}>
                <strong>{a.batch.resourceId}</strong>
                <p>
                  {a.batch.asset.name} · {number(a.quantity)} bbl at{" "}
                  {a.location}
                </p>
              </div>
            ))}
            {selected.inspections.map((i: Row) => (
              <div className="detail-record" key={i.id}>
                <strong>
                  {i.reportReference} · {i.status}
                </strong>
                <p>
                  {number(i.measuredQuantity)} bbl · {i.quality}
                </p>
              </div>
            ))}
            <p className="info-note">
              Fictional evidence and demonstration authorization. No legal
              customs clearance, banking confirmation or real valve actuation.
            </p>
          </section>
        </div>
      )}
      {form && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={form.title}
          >
            <div className="modal-header">
              <h2>{form.title}</h2>
              <button
                className="icon-button"
                aria-label="Close form"
                onClick={() => setForm(undefined)}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              Changes are validated server-side and recorded in the audit trail.
            </p>
            <form onSubmit={submit}>
              {form.fields.map((field) => (
                <label
                  key={field.name}
                  className={field.type === "checkbox" ? "checkbox-label" : ""}
                >
                  {field.label}
                  {field.options ? (
                    <select
                      name={field.name}
                      defaultValue={String(
                        field.value ?? field.options[0]?.value ?? "",
                      )}
                      required
                    >
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={field.name}
                      type={field.type ?? "text"}
                      defaultValue={
                        field.type === "checkbox"
                          ? undefined
                          : String(field.value ?? "")
                      }
                      defaultChecked={
                        field.type === "checkbox"
                          ? Boolean(field.value)
                          : undefined
                      }
                      required={field.type !== "checkbox"}
                      maxLength={500}
                    />
                  )}
                </label>
              ))}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setForm(undefined)}>
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Save record"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  detail,
  icon,
  warn = false,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <section className={`metric ${warn ? "warn" : ""}`}>
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
function CardTitle({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="card-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {trailing}
    </div>
  );
}
function BatchTable({ batches }: { batches: Row[] }) {
  return (
    <section className="card">
      <CardTitle
        title="Traceable production batches"
        subtitle="Standardized petroleum unit: barrels (bbl)"
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ResourceID</th>
              <th>Origin asset</th>
              <th>Produced</th>
              <th>Allocated</th>
              <th>Unallocated</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong className="mono">{b.resourceId}</strong>
                  <small>{when(b.productionDate)}</small>
                </td>
                <td>
                  {b.asset.name}
                  <small>{b.grade}</small>
                </td>
                <td>{number(b.quantity)} bbl</td>
                <td>
                  {number(
                    b.allocations.reduce(
                      (n: number, a: Row) => n + Number(a.quantity),
                      0,
                    ),
                  )}{" "}
                  bbl
                </td>
                <td>
                  {number(
                    Number(b.quantity) -
                      b.allocations.reduce(
                        (n: number, a: Row) => n + Number(a.quantity),
                        0,
                      ),
                  )}{" "}
                  bbl
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DataBars({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: Row[];
}) {
  return (
    <section className="card">
      <CardTitle title={title} subtitle={subtitle} />
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#26303d" vertical={false} />
            <XAxis dataKey="name" stroke="#7a8799" fontSize={9} />
            <YAxis stroke="#7a8799" fontSize={9} />
            <Tooltip
              contentStyle={{
                background: "#15202d",
                border: "1px solid #344458",
              }}
            />
            <Bar
              isAnimationActive={false}
              dataKey="value"
              fill="#68a4ce"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
