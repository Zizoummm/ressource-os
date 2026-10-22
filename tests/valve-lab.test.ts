import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  ValveLab,
  SimulatorGateway,
  sign,
  type Actor,
  type Gateway,
} from "../src/server/valve-lab";
const operator: Actor = { id: "op", organization: "lab", role: "operator" };
const approver: Actor = { id: "ap", organization: "lab", role: "approver" };
function setup(custom?: Gateway) {
  const key = randomBytes(32);
  const gateway = new SimulatorGateway(key);
  const lab = new ValveLab(key, custom ?? gateway);
  lab.cargoes.set("cargo", {
    id: "cargo",
    organization: "lab",
    testOnly: true,
    version: 1,
    requirements: { inspection: true, treasury: true },
  });
  lab.register(operator, "valve", "controller", "cargo");
  lab.approve(approver, "cargo");
  return { lab, gateway, key };
}
describe("ValveLab safety and authorization", () => {
  it("confirms opening only with matching sensor feedback and supports close", async () => {
    const { lab } = setup();
    expect((await lab.command(operator, "valve", "OPEN")).status).toBe(
      "OPEN CONFIRMED",
    );
    expect((await lab.command(operator, "valve", "CLOSE")).position).toBe(
      "CLOSED",
    );
    expect(lab.events.map((e) => e.type)).toContain("POSITION_CONFIRMED");
  });
  it("blocks unauthorized users and tenant crossover", async () => {
    const { lab } = setup();
    await expect(lab.command(approver, "valve", "OPEN")).rejects.toThrow(
      "NOT_AUTHORIZED",
    );
    await expect(
      lab.command({ ...operator, organization: "other" }, "valve", "OPEN"),
    ).rejects.toThrow("NOT_AUTHORIZED");
  });
  it("requires independent approval", async () => {
    const { lab } = setup();
    lab.cargoes.get("cargo")!.approval!.actor.id = operator.id;
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "INDEPENDENT_APPROVAL_REQUIRED",
    );
  });
  it("blocks failed ARRS requirements and changed cargo versions", async () => {
    const { lab } = setup();
    lab.cargoes.get("cargo")!.requirements.inspection = false;
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "ARRS_BLOCKED",
    );
    lab.cargoes.get("cargo")!.requirements.inspection = true;
    lab.cargoes.get("cargo")!.version++;
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "INDEPENDENT_APPROVAL_REQUIRED",
    );
  });
  it("records network failure without claiming a position", async () => {
    const { lab, gateway } = setup();
    gateway.online = false;
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "NETWORK_FAILURE",
    );
    expect(lab.valves.get("valve")!.position).toBe("UNKNOWN");
    expect(lab.events.at(-1)!.type).toBe("FAILURE");
  });
  it("rejects expired authenticated commands", async () => {
    const { gateway, key } = setup();
    const now = Date.now();
    await expect(
      gateway.send(
        sign(
          {
            id: "expired",
            valveId: "valve",
            controller: "controller",
            cargoId: "cargo",
            action: "OPEN",
            issuedAt: now - 6000,
            expiresAt: now - 1000,
          },
          key,
        ),
      ),
    ).rejects.toThrow("EXPIRED_COMMAND");
  });
  it("rejects replay attempts", async () => {
    const { gateway, key } = setup();
    const now = Date.now();
    const c = sign(
      {
        id: "once",
        valveId: "valve",
        controller: "controller",
        cargoId: "cargo",
        action: "OPEN",
        issuedAt: now,
        expiresAt: now + 5000,
      },
      key,
    );
    await gateway.send(c);
    await expect(gateway.send(c)).rejects.toThrow("REPLAY_ATTEMPT");
  });
  it("rejects forged commands", async () => {
    const { gateway, key } = setup();
    const now = Date.now();
    const c = sign(
      {
        id: "forged",
        valveId: "valve",
        controller: "controller",
        cargoId: "cargo",
        action: "CLOSE",
        issuedAt: now,
        expiresAt: now + 5000,
      },
      key,
    );
    c.action = "OPEN";
    await expect(gateway.send(c)).rejects.toThrow("INVALID_SIGNATURE");
  });
  it("does not confuse acknowledgement or unrelated feedback with open confirmation", async () => {
    const { lab } = setup({
      send: async (c) => ({
        commandId: "wrong",
        valveId: c.valveId,
        position: "OPEN",
        observedAt: Date.now(),
        source: "SIMULATED_POSITION_SENSOR",
      }),
    });
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "POSITION_NOT_CONFIRMED",
    );
    expect(lab.valves.get("valve")!.position).toBe("UNKNOWN");
  });
  it("blocks unsafe interlocks and latched emergency stop; still permits close", async () => {
    const { lab } = setup();
    lab.valves.get("valve")!.interlocks.lowPressure = false;
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "SAFETY_INTERLOCK",
    );
    lab.valves.get("valve")!.interlocks.lowPressure = true;
    lab.emergencyStop(operator, "valve");
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "SAFETY_INTERLOCK",
    );
    expect((await lab.command(operator, "valve", "CLOSE")).position).toBe(
      "CLOSED",
    );
  });
  it("does not confirm opening when emergency stop races sensor feedback", async () => {
    let resolve!: (v: any) => void;
    const { lab } = setup({
      send: (c) =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    const pending = lab.command(operator, "valve", "OPEN");
    const command = (lab.events.find((e) => e.type === "COMMAND")!.data as any)
      .command;
    lab.emergencyStop(operator, "valve");
    resolve({
      commandId: command.id,
      valveId: "valve",
      position: "OPEN",
      observedAt: Date.now(),
      source: "SIMULATED_POSITION_SENSOR",
    });
    await expect(pending).rejects.toThrow("EMERGENCY_STOP");
  });
  it("expires approvals and consumes approval after each OPEN attempt", async () => {
    const { lab } = setup();
    lab.cargoes.get("cargo")!.approval!.expiresAt = Date.now() - 1;
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "INDEPENDENT_APPROVAL_REQUIRED",
    );
    lab.approve(approver, "cargo");
    await lab.command(operator, "valve", "OPEN");
    await expect(lab.command(operator, "valve", "OPEN")).rejects.toThrow(
      "INDEPENDENT_APPROVAL_REQUIRED",
    );
  });
  it("times out absent feedback without confirming a position", async () => {
    vi.useFakeTimers();
    try {
      const { lab } = setup({ send: () => new Promise(() => {}) });
      const pending = expect(
        lab.command(operator, "valve", "OPEN"),
      ).rejects.toThrow("FEEDBACK_TIMEOUT");
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      expect(lab.valves.get("valve")!.position).toBe("UNKNOWN");
    } finally {
      vi.useRealTimers();
    }
  });
});
