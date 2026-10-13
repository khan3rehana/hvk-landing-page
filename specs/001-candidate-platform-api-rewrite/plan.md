# Implementation Plan: Candidate Platform API Rewrite (v1)

**Branch**: `backend` (spec directory `specs/001-candidate-platform-api-rewrite`) | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-candidate-platform-api-rewrite/spec.md`

## Summary

Replace the current seven-route Express app with the HLD/LLD architecture: a versioned `/api/v1` REST API (auth with password and OTP, onboarding, Razorpay Orders + Checkout with server-side verification and webhooks, exam hand-off and signed completion callbacks, feedback, results, TA leads, staff APIs) plus a BullMQ worker for the 24-hour follow-up, result email, notification retries and exam-link issuance, with MongoDB as the source of truth and Redis only as the queue/rate-limit store. External systems (Razorpay, email, OTP/SMS, exam platform, TA channel) sit behind ports so undecided providers (spec D-1…D-3) are swappable. Existing candidates and payments are migrated in place by an idempotent, dry-run-first command; all superseded code, dependencies and variables are deleted after parity tests pass ([legacy mapping](contracts/legacy-mapping.md)). Technical rationale for every choice is in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 (`strict`), Node.js ≥ 22.12 (`engines`), CommonJS build (existing); `tsx` for dev and scripts

**Primary Dependencies**: Express 5, Zod 4, Mongoose 9, BullMQ 6 (+ioredis), `razorpay` 2.9, `@getbrevo/brevo` 6, `argon2`, `jsonwebtoken`, `pino`/`pino-http`, `helmet`, `cors`, `express-rate-limit` + `rate-limit-redis`, `libphonenumber-js`, `@asteasolutions/zod-to-openapi`, `swagger-ui-express` (versions: [research R-28](research.md))

**Storage**: MongoDB (standalone is sufficient — no multi-document transactions; 13 collections in [data-model.md](data-model.md)); Redis (BullMQ queues, rate-limit counters)

**Testing**: Vitest 5 (projects `unit`, `integration`, `contract`, `e2e`, `security`, `queue`), Supertest, `mongodb-memory-server`; real Redis (Compose) only for the `queue` project; fakes at every port; injectable `Clock`

**Target Platform**: Linux containers (Node 22 slim image, non-root); developed on Docker Desktop for Windows

**Project Type**: web-service — REST API process + worker process built from one codebase

**Performance Goals**: p95 < 500 ms for non-provider endpoints at 100 concurrent candidates (SC-001); webhook acknowledged in < 2 s p95; reconciler recovers all due work within 5 minutes of worker start (SC-004)

**Constraints**: Razorpay webhook must be acknowledged within a few seconds → the webhook path never calls the exam provider inline; all signature checks on raw bytes; no secrets or PII in logs; startup fails fast on unsafe production config; no in-process timers for business work

**Scale/Scope**: thousands of candidates; registration campaigns of ~100 concurrent users; 29 operations, 13 collections, 5 job types, 8 outbound/inbound integrations behind 6 ports

## Constitution Check

*GATE: passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle | How the design satisfies it | Result |
|---|---|---|
| I. Backend is the source of truth | Payment `paid` only through signature + provider lookup/webhook (FR-054/056); attempt `completed` only via signed callback or provider status (FR-073/075); onboarding step server-owned (FR-046); roles never client-writable (FR-041) | PASS |
| II. One versioned contract | `/api/v1` only; envelope + codes in [rest-api-v1](contracts/rest-api-v1.md); OpenAPI generated from Zod with a route↔doc contract test (FR-015) | PASS |
| III. Durable, idempotent workflows | Atomic conditional transitions (R-09); DB rows + deterministic job ids + reconciler (R-10, [jobs](contracts/background-jobs.md)); `effectsAppliedAt` crash marker; unique idempotency keys | PASS |
| IV. Security and privacy | Argon2id, hashed OTP (HMAC)/refresh/reset secrets, strict Zod validation, rate limits, RBAC + audit, raw-body signatures, CORS allow-list, redacting logger, minimal TA DTOs, startup guards (FR-016) | PASS (single documented exception: registration 409, D-10) |
| V. Test-first with failure-path coverage | Every story phase in [tasks.md](tasks.md) lists tests **before** implementation; levels per LLD §11; offline fakes; coverage floors (FR-134); `verify` gate | PASS |
| VI. Observable by design | pino JSON + request ids + redaction, `/health/live` vs `/health/ready`, job logs and terminal-failure events | PASS |
| VII. Simplicity, replaceable integrations | Modular monolith in the LLD layout; ports for Razorpay, email, OTP, exam, TA delivery, clock; existing stack retained; additions justified below | PASS |

**Post-design re-check**: no new violations introduced by `data-model.md`/`contracts/`. The only justified deviations from the LLD text are listed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-candidate-platform-api-rewrite/
├── plan.md                    # This file (/speckit-plan)
├── research.md                # Phase 0
├── data-model.md              # Phase 1
├── quickstart.md              # Phase 1 — run/validate guide
├── contracts/
│   ├── rest-api-v1.md         # 29 operations + error catalogue
│   ├── exam-provider.md       # port + signed callback proposal
│   ├── background-jobs.md     # job catalogue, reconciler, process model
│   └── legacy-mapping.md      # route mapping, parity checklist, removal inventory, env changes
├── checklists/requirements.md # spec quality checklist
├── source-docs/{HLD,LLD}.md   # text extractions of the provided documents
├── spec.md
└── tasks.md                   # Phase 2 (/speckit-tasks)
```

### Workspace layout (current folders — unchanged by this feature)

```text
E:\hvk\                     plain folder, not a git repository (CLAUDE.md + .claude\skills\ speckit-* wrappers)
├── backend\                git checkout of branch `backend`  ← SpecKit lives here: .specify\, .claude\skills\, specs\
└── frontend\               git checkout of branch `frontend` (not touched by this feature)
```

Both checkouts track the same remote (`khan3rehana/hvk-landing-page`). **Every path in `tasks.md`, `quickstart.md` and the tree below is relative to `E:\hvk\backend`** (the repository root of the `backend` branch). SpecKit commands can be run from `E:\hvk` or `E:\hvk\backend`: the scripts find `.specify\` from their own location, and the wrappers in `E:\hvk\.claude\skills\` delegate to the real skills in `backend\.claude\skills\`. The backend never imports from `frontend\` (Constitution, Technology constraints).

### Source Code (repository root = `E:\hvk\backend`)

```text
Dockerfile
docker-compose.yml
.dockerignore
.env.example
eslint.config.mjs
.prettierrc.json
vitest.config.ts
tsconfig.json                  # editor/typecheck (includes tests, scripts)
tsconfig.build.json            # emits src/ only → dist/
package.json
README.md

scripts/
├── migrate-legacy-candidates.ts   # --dry-run (default) | --apply | --finalize
├── seed-staff.ts                  # creates/updates ta|admin accounts
├── requeue.ts                     # runbook helper: re-queue a result/notification/follow-up
├── seed-legacy-fixture.ts         # rehearsal data in legacy shape (scratch DB only)
├── dev-send-exam-callback.ts      # dev helper: signs and posts a provider callback (refused when NODE_ENV=production)
└── lib/                           # shared CLI helpers (prompt without echo, report writer)

src/
├── config/        env.ts  database.ts  redis.ts
├── modules/
│   ├── auth/            auth.routes.ts  auth.controller.ts  auth.service.ts  auth.schemas.ts
│   │                    session.model.ts  session.service.ts  otp.model.ts  otp.service.ts
│   │                    password.service.ts  password-reset.model.ts  otp-sender.port.ts
│   │                    senders/log-otp.sender.ts
│   ├── candidates/      candidate.model.ts  candidate.repository.ts  candidate.service.ts
│   │                    candidate.routes.ts  candidate.controller.ts  candidate.schemas.ts  candidate.dto.ts
│   │                    identity.ts            # email/phone normalisation
│   ├── onboarding/      onboarding.routes.ts  onboarding.controller.ts  onboarding.service.ts
│   │                    onboarding.schemas.ts  onboarding.state.ts
│   ├── payments/        payment.model.ts  provider-event.model.ts  payment.state.ts
│   │                    payment.service.ts  payment.effects.ts  payment.routes.ts  payment.controller.ts
│   │                    payment.schemas.ts  payment.webhook.ts  payment-provider.port.ts
│   │                    razorpay.client.ts  payment.dto.ts
│   ├── exams/           exam-attempt.model.ts  exam.state.ts  exam.service.ts  exam.routes.ts
│   │                    exam.controller.ts  exam.schemas.ts  exam-provider.adapter.ts   # the port
│   │                    providers/hvk-exam.adapter.ts  providers/stub.adapter.ts
│   │                    provider-callback.verifier.ts  provider-callback.handler.ts
│   ├── feedback/        feedback.model.ts  feedback.service.ts  feedback.schemas.ts
│   ├── results/         result.model.ts  result.state.ts  result.service.ts
│   │                    result.routes.ts  result.controller.ts
│   ├── notifications/   notification.model.ts  notification.service.ts  email.provider.ts   # the port
│   │                    providers/brevo.provider.ts  template.renderer.ts
│   │                    templates/{exam-link,ta-registration-alert,ta-payment-followup,result,password-reset}.html
│   ├── talent-acquisition/  lead.model.ts  follow-up.model.ts  lead.state.ts  lead.service.ts
│   │                    ta-delivery.adapter.ts  providers/email-ta.adapter.ts
│   │                    admin.routes.ts  admin.controller.ts  admin.schemas.ts  lead.dto.ts
│   └── audit/           audit.model.ts  audit.service.ts
├── middleware/    request-context.middleware.ts  validate.middleware.ts  auth.middleware.ts
│                  rbac.middleware.ts  rate-limit.middleware.ts  error.middleware.ts
│                  not-found.middleware.ts  legacy-gone.middleware.ts   # temporary (FR-145)
├── jobs/          queue.ts  worker.ts  reconciler.ts  ta-notify.worker.ts  payment-followup.worker.ts
│                  result-email.worker.ts  notification-retry.worker.ts  exam-link.worker.ts
├── docs/          openapi.ts
├── shared/        errors.ts  envelope.ts  logger.ts  time.ts  crypto.ts  ids.ts  pagination.ts  types.ts
├── app.ts         # createApp(deps): composition + middleware order
├── container.ts   # builds services with real adapters; tests build with fakes
└── server.ts

tests/
├── support/       harness.ts  fake-clock.ts  fakes/{payment-provider,email-provider,exam-provider,otp-sender,ta-delivery}.ts  factories.ts
├── unit/          state machines, crypto, identity, renderer, services (mocked repos)
├── integration/   per-module with in-memory MongoDB + Supertest
├── contract/      openapi-vs-routes, provider-callback payloads, no-legacy-artefacts
├── e2e/           journey.test.ts (register → … → result email) with FakeClock
├── security/      idor-matrix, rbac, rate-limits, leakage, signature/replay
└── queue/         BullMQ semantics against real Redis (delay, retry, dedupe, restart, flush)
```

**Structure Decision**: single backend project (modular monolith, LLD §2 layout) with two entry points (`server.ts`, `jobs/worker.ts`). Frontend is a different branch/checkout and is not touched. Modules expose a small public surface (their service + types); cross-module access goes through services, not other modules' models. `container.ts` is the only place real adapters are wired, so every test composes the same graph with fakes.

## Request pipeline (order matters)

1. `request-context` → id, child logger  2. `helmet`  3. `cors` (allow-list)  4. global rate limit
5. **signed raw routes** (`POST /api/v1/payments/webhook`, `POST /api/v1/exams/provider-callback`) mounted with `express.raw({ type: "application/json", limit: "1mb" })` **before** the JSON parser (R-17)
6. `express.json({ limit: "100kb", strict: true })` → malformed → `MALFORMED_JSON`; content-type guard → 415
7. `/health*`, `/api-docs*`  8. `/api/v1` routers (each route: rate-limit class → `authenticate` → `authorize(roles)` → `validate(schema)` → controller)
9. `legacy-gone` for any other `/api/*` (temporary)  10. `not-found`  11. `error` handler (maps `AppError`, Zod, Mongo duplicate-key, Mongoose cast, unknown → 500 generic).

## Composition and testability

Ports (interfaces) in module roots: `PaymentProvider` (createOrder, fetchPayment, fetchOrder, verifyWebhookBody), `EmailProvider`, `OtpSender`, `ExamProvider`, `TaDeliveryAdapter`, `Clock`. Services take their dependencies as constructor arguments (`createPaymentService({ repo, provider, clock, … })`). No service imports an SDK; only adapters do. Tests use `tests/support/harness.ts` to build the app with an in-memory MongoDB, `FakeClock` and fakes that record calls and can be told to fail (transient/permanent) so failure paths are deterministic.

## Configuration (validated in `config/env.ts`; `.env.example` lists all)

| Variable | Default | Prod rule |
|---|---|---|
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | `development`, `5000`, `info` | – |
| `MONGODB_URI` | – | required |
| `MONGODB_DNS_SERVERS` | unset | optional (replaces unconditional override) |
| `REDIS_URL` | unset | required when `WORKER_ENABLED` or rate-limit store needed |
| `WORKER_ENABLED` | `false` | queue/worker switch: when `true` the API enqueues jobs and `/health/ready` checks Redis; the worker process refuses to start unless `true`; requires `REDIS_URL` |
| `WORKER_CONCURRENCY`, `RECONCILE_INTERVAL_SECONDS` | `5`, `300` | – |
| `CORS_ORIGINS` | `http://localhost:3000` | no `*` |
| `TRUST_PROXY_HOPS`, `DEFAULT_PHONE_REGION` | `0`, `IN` | – |
| `JWT_ACCESS_SECRET` | – | required, ≥ 32 bytes |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`, `PASSWORD_RESET_TTL_MINUTES` | `15`, `30`, `60` | – |
| `OTP_ENABLED`, `OTP_SENDER`, `OTP_PEPPER`, `OTP_TTL_MINUTES` | `false`, `log`, –, `5` | `OTP_SENDER≠log` and pepper required when enabled |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | – | all required |
| `REGISTRATION_FEE_MINOR`, `REGISTRATION_FEE_CURRENCY` | `50000`, `INR` | – |
| `PAYMENT_ORDER_TTL_MINUTES`, `PAYMENT_FOLLOWUP_DELAY_HOURS`, `RESULT_EMAIL_DELAY_HOURS` | `60`, `24`, `24` | fractional hours allowed (quickstart uses minutes-scale values) |
| `EMAIL_PROVIDER` | `brevo` | `log` (writes emails to the log, dev/test only) forbidden |
| `BREVO_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` | – | key required when `EMAIL_PROVIDER=brevo` |
| `EXAM_PROVIDER`, `EXAM_API_URL`, `INTERNAL_EXAM_API_KEY` | `stub` in dev | `stub` forbidden |
| `EXAM_PROVIDER_CALLBACK_SECRET`, `…_PREVIOUS` | – | secret ≥ 32 bytes |
| `TA_DELIVERY`, `TA_NOTIFY_EMAILS` | `email`, – | at least one address |
| `FRONTEND_URL`, `PASSWORD_RESET_URL_TEMPLATE` | `http://localhost:3000`, `{FRONTEND_URL}/reset-password?token={token}` | https in production |
| `LEGACY_410_ENABLED`, `LEGACY_410_SUNSET_DAYS` | `true`, `90` | temporary |

## Default operational limits

| Item | Default |
|---|---|
| JSON body / raw provider body | 100 KB / 1 MB |
| HTTP `requestTimeout` / `headersTimeout` | 30 s / 20 s |
| Mongo `serverSelectionTimeoutMS`, `maxPoolSize` | 5 000 ms, 20 |
| Outbound timeouts: Razorpay / exam provider / Brevo | 8 s / 8 s / 10 s (wrapped with `AbortSignal`/`Promise.race`) |
| Credentials: access / refresh / reset / OTP / OTP attempts / resend cooldown | 15 min / 30 d / 60 min / 5 min / 5 / 60 s |
| Payment order payable window | 60 min |
| Password length / hash | 8–128 / Argon2id m=19 MiB, t=2, p=1 |
| Pagination | default 20, max 100 |
| Rate limits | table in [rest-api-v1](contracts/rest-api-v1.md#rate-limit-classes-defaults-env-configurable) |
| Retry schedules | [background-jobs](contracts/background-jobs.md) |
| Result email retry | 1 h, 2 h, 4 h, 8 h, 12 h…; ≤ 10 attempts or 7 days |

## Test strategy (maps LLD §11 → directories → required scenarios)

| Level | Directory | Must cover |
|---|---|---|
| Unit | `tests/unit` | auth/password/OTP/session services, identity normalisation, **all state-machine tables** (every legal and illegal transition), payment guards, signature helpers, idempotency-key builders, result eligibility, follow-up decision, template renderer, pagination |
| Integration | `tests/integration` | Mongo repositories + unique-index races, every endpoint happy/validation path, authn/z, Razorpay adapter via fake, webhook signature on raw bytes, job handlers with `FakeClock` |
| Contract | `tests/contract` | OpenAPI document ↔ Express route table (both directions), response shapes vs schemas, provider callback payload fixtures, "no legacy artefacts" guard (SC-013) |
| End-to-end | `tests/e2e` | register → demo skip/complete → order → verify → exam link → callback completed → feedback → +24 h result email → `completed` |
| Failure-path | `tests/integration/failure/*` | duplicate registration (race), invalid/expired OTP, payment cancelled/failed, duplicate webhook, late webhook, job retry, email provider failure (transient/permanent), result not finalized at 24 h, exam provider down at payment |
| Security | `tests/security` | IDOR matrix over every owner-scoped route, role separation, rate limits, CORS allow-list, mass assignment, secret/PII leakage in responses and captured logs, forged/replayed signatures |
| Queue | `tests/queue` | delay accuracy, retry/backoff, dedupe by id, worker kill/restart, Redis flush + reconciler recovery |

Coverage gates (FR-134): business modules ≥ 90% lines / 85% branches; project ≥ 80% lines. `npm run verify` = `typecheck` → `lint` → `test:unit` → `test:integration` → `test:contract` → `test:e2e` → `test:security` → `audit` (queue tests run separately because they need Redis: `npm run test:queue`).

## Delivery phases (see [tasks.md](tasks.md))

| Phase | LLD §13 milestone | Outcome |
|---|---|---|
| 1 Setup | 1 | tooling, Docker, legacy baseline tag and removal, skeleton |
| 2 Foundational | 1 | config, logging, errors/envelope, health, app factory, test harness, ports, notification core, queue skeleton, candidate model |
| 3 US1 | 2 | registration, login, OTP, sessions, password reset, profile, TA lead + outbox |
| 4 US2 | 3 | onboarding status/demo |
| 5 US3 | 4, 5 | Razorpay order/verify/webhook, payment effects, exam attempt + link, `exams/current` |
| 6 US4 | 6 | TA delivery, follow-up job, generic notification delivery, reconciler |
| 7 US5 | 7 | provider callback, completion, feedback, result email job, `results/me` |
| 8 US6 | 7 | staff APIs, RBAC, audit, seeding, link resend |
| 9 US7 | – | migration, 410 handler, repository clean-up, README |
| 10 Polish | – | security/contract/e2e/load verification, runbooks, quickstart validation |

MVP = Phases 1–5 (register → pay → exam access). Phases 6–9 are independently shippable increments in that order.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Exam-provider callback contract unconfirmed (D-1) | Port + fake + signed-callback proposal; polling fallback; flagged in spec; callback route can ship dark until agreed |
| OTP/SMS provider undecided (D-3) | `OTP_ENABLED=false` default; log sender refused in production |
| Razorpay auto-capture not enabled | Documented prerequisite; verify checks `captured`; mismatch surfaces as `PAYMENT_VERIFICATION_FAILED` and a logged flag |
| Frontend still on legacy contract after cutover | 410 `API_VERSION_RETIRED` with replacement hints; frontend spec; keep legacy sunset window configurable |
| Real paid candidates in legacy DB (D-7) | Dry-run-first idempotent migration, reject collection, backup instruction, finalize separated from apply |
| BullMQ custom job-id restrictions | Ids built with `_`; first queue test asserts behaviour |
| Redis loses data | Database-first outbox + reconciler (R-10); SC-004 test flushes Redis |
| Password-reset token in queue payload | Short TTL, `removeOnComplete`, redacted logs, authenticated internal Redis; documented |
| In-memory MongoDB binary download in locked-down CI | Cache directory + documented `MONGOMS_DOWNLOAD_DIR`; alternative: Compose Mongo for tests |
| Scope size (116 FRs) | Story-ordered phases; MVP boundary; each phase ends with a checkpoint that runs `verify` |

## Complexity Tracking

| Addition / deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| BullMQ + Redis | Named in HLD §6 / LLD §7; delayed, retried, deduplicated jobs | Mongo-polling scheduler would still need reconciler logic and loses queue observability; contradicts approved design |
| JWT **plus** per-request session lookup | Immediate revocation (FR-030) while keeping a conventional bearer token for web and mobile | Pure stateless JWT cannot revoke; opaque tokens are not interoperable with other services |
| 6 ports/adapters | Providers for email, OTP, exam, TA, payments are TBD or replaceable (Constitution VII) | Direct SDK calls would leak provider choices into services and block offline tests |
| Extension routes `POST /auth/refresh`, `POST /admin/candidates/:id/exam-link/resend` | Refresh rotation is required by LLD §9 but has no endpoint; resend preserves today's admin capability (FR-147) | Omitting them forces clients to re-login every 15 min or drops an existing capability |
| Extra collections `passwordResets`, `providerEvents`, `auditLogs` | Required by LLD §5.1, §9 but absent from the §3 table | Cannot meet reset, replay-protection and audit requirements without them |
| `taFollowUps.dedupeKey` instead of `paymentId+type` | Follow-up must exist for candidates with no payment attempt (D-4) | Keying on `paymentId` would skip never-attempted candidates |
| Two processes (API, worker) | HLD §8 | Single process would tie job throughput to HTTP latency and block independent scaling |
