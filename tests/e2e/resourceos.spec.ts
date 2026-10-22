import { test, expect, type BrowserContext } from "@playwright/test";
const origin = process.env.APP_URL ?? "http://localhost:3000";
const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
async function login(ctx: BrowserContext, role: string) {
  const r = await ctx.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { email: `${role}@axiom.demo`, password: process.env.DEMO_PASSWORD },
  });
  expect(r.status()).toBe(200);
}
async function command(ctx: BrowserContext, action: string, data: unknown) {
  const r = await ctx.request.post("/api/resource/action", {
    headers: { Origin: origin },
    data: { action, data },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test("authenticated navigation and responsive operational dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("regulator@axiom.demo");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Command Center", exact: true }),
  ).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/resourceos-dashboard.png",
    fullPage: true,
  });
  for (const title of [
    "Resource Registry",
    "Resource Chain",
    "Cargo Verification",
    "Trade & Counterparties",
    "Revenue & Treasury",
    "ARRS Control Center",
    "Intelligence & Risk",
    "Documents & Certificates",
    "Administration",
  ]) {
    await page
      .getByRole("button", { name: title, exact: false })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Command Center", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Command Center", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/resourceos-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("A/B/C journeys: blocked cargo, independent authorization, public verification and revocation", async ({
  browser,
}) => {
  const contexts: Record<string, BrowserContext> = {};
  for (const role of [
    "operator",
    "operator2",
    "inspector",
    "compliance",
    "treasury",
    "regulator",
  ]) {
    contexts[role] = await browser.newContext({ baseURL: origin });
    await login(contexts[role], role);
  }
  try {
    const op = contexts.operator;
    const state = await (await op.request.get("/api/resource/state")).json();
    const suffix = Date.now();
    const cargo = await command(op, "cargo", {
      reference: `E2E-${suffix}`,
      testOnly: true,
      organizationId: state.user.organizationId,
      grade: "Demo light",
      quantity: "100",
      value: "7500",
      terminal: "Harbor One Terminal",
      vessel: "MV E2E Demo",
      shipmentDate: expiresAt,
    });
    const cargoId = cargo.id;
    const foreign = await contexts.operator2.request.post(
      "/api/resource/action",
      {
        headers: { Origin: origin },
        data: { action: "release", data: { cargoId } },
      },
    );
    expect(foreign.status()).toBe(404);
    const asset = state.organizations
      .find((o: any) => o.id === state.user.organizationId)
      .assets.find((a: any) => a.authorized);
    const batch = await command(op, "batch", {
      assetId: asset.id,
      grade: "Demo light",
      quantity: "100",
      storage: "E2E Tank",
      productionDate: new Date().toISOString(),
    });
    await command(op, "allocate", {
      cargoId,
      batchId: batch.id,
      location: "E2E Tank",
      quantity: "100",
    });
    const page = await op.newPage();
    await page.goto("/");
    await page
      .getByRole("button", { name: "ARRS Control Center", exact: false })
      .click();
    await page.getByText(cargo.reference, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Issue release token" }),
    ).toBeDisabled();
    const blocked = await op.request.post("/api/resource/action", {
      headers: { Origin: origin },
      data: { action: "release", data: { cargoId } },
    });
    expect(blocked.status()).toBe(400);
    const rejectedReleaseState = await (
      await op.request.get("/api/resource/state")
    ).json();
    expect(
      rejectedReleaseState.auditEvents.some(
        (event: any) =>
          event.action === "OPERATION_REJECTED" &&
          event.targetId === cargoId &&
          event.metadata.operation === "release",
      ),
    ).toBeTruthy();
    await command(op, "contract", {
      cargoId,
      buyerId: state.counterparties[0].id,
      reference: `E2E-TRADE-${suffix}`,
      quantity: "100",
      price: "75",
      incoterm: "FOB",
      paymentTerms: "Fictional documentary settlement",
    });
    await command(contexts.compliance, "contractReview", {
      cargoId,
      status: "ACCEPTED",
      reason: "Independent demo review",
    });
    await command(contexts.inspector, "inspection", {
      cargoId,
      measuredQuantity: "100",
      quality: "Demo API 34",
      samplingReference: `E2E-SAMPLE-${suffix}`,
      reportReference: `E2E-REPORT-${suffix}`,
      status: "ACCEPTED",
      expiresAt,
    });
    for (const kind of ["POP", "POF"])
      await command(contexts.compliance, "decision", {
        cargoId,
        kind,
        status: "ACCEPTED",
        evidenceReference: `E2E-${kind}-${suffix}`,
        reason: "Fictional manual attestation",
        expiresAt,
      });
    await command(contexts.compliance, "insurance", {
      cargoId,
      reference: `E2E-INS-${suffix}`,
      insurer: "Fictional insurer",
      coverage: "7500",
      expiresAt,
      status: "ACCEPTED",
    });
    await command(contexts.compliance, "guarantee", {
      cargoId,
      reference: `E2E-GUAR-${suffix}`,
      institution: "Fictional guarantor",
      amount: "75",
      expiresAt,
      status: "ACCEPTED",
    });
    await command(contexts.treasury, "deposit", {
      cargoId,
      declared: "75",
      confirmed: "75",
      evidenceReference: `E2E-DEP-${suffix}`,
    });
    await command(contexts.treasury, "fiscal", {
      cargoId,
      documentedPaid: "525",
      evidenceReference: `E2E-FISCAL-${suffix}`,
    });
    await command(contexts.regulator, "approve", {
      cargoId,
      reason: "Independent final approval",
    });
    await page.getByRole("button", { name: "Close cargo details" }).click();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText(cargo.reference, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Issue release token" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Issue release token" }).click();
    await expect(
      page.getByText("Digital Release Token", { exact: true }),
    ).toBeVisible();
    const url = await page
      .getByRole("link", { name: "Open independent verification" })
      .getAttribute("href");
    const publicContext = await browser.newContext({ baseURL: origin });
    const verify = await publicContext.newPage();
    await verify.goto(url!);
    await expect(
      verify.getByRole("heading", { name: "VALID", exact: true }),
    ).toBeVisible();
    const valveId = `LAB-${suffix}`;
    const labCommand = async (data: unknown) => {
      const r = await op.request.post("/api/valve-lab", {
        headers: { Origin: origin },
        data,
      });
      expect(r.ok(), await r.text()).toBeTruthy();
    };
    await labCommand({
      action: "register",
      valveId,
      controller: `CTRL-${suffix}`,
      cargoId,
    });
    await labCommand({ action: "OPEN", valveId });
    const labState = await (await op.request.get("/api/valve-lab")).json();
    expect(labState.valves.find((v: any) => v.id === valveId).status).toBe(
      "OPEN CONFIRMED",
    );
    await labCommand({ action: "CLOSE", valveId });
    await labCommand({ action: "estop", valveId });
    const again = await op.request.post("/api/valve-lab", {
      headers: { Origin: origin },
      data: { action: "OPEN", valveId },
    });
    expect(again.status()).toBe(400);
    const rejectedLabState = await (
      await op.request.get("/api/resource/state")
    ).json();
    expect(
      rejectedLabState.auditEvents.some(
        (event: any) =>
          event.action === "OPERATION_REJECTED" &&
          event.targetId === valveId &&
          event.metadata.operation === "OPEN",
      ),
    ).toBeTruthy();
    const pdf = await op.request.get(`/api/resource/dossier/${cargoId}`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await command(contexts.compliance, "decision", {
      cargoId,
      kind: "POF",
      status: "REJECTED",
      evidenceReference: `E2E-WITHDRAW-${suffix}`,
      reason: "Material evidence withdrawn after release",
      expiresAt,
    });
    await verify.reload();
    await expect(
      verify.getByRole("heading", { name: "REVOKED", exact: true }),
    ).toBeVisible();
    await publicContext.close();
    const unauth = await browser.newContext({ baseURL: origin });
    expect((await unauth.request.get("/api/resource/state")).status()).toBe(
      401,
    );
    expect(
      (await unauth.request.get(`/api/resource/dossier/${cargoId}`)).status(),
    ).toBe(401);
    await unauth.close();
  } finally {
    for (const context of Object.values(contexts)) await context.close();
  }
});
test("producer creates a production batch through the form", async ({
  page,
  context,
}) => {
  await login(context, "operator");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Resource Registry", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Production batch", exact: true })
    .click();
  await page.getByLabel("Quantity (bbl)", { exact: true }).fill("123.456");
  await page
    .getByLabel("Initial storage location")
    .fill(`UI Tank ${Date.now()}`);
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Saved.");
});
