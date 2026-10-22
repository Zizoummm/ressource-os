# ResourceOS API

JSON responses. Authentication is an opaque HttpOnly, SameSite=Strict session cookie. Mutation requests must include `Origin` matching `APP_URL`. Secure cookies are used for HTTPS. All entity access checks happen server-side; clients cannot set their roles, cargo authorization state or token signatures.

- `POST /api/auth/login`: `{email,password}`; returns cookie, never a password/token in JSON.
- `POST /api/auth/logout`: deletes the session.
- `GET /api/session`: current identity and organization/roles.
- `GET /api/resource/state`: database-backed scoped workspace, evaluations and recent audit events.
- `POST /api/resource/action`: `{action,data}`. Inputs are validated by the named Zod schemas in `src/server/resourceos.ts`.
- `POST /api/resource/upload`: multipart `cargoId`, `reference`, `file`.
- `GET /api/resource/documents/:id`: authenticated, authorized attachment download.
- `GET /api/resource/dossier/:cargoId`: authenticated DEMO PDF with current records and QR.
- `GET /api/resource/fiscal.csv`: scoped fiscal export; spreadsheet-formula characters escaped.
- `GET /api/resource/verify/:token`: minimal public verification result, no commercial data.
- `GET /api/valve-lab`: scoped ResourceOS laboratory simulator state.
- `POST /api/valve-lab`: operator-only `register`, `OPEN`, `CLOSE`, `estop`; independent approval comes from ARRS.

| Action             | Role                      | Main data fields                                                                    |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------- |
| organization       | ADMIN                     | name,type,jurisdiction,registration,beneficialOwners                                |
| organizationVerify | COMPLIANCE, REGULATOR     | id,verified                                                                         |
| license            | REGULATOR                 | organizationId,reference,expiresAt,verified                                         |
| asset              | OPERATOR, ADMIN           | organizationId,name,location                                                        |
| assetVerify        | REGULATOR                 | id,authorized                                                                       |
| batch              | OPERATOR                  | assetId,grade,quantity,storage,productionDate                                       |
| transfer           | OPERATOR                  | batchId,fromLocation,toLocation,quantity,reference                                  |
| cargo              | OPERATOR                  | reference,organizationId,grade,quantity,value,terminal,vessel,shipmentDate,testOnly |
| cargoEdit          | OPERATOR                  | cargoId,terminal,vessel,shipmentDate,reason                                         |
| allocate           | OPERATOR                  | cargoId,batchId,location,quantity                                                   |
| counterparty       | COMPLIANCE                | name,type,jurisdiction,registration,beneficialOwners                                |
| counterpartyVerify | COMPLIANCE                | id,verified                                                                         |
| contract           | OPERATOR                  | cargoId,buyerId,reference,quantity,price,incoterm,paymentTerms                      |
| contractReview     | COMPLIANCE                | cargoId,status,reason                                                               |
| inspection         | INSPECTOR                 | cargoId,measuredQuantity,quality,samplingReference,reportReference,status,expiresAt |
| decision           | COMPLIANCE                | cargoId,kind (POP/POF),status,evidenceReference,reason,expiresAt,provenance         |
| insurance          | COMPLIANCE                | cargoId,reference,insurer,coverage,expiresAt,status                                 |
| guarantee          | COMPLIANCE                | cargoId,reference,institution,amount,expiresAt,status                               |
| deposit            | TREASURY                  | cargoId,declared,confirmed,evidenceReference                                        |
| fiscal             | TREASURY                  | cargoId,documentedPaid,evidenceReference                                            |
| evaluate           | scoped authenticated user | cargoId                                                                             |
| approve            | REGULATOR                 | cargoId,reason                                                                      |
| release            | OPERATOR, REGULATOR       | cargoId                                                                             |
| revoke             | REGULATOR                 | cargoId,reason                                                                      |
| documentReview     | COMPLIANCE, INSPECTOR     | documentId,status,reason                                                            |
| policy             | ADMIN                     | depositRate,royaltyRate,dutyRate,otherRate,discrepancyRate,tokenMinutes             |
| user               | ADMIN                     | name,email,password,organizationId,role                                             |
| userActive         | ADMIN                     | id,active                                                                           |

Quantities and financial values are decimal strings, dates are ISO-8601 timestamps with timezone, booleans are JSON booleans. Monetary storage rounds to two decimals. Typical errors: 400 invalid input/business precondition; 401 no session; 403 role/origin violation; 404 inaccessible entity; 409 duplicate or concurrent change. Retry a conflict after refreshing state; never automatically repeat an ambiguous physical command.

Example release:

```json
{ "action": "release", "data": { "cargoId": "existing-scoped-cargo-id" } }
```

The server recomputes eligibility and current independent approval, checks active tokens, signs a short-lived version-bound token and records issuance atomically. No endpoint accepts `status: RELEASED` as a shortcut.
