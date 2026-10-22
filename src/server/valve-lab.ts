import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type Position = "UNKNOWN" | "OPEN" | "CLOSED";
export type Actor = {
  id: string;
  organization: string;
  role: "operator" | "approver" | "auditor";
};
export type Cargo = {
  id: string;
  organization: string;
  testOnly: boolean;
  version: number;
  requirements: Record<string, boolean>;
  approval?: { actor: Actor; version: number; expiresAt: number };
};
export type Valve = {
  id: string;
  controller: string;
  cargoId: string;
  organization: string;
  mode: "SIMULATOR";
  connected: boolean;
  position: Position;
  emergencyStop: boolean;
  interlocks: {
    lowPressure: boolean;
    waterOnly: boolean;
    localEnable: boolean;
    feedbackHealthy: boolean;
  };
  status: string;
};
export type Command = {
  id: string;
  valveId: string;
  controller: string;
  cargoId: string;
  action: "OPEN" | "CLOSE";
  issuedAt: number;
  expiresAt: number;
  signature: string;
};
export type Feedback = {
  commandId: string;
  valveId: string;
  position: Position;
  observedAt: number;
  source: "SIMULATED_POSITION_SENSOR";
};
export type Audit = { timestamp: number; type: string; data: unknown };
export interface Gateway {
  send(command: Command): Promise<Feedback>;
}
const payload = (c: Omit<Command, "signature">) =>
  JSON.stringify([
    c.id,
    c.valveId,
    c.controller,
    c.cargoId,
    c.action,
    c.issuedAt,
    c.expiresAt,
  ]);
export function sign(
  command: Omit<Command, "signature">,
  key: Buffer,
): Command {
  return {
    ...command,
    signature: createHmac("sha256", key).update(payload(command)).digest("hex"),
  };
}

/** Dedicated in-process gateway. ACK is never treated as position feedback. No physical transport exists. */
export class SimulatorGateway implements Gateway {
  private seen = new Set<string>();
  online = true;
  stopped = new Set<string>();
  constructor(
    private key: Buffer,
    private clock = Date.now,
  ) {}
  stop(valveId: string) {
    this.stopped.add(valveId);
  }
  async send(c: Command): Promise<Feedback> {
    if (!this.online) throw new Error("NETWORK_FAILURE");
    const expected = sign(c, this.key).signature;
    if (
      !/^[a-f0-9]{64}$/.test(c.signature) ||
      !timingSafeEqual(
        Buffer.from(c.signature, "hex"),
        Buffer.from(expected, "hex"),
      )
    )
      throw new Error("INVALID_SIGNATURE");
    if (
      c.expiresAt <= this.clock() ||
      c.issuedAt > this.clock() ||
      c.expiresAt - c.issuedAt > 5000
    )
      throw new Error("EXPIRED_COMMAND");
    if (this.seen.has(c.id)) throw new Error("REPLAY_ATTEMPT");
    this.seen.add(c.id);
    if (c.action === "OPEN" && this.stopped.has(c.valveId))
      throw new Error("EMERGENCY_STOP");
    return {
      commandId: c.id,
      valveId: c.valveId,
      position: c.action === "OPEN" ? "OPEN" : "CLOSED",
      observedAt: this.clock(),
      source: "SIMULATED_POSITION_SENSOR",
    };
  }
}

export class ValveLab {
  readonly valves = new Map<string, Valve>();
  readonly cargoes = new Map<string, Cargo>();
  readonly events: Audit[] = [];
  private busy = new Set<string>();
  constructor(
    private key: Buffer,
    readonly gateway: Gateway,
    private journal?: string,
    private clock = Date.now,
  ) {
    if (journal) {
      mkdirSync(dirname(journal), { recursive: true });
      try {
        for (const line of readFileSync(journal, "utf8")
          .split("\n")
          .filter(Boolean))
          this.events.push(JSON.parse(line));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }
  private audit(type: string, data: unknown) {
    const event = { timestamp: this.clock(), type, data };
    if (this.journal)
      appendFileSync(this.journal, JSON.stringify(event) + "\n", {
        mode: 0o600,
      });
    this.events.push(event);
  }
  private authorize(actor: Actor, organization: string, role: Actor["role"]) {
    if (actor.organization !== organization || actor.role !== role)
      throw new Error("NOT_AUTHORIZED");
  }
  register(actor: Actor, id: string, controller: string, cargoId: string) {
    this.authorize(actor, actor.organization, "operator");
    if (
      ![id, controller, cargoId].every(
        (x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x),
      )
    )
      throw new Error("INVALID_ID");
    if (
      this.valves.has(id) ||
      [...this.valves.values()].some((v) => v.controller === controller)
    )
      throw new Error("ALREADY_REGISTERED");
    const cargo = this.cargoes.get(cargoId);
    if (!cargo || cargo.organization !== actor.organization || !cargo.testOnly)
      throw new Error("TEST_CARGO_REQUIRED");
    const valve: Valve = {
      id,
      controller,
      cargoId,
      organization: actor.organization,
      mode: "SIMULATOR",
      connected: true,
      position: "UNKNOWN",
      emergencyStop: false,
      interlocks: {
        lowPressure: true,
        waterOnly: true,
        localEnable: true,
        feedbackHealthy: true,
      },
      status: "REGISTERED",
    };
    this.audit("REGISTERED", { actor: actor.id, valve });
    this.valves.set(id, valve);
    return valve;
  }
  approve(actor: Actor, cargoId: string) {
    const cargo = this.cargoes.get(cargoId);
    if (!cargo) throw new Error("CARGO_NOT_FOUND");
    this.authorize(actor, cargo.organization, "approver");
    if (
      !Object.keys(cargo.requirements).length ||
      !Object.values(cargo.requirements).every(Boolean)
    )
      throw new Error("ARRS_BLOCKED");
    this.audit("APPROVAL", {
      actor: actor.id,
      cargoId,
      version: cargo.version,
    });
    cargo.approval = {
      actor: { ...actor },
      version: cargo.version,
      expiresAt: this.clock() + 60_000,
    };
  }
  async command(actor: Actor, valveId: string, action: "OPEN" | "CLOSE") {
    let valve: Valve | undefined;
    try {
      valve = this.valves.get(valveId);
      if (!valve) throw new Error("VALVE_NOT_FOUND");
      this.authorize(actor, valve.organization, "operator");
      if (action !== "OPEN" && action !== "CLOSE")
        throw new Error("INVALID_ACTION");
      if (this.busy.has(valveId)) throw new Error("COMMAND_IN_PROGRESS");
      const cargo = this.cargoes.get(valve.cargoId);
      if (action === "OPEN") {
        if (
          !cargo?.testOnly ||
          !Object.keys(cargo.requirements).length ||
          !Object.values(cargo.requirements).every(Boolean)
        )
          throw new Error("ARRS_BLOCKED");
        const a = cargo.approval;
        if (
          !a ||
          a.actor.id === actor.id ||
          a.actor.role !== "approver" ||
          a.actor.organization !== actor.organization ||
          a.version !== cargo.version ||
          a.expiresAt <= this.clock()
        )
          throw new Error("INDEPENDENT_APPROVAL_REQUIRED");
        if (
          valve.emergencyStop ||
          !Object.values(valve.interlocks).every(Boolean)
        )
          throw new Error("SAFETY_INTERLOCK");
      }
    } catch (e) {
      this.audit("BLOCKED", {
        actor: actor.id,
        valveId,
        action,
        error: (e as Error).message,
      });
      throw e;
    }
    const v = valve!;
    this.busy.add(valveId);
    try {
      const c = sign(
        {
          id: randomUUID(),
          valveId,
          controller: v.controller,
          cargoId: v.cargoId,
          action,
          issuedAt: this.clock(),
          expiresAt: this.clock() + 5000,
        },
        this.key,
      );
      this.audit("COMMAND", { actor: actor.id, command: c });
      if (action === "OPEN") delete this.cargoes.get(v.cargoId)!.approval;
      v.status = "AWAITING_POSITION";
      v.position = "UNKNOWN";
      let timer: ReturnType<typeof setTimeout> | undefined;
      let feedback: Feedback;
      try {
        feedback = await Promise.race([
          this.gateway.send(c),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("FEEDBACK_TIMEOUT")),
              5000,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      this.audit("RESPONSE", feedback);
      if (
        feedback.commandId !== c.id ||
        feedback.valveId !== v.id ||
        feedback.observedAt < c.issuedAt ||
        feedback.observedAt > this.clock() ||
        this.clock() >= c.expiresAt ||
        feedback.source !== "SIMULATED_POSITION_SENSOR" ||
        feedback.position !== (action === "OPEN" ? "OPEN" : "CLOSED")
      )
        throw new Error("POSITION_NOT_CONFIRMED");
      if (action === "OPEN" && v.emergencyStop)
        throw new Error("EMERGENCY_STOP");
      if (action === "OPEN" && !Object.values(v.interlocks).every(Boolean))
        throw new Error("SAFETY_INTERLOCK");
      v.connected = true;
      v.position = feedback.position;
      v.status = action === "OPEN" ? "OPEN CONFIRMED" : "CLOSED CONFIRMED";
      this.audit("POSITION_CONFIRMED", {
        valveId,
        commandId: c.id,
        position: v.position,
      });
      return v;
    } catch (e) {
      v.position = "UNKNOWN";
      v.status = (e as Error).message;
      if (v.status === "NETWORK_FAILURE") v.connected = false;
      this.audit("FAILURE", { valveId, action, error: v.status });
      throw e;
    } finally {
      this.busy.delete(valveId);
    }
  }
  emergencyStop(actor: Actor, valveId: string) {
    const v = this.valves.get(valveId);
    if (!v) throw new Error("VALVE_NOT_FOUND");
    this.authorize(actor, v.organization, "operator");
    this.audit("SIMULATED_ESTOP", { actor: actor.id, valveId });
    v.emergencyStop = true;
    v.position = "UNKNOWN";
    v.status = "EMERGENCY STOP — POSITION UNKNOWN";
    if (this.gateway instanceof SimulatorGateway) this.gateway.stop(valveId);
  }
}
