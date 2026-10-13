# Phase 0 Research: Candidate Platform API Rewrite (v1)

**Date**: 2026-10-13 · **Spec**: [spec.md](spec.md) · No `NEEDS CLARIFICATION` remained in the Technical Context; this document records each technical decision, why, and what was rejected. Library versions were read from the npm registry on 2026-10-13 and are **starting points to be pinned in `package.json` at install time**, not guarantees.

## Existing-code findings that shape the design

| Finding (branch `backend` @ `105a7b9`) | Consequence |
|---|---|
| `verifyPaymentLink` / `verifyRazorpayPayment` set `candidate.status = "failed"` on any bad signature, and take `candidateId` from the request body | Anyone who knows an id can block a candidate → FR-055; ownership comes from the session, not the body |
| `GET /api/candidates/:id` is unauthenticated and returns name, email, phone, address | IDOR/PII leak → `GET /candidates/me` only |
| `finalizeSuccessfulPayment` already uses an atomic `findOneAndUpdate({status:{$ne:"paid"}})` claim to resolve the verify-vs-webhook race | Keep the pattern (R-09); this is the "functionality to maintain" |
| Exam link emailed is a one-time magic link to the frontend, stored as SHA-256 with TTL (168 h) | Retired by the LLD flow (see spec Assumptions); the hashing idiom is reused for refresh/reset tokens |
| `config/db.ts` calls `dns.setServers(["8.8.8.8","1.1.1.1"])` unconditionally at import | Global side effect → opt-in `MONGODB_DNS_SERVERS` |
| Two Brevo SDKs installed (`@getbrevo/brevo`, `sib-api-v3-sdk`); only the first is used; `createEmailCampaign` unused | Drop `sib-api-v3-sdk`, drop campaigns |
| `express.urlencoded` mounted but no route uses form bodies; `cors({credentials:true})` with `*` allowed | Remove; credentials off (tokens travel in headers) |
| `POST /api/email/send` lets an admin key holder send arbitrary HTML to arbitrary recipients | Retired; all mail is system-generated from templates |
| No tests, no ESLint, no Docker, `dist/` checked out locally (ignored by git) | Added by this feature |
| README has broken code fences and lists a subset of routes | Rewritten |

## Decisions

### R-01 Language, runtime, module format
- **Decision**: TypeScript 5.9 (`strict`), Node.js ≥ 22.12 (`engines`), CommonJS output as today, `tsx` for dev/scripts.
- **Rationale**: Matches the current toolchain; Vitest 5 needs Node ^22.12 / ≥24; Mongoose 9 needs ≥ 20.19.
- **Rejected**: TypeScript 7 (registry shows 7.0.2) — major upgrade with no feature need, separate chore; ESM migration — churn without benefit.

### R-02 Architecture
- **Decision**: Modular monolith following `LLD §2` (`modules/*`, `middleware`, `jobs`, `shared`, `config`), two entry points (`server.ts` API, `jobs/worker.ts`) from one build.
- **Rationale**: Constitution VII; the HLD asks for separately deployable API and worker sharing code/config.
- **Rejected**: Microservices (no scale need); in-process scheduler (violates Principle III).

### R-03 Validation and OpenAPI
- **Decision**: Zod 4 schemas per endpoint (`*.schemas.ts`) feed a `validate` middleware and `@asteasolutions/zod-to-openapi` (9.x, peer `zod ^4`) to emit the OpenAPI document; `swagger-ui-express` is kept for `/api-docs`. `swagger-jsdoc` and the JSDoc blocks are removed.
- **Rationale**: One source of truth (Principle II, FR-015); a contract test compares the Express route table with the generated paths.
- **Rejected**: Hand-written YAML (drifts); JSDoc annotations (the current approach — three copies of each schema); Zod 4's native `toJSONSchema` alone (would need our own path assembly).

### R-04 Password hashing
- **Decision**: Argon2id via the `argon2` package, defaults `m=19456 KiB, t=2, p=1` (OWASP minimum profile), configurable; verify unknown accounts against a pre-computed dummy hash to equalise timing; password length 8–128.
- **Rationale**: LLD §9 allows Argon2id or bcrypt; Argon2id is preferred, ships prebuilt binaries for Linux/Windows; the 128 cap limits hashing-DoS.
- **Rejected**: bcrypt (72-byte truncation; acceptable fallback if prebuilds fail in a target environment).

### R-05 Access credentials and sessions
- **Decision**: Access credential = JWT (HS256, `jsonwebtoken`, algorithm pinned, `iss`/`aud` checked) with `sub`, `sid`, `role`, 15-minute life. Each request also loads the session by `sid` and rejects it if revoked/expired, giving immediate revocation (FR-030). Secret `JWT_ACCESS_SECRET` ≥ 32 random bytes, validated at start-up.
- **Rationale**: Familiar to web and mobile; other services (e.g. the exam backend) could verify it later; the per-request session lookup is one indexed read.
- **Rejected**: Opaque access tokens (simpler but not interoperable); stateless-only JWT (cannot revoke before expiry, violates FR-030).

### R-06 Refresh credentials
- **Decision**: 256-bit random, base64url, SHA-256 stored on the session row with `previousRefreshHash` and `rotatedAt`; rotation on every use; presenting the previous value revokes the session (reuse detection). Reset tokens use the same generator and storage idiom.
- **Rationale**: High-entropy secrets need only a fast hash; matches the existing `examAccessTokenService` idiom.

### R-07 OTP
- **Decision**: 6-digit code from `crypto.randomInt`; stored as `HMAC-SHA256(OTP_PEPPER, challengeId + ":" + code)` (a plain hash of a 6-digit code is reversible by brute force); 5-minute expiry, 5 attempts, single-use via conditional update (`consumedAt: null`); decoy challenge returned for unknown/disabled numbers; resend cooldown 60 s; limits 5/hour/number and 20/hour/IP.
- **Rationale**: FR-028/FR-029 and HLD §9 (no enumeration, expiry, rate limits).
- **Rejected**: Plain SHA-256 of the code; returning 404 for unknown numbers.

### R-08 Identity normalisation
- **Decision**: Email `trim → NFKC → toLowerCase` (no plus-address or dot stripping, to avoid wrongly merging distinct people); phone via `libphonenumber-js` `parsePhoneNumberFromString(input, DEFAULT_PHONE_REGION)` requiring `isValid()`, stored E.164; unique indexes on `emailNormalized` and `phoneE164`.
- **Rationale**: Existing UI collects 10-digit Indian numbers; E.164 is required by LLD §3.

### R-09 Atomic state guards instead of multi-document transactions
- **Decision**: Every transition is `findOneAndUpdate({ _id, state: { $in: allowedFrom } }, { $set: … })`; the first successful claim is the linearisation point. Multi-step effects after a claim (candidate step, exam attempt, notification) are idempotent upserts keyed by unique indexes, and the claimed row carries `effectsAppliedAt: null` until finished so the reconciler can resume after a crash.
- **Rationale**: Works on a standalone MongoDB (dev Compose) and generalises the existing, proven `finalizeSuccessfulPayment` pattern; avoids requiring a replica set.
- **Rejected**: Transactions (need a replica set; still need idempotency for retries).

### R-10 Outbox + reconciler for database ↔ queue consistency
- **Decision**: Work is first recorded as a database row (`notifications`, `taFollowUps`, `results`, `examAttempts` with `scheduledAt`/`dueAt` and `queuedAt`); the enqueue happens after the write. The reconciler (worker start + every 5 min) selects due-or-soon rows lacking a live job and enqueues them with the same deterministic job ID, which the queue de-duplicates.
- **Rationale**: Satisfies FR-110/FR-111 and LLD §7 ("persisted in the queue and/or represented in MongoDB").

### R-11 Queue
- **Decision**: BullMQ (6.x) on Redis (ioredis via BullMQ); delayed jobs; one queue per concern (`notifications`, `followups`, `results`, `exams`); deterministic job IDs built from the business key with `:` replaced by `_` (BullMQ restricts `:` in custom IDs — **verify in the first queue test**); `attempts` + exponential `backoff`; `removeOnComplete` (1 000 / 7 d), `removeOnFail` (5 000 / 30 d); worker concurrency 5.
- **Rationale**: Named in HLD §6 and LLD §7.
- **Rejected**: `agenda`/Mongo-based schedulers (would remove Redis but contradict the documented design); `node-cron` (not durable per job).

### R-12 Razorpay
- **Decision**: Orders + Checkout (`razorpay` SDK 2.9.8, already a dependency). Order: payment document first (`created`), then `orders.create({ amount, currency, receipt: "rcpt_" + paymentId, notes: { paymentId, candidateId } })`, then store `providerOrderId` (partial unique index so orphan rows without an id are harmless and swept). Verify: HMAC-SHA256(`order_id|payment_id`, key secret), constant-time compare, then `payments.fetch` to confirm `captured`, order, amount, currency. Webhook: HMAC-SHA256(raw body, webhook secret) in `x-razorpay-signature`; dedupe on `x-razorpay-event-id`; handle `payment.authorized|captured|failed`, `order.paid`, `refund.processed|created`. Operational prerequisite: **auto-capture enabled** on the Razorpay account.
- **Rationale**: LLD §5.3/§8; reuses today's signature code (manual HMAC + `timingSafeEqual`).
- **Rejected**: Keeping hosted Payment Links (LLD specifies Checkout; the callback relied on browser-supplied parameters); trusting the checkout response alone.

### R-13 Exam provider port
- **Decision**: `ExamProvider` port with `createAttempt({candidate}) → { externalAttemptId, examUrl }` and `fetchAttemptStatus(externalAttemptId)`. Adapters: `hvk-exam` (HTTP, header `x-internal-api-key`, request/response as in the current `examAccessService`, extended to return an attempt id) and `stub` (dev/test only). Inbound callback signed with HMAC-SHA256 over `timestamp + "." + rawBody`; ±5 min tolerance; `X-Exam-Event-Id` replay store. Full contract: [contracts/exam-provider.md](contracts/exam-provider.md).
- **Rationale**: HLD §3/§11 mark this TBD; a port isolates the decision (Constitution VII). The legacy "placeholder URL" fallback is **not** carried over for production (never hand a paying candidate a fake link); `stub` is refused in production by FR-016.

### R-14 Email
- **Decision**: `EmailProvider` port; Brevo adapter on `@getbrevo/brevo` (`BrevoClient.transactionalEmails.sendTransacEmail`, as today). The current `renderTemplate` (`{{key}}`, `{{#if key}}`, HTML-escaping) moves to `notifications/template.renderer.ts` with tests and the template lookup simplified to one directory (the four-path search is removed). New templates: `exam-link` (receipt + link; evolves `acknowledgement`), `ta-registration-alert`, `ta-payment-followup`, `result`, `password-reset`.
- **Rejected**: Switching providers (no requirement); storing rendered bodies (reset links are secrets).

### R-15 Logging
- **Decision**: `pino` 10 + `pino-http` 11, JSON in production / pretty in dev, redact `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.newPassword`, `*.otp`, `*.refreshToken`, `*.accessToken`, `*.resetToken`, `*.razorpay_signature`, `*.signature`; request ID shared with FR-006. Replaces `morgan` and `console.*`.

### R-16 Rate limiting
- **Decision**: `express-rate-limit` 8.7 with `rate-limit-redis` 6 when `REDIS_URL` is set, memory store otherwise (tests); keys: IP for global/register, IP+normalised identifier for login/OTP/forgot, candidate id for payments; `trust proxy` driven by `TRUST_PROXY_HOPS` (default 0). Defaults in [plan.md](plan.md#default-operational-limits).

### R-17 Webhook and callback body handling
- **Decision**: The two signed routes (`/payments/webhook`, `/exams/provider-callback`) are mounted **before** the global JSON parser with `express.raw({ type: "application/json", limit: "1mb" })`; the signature is verified on the Buffer and only then `JSON.parse`d. The legacy `express.json({ verify })` raw-capture for every route is removed.
- **Rationale**: LLD §9 "verify against raw bytes before JSON mutation".

### R-18 CORS and headers
- **Decision**: `helmet()` defaults; CORS allow-list from `CORS_ORIGINS`, `credentials: false` (tokens in `Authorization`), wildcard refused in production; `Cache-Control: no-store` on `/auth/*`, `/payments/*`, `/candidates/me`.

### R-19 Test stack
- **Decision**: Vitest 5 (projects: `unit`, `integration`, `contract`, `e2e`, `security`, `queue`), Supertest 7 against `createApp()`, `mongodb-memory-server` 11 for MongoDB (downloads a MongoDB binary on first run; cacheable in CI), fakes for Razorpay/email/exam/OTP at their ports, an injectable `Clock`. The `queue` project uses a real Redis from Compose (`TEST_REDIS_URL`) to exercise BullMQ semantics (delay, retry, dedupe, restart); all other projects need no network.
- **Rationale**: FR-133 (offline, deterministic) and the LLD §11 level list.
- **Rejected**: `ioredis-mock` (BullMQ relies on Lua scripts it cannot emulate); Jest (extra transform config for TS).

### R-20 Static analysis
- **Decision**: ESLint (flat config) + `typescript-eslint`, Prettier (double quotes, semicolons, width 100 — matches existing code). Confirm peer-dependency compatibility between the installed ESLint and typescript-eslint majors at install time.

### R-21 Containers
- **Decision**: Multi-stage `Dockerfile` (`deps` → `build` → `runtime`) on a pinned `node:22-bookworm-slim`, `USER node`, `npm ci --omit=dev`, `HEALTHCHECK` on `/health/live`; `docker-compose.yml` with `api`, `worker`, `mongo`, `redis`; named volumes `mongo-data`, `redis-data`; host ports `127.0.0.1:5000`, `127.0.0.1:27017`, `127.0.0.1:6379`; service-name DNS (`mongodb://mongo:27017/hvk`); `.dockerignore` excludes `.env*`, `node_modules`, `dist`, `.git`, `specs`. A `tools` profile adds the test Redis. Pin image digests when implementing.
- **Rationale**: LLD §10.

### R-22 Configuration
- **Decision**: Single `config/env.ts` using a Zod schema, parsed once, typed export; `process.loadEnvFile()` kept for local runs when `.env` exists; production guard (FR-016) implemented as a `superRefine`.

### R-23 Time
- **Decision**: `shared/time.ts` exports a `Clock` (`now(): Date`) injected into services; `SystemClock` in production, `FakeClock` in tests. Delays are computed as `dueAt − clock.now()`.

### R-24 Pagination
- **Decision**: Offset pagination (`page`, `pageSize`) returning `{ items, page, pageSize, total }` in `data` with the same shape in OpenAPI; whitelisted filters/sorts mapped to indexed fields only (no raw operators from the client, preventing NoSQL operator injection).

### R-25 Identifier handling
- **Decision**: Path ids are validated as 24-hex ObjectIds; malformed or foreign ids return 404 `NOT_FOUND` (same as today's `CastError` handling, and avoids existence probing).

### R-26 Legacy data migration
- **Decision**: In-place conversion of the `candidates` collection using the raw driver (`mongoose.connection.collection`), no legacy model. Steps: (1) read legacy docs lacking `schemaVersion`; (2) map `name→fullName`, `email→emailNormalized`, `phone→phoneE164` (normalise; failures → `migrationRejects`), `status` (`paid`→`exam_ready` + payment + attempt; `pending|failed`→`fee_pending`), `createdAt` retained, `registeredAt=createdAt`, `passwordHash=null`, `role=candidate`, `legacy=true`; (3) insert `payments` (from `razorpayOrderId/PaymentId`, amount = configured fee at migration time, `migrated:true`) and `examAttempts` (from `examLink`) idempotently by unique keys; (4) insert TA lead (`legacy_import`, no notification); (5) `--finalize` later `$unset`s legacy fields and drops `email_1`/`phone_1`. Dry-run is the default; report written to `migration-report-<timestamp>.json` (git-ignored).
- **Rationale**: FR-143/FR-144; the new and old documents share the collection name, so a separate collection would diverge from the LLD.

### R-27 Idempotency keys for clients
- **Decision**: Not adopting an `Idempotency-Key` header in v1; operations are naturally idempotent (order reuse, guarded transitions). Revisit if mobile retries show duplicates.

### R-28 Dependency changes (summary)
- **Add**: `argon2`, `jsonwebtoken`, `bullmq`, `pino`, `pino-http`, `express-rate-limit`, `rate-limit-redis`, `libphonenumber-js`, `@asteasolutions/zod-to-openapi`. Dev: `tsx`, `vitest`, `supertest`, `mongodb-memory-server`, `eslint`, `typescript-eslint`, `prettier`, `@types/jsonwebtoken`, `@types/supertest`, `rimraf`.
- **Keep**: `express`, `cors`, `helmet`, `mongoose`, `razorpay`, `@getbrevo/brevo`, `swagger-ui-express`, `zod`, `typescript`.
- **Remove**: `sib-api-v3-sdk`, `morgan`, `swagger-jsdoc`, `ts-node-dev`, `@types/morgan`, `@types/swagger-jsdoc`.
