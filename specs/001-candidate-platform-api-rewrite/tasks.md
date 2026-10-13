---

description: "Task list for the Candidate Platform API rewrite (v1)"
---

# Tasks: Candidate Platform API Rewrite (v1)

**Input**: Design documents from `/specs/001-candidate-platform-api-rewrite/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED and written first. The spec requires them (FR-130–FR-135) and Constitution Principle V makes test-first non-negotiable: in every story phase, the test tasks come first and MUST be seen failing before the implementation tasks start.

**Organization**: Phases follow the user stories in [spec.md](spec.md) so each story can be implemented, tested and demonstrated on its own. Paths are relative to `E:\hvk\backend` (repository root of the `backend` branch).

## Format: `- [ ] T### [P?] [US#?] Description with file path (FR refs)`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[US#]**: user-story label (story phases only)
- FR/SC references point at [spec.md](spec.md); model tasks quote the constraints from [data-model.md](data-model.md) so they are not left to implementation-time discretion

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: baseline tag, tooling, containers, and removal of the superseded code.

- [ ] T001 Verify `git rev-parse HEAD` is `105a7b9…` and tag it: `git tag legacy-backend-baseline 105a7b9` so every removed file stays retrievable (FR-140)
- [ ] T002 Rewrite `package.json`: `"engines": { "node": ">=22.12" }`; scripts `dev` (`tsx watch src/server.ts`), `dev:worker`, `build` (`rimraf dist && tsc -p tsconfig.build.json && node -e "require('fs').cpSync('src/modules/notifications/templates','dist/modules/notifications/templates',{recursive:true})"`), `start`, `start:worker`, `typecheck`, `lint`, `format`, `test`, `test:unit`, `test:integration`, `test:contract`, `test:e2e`, `test:security`, `test:queue`, `test:coverage`, `audit` (`npm audit --audit-level=high`), `verify`, `migrate:legacy`, `seed:staff`, `seed:legacy-fixture`, `jobs:requeue`, `dev:send-exam-callback`; REMOVE `sib-api-v3-sdk`, `morgan`, `swagger-jsdoc`, `ts-node-dev`, `@types/morgan`, `@types/swagger-jsdoc`; ADD the dependencies listed in research R-28; run `npm install` and commit the lockfile (FR-126, FR-135, FR-141)
- [ ] T003 [P] Create `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, includes `src`, `tests`, `scripts`) and `tsconfig.build.json` (emits `src` only to `dist`, `sourceMap`, CommonJS) replacing the current `tsconfig.json`
- [ ] T004 [P] Add `eslint.config.mjs` (flat config, `typescript-eslint` recommended-type-checked, `no-console` in `src`, restricted cross-module imports) and `.prettierrc.json` (double quotes, semicolons, width 100); verify the installed ESLint/typescript-eslint majors are peer-compatible (research R-20)
- [ ] T005 [P] Add `vitest.config.ts` with projects `unit`, `integration`, `contract`, `e2e`, `security`, `queue` (queue project reads `TEST_REDIS_URL`), global setup that starts `mongodb-memory-server`, coverage thresholds placeholder (finalised in T161)
- [ ] T006 [P] Update `.gitignore`: add `coverage/`, `migration-report-*.json`, `.env.*` (except `.env.example`), `.claude/settings.local.json` (SpecKit's init warns agent folders may hold credentials; the committed `.claude/skills/` stay), keep `dist/`, `node_modules/`
- [ ] T007 [P] Create `.dockerignore` (excludes `.env*`, `node_modules`, `dist`, `.git`, `specs`, `tests`) and multi-stage `Dockerfile` (`deps` → `build` → `runtime` on pinned `node:22-bookworm-slim`, `USER node`, `npm ci --omit=dev`, `HEALTHCHECK` on `/health/live`) (FR-123, R-21)
- [ ] T008 Create `docker-compose.yml`: services `api`, `worker`, `mongo` (named volume `mongo-data`, healthcheck), `redis` (named volume `redis-data`, `requirepass`, healthcheck); host ports `127.0.0.1:5000`, `127.0.0.1:27017`, `127.0.0.1:6379`; API uses `mongodb://mongo:27017/hvk` and `redis://…@redis:6379`, binds `0.0.0.0` in-container (FR-120, FR-121)
- [ ] T009 [P] Rewrite `.env.example` with every variable from plan.md "Configuration" (placeholders only, comments for prod rules) (FR-122, FR-146)
- [ ] T010 Move the reusable email template: `git mv src/templates/emails/acknowledgement.html src/modules/notifications/templates/exam-link.html`; review `notification.html` (keep only if reused by a new template); the `exam-access-reset.html` template is deleted with the legacy code (R-14)
- [ ] T011 Delete the superseded legacy source listed in [contracts/legacy-mapping.md §3](contracts/legacy-mapping.md) (controllers, routes, `models/Candidate.ts`, `middleware/adminAuth.ts`, old services/validators, `docs/swagger.ts`, `config/razorpay.ts`) and the stale untracked `dist/` directory (FR-141)
- [ ] T012 Create the folder skeleton from plan.md "Source Code" (`src/config`, `src/modules/*`, `src/middleware`, `src/jobs`, `src/docs`, `src/shared`, `tests/*`, `scripts/lib`) with minimal `src/app.ts` and `src/server.ts` so `npm run typecheck` and `npm run build` pass (depends on T011)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: everything every story needs — config, logging, errors/envelope, request pipeline, health, ports, notification core, queue skeleton, candidate model, test harness.

**⚠️ CRITICAL**: no user-story work begins until this phase is complete.

### Tests first

- [ ] T013 [P] Unit test `tests/unit/config/env.test.ts`: defaults, required vars, `JWT_ACCESS_SECRET` ≥ 32 bytes, production refuses wildcard CORS / `EXAM_PROVIDER=stub` / `OTP_SENDER=log` / `EMAIL_PROVIDER=log` / missing webhook secret (FR-016)
- [ ] T014 [P] Unit test `tests/unit/shared/errors.test.ts`: `AppError` → HTTP status + code for every row of the error catalogue; envelope shapes success/error (FR-003, FR-004, FR-005)
- [ ] T015 [P] Unit test `tests/unit/middleware/error.middleware.test.ts`: maps Zod → `VALIDATION_ERROR` with per-field `details`, Mongo 11000 → `CONFLICT`, Mongoose `CastError` → `NOT_FOUND`, malformed JSON → `MALFORMED_JSON`, 415, 413, unknown error → generic 500 with no stack/driver text (FR-007, FR-009, FR-018)
- [ ] T016 [P] Unit test `tests/unit/middleware/request-context.test.ts`: reuse valid `X-Request-Id` (`[A-Za-z0-9._-]{8,64}`), regenerate invalid, echoed in header and `meta.requestId` (FR-006)
- [ ] T017 [P] Unit test `tests/unit/shared/crypto.test.ts`: SHA-256 token hashing, HMAC helpers, `timingSafeEqual` wrapper handles unequal lengths, random token length/alphabet, OTP HMAC with pepper (research R-06/R-07)
- [ ] T018 [P] Unit test `tests/unit/shared/time-pagination.test.ts`: `FakeClock` advance, delay computation `max(0, dueAt − now)`, pagination parser defaults/caps/whitelisted sort (FR-096, FR-116)
- [ ] T019 [P] Unit test `tests/unit/notifications/template.renderer.test.ts`: `{{key}}` substitution, `{{#if key}}` truthiness, HTML escaping of `& < > " '`, missing template error, `year` default (legacy parity P-16); plus `tests/unit/notifications/brevo.provider.test.ts` with a fake SDK: sender override, recipient normalisation, transient (429/5xx/timeout) vs permanent (4xx) error classification (legacy parity P-15)
- [ ] T020 [P] Integration test `tests/integration/health.test.ts`: `/health` and `/health/live` 200; `/health/ready` 200 with database up, 503 `NOT_READY` when the database check fails, queue check only when `WORKER_ENABLED` (FR-011)
- [ ] T021 Create the test harness `tests/support/harness.ts` (builds `createApp` from `container` with in-memory MongoDB, `FakeClock`, in-memory rate-limit store), `tests/support/fake-clock.ts`, fakes in `tests/support/fakes/{payment-provider,email-provider,exam-provider,otp-sender,ta-delivery}.ts` (record calls; `failNext('transient'|'permanent')`), and `tests/support/factories.ts` (candidate, staff, payment, attempt builders) (FR-133)

### Implementation

- [ ] T022 [P] Implement `src/shared/errors.ts` (`AppError`, subclasses, code→status map from the catalogue), `src/shared/envelope.ts` (`ok()`, `fail()`), `src/shared/ids.ts` (ObjectId validation → `NOT_FOUND`) (FR-003–FR-005, FR-010)
- [ ] T023 [P] Implement `src/shared/logger.ts` (`pino` + `pino-http`, JSON in prod, redact paths: `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.newPassword`, `*.otp`, `*.refreshToken`, `*.accessToken`, `*.resetToken`, `*.token`, `*.razorpay_signature`, `*.signature`, `req.headers["x-razorpay-signature"]`, `req.headers["x-exam-signature"]`) (FR-014)
- [ ] T024 [P] Implement `src/shared/time.ts` (`Clock`, `SystemClock`, `delayUntil(dueAt, clock)`) (FR-116)
- [ ] T025 [P] Implement `src/shared/crypto.ts` (`sha256`, `hmacSha256`, `safeEqual`, `randomToken(bytes)`, `otpDigest(pepper, challengeId, code)`) and `src/shared/pagination.ts`, `src/shared/types.ts` (R-06, R-07, R-24)
- [ ] T026 Implement `src/config/env.ts`: single Zod schema, typed export, production `superRefine` guards, `process.loadEnvFile()` when `.env` exists (FR-016, R-22)
- [ ] T027 [P] Implement `src/config/database.ts` (Mongoose connect with `serverSelectionTimeoutMS` 5000 / `maxPoolSize` 20, `ping()`, `close()`, opt-in `MONGODB_DNS_SERVERS` replacing the legacy unconditional DNS override) and `src/config/redis.ts` (shared ioredis options, `ping()`, `close()`) (FR-011, FR-017)
- [ ] T028 Implement `src/middleware/request-context.middleware.ts` (id, child logger on `req`/`res.locals`) (FR-006)
- [ ] T029 Implement `src/middleware/validate.middleware.ts` (`validate({ body, params, query })` with strict Zod objects, trimmed strings, unknown keys rejected, error `details[]`) (FR-007)
- [ ] T030 Implement `src/middleware/error.middleware.ts` and `src/middleware/not-found.middleware.ts` per T015 (FR-009, FR-018)
- [ ] T031 Implement `src/middleware/rate-limit.middleware.ts`: factory `limiter(class)` for the classes in [rest-api-v1](contracts/rest-api-v1.md#rate-limit-classes-defaults-env-configurable), Redis store when `REDIS_URL` set else memory, `trust proxy` from `TRUST_PROXY_HOPS`, 429 `RATE_LIMITED` + `Retry-After` (FR-013)
- [ ] T032 Implement `src/docs/openapi.ts`: `@asteasolutions/zod-to-openapi` registry, `registerRoute()` helper used by every module, builder for OpenAPI 3.1, `/api-docs` (swagger-ui-express) and `/api-docs.json` mounting (FR-015, R-03)
- [ ] T033 Implement the candidate model in `src/modules/candidates/candidate.model.ts` with constraints verbatim from data-model: `fullName` trimmed 2–100; `emailNormalized` required **unique**; `phoneE164` required **unique**; `passwordHash` string|null; `role` enum `candidate|ta|admin` default `candidate`; `status` enum `active|disabled`; `onboardingStep` enum (8 values); `pincode` `/^\d{6}$/`; `source` enum; `schemaVersion: 2`; indexes `{status,createdAt:-1}`, `{role}`, `{onboardingStep,createdAt:-1}`, `{fullNameNormalized}`; plus `candidate.repository.ts` (incl. conditional `advanceStep(id, fromSteps[], to)`) and `candidate.dto.ts` (FR-008, FR-036)
- [ ] T034 [P] Implement `src/modules/audit/audit.model.ts` (append-only; indexes `{entityType,entityId,at:-1}`, `{actorId,at:-1}`) and `audit.service.ts` (`record()` with allow-listed `changes`) (FR-101)
- [ ] T035 [P] Define the ports: `src/modules/payments/payment-provider.port.ts`, `src/modules/exams/exam-provider.adapter.ts`, `src/modules/notifications/email.provider.ts`, `src/modules/auth/otp-sender.port.ts`, `src/modules/talent-acquisition/ta-delivery.adapter.ts` with the typed errors `ProviderUnavailableError` / `ProviderRejectedError` (Constitution VII)
- [ ] T036 Implement notification core: `src/modules/notifications/notification.model.ts` (`idempotencyKey` **unique**; status enum; `attempts`/`maxAttempts` 5; index `{status,scheduledAt}`), `template.renderer.ts` (ported from legacy `renderTemplate`, single templates directory), `providers/brevo.provider.ts` (`@getbrevo/brevo` `transactionalEmails.sendTransacEmail`, sender override, 10 s timeout, error classification transient/permanent), `providers/log.provider.ts` (dev only), `notification.service.ts` (`create()` idempotent upsert by key) (FR-092, R-14)
- [ ] T037 Implement queue skeleton: `src/jobs/queue.ts` (queues `notifications|followups|results|exams|maintenance`, `enqueue(name, businessKey, payload, delay)` with `:`→`_` ids and default options from [background-jobs](contracts/background-jobs.md)), `src/jobs/worker.ts` (process shell, graceful shutdown), `src/jobs/reconciler.ts` (empty step registry); job names are the FR-115 catalogue constants `candidate-registration-ta-notify`, `unpaid-payment-follow-up`, `exam-result-email`, `notification-retry`, `exam-link-issue` (FR-110, FR-112, FR-114, FR-115)
- [ ] T038 Implement `src/container.ts` (builds real adapters/services/Mongoose connection/queues) and `src/app.ts` (`createApp(deps)` with the request pipeline order from plan.md, `/health*`, `/api-docs*`, 404/error handlers) (FR-001, FR-002, FR-012)
- [ ] T039 Implement `src/server.ts`: validate env, connect DB (+Redis when enabled), start HTTP server with timeouts, handle `SIGTERM`/`SIGINT` by draining and closing connections (FR-017)
- [ ] T040 Checkpoint: run `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`, then `docker compose up -d --build` and confirm `/health/ready` per quickstart §1, including that data survives `docker compose down && up` and the one-command start completes in under 10 minutes on a clean machine (SC-009)

**Checkpoint**: foundation ready — user stories can start.

---

## Phase 3: User Story 1 - Candidate registers and signs in (Priority: P1) 🎯 MVP

**Goal**: registration with TA lead + queued alert + scheduled follow-up, password and OTP login, sessions, password reset, profile.

**Independent Test**: register → login → `GET /candidates/me` → logout; exactly one candidate, one lead, one queued notification, one scheduled follow-up per registration ([quickstart §3](quickstart.md)).

### Tests for User Story 1 (write first, must fail) ⚠️

- [ ] T041 [P] [US1] Unit `tests/unit/candidates/identity.test.ts`: email trim → NFKC → lowercase (no plus/dot stripping); phone `9876543210`, `09876543210`, `+91 98765 43210` all → `+919876543210`; invalid/short/too-long rejected; look-alike Unicode collisions (FR-021)
- [ ] T042 [P] [US1] Unit `tests/unit/auth/password.service.test.ts`: hash ≠ plaintext, verify true/false, 8–128 length policy, not equal to email/phone/name, dummy-hash path for unknown users (FR-023, FR-027)
- [ ] T043 [P] [US1] Unit `tests/unit/auth/otp.service.test.ts`: 6-digit code, digest uses pepper (not plain hash), 5 attempts then locked, single use, expiry via `FakeClock`, decoy challenge behaves identically (FR-028, FR-029)
- [ ] T044 [P] [US1] Unit `tests/unit/auth/session.service.test.ts`: JWT claims (`sub`,`sid`,`role`,`iss`,`aud`), alg pinned HS256, refresh rotation, previous-token reuse revokes session, revoked/expired session rejected immediately (FR-030, FR-031)
- [ ] T045 [P] [US1] Contract `tests/contract/auth.contract.test.ts`: request/response schemas of operations #3–#12 match the generated OpenAPI (FR-015)
- [ ] T046 [P] [US1] Integration `tests/integration/auth/register.test.ts`: 201 with DTO + `nextStep: demo_pending` and **no tokens**; one candidate/lead(`new`)/notification(`queued`, key `ta-registration:{id}`)/follow-up(`scheduled`, key `unpaid-24h:{id}`); duplicate email-case / phone-format variants → 409 `CONFLICT` with non-specific message; 20 parallel identical registrations → exactly one 201; invalid input → 400 with `details`; `acceptTerms:false` → 400; registration still 201 when queue/TA channel fails (FR-020–FR-026, SC edge cases)
- [ ] T047 [P] [US1] Integration `tests/integration/auth/login.test.ts`: login by email and by phone; unknown/wrong/disabled/no-hash accounts all return identical 401 `INVALID_CREDENTIALS`; login throttling returns 429 (FR-027, FR-035, FR-013)
- [ ] T048 [P] [US1] Integration `tests/integration/auth/otp.test.ts`: request 202 for registered and unregistered numbers with same shape; verify success; expired; wrong code ×5 locks; replay of consumed code; cooldown 429; `OTP_ENABLED=false` → 404 (FR-028, FR-029)
- [ ] T049 [P] [US1] Integration `tests/integration/auth/session.test.ts`: refresh rotates and old token fails; replay of rotated token revokes the session; logout 204 and repeat 204 (signature-only auth); revoked access token rejected on `/candidates/me` immediately (FR-030–FR-032)
- [ ] T050 [P] [US1] Integration `tests/integration/auth/password-reset.test.ts`: forgot → 202 for known and unknown email; known email enqueues one `password_reset` job whose payload (not DB) holds the token; reset consumes token (second use `INVALID_RESET_TOKEN`), expired token rejected, all sessions revoked (FR-033, FR-034)
- [ ] T051 [P] [US1] Integration `tests/integration/candidates/profile.test.ts`: `GET /candidates/me` own record; `PATCH` allow-list only; `role`, `status`, `onboardingStep`, `email`, `phone`, payment/result fields → 400; staff sees own `role` (FR-040, FR-041)
- [ ] T052 [P] [US1] Security `tests/security/auth-leakage.test.ts`: no `passwordHash`/token hashes/OTP in any response or captured log line; enumeration parity (timing within tolerance) for login/OTP/forgot (FR-008, FR-014, SC-008)

### Implementation for User Story 1

- [ ] T053 [P] [US1] Create `src/modules/auth/session.model.ts` (`refreshTokenHash` **unique**; `previousRefreshHash`; `expiresAt`; `revokedAt`/`revokedReason` enum `logout|password_reset|refresh_reuse|disabled`; `purgeAt` = `expiresAt + 30 d` TTL; index `candidateId`) (data-model `authSessions`)
- [ ] T054 [P] [US1] Create `src/modules/auth/otp.model.ts` (`codeHash`; `attempts` int; `maxAttempts` 5; `consumedAt`; `decoy`; TTL `purgeAt` = `expiresAt + 1 h`; index `{phoneE164,purpose,createdAt:-1}`) and `src/modules/auth/password-reset.model.ts` (`tokenHash` **unique**; `expiresAt` 60 min; `consumedAt`; TTL `purgeAt`) (FR-125)
- [ ] T055 [P] [US1] Create `src/modules/talent-acquisition/lead.model.ts` (unique `{candidateId,type}`; `type` `registration`; `status` enum; `version`; `notes` ≤ 100 × `{at,by,text ≤ 1000}`; indexes per data-model) and `follow-up.model.ts` (`dedupeKey` **unique**; status enum incl. `scheduled`; indexes `{status,dueAt}`) (FR-090, FR-094)
- [ ] T056 [US1] Implement `src/modules/candidates/identity.ts` (`normaliseEmail`, `normalisePhone` with `libphonenumber-js` and `DEFAULT_PHONE_REGION`) (FR-021)
- [ ] T057 [US1] Implement `src/modules/auth/password.service.ts` (Argon2id m=19456 KiB, t=2, p=1 configurable; policy; dummy-hash verification) (FR-023, R-04)
- [ ] T058 [US1] Implement `src/modules/auth/session.service.ts` (issue/refresh/revoke; JWT HS256 with `jsonwebtoken`; session lookup per request) (FR-030, FR-031, R-05, R-06)
- [ ] T059 [US1] Implement `src/modules/auth/otp.service.ts` and `senders/log-otp.sender.ts` (request with decoy, verify with conditional consume, cooldown, 5 attempts) (FR-028, FR-029, R-07)
- [ ] T060 [US1] Implement registration unit-of-work in `src/modules/candidates/candidate.service.ts`: create candidate at `demo_pending` (+ `registeredAt`, `termsAcceptedAt`), `taLeads(registration,new)`, `notifications(ta_registration_alert, queued)`, `taFollowUps(scheduled, dueAt = registeredAt + PAYMENT_FOLLOWUP_DELAY_HOURS)`; map duplicate-key to 409; enqueue `candidate-registration-ta-notify` and `unpaid-payment-follow-up` best-effort after commit (failures logged, left to reconciler) (FR-022, FR-024–FR-026, FR-090, FR-094)
- [ ] T061 [US1] Implement `src/modules/auth/auth.service.ts` (login, OTP login, refresh, logout, forgot, reset; disabled-account gating; `lastLoginAt`; revoke-all on reset) (FR-027–FR-035)
- [ ] T062 [US1] Implement `src/middleware/auth.middleware.ts` (`authenticate`: verify JWT + active session + active account; `authenticateLoose` for logout) and `src/middleware/rbac.middleware.ts` (`authorize(...roles)`); both read `status` and `role` from the database record, never from the token claim, so disabling or demoting an account takes effect on the next request (FR-030, FR-035, FR-100)
- [ ] T063 [US1] Define Zod schemas `src/modules/auth/auth.schemas.ts` and `src/modules/candidates/candidate.schemas.ts` (field rules from [rest-api-v1](contracts/rest-api-v1.md) #3–#12) and register them with `registerRoute()` (FR-007, FR-015, FR-020)
- [ ] T064 [US1] Implement controllers + routes `src/modules/auth/auth.controller.ts`, `auth.routes.ts`, `src/modules/candidates/candidate.controller.ts`, `candidate.routes.ts` with rate-limit classes `register|login|otpRequest|otpVerify|passwordForgot|passwordReset` and `Cache-Control: no-store`; mount under `/api/v1` in `src/app.ts` (FR-001, FR-013, FR-025, FR-040, FR-041)
- [ ] T065 [P] [US1] Create email templates `src/modules/notifications/templates/password-reset.html` and `ta-registration-alert.html` (escaped variables, no secrets beyond the reset link) (FR-033, FR-091)
- [ ] T066 [US1] Implement `PATCH /candidates/me` allow-list (`fullName`, `college`, `place`, `city`, `state`, `pincode`) with `fullNameNormalized` refresh in `candidate.service.ts` (FR-041)

**Checkpoint**: US1 fully functional and testable independently (`npm run test:integration -- auth candidates`).

---

## Phase 4: User Story 2 - Candidate completes or skips the demo and reaches the fee step (Priority: P1)

**Goal**: server-held onboarding progress that reaches `fee_pending`.

**Independent Test**: fresh candidate: status `demo_pending` → `skip` → `fee_pending`; repeat is a no-op; second device sees the same step.

### Tests for User Story 2 (write first) ⚠️

- [ ] T067 [P] [US2] Unit `tests/unit/onboarding/onboarding.state.test.ts`: every legal transition in data-model "Onboarding step" table and every illegal pair (exhaustive matrix) returns the expected result (FR-046, FR-047)
- [ ] T068 [P] [US2] Integration `tests/integration/onboarding/onboarding.test.ts`: status payload and `nextAction` for each step; `demo/complete` and `demo/skip` → `fee_pending` and timestamps; repeat at `fee_pending`+ → 200 `changed:false`; concurrent complete+skip → one change; second-device resume; staff account → 422; `PATCH /candidates/me` cannot change the step (FR-042–FR-046)
- [ ] T069 [P] [US2] Contract `tests/contract/onboarding.contract.test.ts` for operations #13–#15 (FR-015)

### Implementation for User Story 2

- [ ] T070 [US2] Implement `src/modules/onboarding/onboarding.state.ts` (transition table + `canAdvance`) and use it from `candidate.repository.advanceStep` (FR-046)
- [ ] T071 [US2] Implement `src/modules/onboarding/onboarding.service.ts` (status, complete, skip — conditional update on `demo_pending`, idempotent otherwise; payment/exam summaries) (FR-042–FR-045, FR-047)
- [ ] T072 [US2] Implement `onboarding.schemas.ts`, `onboarding.controller.ts`, `onboarding.routes.ts`; register with OpenAPI; mount in `src/app.ts` (FR-001, FR-015)

**Checkpoint**: US1 + US2 work end to end up to the fee step.

---

## Phase 5: User Story 3 - Candidate pays the registration fee and receives exam access (Priority: P1)

**Goal**: server-verified Razorpay payment (verify + webhook), exactly-once effects, exam attempt and link, `GET /exams/current`.

**Independent Test**: fake Razorpay + fake exam provider: create order → signed verify → `GET /exams/current`; concurrent verify + webhook ×100 → one grant, one email.

### Tests for User Story 3 (write first) ⚠️

- [ ] T073 [P] [US3] Unit `tests/unit/payments/payment.state.test.ts`: full transition table incl. `failed → paid`, `expired → paid` (late success), `paid` never regresses except to `refunded`, terminal states (FR-053)
- [ ] T074 [P] [US3] Unit `tests/unit/payments/signature.test.ts`: checkout HMAC over `order_id|payment_id`; webhook HMAC over **raw bytes** (re-serialised JSON fails); unequal-length signatures rejected without throwing (FR-054, FR-056, legacy P-06/P-07)
- [ ] T075 [P] [US3] Unit `tests/unit/exams/exam.state.test.ts` for `created → link_issued → in_progress → completed|abandoned|invalidated` (FR-076)
- [ ] T076 [P] [US3] Unit `tests/unit/exams/hvk-exam.adapter.test.ts` against a local fake HTTP server: success with/without `externalAttemptId`, missing `link`, 5xx/timeout → `ProviderUnavailableError`, 4xx → `ProviderRejectedError`, non-https link rejected in production, API key never logged (FR-079, FR-077, legacy P-17)
- [ ] T077 [P] [US3] Contract `tests/contract/payments-exams.contract.test.ts` for operations #16–#20 (FR-015)
- [ ] T078 [P] [US3] Integration `tests/integration/payments/orders.test.ts`: amount/currency from config (client `amount` → 400); step guard 422; already paid 409; open order reused (200 vs 201); fee change cancels and replaces; provider failure → 503 and orphan row without `providerOrderId` is expired by the sweeper; order TTL expiry (FR-050–FR-052, FR-062)
- [ ] T079 [P] [US3] Integration `tests/integration/payments/verify.test.ts`: happy path (→ `paid`, step `exam_ready`, attempt, `exam_link` notification, `effectsAppliedAt`); forged signature, other candidate's order (404), amount/currency/order mismatch, payment not captured → 400 with state unchanged and an audit entry; provider lookup outage → 503; repeat verify identical 200 with no extra side effects (FR-054, FR-055, FR-061, FR-064, legacy P-05)
- [ ] T080 [P] [US3] Integration `tests/integration/payments/webhook.test.ts`: missing/invalid signature 400 (nothing parsed); duplicate event id acknowledged once processed; replay while `processedAt` null reprocesses safely; unknown order 200 + warning; unsupported event ignored; `payment.failed` → `failed` and same order reused on retry; late `payment.captured` after expiry → `paid`; refund → `refunded` + `requiresReview` without revoking access; second captured payment flagged `duplicate` with no second grant/email (FR-056–FR-059, FR-063)
- [ ] T081 [P] [US3] Integration `tests/integration/payments/race.test.ts`: run verify and webhook concurrently 100 times (and each twice) → exactly one `paid` transition, one `examAttempts`, one `exam_link` notification (SC-003, legacy P-08)
- [ ] T082 [P] [US3] Integration `tests/integration/payments/effects-recovery.test.ts`: simulate crash after the `paid` claim (effects skipped) → reconciler step completes step/attempt/notification exactly once and sets `effectsAppliedAt` (R-09)
- [ ] T083 [P] [US3] Integration `tests/integration/exams/current.test.ts`: unpaid → 422 `PAYMENT_REQUIRED`; paid with provider down → 200 `status:created`, `examUrl:null`, `exam-link-issue` job queued; after provider recovers (job runs) → `link_issued` with URL and one email (FR-070–FR-072, legacy P-09)
- [ ] T084 [P] [US3] Security `tests/security/payments-idor.test.ts`: candidate B cannot verify/read candidate A's order, payments, or exam attempt (404); a table-driven forged/replayed/unsigned/mismatched/cross-candidate confirmation suite (reusing T079/T080 fixtures) asserts 0 exam-access grants (SC-002) (FR-054, FR-060)

### Implementation for User Story 3

- [ ] T085 [P] [US3] Create `src/modules/payments/payment.model.ts` with data-model constraints: `providerOrderId` string **unique partial**; `providerPaymentId` **unique partial**; `amountMinor` int ≥ 1; `currency` `INR`; `status` enum `created|pending|paid|failed|cancelled|expired|refunded`; `expiresAt`; `effectsAppliedAt`; `flags {duplicate,requiresReview,amountMismatch}`; indexes `{candidateId,status,createdAt:-1}`, `{status,expiresAt}`, partial `{status,effectsAppliedAt}` for `paid` + null; and `provider-event.model.ts` (unique `{provider,eventId}`; `payloadHash`; TTL `purgeAt` = `receivedAt + 90 d`) (FR-125)
- [ ] T086 [P] [US3] Create `src/modules/exams/exam-attempt.model.ts`: unique `{candidateId,paymentId}`; `externalAttemptId` **unique partial**; partial unique `{candidateId}` where `status ∈ {created,link_issued,in_progress}`; `examUrl`; `status` enum; `linkAttempts`, `nextLinkAttemptAt`, `linkNeedsAttention`; indexes per data-model
- [ ] T087 [US3] Implement `src/modules/payments/payment.state.ts` and `src/modules/exams/exam.state.ts` (transition tables + conditional-update helpers `claimPaid`, `advanceAttempt`) (FR-053, FR-076)
- [ ] T088 [US3] Implement `src/modules/payments/razorpay.client.ts` (implements `PaymentProvider`: `createOrder` with `receipt = "rcpt_" + paymentId` and `notes {paymentId,candidateId}`, `fetchPayment`; 8 s timeout wrapper; maps SDK/HTTP errors to `ProviderUnavailableError`/`ProviderRejectedError`) (R-12)
- [ ] T089 [P] [US3] Implement `src/modules/exams/providers/hvk-exam.adapter.ts` (matches [exam-provider §2](contracts/exam-provider.md)) and `providers/stub.adapter.ts` (dev/test only) (FR-079)
- [ ] T090 [US3] Implement `src/modules/payments/payment.service.ts`: `createOrder` (payment row first, provider order second, open-order reuse, supersede on fee change), `verify` (ownership → signature → provider lookup → `claimPaid`), `applyProviderEvent` (shared by webhook), expiry marking, duplicate-payment flagging, verification-attempt audit (FR-050–FR-055, FR-059, FR-061, FR-064)
- [ ] T091 [US3] Implement `src/modules/payments/payment.effects.ts`: idempotent effects after the `paid` claim — step `fee_pending → exam_ready`, ensure `examAttempts(created)`, optional inline `createAttempt` (4 s budget, verify path only), create `exam_link` notification (`exam-link:{paymentId}`) and enqueue delivery, cancel a still-`scheduled` follow-up, then set `effectsAppliedAt` (FR-058, FR-070, FR-071)
- [ ] T092 [US3] Implement `src/modules/payments/payment.webhook.ts`: raw-body signature check, `providerEvents` insert (duplicate-aware), event dispatch per [rest-api-v1 #18](contracts/rest-api-v1.md), prompt 200 (FR-056, FR-057, R-17)
- [ ] T093 [US3] Implement `src/modules/exams/exam.service.ts` (`current()`, `ensureAttempt()`, `issueLink()` incl. 422 `PAYMENT_REQUIRED`) (FR-070, FR-072, FR-077)
- [ ] T094 [US3] Implement `src/jobs/exam-link.worker.ts` (`exam-link-issue`: 8 attempts, exponential from 30 s capped 30 min, `linkNeedsAttention` on exhaustion) per [background-jobs](contracts/background-jobs.md) (FR-070, FR-113)
- [ ] T095 [P] [US3] Finalise `src/modules/notifications/templates/exam-link.html` (payment receipt + approved link, escaped; parity with the legacy acknowledgement content) and wire `exam_link` notification creation (FR-071, legacy P-10)
- [ ] T096 [US3] Implement schemas/controllers/routes for payments (`orders`, `verify`, `me`) and `GET /exams/current`; mount `POST /payments/webhook` with `express.raw` **before** the JSON parser in `src/app.ts`; register in OpenAPI; apply the `payments` rate-limit class (FR-001, FR-013, FR-060, R-17)
- [ ] T097 [US3] Add reconciler steps "expire payments" and "resume payment effects" to `src/jobs/reconciler.ts` per [background-jobs](contracts/background-jobs.md#reconciler-queue-maintenance-repeatable-reconcile-every-5-min-and-once-at-worker-start) (FR-052, FR-111)

**Checkpoint (MVP)**: register → onboarding → pay → exam link works and is safe under races. Run `npm run verify` and quickstart §3–§4.

---

## Phase 6: User Story 4 - Talent Acquisition is alerted and follows up on unpaid candidates (Priority: P2)

**Goal**: TA alert delivery, the 24-hour unpaid follow-up, one generic retrying delivery path, and a reconciler that heals queue loss.

**Independent Test**: advance `FakeClock` 24 h and run handlers: unpaid → exactly one follow-up; paid → none; re-run ×3 unchanged; Redis flush recovered by the reconciler.

### Tests for User Story 4 (write first) ⚠️

- [ ] T098 [P] [US4] Unit `tests/unit/ta/followup.decision.test.ts`: decision matrix (paid → cancel, unpaid no attempt, unpaid with latest attempt) and payload minimisation to the FR-091 field list
- [ ] T099 [P] [US4] Integration `tests/integration/jobs/ta-notify.test.ts`: delivery success → notification `sent`, lead `new → queued`, and with the fake clock the alert is delivered within 60 s of registration (SC-005); transient failure retries with backoff; permanent failure → `failed` + error log, registration unaffected (FR-091, FR-093)
- [ ] T100 [P] [US4] Integration `tests/integration/jobs/payment-followup.test.ts` (with `FakeClock`): unpaid at +24 h → follow-up `open` and TA alert; paid before → `cancelled`; three forced re-runs → still one follow-up and one alert; latest payment attached; `PAYMENT_FOLLOWUP_DELAY_HOURS` override (FR-094, FR-095, SC-006)
- [ ] T101 [P] [US4] Integration `tests/integration/jobs/notification-retry.test.ts`: claim `queued → sending`; transient → back to `queued` with `nextAttemptAt` per schedule; permanent → `failed`; idempotency key prevents a second send; `password_reset` payload token never persisted (FR-092, FR-093)
- [ ] T102 [P] [US4] Integration `tests/integration/jobs/reconciler.test.ts`: rows with no job are enqueued once; past-due rows get delay 0; `password_reset` excluded; running twice is idempotent (FR-111, FR-112)
- [ ] T103 [P] [US4] Queue `tests/queue/queue.test.ts` against real Redis: delay accuracy, same-id dedupe, retry/backoff, worker kill and restart completes the job once, `SIGTERM` lets an active job finish before the worker exits (FR-017), `FLUSHALL` + reconciler restores due work, custom job-id format accepted by BullMQ (SC-004, research R-11)

### Implementation for User Story 4

- [ ] T104 [P] [US4] Implement `src/modules/talent-acquisition/providers/email-ta.adapter.ts` (default `TA_DELIVERY=email` to `TA_NOTIFY_EMAILS`, minimal payload only) and create `templates/ta-payment-followup.html` (FR-091)
- [ ] T105 [US4] Implement `src/modules/talent-acquisition/lead.state.ts` + system transition `new → queued` in `lead.service.ts` (FR-098 transition rules)
- [ ] T106 [US4] Implement `src/jobs/notification-retry.worker.ts`: the single delivery path for all notification types (claim, resolve recipient/template, send, classify, reschedule/fail) (FR-092, FR-093)
- [ ] T107 [US4] Implement `src/jobs/ta-notify.worker.ts` (`candidate-registration-ta-notify`) (FR-091)
- [ ] T108 [US4] Implement `src/jobs/payment-followup.worker.ts` (`unpaid-payment-follow-up`: claim, re-read payment state, activate or cancel, create + enqueue TA notification) (FR-095)
- [ ] T109 [US4] Add the "re-enqueue due rows" step to `src/jobs/reconciler.ts` (notifications, follow-ups, results, attempts) and register the repeatable `reconcile` job every `RECONCILE_INTERVAL_SECONDS` plus once at start (FR-111)
- [ ] T110 [US4] Wire all queues, workers, concurrency, retry/backoff options and graceful shutdown in `src/jobs/worker.ts`; enable the `worker` Compose service and `WORKER_ENABLED`; confirm quickstart §5 follow-up checks (FR-114, FR-017)

**Checkpoint**: US1–US4 independent and passing; durability scenarios proven (`npm run test:queue`).

---

## Phase 7: User Story 5 - Exam completion, feedback and the result email (Priority: P2)

**Goal**: trusted completion via signed callback, one feedback per attempt, result email at +24 h with bounded retry, `GET /results/me`.

**Independent Test**: seed a paid candidate with an issued attempt; post signed `attempt.completed` and `result.finalized`; submit feedback; advance 24 h; run worker → one result email, step `completed`.

### Tests for User Story 5 (write first) ⚠️

- [ ] T111 [P] [US5] Unit `tests/unit/exams/provider-callback.verifier.test.ts`: HMAC over `timestamp.rawBody`, ±300 s tolerance, `sha256=` prefix, previous-secret acceptance, header/body event-id mismatch, constant-time compare (FR-073)
- [ ] T112 [P] [US5] Unit `tests/unit/results/result.state.test.ts`: transition table, `email_scheduled` when finalized early, re-finalization versioning, backoff schedule 1/2/4/8/12 h and 10-attempt/7-day cap (FR-083, FR-085)
- [ ] T113 [P] [US5] Integration `tests/integration/exams/provider-callback.test.ts`: bad/missing signature and stale timestamp → 401; replay → `duplicate`; unknown attempt → `ignored` + warning; `attempt.completed` creates one result and one job; out-of-order (`result.finalized` first implies completion, `completed` before `started`); terminal attempt ignores later events (FR-073, FR-074, FR-082)
- [ ] T114 [P] [US5] Integration `tests/integration/exams/complete.test.ts`: candidate call alone never completes; provider-reported `completed` applies the same handler path; `unsupported` → 202 `pendingProviderConfirmation`; non-owner 404; already completed 409; `created` 422 (FR-075)
- [ ] T115 [P] [US5] Integration `tests/integration/feedback/feedback.test.ts`: valid submit 201 + step `feedback_submitted`; rating bounds; comments > 2000; answers > 50; not completed 422; other owner 404; second submit 409 (FR-080, FR-081)
- [ ] T116 [P] [US5] Integration `tests/integration/jobs/result-email.test.ts` (with `FakeClock`): finalized at 24 h → exactly one email, `emailed`, `publishedAt`, step `completed` when feedback exists (both orders); not finalized → reschedule per schedule, then `needsAttention` + error log after the cap, finalized later → sent once; retry after success is a no-op; email provider transient/permanent failures (FR-082–FR-086, SC-007)
- [ ] T117 [P] [US5] Integration `tests/integration/results/results.test.ts`: `not_available`, status-only before publication, full fields after `emailed`, only own result (FR-086)
- [ ] T118 [P] [US5] Contract `tests/contract/provider-callback.contract.test.ts` with fixture payloads for every event type, and OpenAPI check for operations #21–#24 (FR-015)
- [ ] T119 [P] [US5] End-to-end `tests/e2e/journey.test.ts`: register → skip demo → order → verify → exam link → `attempt.started`/`completed`/`result.finalized` callbacks → feedback → +24 h → result email → `completed` (LLD §11 e2e)

### Implementation for User Story 5

- [ ] T120 [P] [US5] Create `src/modules/feedback/feedback.model.ts` (`examAttemptId` **unique**; `rating` int 1–5; `answers` ≤ 50 × `{questionId ≤ 64, value ≤ 1000 | number | boolean}`; `comments` ≤ 2000) and `src/modules/results/result.model.ts` (`examAttemptId` **unique**; `status` enum; `version`; `emailScheduledAt`; `emailAttempts`; `needsAttention`; indexes `{status,finalizedAt}`, `{status,nextAttemptAt}`) plus `result.state.ts`
- [ ] T121 [US5] Implement `src/modules/exams/provider-callback.verifier.ts` (FR-073) and `provider-callback.handler.ts` (event → effect table in [exam-provider §3](contracts/exam-provider.md), shared completion path used by the candidate-triggered check) (FR-074–FR-076)
- [ ] T122 [US5] Extend `src/modules/exams/exam.service.ts` with `completeFromProvider()` (attempt → `completed`, candidate step, create result + schedule email once) and `reportCandidateComplete()` (records `candidateReportedCompleteAt`, calls `fetchAttemptStatus`) (FR-075, FR-082)
- [ ] T123 [US5] Implement `src/modules/results/result.service.ts` (create/schedule, finalize with versioning, publish on send, step recompute `→ completed` when feedback and email both done) (FR-083, FR-086, FR-047)
- [ ] T124 [US5] Implement `src/modules/feedback/feedback.service.ts` and `feedback.schemas.ts` (owner + `completed` guards, unique-key conflict → 409, step transition) (FR-080, FR-081)
- [ ] T125 [US5] Implement `src/jobs/result-email.worker.ts` per [background-jobs](contracts/background-jobs.md) including the backoff schedule, cap and `needsAttention` handling (FR-084, FR-085)
- [ ] T126 [US5] Add routes: `POST /exams/provider-callback` (raw body, mounted before JSON parser), `POST /exams/attempts/:id/complete`, `POST /exams/attempts/:id/feedback`, `GET /results/me` (controllers, schemas, OpenAPI, rate-limit classes `provider|global`) (FR-001, FR-073, FR-075, FR-080, FR-086)
- [ ] T127 [P] [US5] Create `src/modules/notifications/templates/result.html` and register type `result` in `notification.service.ts` (FR-084)
- [ ] T128 [P] [US5] Create `scripts/dev-send-exam-callback.ts` (signs and POSTs a callback with `EXAM_PROVIDER_CALLBACK_SECRET`; refuses `NODE_ENV=production`) used by quickstart §5

**Checkpoint**: full candidate journey passes e2e with fake clock.

---

## Phase 8: User Story 6 - TA/admin staff manage leads and follow-ups (Priority: P3)

**Goal**: RBAC-protected, audited lead and follow-up management plus staff seeding and exam-link resend.

**Independent Test**: seed a `ta` user; list/filter/paginate leads; move a lead along a legal path and fail an illegal one; verify audit entries; candidate token gets 403.

### Tests for User Story 6 (write first) ⚠️

- [ ] T129 [P] [US6] Unit `tests/unit/ta/lead.state.test.ts`: legal moves (one step forward; `resolved` only from `in_progress`; `closed` from any non-terminal), illegal skips/backwards/terminal-exit (FR-098)
- [ ] T130 [P] [US6] Integration `tests/integration/admin/leads.test.ts`: pagination bounds (page beyond end, `pageSize` > 100 → 400), whitelisted sort/filter, unknown key → 400, invalid date range → 400, `q` prefix search, DTO contains only FR-102 fields (FR-096, FR-102)
- [ ] T131 [P] [US6] Integration `tests/integration/admin/lead-update.test.ts`: legal transition recorded with actor/timestamp and audit `lead.update` (from/to); illegal → 422; stale `expectedVersion` → 409 `STALE_UPDATE`; `assignedTo` must be an active staff user; detail read writes `lead.read` audit (FR-097, FR-098, FR-101)
- [ ] T132 [P] [US6] Integration `tests/integration/admin/follow-ups.test.ts`: only `open|in_progress` by default, `scheduled`/`cancelled` never listed, safe payment fields only, pagination (FR-099)
- [ ] T133 [P] [US6] Integration `tests/integration/admin/exam-link-resend.test.ts`: admin-only; unpaid → 422; resends current link; expired link → re-issue (`reissued:true`) and old attempt invalidated; audited (FR-078)
- [ ] T134 [P] [US6] Security `tests/security/rbac.test.ts`: every `/admin/*` route returns 401 unauthenticated, 403 for candidate role, 403 for `ta` on resend; `ta` and `admin` succeed on their routes (FR-100)
- [ ] T135 [P] [US6] Integration `tests/integration/scripts/seed-staff.test.ts`: creates and updates a `ta|admin` account, hashes the password, never prints it, refuses a duplicate phone belonging to another account (FR-124, FR-036)

### Implementation for User Story 6

- [ ] T136 [US6] Complete `src/modules/talent-acquisition/lead.service.ts` (whitelisted query builder with escaped anchored-prefix `q`, update with `version` check and transition guard, follow-up listing) (FR-096–FR-099)
- [ ] T137 [P] [US6] Create `src/modules/talent-acquisition/lead.dto.ts` and `admin.schemas.ts` (query/body schemas, unknown keys rejected) (FR-102)
- [ ] T138 [US6] Implement `src/modules/talent-acquisition/admin.controller.ts` and `admin.routes.ts` (`authenticate`, `authorize("ta","admin")`, `admin` rate class, audit calls) and mount under `/api/v1/admin` (FR-100, FR-101)
- [ ] T139 [US6] Implement exam-link resend in `src/modules/exams/exam.service.ts` + route `POST /admin/candidates/:id/exam-link/resend` (`authorize("admin")`) (FR-078)
- [ ] T140 [P] [US6] Implement `scripts/seed-staff.ts` and `scripts/lib/prompt.ts` (hidden password prompt, args `--email --phone --role`) (FR-124)
- [ ] T141 [US6] Register operations #25–#29 in OpenAPI and add the `tests/contract` assertions for them (FR-015)

**Checkpoint**: staff workflows complete; all six stories independently verifiable.

---

## Phase 9: User Story 7 - Maintainers cut over from the legacy API without losing data (Priority: P2)

**Goal**: migrate existing data, retire legacy paths with a clear 410, and leave only the new architecture in the repository.

**Independent Test**: rehearse on a scratch DB per [quickstart §7–§8](quickstart.md): dry-run writes nothing, apply is idempotent, paid candidates keep paid state and an attempt, `git grep` finds no legacy artefacts.

### Tests for User Story 7 (write first) ⚠️

- [ ] T142 [P] [US7] Integration `tests/integration/migration/migrate-legacy.test.ts`: dry-run writes nothing and reports each record; apply maps fields per [data-model legacy table](data-model.md#legacy-document--v1-mapping-migration-input-shape) (paid → payment + attempt + `exam_ready`; pending/failed → `fee_pending`; phone normalised; invalid phone / missing payment id → `migrationRejects` with reason); re-run changes nothing; `--finalize` unsets legacy fields and drops `email_1`/`phone_1` only when asked; paid count preserved (FR-143, FR-144, SC-010)
- [ ] T143 [P] [US7] Integration `tests/integration/legacy-gone.test.ts`: every legacy path (`/api/register`, `/api/razorpay/*`, `/api/candidates/:id`, `/api/exam-access/verify`, `/api/email/*`) → 410 `API_VERSION_RETIRED` naming the replacement; `/api/v1/*` unaffected; disabled when `LEGACY_410_ENABLED=false` (FR-145)
- [ ] T144 [P] [US7] Contract `tests/contract/no-legacy.test.ts`: fails if any inventory path/dependency/env name from [legacy-mapping §3–§4](contracts/legacy-mapping.md) exists outside the allow-listed `legacy-gone.middleware.ts` and `specs/` (FR-141, SC-013)
- [ ] T145 [P] [US7] Parity coverage check `tests/contract/parity.test.ts`: every row P-01…P-17 of the parity checklist maps to an existing test name (via `@parity P-xx` tags in test titles, added as the tests are written: T015 P-11, T019 P-15/P-16, T046 P-01/P-02, T051 P-02, T074 P-06/P-07, T076 P-17, T078 P-03/P-04, T079 P-05/P-10, T080 P-07, T081 P-08, T083 P-09, T133 P-14, T152 P-12, T154 P-13) so each preserved capability (optional profile fields, fee in minor units, receipt + exam-link email, verify-vs-webhook race safety, constant-time signatures, multi-origin CORS, API docs, health, Brevo, exam adapter) is proven (FR-142, FR-147)

### Implementation for User Story 7

- [ ] T146 [US7] Implement `scripts/migrate-legacy-candidates.ts` and `scripts/lib/report.ts` (modes `--dry-run` default / `--apply` / `--finalize`, raw collection access, idempotency via `schemaVersion`, per-record JSON report, backup warning printed) (FR-143, FR-144, R-26)
- [ ] T147 [P] [US7] Implement `scripts/seed-legacy-fixture.ts` (paid, pending, failed, invalid-phone, duplicate-looking candidates in the legacy shape; refuses non-rehearsal DB names unless `--force`)
- [ ] T148 [US7] Implement `src/middleware/legacy-gone.middleware.ts` and mount it after the v1 routers (`LEGACY_410_ENABLED`, `LEGACY_410_SUNSET_DAYS`) (FR-145)
- [ ] T149 [US7] Rewrite `README.md` for the new system (stack, setup, Docker, scripts, endpoint overview linking to `/api-docs`, operations, migration) and fix the broken code fences; re-audit `.env.example` against `config/env.ts` (FR-146)
- [ ] T150 [US7] Run quickstart §8 (`git grep …`), delete any remaining legacy artefacts (e.g. empty `src/templates`, unused types), and confirm `npm ls` shows none of the removed dependencies (FR-141, SC-013)

**Checkpoint**: repository contains only the new architecture; migration rehearsed.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: cross-story verification, performance smoke, documentation, CI.

- [ ] T151 [P] Security `tests/security/idor-matrix.test.ts`: iterate the registered route table; for every owner-scoped route, request another candidate's resource and assert 404 (never 200/403) (FR-132)
- [ ] T152 [P] Security `tests/security/rate-limits-cors.test.ts`: each rate-limit class returns 429 with `Retry-After` after its limit; CORS allow-list honoured (multiple origins), wildcard refused in production config, pre-flight from a foreign origin denied; standard security headers (helmet set, `Cache-Control: no-store` on auth/payment/profile routes) present on responses (FR-012, FR-013)
- [ ] T153 [P] Security `tests/security/log-leakage.test.ts`: run the e2e scenarios with a capturing log stream and assert zero occurrences of passwords, OTPs, tokens, signatures, secrets, raw provider payloads (FR-014, SC-008)
- [ ] T154 [P] Contract `tests/contract/openapi-routes.test.ts`: Express route table ⇄ generated OpenAPI paths/methods in both directions; every response in the spec validates against its Zod schema (FR-015, SC-012)
- [ ] T155 Set coverage thresholds in `vitest.config.ts` (business modules ≥ 90% lines / 85% branches; project ≥ 80% lines) and make `npm run test:coverage` fail below them; confirm every LLD §11 failure-path scenario has a named passing test (SC-011) (FR-131, FR-134)
- [ ] T156 [P] Add `scripts/load-smoke.ts` (autocannon against a running stack: register/login/status at 100 connections) and record p95 results in `README.md` (SC-001)
- [ ] T157 [P] Write the operations runbook section in `README.md` (re-queue stuck work, duplicate/refund review queries, attention lists, secret rotation, restore/backup note, `jobs:requeue` usage) and implement `scripts/requeue.ts` accordingly (FR-085)
- [ ] T158 [P] Add `.github/workflows/backend-ci.yml`: Node 22, `npm ci`, `typecheck`, `lint`, `test:unit|integration|contract|e2e|security`, `test:queue` with a Redis service container, `npm audit --audit-level=high` (FR-126, FR-135)
- [ ] T159 Run `npm run verify`, `npm run test:queue`, then walk through every section of [quickstart.md](quickstart.md) against the Docker stack; record deviations and fix them
- [ ] T160 [P] Integration `tests/integration/indexes.test.ts`: after model initialisation (`syncIndexes`) every unique, partial-unique and TTL index in [data-model.md](data-model.md) exists with the documented options (`emailNormalized`, `phoneE164`, `providerOrderId`/`providerPaymentId` partial, `{candidateId,paymentId}`, live-attempt partial unique, `examAttemptId` on feedback/results, `idempotencyKey`, `dedupeKey`, `{provider,eventId}`, TTL `purgeAt` on sessions/OTP/reset/provider events) — these indexes are what make every race-safety claim true (FR-022, FR-125)
- [ ] T161 Re-run the SpecKit analysis (`/speckit-analyze`) on spec/plan/tasks after implementation changes, resolve CRITICAL/HIGH findings, and tick the checklist (Constitution governance)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** → none. T001 before T011; T011 before T012.
- **Phase 2 Foundational** → after Phase 1; **blocks all stories**. Within it: T021 (harness) before any integration test; T022–T027 before T028–T039; T033 (candidate model) before every story.
- **Phase 3 US1** → after Phase 2. **Phase 4 US2** → after US1 (needs authenticated candidates). **Phase 5 US3** → after US2 (requires `fee_pending`). Together = MVP.
- **Phase 6 US4** → after US1 (needs lead/notification/follow-up rows) and the payment effects from US3 for the "paid → cancel" scenario; the delivery path (T106–T107) can start after US1.
- **Phase 7 US5** → after US3 (needs attempts) and T106 (delivery path).
- **Phase 8 US6** → after US1 (leads) and US4 (follow-ups activated); resend (T139) after US3.
- **Phase 9 US7** → after US1–US3 are at parity (parity tests T145 need their tests); migration (T146) needs the final data model from US3/US5 but not their endpoints.
- **Phase 10 Polish** → after the stories being shipped.

### Within each story

Tests first and failing → models → state machines → services → jobs → controllers/routes → OpenAPI registration → checkpoint run.

### Parallel opportunities

- Setup: T003–T007, T009 in parallel.
- Foundational tests T013–T020 in parallel; T022–T025, T027, T034, T035 in parallel.
- Per story: every `[P]` test task (different files) in parallel; models `[P]` in parallel.
- After Phase 5, US4 / US5 / US6 can proceed on separate branches off `backend` by different developers.

### Parallel example: User Story 3 test authoring

```text
Task: "Unit tests/unit/payments/payment.state.test.ts"          (T073)
Task: "Unit tests/unit/payments/signature.test.ts"              (T074)
Task: "Integration tests/integration/payments/webhook.test.ts"  (T080)
Task: "Integration tests/integration/payments/race.test.ts"     (T081)
```

---

## Implementation Strategy

### MVP first (Phases 1–5)

1. Setup → Foundational (checkpoint T040) → US1 → US2 → US3.
2. **Stop and validate**: `npm run verify`, quickstart §3–§4 with Razorpay test mode. This is a shippable slice: candidates can register, pay, and get exam access safely.

### Incremental delivery

3. US4 (TA alerts + durable follow-up) → validate with `npm run test:queue` and quickstart §5.
4. US5 (completion, feedback, results) → validate e2e.
5. US7 (cut over, migrate, clean) → rehearse migration, then switch the frontend over.
6. US6 (staff APIs) → TA moves off email-only workflow.
7. Polish (security matrix, coverage, load smoke, CI).

### Team strategy

One developer completes Phases 1–2 together; afterwards US4, US5 and US6 can run in parallel behind the MVP.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task. Commit after each task or logical group using the `type: summary` convention.
- Verify each test fails for the right reason before implementing (Constitution V).
- The legacy code is deleted in T011 (after tagging in T001); the replacement behaviours are proven by the parity-tagged tests (T145) — consult the old code with `git show legacy-backend-baseline:<path>`.
- Items needing stakeholder confirmation (spec D-1…D-12) do not block these tasks; each is isolated behind configuration or an adapter.
