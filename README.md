# AXIOM ResourceOS

**Resource Intelligence. Sovereign Control.**

Working demonstration MVP for petroleum traceability, independent verification and rules-based export authorization. All seeded entities, financial rates, inspection attestations and release tokens are fictional. A token is not legal customs clearance, bank confirmation or Treasury reconciliation.

## Start locally

Requirements: Node.js 24, npm 11, Docker with Compose. PostgreSQL 17 runs on loopback port 5432.

```sh
cd /workspace/ressource-os
npm ci --cache /tmp/npm-cache
npm run setup
npm run dev
```

`setup` creates a private `.env` only as needed, preserves existing values, starts PostgreSQL, generates the Prisma client, applies versioned SQL migrations and seeds an empty demo workspace. No default password is shipped. The generated password is in `DEMO_PASSWORD` in `.env`; read it locally and do not paste it in chat. `.env`, `.env.local`, evidence storage and local backups are ignored by Git.

For a production-mode **local demonstration**, run `npm run build` followed by `npm start`. This does not make the application production-ready. `APP_URL` must match the origin used in the browser; HTTPS origins receive Secure session cookies.

## Publish a test instance on Render

[Deploy to Render](https://render.com/deploy?repo=https://github.com/Zizoummm/ressource-os)

The root `render.yaml` creates an authenticated web service, managed PostgreSQL and persistent evidence disk. These selected plans are paid; review current pricing in Render before creating them. Follow the [Render deployment guide](docs/deploy-render.md) for the exact steps and private test credentials. Local passwords and database snapshots are not uploaded.

## Development accounts

All seeded accounts use the locally generated `DEMO_PASSWORD`. Use separate browser profiles when demonstrating separation of duties.

| Account                 | Role                            | Scope                                           |
| ----------------------- | ------------------------------- | ----------------------------------------------- |
| `admin@axiom.demo`      | System Administrator            | Accounts, organizations, fictional policies     |
| `operator@axiom.demo`   | Producer / Operator             | Aurora Basin production and cargos              |
| `operator2@axiom.demo`  | Producer / Operator             | Meridian Fields production and cargos           |
| `inspector@axiom.demo`  | Inspector                       | Independent Q&Q and document review             |
| `compliance@axiom.demo` | Compliance Officer              | Counterparties, contracts, POP/POF, guarantees  |
| `regulator@axiom.demo`  | Regulator / Authorizing Officer | Licenses, origin, final approval and revocation |
| `treasury@axiom.demo`   | Treasury Officer                | Documentary deposits and fiscal assessments     |
| `auditor@axiom.demo`    | Auditor                         | Read access to the workspace and audit trail    |

If a Render login rejects the configured DEMO_PASSWORD after it was changed, use the explicit [demo password recovery command](docs/deploy-render.md#recover-a-rejected-demonstration-password); normal startup does not overwrite account passwords.

The database starts with 3 producers, 2 trading companies, 2 terminals, 2 independent inspection organizations, a regulator and Treasury; 12 batches/cargos, commercial and inspection records, generated PDF evidence and three scenarios. Automated integration/E2E checks add clearly named test records to the development database and audit trail. Use an isolated database when you want a pristine demo portfolio.

## Complete workflows

1. **Resource Registry:** register an organization, independent verification/license, resource asset, regulator origin authorization and production batch. Every batch receives a unique ResourceID and uses barrels (`bbl`).
2. **Resource Chain:** record custody transfers and allocate available quantities to cargos. PostgreSQL serializable transactions, row locks and constraints protect quantity conservation, including concurrent requests. Corrections are new events; custody history cannot be overwritten.
3. **Cargo Verification:** independent inspectors record Q&Q, measurement, sampling/report references and expiry. Material discrepancy or expired/rejected evidence blocks release. Uploading a file does not independently verify anything.
4. **Trade & Counterparties:** register and verify buyers/owners, submit/review contracts, POP/POF attestations, insurance and guarantees. Provenance distinguishes simulated evidence, manual attestations and self-declared uploads.
5. **Revenue & Treasury:** configure fictional deposit requirements (0.5–2%), royalty, duty and other charges. Decimal arithmetic calculates required deposits and fiscal assessments. Required, declared, documented-paid and outstanding amounts stay separate. Export CSV.
6. **ARRS:** evaluate 13 automatic conditions from underlying records; requirement 14 is independent final human approval. The requester/producer cannot approve itself. Eligible status alone cannot issue a release token. Signed, short-lived tokens have unique IDs and authorization versions; only one unrevoked token per cargo/version is allowed.
7. **Public verification:** QR and verification page return VALID / EXPIRED / REVOKED / INVALID without exposing commercial evidence. Material edits revoke previous tokens and invalidate approvals. Expiry and controlling conditions are checked at verification time, without relying on a scheduler.
8. **Documents:** authenticated PDF/PNG/JPEG uploads (up to 5 MB), protected downloads and independent reviews. Generate a multi-page, DEMO-watermarked EVP including origin, custody, Q&Q, trade, financial conditions, checklist, approvals, document index, token/QR and audit references.
9. **Administration:** create/disable users, manage organization records and demonstration policies, inspect append-only audit history. PostgreSQL also rejects UPDATE/DELETE of audit and custody events.
10. **ValveLab:** ResourceOS-authenticated simulator at `/valve-lab`, using actual test-cargo ARRS records and independent approval. Registration/position are process-local; journal survives restart. Every OPEN attempt consumes approval. No physical actuation is implemented. See [hardware integration requirements](docs/hardware-integration.md).

## Demonstration scenarios

- **A — authorized:** seeded cargo ending `0001` starts eligible, independently approved and released. Its short-lived token can expire; a regulator can record a new approval and issue a fresh token. QR verification and EVP use the same current database records.
- **B — blocked:** cargo ending `0002` lacks accepted Q&Q and has rejected POF. ARRS exposes the exact blockers and refuses release.
- **C — invalidated:** cargo ending `0003` previously received a token, then its POF evidence was rejected. That token verifies as REVOKED and a fresh review/approval is required.

## Validation

Start the application before HTTP/browser tests:

```sh
npm test
npm run test:integration
npm run typecheck
npm run build
npm start
# In a second terminal:
node --env-file=.env scripts/smoke.mjs
npm run test:e2e
```

Vitest covers ValveLab authorization, interlocks, network failures, expiration, replay, feedback and decimal calculations. PostgreSQL integration checks cover actual mutations, isolation, conservation under concurrency, all A/B/C outcomes, protected evidence, PDF generation and database audit constraints. Playwright exercises login, all ten modules, responsive layout, UI batch creation and the multi-account A/B/C journey, including ValveLab. It uses `/usr/bin/chromium` if available; otherwise install Chromium with `npx playwright install chromium` on a network that permits the official browser distribution.

## Architecture

Next.js App Router / React / TypeScript; Tailwind and a shadcn-style Radix button primitive; Recharts; PostgreSQL; Prisma 6 with the JavaScript query compiler and PostgreSQL driver adapter; Zod; Decimal.js; bcrypt; opaque server-side sessions; pdf-lib; QRCode; Vitest and Playwright.

- `prisma/schema.prisma`: normalized identity, custody, cargo, compliance, finance, authorization and audit entities.
- `src/server/auth.ts`: password validation, expiring sessions, role and tenant/producer scope.
- `src/server/resourceos.ts`: validated transactional domain operations, authorization invalidation and signing.
- `src/server/arrs.ts`: deterministic evidence-based eligibility and decimal finance.
- `src/server/storage.ts`, `documents.ts`: evidence storage adapter and dossiers.
- `src/server/valve-lab.ts`, `valve-resourceos.ts`: isolated simulator and ResourceOS integration.
- `src/components/resourceos.tsx`: operational interface; `src/lib/i18n.ts` provides the initial English message catalog structure.
- `docs/api.md`: API operations and authorization.

The SQL migration files were generated from the Prisma schema, then extended with constraints/triggers. `npm run db:migrate` uses a small PostgreSQL runner with migration checksums, transactional application and an advisory lock. It deliberately avoids a Prisma 6 WASM migration-engine incompatibility with PostgreSQL system-catalog `name` types. Use this runner consistently; do not mix its migration ledger with `prisma migrate deploy`. To add a migration, generate/review SQL into a new migration directory; never edit a previously applied file.

## Persistence and cloud restart

PostgreSQL data persists in the Docker volume; evidence lives in `.data/documents`. Both need backups. `bash scripts/backup.sh` writes an ignored, private SQL snapshot for this demo. Before publishing a cloud snapshot, refresh that backup so the database contents can travel with the workspace files. `bash scripts/cloud-start.sh` starts the database, restores the snapshot only when the database has no ResourceOS schema, verifies migrations, preserves existing seed data and starts development mode. It never overwrites a populated database. Existing checkouts are already isolated; no Git worktree is needed.

## Limits before production

This is a working local demonstration, not a sovereign/industrial deployment certification. Institutional trust and verification are manual/fictional, and there are no live government, banking, customs or Treasury integrations. The initial workspace uses a single membership per account and shared demo credentials; deploy distinct identities, institutional onboarding, MFA, recovery, password lifecycle and durable rate limiting before production. The login limiter is process-local. Use TLS, restricted database accounts, encrypted backups, audit export/retention, upload malware scanning, server request-size limits and managed secret/key rotation. The application database owner can alter triggers; the append-only log is not cryptographically tamper-proof. External adapter expansion points are documented in `docs/architecture.md`.

Valves remain simulator-only. Independent physical emergency stop, device identity, persistent controller replay prevention, fail-safe driver hardware, local interlocks and independent position sensing require the separate hardware work described in the hardware document.
