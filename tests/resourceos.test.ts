import { describe, it, expect } from "vitest";
import { financials } from "../src/server/arrs";
describe("decimal financial calculations", () => {
  it("calculates required deposit and total public assessment exactly", () => {
    expect(financials("20000000", ".01", ".05", ".02", "0")).toEqual({
      deposit: "200000.00",
      royalty: "1000000.00",
      duty: "400000.00",
      other: "0.00",
      total: "1400000.00",
    });
  });
  it("handles fractional cents using decimal arithmetic", () => {
    expect(financials("0.30", ".01", ".10", ".20", "0").total).toBe("0.09");
  });
  it("does not lose large monetary precision", () => {
    expect(
      financials("9999999999999999.99", ".01", ".05", ".02", "0").deposit,
    ).toBe("100000000000000.00");
  });
});
