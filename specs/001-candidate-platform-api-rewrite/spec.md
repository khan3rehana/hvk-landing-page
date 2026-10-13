# Feature Specification: Candidate Platform API Rewrite (v1)

**Feature Branch**: `backend` (existing branch of the single remote; no feature branch is created — spec directory `specs/001-candidate-platform-api-rewrite`)

**Created**: 2026-10-13

**Status**: Draft — ready for the `review-spec` gate

**Input**: User description: "Using the provided HLD and LLD (v1.0, 13 Oct 2026), analyze the existing HVK backend and rewrite it to the new architecture and API contracts. Initialize SpecKit in the backend branch. Clean out the older code. Maintain existing functionality and include appropriate test coverage." (The earlier mention of an "updated query parameter behavior" was explicitly withdrawn by the requester — see Clarifications.)

Source documents (text extractions kept beside this spec): [HLD](source-docs/HLD.md) · [LLD](source-docs/LLD.md). Citations such as `HLD §7.2` or `LLD §5.3` refer to them.

## Background and Scope

**Today** (analysis of branch `backend` @ `105a7b9`): a small Express 5 / TypeScript API with seven public routes under `/api`. It registers a candidate (no credentials), creates a Razorpay order or hosted Payment Link, verifies the payment (client-driven verify call or webhook, racing safely), emails a receipt with a one-time "magic link" to the exam, and has two admin-key routes (`reset-exam-access`, arbitrary email send). It has **no** authentication or sessions, onboarding, TA (talent acquisition) workflow, exam-attempt tracking, feedback, results, background jobs, tests, linting, Docker setup or API versioning, and it exposes unauthenticated by-ID candidate reads.

**Target** (HLD/LLD): a versioned REST API (`/api/v1`) shared by web and mobile that covers registration and authentication (email/password and mobile OTP), onboarding demo progress, server-verified Razorpay payments that gate exam access, exam hand-off and trusted completion, feedback, a result email 24 hours after completion, TA lead creation at registration, a 24-hour unpaid-payment follow-up, durable background processing, role-based staff APIs, and a Docker-based development environment.

**This specification** defines the complete backend rewrite, the removal of superseded legacy code, and the migration of existing candidate data, so that every existing capability is either preserved or deliberately retired (see [legacy mapping](contracts/legacy-mapping.md)).

**Out of scope**: the web UI and mobile apps (the `frontend` branch needs its own spec to adopt the new contract — impact is listed in the legacy mapping); the exam delivery product itself; initiating refunds; an admin web UI; production hosting/IaC; CRM integration beyond the pluggable TA adapter; metrics dashboards (logs and health probes only); localisation.

## Clarifications

### Session 2026-10-13

- Q: Should the spec cover the "updated query parameter behavior"? → A: No — requester said to ignore it. The only query-string-driven behaviour in the legacy code was the frontend Razorpay payment-link redirect (retired with Payment Links); list endpoints use ordinary pagination/filter parameters as required by LLD §5.4 and are specified only to that extent (FR-096).
- Q: Repository layout? → A: One remote with two branches (`frontend`, `backend`), checked out in separate folders. SpecKit lives in the backend checkout and operates on branch `backend`. The HLD's "separate repositories" principle is met by independent branches/checkouts with no cross-imports.
- Q: Scope of the rewrite? → A: Rewrite the whole backend per the new documents and remove the older code (not a partial patch).
- Q: SpecKit branch handling? → A: Initialise on `backend` and keep the specification on it (no numbered feature branch).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Candidate registers and signs in (Priority: P1)

A prospective candidate creates an account with name, email, mobile number, password and acceptance of terms, then signs in with email/password or a one-time code sent to their mobile. They can sign out, refresh a session, and recover a forgotten password. Registering also creates a durable TA lead and queues an alert to Talent Acquisition.

**Why this priority**: Every other capability needs an authenticated candidate; registration also feeds the TA pipeline that is a core business goal (HLD §2).

**Independent Test**: With only the auth, candidate and lead modules deployed, register → login → `GET /candidates/me` → logout works and leaves exactly one candidate, one TA lead and one queued TA notification per registration.

**Acceptance Scenarios**:

1. **Given** valid unique details and `acceptTerms: true`, **When** the candidate registers, **Then** the API returns 201 with the candidate DTO and `nextStep: "demo_pending"`, the password is stored only as a hash, email/phone are normalised, one TA lead (`new`) exists, and one TA notification record is queued.
2. **Given** an email or phone already registered (in any letter-case/format variant), **When** someone registers again, **Then** the API returns 409 `CONFLICT` with a generic message and creates no second candidate, lead or notification — even when two identical requests race.
3. **Given** a registered candidate, **When** they log in with correct email *or* phone plus password, **Then** the API returns 200 with an access credential, a refresh credential and the candidate DTO.
4. **Given** an unknown account or a wrong password, **When** login is attempted, **Then** the response is the same 401 `INVALID_CREDENTIALS` in both cases and takes a comparable time.
5. **Given** a registered phone, **When** an OTP is requested and the correct code is verified within its lifetime, **Then** a session is issued and the code can never be used again.
6. **Given** an OTP request for an unregistered phone, **When** the request is made, **Then** the response is indistinguishable (202 with a challenge) from a registered number, no message is sent, and verification fails with the generic invalid-code error.
7. **Given** a valid refresh credential, **When** it is exchanged, **Then** a new pair is issued and the old refresh credential stops working; replaying a rotated credential revokes that whole session.
8. **Given** an authenticated candidate, **When** they log out, **Then** the session is revoked immediately (the access credential stops working at once) and a repeat logout still returns 204.
9. **Given** a forgotten password, **When** the candidate requests a reset, **Then** the response is always 202; if the email is registered a single-use, expiring reset link is emailed; using it sets the new password, returns 204 and revokes all that account's sessions.

---

### User Story 2 - Candidate completes or skips the demo and reaches the fee step (Priority: P1)

After signing in the candidate is shown the onboarding demo video. Finishing it, or skipping it at any time, moves them to the registration-fee step. Progress is stored by the server so any device can resume.

**Why this priority**: The fee step is unreachable without it (the payment rules require `fee_pending`), so it sits on the critical path even though the logic is small.

**Independent Test**: Log in as a fresh candidate, `GET /onboarding/status` → `demo_pending`; `POST /onboarding/demo/skip` → `fee_pending`; repeating the call changes nothing.

**Acceptance Scenarios**:

1. **Given** a candidate at `demo_pending`, **When** they call `demo/complete`, **Then** the step becomes `fee_pending` and the completion time is recorded.
2. **Given** a candidate at `demo_pending`, **When** they call `demo/skip`, **Then** the step becomes `fee_pending` exactly as after completion and the skip time is recorded.
3. **Given** a candidate already at `fee_pending` or later, **When** they call either endpoint again, **Then** the API returns 200 with the unchanged current status and no state regresses.
4. **Given** a candidate logs in on a second device, **When** they read `onboarding/status`, **Then** they see the same server-held step and resume there.
5. **Given** a client attempts to change their step through `PATCH /candidates/me`, **When** the request includes `onboardingStep`, `status`, `role` or payment/result fields, **Then** it is rejected with 400 and nothing changes.

---

### User Story 3 - Candidate pays the registration fee and receives exam access (Priority: P1)

At the fee step the candidate creates a payment order (amount and currency fixed by the server), pays through Razorpay Checkout, and the API confirms the payment on its own — from the checkout result and/or the provider webhook, never from the browser's claim alone. Only then does the candidate become exam-eligible: an exam attempt is created, the exam link is emailed to their registered address, and the API returns the approved link for redirect.

**Why this priority**: Revenue and exam access hinge on this flow; the existing system's most valuable logic (signature checks, verify-vs-webhook race safety) must carry over and be strengthened.

**Independent Test**: With a fake Razorpay and fake exam provider, drive create-order → verify (signed) → `GET /exams/current`; then replay the verify call and the webhook in parallel and confirm exactly one grant and one email.

**Acceptance Scenarios**:

1. **Given** a candidate at `fee_pending`, **When** they create an order, **Then** a `payments` record is stored as `created` with the server-configured amount/currency, and the response carries what Checkout needs (order id, amount, currency, public key id) — any client-supplied amount is ignored/rejected.
2. **Given** an open unpaid order already exists for the candidate, **When** they create an order again, **Then** the same order is returned instead of creating a duplicate.
3. **Given** a correct checkout signature for the candidate's own order, **When** they call `payments/verify`, **Then** the API confirms the payment with the provider, marks it `paid`, sets the step to `exam_ready`, creates the exam attempt, queues the exam-link email and returns 200.
4. **Given** a forged or mismatched signature, an order belonging to another candidate, or an amount/currency/order mismatch, **When** verify is called, **Then** the API returns an error (400 or 404), grants nothing, and does **not** change the payment or candidate into a failed/blocked state.
5. **Given** the verify call and the `payment.captured` webhook arrive simultaneously, or either arrives twice, **When** both are processed, **Then** the payment becomes `paid` once, exactly one exam attempt exists and exactly one exam-link email is sent.
6. **Given** a webhook with an invalid signature, a missing signature, or a replayed event id, **When** it arrives, **Then** it is rejected (invalid/missing) or acknowledged without reprocessing (replay).
7. **Given** a `payment.failed` event, **When** it arrives for an open order, **Then** that payment becomes `failed`, the candidate stays at `fee_pending`, and they can pay again — the same order is reused while it is still payable, and a later success moves it to `paid`.
8. **Given** a late webhook arrives after the order had expired or after the payment was already `paid`, **When** processed, **Then** a late success completes an otherwise-unpaid candidate, and no event ever moves a `paid` payment backwards.
9. **Given** the exam provider is down at payment time, **When** the payment is confirmed, **Then** payment succeeds, the attempt stays `created`, `GET /exams/current` reports the link is being prepared, and a retry issues the link and sends the email without user action.
10. **Given** a candidate who has not paid, **When** they call `GET /exams/current`, **Then** they receive 422 `PAYMENT_REQUIRED` and no link.

---

### User Story 4 - Talent Acquisition is alerted and follows up on unpaid candidates (Priority: P2)

When a candidate registers, TA is notified immediately. If the candidate still has not paid 24 hours after registration, a single payment follow-up is created for TA — unless they paid in the meantime. Both survive restarts and never duplicate.

**Why this priority**: Core business goal (HLD §2) but built on top of P1 flows and a delivery channel that is still TBD, so it is isolated behind an adapter.

**Independent Test**: Register a candidate; advance the clock 24 h; run the worker: an unpaid candidate yields exactly one follow-up, a candidate who paid yields none; restart the worker mid-way and re-run: counts unchanged.

**Acceptance Scenarios**:

1. **Given** a queued registration notification, **When** the worker runs, **Then** the TA alert is delivered through the configured TA channel with only the minimum candidate fields, the notification is marked sent, and the lead moves from `new` to `queued`.
2. **Given** the TA channel fails transiently, **When** delivery is attempted, **Then** it is retried with exponential backoff up to the maximum, and a terminal failure is recorded and logged at error level.
3. **Given** a candidate still unpaid at registration + 24 h, **When** the follow-up job runs, **Then** exactly one TA follow-up exists for that candidate, enriched with their latest payment attempt (if any).
4. **Given** the candidate paid before the job runs, **When** it runs, **Then** it does nothing and no follow-up exists.
5. **Given** the job executes twice (retry, duplicate delivery, or restart), **When** processed, **Then** still exactly one follow-up exists.
6. **Given** the queue store's data is lost but the database survives, **When** the worker starts, **Then** the reconciler re-creates every due-but-missing job from the database records.

---

### User Story 5 - Exam completion, feedback and the result email (Priority: P2)

The exam provider reports (through an authenticated callback) that the candidate started and completed the exam. The candidate then submits feedback and sees a thank-you. Twenty-four hours after completion the finalized result is emailed; if the result is not final yet, the email waits and is retried.

**Why this priority**: Completes the candidate journey but depends on the unfinished exam-provider contract, so it is built against an adapter and a proposed signed-callback contract.

**Independent Test**: Seed a paid candidate with an issued attempt; post signed `attempt.completed` and `result.finalized` callbacks; submit feedback; advance the clock 24 h; run the worker: one result email, step `completed`.

**Acceptance Scenarios**:

1. **Given** a correctly signed, fresh, never-seen provider callback marking the attempt completed, **When** received, **Then** the attempt becomes `completed`, the candidate step becomes `exam_completed`, a result record is created (`pending`) and the result email is scheduled for completion + 24 h — once.
2. **Given** a callback with a bad signature, a timestamp outside the tolerance, or an already-processed event id, **When** received, **Then** it is rejected (401) or acknowledged as a duplicate without side effects.
3. **Given** the candidate's own browser calls `attempts/:id/complete`, **When** processed, **Then** the attempt is **not** marked officially completed; the API reconciles with the provider and reports the current status (202).
4. **Given** a completed attempt, **When** the owner submits valid feedback, **Then** it is stored (201), the step becomes `feedback_submitted`, and a second submission returns 409.
5. **Given** feedback for an attempt that is not completed, or for another candidate's attempt, **When** submitted, **Then** the API returns 422 or 404 respectively and stores nothing.
6. **Given** the result is finalized when the 24-hour job runs, **When** it runs, **Then** exactly one result email is sent, the result becomes `emailed`, and `GET /results/me` now returns the published result.
7. **Given** the result is *not* finalized at 24 h, **When** the job runs, **Then** nothing is sent, the job is rescheduled with bounded backoff, and after the maximum attempts the result is flagged for attention and an error-level alert is logged.
8. **Given** the job is retried after a successful send, **When** it runs again, **Then** no second email is sent.

---

### User Story 6 - TA/admin staff manage leads and follow-ups (Priority: P3)

Authorised TA and admin users search leads, open one, update assignment/contact status within allowed transitions, and list payment follow-ups. Every read of lead detail and every change is audit-logged.

**Why this priority**: Valuable operationally, but TA can initially work from the alert emails; the data is already captured by P1/P2.

**Independent Test**: Seed a `ta` user and leads; list with filters/pagination, change status along an allowed path and attempt a forbidden path; verify audit entries and that a candidate token gets 403.

**Acceptance Scenarios**:

1. **Given** a `ta` or `admin` user, **When** they list leads with pagination and filters, **Then** they receive a bounded page containing only the TA-visible fields.
2. **Given** a candidate-role user, **When** they call any `/admin/*` route, **Then** the API returns 403; an unauthenticated call returns 401.
3. **Given** a lead at `contacted`, **When** staff set it to `in_progress`, **Then** it is stored with actor and timestamp, and an audit entry records old/new status; an illegal jump (e.g. `new` → `resolved`) returns 422 and changes nothing.
4. **Given** staff open a lead, **When** the detail is returned, **Then** an access audit entry is written and no password hash, token or payment secret is included.
5. **Given** payment follow-ups exist, **When** staff list them, **Then** safe payment fields only are returned.
6. **Given** staff request an exam-link resend for a paid candidate, **When** processed, **Then** the current valid link is re-emailed (a fresh link is issued if the old attempt link is expired/invalidated) and the action is audited.

---

### User Story 7 - Maintainers cut over from the legacy API without losing data (Priority: P2)

Maintainers retire the old `/api/*` routes and code, and migrate existing candidates and payments into the new data model, so nothing paid is lost and the repository contains only the new architecture.

**Why this priority**: Explicitly requested ("clean older codes") and required to keep existing functionality safe; ordered after the new flows because it depends on them.

**Independent Test**: Run the migration in dry-run against a copy of production-shaped data: report lists every candidate with outcome; apply; re-run (no-op); confirm paid candidates retain paid status and an exam attempt; confirm legacy paths answer 410.

**Acceptance Scenarios**:

1. **Given** legacy candidate documents, **When** the migration runs in dry-run, **Then** nothing is written and a report lists, per candidate, the planned mapping or the reason it would be rejected.
2. **Given** `--apply`, **When** it runs, **Then** legacy `paid` candidates become paid candidates with a payment record and an exam attempt (link preserved), legacy `pending`/`failed` candidates land at `fee_pending`, phone numbers are normalised, unusable records go to a reject collection with a reason, and no candidate or payment is lost or duplicated.
3. **Given** the migration is run a second time, **When** it completes, **Then** it makes no changes.
4. **Given** a migrated candidate without a password, **When** they use OTP login or "forgot password", **Then** they can enter the new system.
5. **Given** a client still calls a retired legacy path, **When** the request arrives, **Then** it receives 410 `API_VERSION_RETIRED` with a pointer to the replacement, never a silent 404 or a half-working response.
6. **Given** the cutover is finished, **When** the repository is inspected, **Then** none of the legacy controllers, routes, models, admin-key middleware, unused dependencies or retired environment variables remain, and the README and `.env.example` describe only the new system.

### Edge Cases

**Identity and sessions**
- Email/phone differing only by case, spacing, `+91`/`0` prefix or Unicode look-alikes are treated as the same identity; two simultaneous registrations for the same identity create exactly one record (the loser gets 409).
- Passwords shorter than the minimum or longer than the maximum (to prevent hashing abuse) are rejected; a password equal to the candidate's email, phone or name is rejected.
- `acceptTerms: false` or missing → 400; the acceptance time is recorded when true.
- OTP: expired, wrong, already consumed, too many wrong attempts (challenge locked), resend before cooldown, request flood per number/IP, concurrent verify of the same code (only one succeeds), challenge id belonging to a different phone.
- Refresh-credential replay (rotated or revoked), logout while a request is in flight, password reset while other devices are signed in (all revoked), access credential presented after its session was revoked.
- Disabled account attempting login/OTP/refresh → same generic failure, never a distinguishable error.
- Login brute force against one identifier from many IPs, and one IP against many identifiers: both throttled.

**Payments**
- Verify before webhook, webhook before verify, duplicate webhook, webhook for an unknown order (acknowledged, logged, not retried forever), webhook for an order of an already-paid candidate (duplicate payment: recorded and flagged, no second grant).
- Amount or currency differs between the provider's payment and the stored order (rejected and flagged); the configured fee changed after an order was created (stale open order is superseded by a new one).
- Provider lookup unreachable during verify → 503 `PROVIDER_UNAVAILABLE` (retryable) without marking failure; the webhook finishes the job.
- Candidate double-clicks "Pay" (idempotent order reuse); order expires then pays late (accepted, paid wins); refund event arrives (recorded; access is not auto-revoked, staff review flag set).
- Payment attempts logged for audit never contain signatures, secrets or card data.

**Exam, feedback, result**
- Provider callback out of order (completed before started, result before completion) or duplicated: state only moves forward, side effects fire once.
- Callback for an unknown attempt (acknowledged with a warning log), clock skew beyond tolerance (rejected), replayed signed body (rejected by event id).
- Candidate asks for the exam link while the provider is still preparing it; link already expired/invalidated; attempt `abandoned`/`invalidated`.
- Feedback with out-of-range rating, oversized comments, wrong attempt owner, not completed, duplicate submission.
- Result finalized *before* the 24-hour mark (email still waits for the mark), finalized *after* it (email sent on the next retry), never finalized (attention flag after bounded retries), re-finalized with changed values (new version, one email per version per policy — see D-8).

**Jobs, notifications, infrastructure**
- Process killed between database commit and queue enqueue (reconciler recovers it); queue flushed (reconciler recovers); API running while worker is down (work waits, nothing lost); two workers racing (idempotency keys prevent duplicates).
- Email provider returns transient vs permanent errors (retry vs terminal); notification to a bounced/invalid address; TA channel misconfigured.
- Database down: readiness fails (503), liveness stays healthy. Queue store down: readiness fails once the worker is enabled; the API still serves endpoints that do not need the queue and recorded work is picked up later.
- Malformed JSON, wrong content type, oversized body, unknown route, unsupported method, CORS pre-flight from a non-allow-listed origin.
- Requests behind a proxy: client IP for rate limiting taken only from the configured trusted proxy hops.

**Staff**
- Paginated list with page beyond the end, page size over the cap, unknown filter keys, invalid date ranges (all → 400); two staff updating the same lead concurrently (second gets 409/422 on a stale transition).

## Requirements *(mandatory)*

### Functional Requirements

**Platform and contract**

- **FR-001**: All business endpoints MUST be served under `/api/v1`; only `/health/*` and `/api-docs*` are served outside the version prefix (`LLD §1`).
- **FR-002**: Requests and responses MUST be JSON (`application/json`); other content types MUST be rejected with 415. Request bodies MUST be size-limited (default 100 KB; 1 MB for provider webhook/callback routes).
- **FR-003**: Every success response MUST be `{ "data": …, "meta": { "requestId": … } }` and every error `{ "error": { "code", "message", "details" }, "meta": { "requestId": … } }` (`LLD §6`). This replaces the legacy `{ success, data, error }` envelope.
- **FR-004**: Status codes MUST follow `LLD §6`: 400 malformed/invalid input, 401 unauthenticated, 403 insufficient permission, 404 missing (or not owned), 409 conflict, 422 valid input but invalid workflow state, 429 rate limited, 500 unexpected; plus 415 unsupported media type and 503 dependency unavailable.
- **FR-005**: Errors MUST carry a stable machine-readable `code` from the published catalogue in [contracts/rest-api-v1.md](contracts/rest-api-v1.md#error-code-catalogue); `message` is human-readable and never contains internals.
- **FR-006**: Every request MUST have a correlation/request ID: a well-formed inbound `X-Request-Id` is reused, otherwise one is generated; it is returned in the `X-Request-Id` header and `meta.requestId` and attached to every log line of that request.
- **FR-007**: Request bodies, path parameters and query strings MUST be validated against strict schemas; unknown properties are rejected; validation errors list per-field problems in `details`.
- **FR-008**: Responses MUST be built from DTOs. Password hashes, token/OTP hashes, provider signatures, provider secrets, raw provider payloads, internal flags and database metadata MUST never be serialised.
- **FR-009**: Unexpected failures MUST return a generic 500 with the request ID and no stack trace, driver message or internal detail.
- **FR-010**: Timestamps MUST be ISO-8601 UTC strings; identifiers MUST be strings; money MUST be integer minor units with an ISO currency code.
- **FR-011**: `GET /health/live` (process alive) and `GET /health/ready` (database reachable, plus queue when enabled → 503 otherwise) MUST exist; `GET /health` MUST remain as a liveness alias for existing uptime monitors.
- **FR-012**: Security headers MUST be set on all responses. CORS MUST allow only configured origins; a wildcard origin MUST be refused at start-up in production.
- **FR-013**: Rate limiting MUST apply, with distinct limits, to registration, login, OTP request, OTP verification, password forgot/reset, payment endpoints and a global per-client ceiling; breaches return 429 with `Retry-After` (default limits in the plan).
- **FR-014**: Logs MUST be structured, carry the request ID and relevant business IDs, and redact authorization headers, cookies, passwords, OTPs, tokens, signatures and raw provider payloads.
- **FR-015**: An OpenAPI document MUST be served at `/api-docs.json` with an interactive viewer at `/api-docs`, generated from the request/response schemas used for validation; an automated contract check MUST fail when a route and its documentation diverge (`LLD §11`).
- **FR-016**: Configuration MUST be validated at start-up with clear errors for missing/invalid values, and production MUST refuse unsafe settings (wildcard CORS, stub providers, short signing secrets, missing webhook secret).
- **FR-017**: On termination signals the API and worker MUST stop accepting work, finish in-flight work within a bounded time, and close database/queue connections cleanly.
- **FR-018**: Unknown routes and malformed JSON MUST return the standard error envelope (404 / 400), not framework default pages.

**Identity and sessions**

- **FR-020**: `POST /auth/register` MUST accept `fullName`, `email`, `phone`, `password`, `acceptTerms` (must be `true`) and the optional profile fields `college`, `place`, `city`, `state`, `pincode` retained from the existing registration form (D-9).
- **FR-021**: Email MUST be normalised (trimmed, lower-cased, Unicode-normalised) and phone MUST be normalised to E.164 (national numbers interpreted in the configured default region, India by default) before validation of uniqueness and before storage.
- **FR-022**: Email and phone are both mandatory and each MUST be unique among accounts; uniqueness MUST be enforced by the database so concurrent registrations cannot both succeed. A duplicate returns 409 `CONFLICT` with a message that does not say which field matched (D-10).
- **FR-023**: Passwords MUST be 8–128 characters, MUST NOT equal the account's email, phone or name, and MUST be stored only as a salted memory-hard hash; plaintext passwords are never stored, logged or recoverable.
- **FR-024**: Registration MUST, as one durable unit, create the candidate at onboarding step `demo_pending`, create exactly one TA lead of type `registration` (status `new`), and record one queued TA-alert notification (outbox) keyed `ta-registration:{candidateId}`.
- **FR-025**: Registration MUST respond 201 with the candidate DTO and `nextStep`; it does not issue session credentials (`LLD §5.1`).
- **FR-026**: Registration MUST NOT fail or roll back because the TA channel, email provider or queue is unavailable; delivery happens later from the recorded notification.
- **FR-027**: `POST /auth/login` MUST accept `emailOrPhone` and `password`, return a session on success, and return an identical 401 `INVALID_CREDENTIALS` for unknown identity, wrong password or disabled account, with work-factor-equalised timing.
- **FR-028**: `POST /auth/otp/request` MUST return 202 with `challengeId`, `expiresAt` and `resendAvailableAt` for any well-formed phone; it MUST enforce a resend cooldown and per-number and per-IP limits; codes are 6 digits, expire in 5 minutes by default, and are stored only as hashes; no code is sent for an unregistered or disabled phone.
- **FR-029**: `POST /auth/otp/verify` MUST validate `phoneE164`, `challengeId` and `otp`, allow at most 5 attempts per challenge, consume the code on success (single use), and return a session; every failure mode returns the same 401 `INVALID_OTP`.
- **FR-030**: Sessions MUST consist of a short-lived access credential (default 15 minutes) bound to a server-side session, and a rotating refresh credential (default 30 days). Revoking a session (logout, password reset, refresh-replay) MUST invalidate its access credential immediately, not at expiry.
- **FR-031**: `POST /auth/refresh` MUST exchange a valid refresh credential for a new pair and invalidate the presented one; presenting an already-rotated credential MUST revoke the whole session. Only hashes of refresh credentials are stored.
- **FR-032**: `POST /auth/logout` MUST revoke the caller's session and return 204, also when repeated.
- **FR-033**: `POST /auth/password/forgot` MUST always return 202; for a registered email it emails a single-use reset token valid for 60 minutes (only its hash is stored), rate-limited per email and IP.
- **FR-034**: `POST /auth/password/reset` MUST accept `resetToken` and `newPassword`, apply FR-023, consume the token, revoke all sessions of the account and return 204; expired, used or unknown tokens return a generic 400 `INVALID_RESET_TOKEN`.
- **FR-035**: Accounts have a `status` (`active`, `disabled`); disabled accounts cannot obtain or use sessions.
- **FR-036**: Roles are `candidate`, `ta`, `admin`, stored on the account and never settable through any public or candidate API. Staff accounts are created out-of-band by a seeding command (FR-124).

**Candidate profile and onboarding**

- **FR-040**: `GET /candidates/me` MUST return only the authenticated candidate's own record as a DTO.
- **FR-041**: `PATCH /candidates/me` MUST accept only the allow-listed profile fields (`fullName`, `college`, `place`, `city`, `state`, `pincode`); any other property (role, status, onboarding step, verification, payment or result fields, email, phone) is rejected with 400. Email/phone change is out of scope for v1.
- **FR-042**: `GET /onboarding/status` MUST return the server-held `onboardingStep`, the next required action, and brief payment and exam summaries so a client can resume after login.
- **FR-043**: `POST /onboarding/demo/complete` MUST move `demo_pending` → `fee_pending` and record `demoCompletedAt`.
- **FR-044**: `POST /onboarding/demo/skip` MUST move `demo_pending` → `fee_pending` identically and record `demoSkippedAt`.
- **FR-045**: FR-043/FR-044 MUST be idempotent: called at `fee_pending` or any later step they return 200 with the current status and change nothing.
- **FR-046**: Onboarding steps (`registered → demo_pending → fee_pending → exam_ready → exam_in_progress → exam_completed → feedback_submitted → completed`) are server-owned and monotonic; every transition is performed atomically against the expected prior step and illegal requests return 422 `WORKFLOW_STATE_INVALID`.
- **FR-047**: Step `completed` is reached when feedback has been submitted **and** the result email has been sent, whichever happens last (D-11).

**Payments**

- **FR-050**: `POST /payments/orders` MUST require an authenticated candidate at `fee_pending`; the body carries no amount/currency (they come from server configuration); a candidate already `paid` receives 409 `PAYMENT_ALREADY_COMPLETED`; other steps receive 422.
- **FR-051**: If the candidate has an open (`created`, `pending` or `failed`), unexpired order with the current fee and currency, that order MUST be returned; an open order created under a different fee/currency MUST be set `cancelled` and replaced.
- **FR-052**: Open orders MUST expire after a configured period (default 60 minutes) to `expired`; a verified success arriving later MUST still be honoured (provider-verified paid state wins).
- **FR-053**: Payment states are `created → pending → paid | failed | cancelled | expired | refunded` with these triggers: `pending` when a checkout attempt is reported (verify call or `payment.authorized`); `paid` only through FR-054/FR-057; `failed` via the `payment.failed` event (it records the latest attempt's failure — the order stays payable until it expires, and a later verified success moves it to `paid`); `expired`/`cancelled` per FR-051/FR-052; `refunded` only via a verified refund event. `paid` never regresses except to `refunded`.
- **FR-054**: `POST /payments/verify` MUST (1) require the order to belong to the caller (otherwise 404), (2) verify the Checkout signature with a constant-time comparison, (3) fetch the payment from the provider and confirm captured status, order id, amount and currency, (4) atomically claim the `paid` transition, and (5) be idempotent — a repeat on a paid payment returns the same 200 result without repeating side effects.
- **FR-055**: A failed or suspicious verification (bad signature, mismatch, wrong owner) MUST return an error and record an audit entry, but MUST NOT set the payment or candidate to a failed/blocked state (the legacy behaviour allowed anyone to flip a candidate to `failed`).
- **FR-056**: `POST /payments/webhook` MUST verify the provider signature over the raw request bytes before parsing, reject missing/invalid signatures (400), de-duplicate by provider event ID, acknowledge promptly (2xx) after durable recording, and acknowledge-and-ignore unsupported events.
- **FR-057**: The webhook MUST handle at least `payment.authorized`, `payment.captured`, `order.paid`, `payment.failed` and refund events and apply them through the same guarded transitions as FR-054.
- **FR-058**: The first transition to `paid` MUST, exactly once and regardless of which path (verify/webhook) wins: move the candidate to `exam_ready`, create the exam attempt (FR-070), queue the exam-link email, and suppress any pending unpaid follow-up.
- **FR-059**: A second successful payment for an already-paid candidate MUST be stored, flagged `duplicate`, logged at warning level, and produce no second grant or email.
- **FR-060**: `GET /payments/me` MUST return the caller's payments as safe DTOs (id, status, amount, currency, order id for checkout resume, timestamps) — never signatures or secrets.
- **FR-061**: If the provider cannot be reached while verifying, the API MUST return 503 `PROVIDER_UNAVAILABLE` (retryable) and leave state unchanged; the webhook remains the completion path.
- **FR-062**: The fee is configured in minor units (default 50000 = INR 500.00, matching the current setting) with currency INR.
- **FR-063**: Refunds are not initiated by the API; a verified refund event sets `refunded`, flags the candidate for staff review, and does not automatically revoke exam access.
- **FR-064**: Each verification attempt MUST be recorded (outcome, reason code, timestamp, candidate, payment id) without storing signatures or secrets.

**Exams**

- **FR-070**: On first `paid`, the API MUST create an exam attempt (`created`), call the exam-provider adapter to obtain the external attempt id and approved exam URL, and move the attempt to `link_issued`. Adapter failure MUST NOT fail the payment; the attempt stays `created` and a retried job completes it (bounded backoff, then alert).
- **FR-071**: The exam-link email MUST be sent once per attempt (idempotency key), to the candidate's registered email, and contain the approved link and a payment receipt equivalent to today's acknowledgement.
- **FR-072**: `GET /exams/current` MUST require authentication and `paid` status (422 `PAYMENT_REQUIRED` otherwise) and return the attempt status plus the approved URL only when one has been issued; while `created` it reports that the link is being prepared.
- **FR-073**: `POST /exams/provider-callback` MUST authenticate the provider with a signature over timestamp + raw body, reject timestamps outside ±5 minutes, and reject replayed event IDs (contract in [contracts/exam-provider.md](contracts/exam-provider.md)). No end-user credential is accepted on this route.
- **FR-074**: Provider events (`attempt.started`, `attempt.completed`, `attempt.abandoned`, `attempt.invalidated`, `result.updated`, `result.finalized`) MUST be applied idempotently and monotonically; out-of-order or duplicate events never regress state or repeat side effects; unknown attempts are acknowledged with a warning log.
- **FR-075**: `POST /exams/attempts/:id/complete` MUST NOT mark official completion from the client's word; it records the report, asks the adapter for the provider's status, applies any confirmation through FR-074 and returns 202 with the current status. Non-owner → 404.
- **FR-076**: Attempt states are `created → link_issued → in_progress → completed | abandoned | invalidated`; `completed`, `abandoned`, `invalidated` are terminal.
- **FR-077**: The API MUST only ever hand out URLs produced by the exam-provider adapter for that candidate's attempt — never a client-supplied URL.
- **FR-078**: `POST /admin/candidates/:id/exam-link/resend` (staff; extension preserving today's admin "reset exam access") MUST re-email the current valid link for a paid candidate, requesting a fresh link from the adapter (and invalidating the old attempt link) when it is expired or invalidated; the action is audited.
- **FR-079**: The exam provider MUST be accessed only through a port with at least `createAttempt` and `fetchAttemptStatus`; a development stub adapter exists but is rejected in production (FR-016). The first real adapter targets the existing exam backend contract (`contracts/exam-provider.md`).

**Feedback and results**

- **FR-080**: `POST /exams/attempts/:id/feedback` MUST require the owner and a `completed` attempt, validate `rating` (integer 1–5), `answers` (bounded list of question-id/value pairs) and `comments` (≤ 2000 characters), store the feedback and move the step to `feedback_submitted`.
- **FR-081**: Exactly one feedback submission per attempt is accepted; a repeat returns 409 `FEEDBACK_ALREADY_SUBMITTED` (D-12).
- **FR-082**: When an attempt becomes `completed`, a result record (`pending`) MUST be created and the result email scheduled for `completedAt + 24 h` exactly once (one result per attempt).
- **FR-083**: Result states are `pending → processing → finalized → email_scheduled → emailed`; `finalized` requires score and outcome from the provider; if finalization happens before the 24-hour mark the state becomes `email_scheduled`.
- **FR-084**: The result-email job MUST re-read the result, send only if finalized and not already emailed (idempotency key per result version), and mark `emailed` with the send time.
- **FR-085**: If the result is not finalized when due, the job MUST reschedule with bounded backoff (default 1 h, 2 h, 4 h, 8 h, then 12 h; max 10 attempts or 7 days), after which the result is flagged `needs_attention` and an error-level alert is logged; staff can re-trigger by re-queuing (runbook).
- **FR-086**: `GET /results/me` MUST return only the caller's result: `status` always; `score`, `outcome`, `finalizedAt`, `publishedAt` only once published — results are published when the result email is sent so the API and the email never disagree (D-8).

**Talent Acquisition and notifications**

- **FR-090**: A TA lead is created for every registration (FR-024) with source `web`/`mobile`/`legacy_import`; at most one lead per candidate per lead type.
- **FR-091**: TA alerts MUST be delivered through a TA-delivery port; the default adapter emails the configured TA mailbox list, and the payload contains only: candidate id, full name, email, phone, registration time, lead type and (for follow-ups) payment status and latest attempt time.
- **FR-092**: Every outbound message MUST have a notification record (type, channel, status, attempts, unique idempotency key, scheduled/sent times, provider message id, last error code). Message bodies containing secrets (e.g. reset links) are not stored.
- **FR-093**: Transient delivery failures MUST be retried with exponential backoff (default max 5 attempts); permanent failures and exhausted retries set the notification to `failed`, log at error level, and never block the originating workflow.
- **FR-094**: At registration the system MUST record one follow-up in state `scheduled` (unique key `unpaid-24h:{candidateId}`) due at `registeredAt + 24 h` (configurable; D-4) and schedule its job; being a database record, it is what the reconciler (FR-111) uses to recover the job.
- **FR-095**: When due, the job MUST re-read the candidate's payment state: if `paid`, mark the follow-up `cancelled` and do nothing else; otherwise activate that same follow-up to `open` (attaching the latest payment attempt if any) and alert TA; re-execution never creates a second follow-up or a second alert. Staff-facing lists (FR-099) show only activated follow-ups.
- **FR-096**: `GET /admin/ta-leads` MUST support pagination (`page`, `pageSize` default 20 / max 100), sorting, and filters (`status`, `assignedTo`, `createdFrom`, `createdTo`, free-text `q` on name/email/phone); invalid or unknown parameters return 400.
- **FR-097**: `GET /admin/ta-leads/:id` MUST return least-privilege lead detail and write an access audit entry.
- **FR-098**: `PATCH /admin/ta-leads/:id` MUST allow only assignment, contact/next-action fields, notes and status, validate transitions (`new → queued → assigned → contacted → in_progress → resolved | closed`: one step forward at a time, `resolved` only from `in_progress`, `closed` from any non-terminal state, `resolved`/`closed` terminal), reject illegal transitions with 422 and stale concurrent updates with 409, and record actor and timestamp.
- **FR-099**: `GET /admin/payments/pending-follow-up` MUST list follow-ups (filter by status, due date; paginated) with safe payment fields only.
- **FR-100**: Role matrix: `candidate` → own-data endpoints only; `ta` → leads, follow-ups; `admin` → everything `ta` has plus exam-link resend; unauthenticated → public endpoints only. Violations return 401/403.
- **FR-101**: Audit entries (actor, role, action, entity, before/after for status fields, request ID, time) MUST be written for lead reads of detail, lead changes, follow-up changes and staff exam-link resends, and for suspicious payment verifications.
- **FR-102**: Candidate PII exposed to staff MUST be limited to the fields in the admin DTOs; password hashes, token hashes and payment credentials are never exposed.

**Background processing**

- **FR-110**: Delayed/retried work MUST be persisted durably in the queue **and** be derivable from database records (`scheduledAt`/`dueAt`), so business-critical work survives restarts and queue loss.
- **FR-111**: A reconciler MUST run at worker start-up and periodically (default every 5 minutes) to re-enqueue any due or overdue database records that have no live job.
- **FR-112**: Every job MUST have a deterministic ID derived from its business key so duplicate scheduling collapses, and handlers MUST be idempotent and re-read current state before acting.
- **FR-113**: Jobs MUST retry with bounded exponential backoff; exhausted jobs remain inspectable and raise an error-level event with the job ID and business IDs.
- **FR-114**: The worker MUST be a separately started process from the API using the same codebase and configuration; the API MUST function (and record work) when the worker is down.
- **FR-115**: The job catalogue is: `candidate-registration-ta-notify`, `unpaid-payment-follow-up`, `exam-result-email`, `notification-retry`, `exam-link-issue` (detailed in [contracts/background-jobs.md](contracts/background-jobs.md)).
- **FR-116**: All time-based rules (24 h follow-up, 24 h result email, expiries, cooldowns) MUST read time from one injectable source so automated tests can advance time without waiting.

**Operations and environment**

- **FR-120**: One documented command MUST start the full local stack (API, database, queue store, worker) in containers; the API reaches the database by its service name, binds all interfaces inside the container, and published host ports bind to `127.0.0.1`.
- **FR-121**: Database data MUST persist across container restarts and recreation via a named volume.
- **FR-122**: `.env` is local and untracked; `.env.example` is committed and lists every variable with safe placeholder values; secrets never appear in images or the repository.
- **FR-123**: The production image MUST run as a non-root user from a pinned base image and contain no `.env` or dev dependencies.
- **FR-124**: A seeding command MUST create or update a staff account (`ta`/`admin`) from CLI arguments/prompt without echoing the password; there is no HTTP path to create staff.
- **FR-125**: Ephemeral data MUST expire automatically: OTP challenges (shortly after expiry), reset tokens, expired/revoked sessions (30 days after expiry), provider event records (90 days).
- **FR-126**: The lockfile MUST be committed and a dependency vulnerability audit MUST be part of the quality gate (report-only initially, failing on high severity).

**Testing**

- **FR-130**: Automated tests MUST exist at the levels in `LLD §11` — unit, integration, contract, end-to-end, failure-path and security — each covering the items listed there.
- **FR-131**: The failure-path suite MUST include every scenario named in `LLD §11`: duplicate registration, invalid OTP, expired OTP, payment cancelled, duplicate webhook, late webhook, job retry, email provider failure, result not finalized at 24 hours.
- **FR-132**: The security suite MUST cover authorization and IDOR on every owner-scoped route, role separation for staff routes, rate limits, CORS, validation/mass-assignment, secret and PII leakage in responses and logs, signature and replay checks.
- **FR-133**: The suite MUST run offline and deterministically using fakes at every external adapter; no test may require real Razorpay, email, SMS or exam-provider access.
- **FR-134**: Business-logic modules (state machines, services, guards) MUST reach at least 90% line and 85% branch coverage; the whole project at least 80% lines.
- **FR-135**: Package scripts MUST provide `typecheck`, `lint`, `test`, `test:unit`, `test:integration`, `test:contract`, `test:e2e` and a single `verify` gate that runs them.

**Legacy retirement and migration**

- **FR-140**: Before any deletion, the current commit MUST be tagged (`legacy-backend-baseline`) so the old implementation remains retrievable.
- **FR-141**: All superseded code MUST be removed: legacy controllers, routes, the old `Candidate` model, the admin-API-key middleware, the arbitrary email-send API, the one-time magic-link token flow, the Payment Link flow, the old Swagger JSDoc blocks, the global DNS override, unused or replaced dependencies (`sib-api-v3-sdk`, `morgan`, `swagger-jsdoc`, `ts-node-dev`), obsolete environment variables and the stale `dist/` output (inventory in [contracts/legacy-mapping.md](contracts/legacy-mapping.md)).
- **FR-142**: Each legacy behaviour MUST appear in the mapping with its v1 replacement or an explicit "retired — reason", and each mapped behaviour MUST be covered by at least one test.
- **FR-143**: A migration command MUST convert legacy candidate documents in place to the new model (field renames, phone normalisation, status mapping, payment and exam-attempt creation for paid candidates, lead creation without notifying), defaulting to dry-run, requiring `--apply` to write, idempotent, writing a per-record report, and quarantining unusable records with a reason.
- **FR-144**: Migration MUST NOT delete legacy fields or indexes in the apply step; a separate explicit `--finalize` step removes them after verification. A backup instruction is printed and documented.
- **FR-145**: Retired legacy paths MUST answer 410 `API_VERSION_RETIRED` naming the replacement route, for a configurable sunset window, then be removable by deleting one module.
- **FR-146**: `README.md` and `.env.example` MUST be rewritten for the new system (endpoints, setup, scripts, variables); removed variables are listed in the legacy mapping.
- **FR-147**: Existing capabilities that MUST be preserved: optional profile fields (college, place, city, state, pincode); fee from configuration in minor units with default 50000; receipt-plus-exam-link email content; verify-vs-webhook race safety; constant-time signature comparison; multi-origin CORS; interactive API docs; health endpoint; Brevo as the email provider; the existing exam backend as the first exam adapter.

### Key Entities *(include if feature involves data)*

- **Candidate (account)**: the person using web/mobile; identity (normalised email, E.164 phone), credentials (password hash), role (`candidate`/`ta`/`admin`), account status, profile fields, onboarding step, key timestamps (registered, terms accepted, demo completed/skipped). Staff accounts share this entity with a different role.
- **Auth session / refresh credential**: a signed-in device session with hashed rotating refresh credential, expiry and revocation state.
- **OTP challenge**: a pending mobile sign-in code (hashed), purpose, expiry, attempt count, consumption.
- **Password reset token**: single-use expiring token (hashed) for one account.
- **Payment**: one checkout attempt for the registration fee — provider order/payment ids, amount, currency, state, verification time, flags (`duplicate`, `requiresReview`).
- **Provider event**: a received webhook/callback identity (provider, event id, type, received/processed times) used for replay and duplicate protection.
- **Exam attempt**: the candidate's exam instance — provider, external attempt id, approved exam URL, state, started/completed times, result status.
- **Feedback**: the candidate's single post-exam submission per attempt — rating, answers, comments.
- **Result**: outcome of an attempt — score, outcome, finalization/publication times, email schedule and send state, retry bookkeeping.
- **Notification**: one outbound message with channel, status, attempts, idempotency key and delivery metadata.
- **TA lead**: a sales/outreach record for a candidate — type, status, assignee, contact history, notes.
- **TA follow-up**: the payment follow-up for an unpaid candidate — due time, status, assignee, outcome, linked payment.
- **Audit entry**: immutable record of staff actions and security-relevant events.

State models, fields, indexes and relationships are specified in [data-model.md](data-model.md).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new candidate can register and sign in using two requests, and all auth, onboarding and profile reads/writes respond in under 500 ms for 95% of requests at 100 concurrent candidates.
- **SC-002**: Across the automated payment-security suite (forged, replayed, mismatched, cross-candidate and unsigned confirmations), 0 attempts result in exam access; exam access exists only for candidates whose payment was provider-verified.
- **SC-003**: In 100 repeated trials where verification and the webhook are processed concurrently for the same payment, exactly 1 payment transition, 1 exam attempt and 1 exam-link email result every time.
- **SC-004**: After the API and worker are killed and restarted at any point, 100% of seeded due follow-ups and result emails (at least 100 of each) are completed exactly once within 5 minutes of recovery, including when the queue store was wiped.
- **SC-005**: When the TA channel is healthy, 95% of registrations produce a delivered TA alert within 60 seconds.
- **SC-006**: Every unpaid candidate has exactly one follow-up created within 15 minutes after their 24-hour mark; paid candidates have none; no duplicates over 1,000 simulated runs including retries.
- **SC-007**: Result emails go out within 15 minutes of the later of the 24-hour mark and result finalization for 99% of results; none are sent twice or before finalization.
- **SC-008**: Automated scans of all responses and captured logs from the security suite find zero occurrences of passwords, OTPs, tokens, signatures or secrets.
- **SC-009**: A developer with the documented prerequisites installed can bring up the full stack with one command in under 10 minutes on a clean machine, and data survives a restart.
- **SC-010**: Migration of the legacy dataset accounts for 100% of candidates (migrated or listed with a reason), loses 0 paid candidates, and a second run changes 0 records.
- **SC-011**: 100% of the failure-path scenarios in `LLD §11` are automated and pass; coverage meets FR-134.
- **SC-012**: The same published API document is used by web and mobile with no client-specific branches; a contract check passes for every route and fails the build if a route is undocumented.
- **SC-013**: After cutover, a repository search finds none of the legacy artefacts listed in the legacy mapping inventory.

## Assumptions

Where the HLD/LLD mark a decision as TBD, this specification fixes a safe, configurable default so that work can proceed. Each is isolated behind configuration or an adapter and can be changed without reworking other modules. **Decisions D-1 to D-12 are flagged for stakeholder confirmation** (they are the `LLD §12` "decisions required before production" plus gaps found during analysis).

- **D-1 Exam provider and completion reporting** (`HLD §3`, `LLD §12`): the first adapter targets the existing exam backend's link-creation contract (`POST {EXAM_API_URL}/api/exam-access`, server-to-server key). Completion/result events use the signed-callback contract proposed in [contracts/exam-provider.md](contracts/exam-provider.md); it must be agreed with the exam-provider owner before production, and polling (`fetchAttemptStatus`) is the fallback.
- **D-2 Email provider**: Brevo (already in use) behind an email port, with the existing HTML-template approach retained and HTML-escaping of all variables.
- **D-3 OTP/SMS provider**: undecided; v1 ships the OTP port with a log-only development sender (rejected in production). A real SMS adapter is a pre-production task. OTP login can be disabled by configuration until then.
- **D-4 24-hour follow-up timer origin** (`LLD §12`): `registeredAt + 24 h`, configurable. Chosen because it is deterministic, covers candidates who never open checkout, and needs exactly one job per candidate; the latest payment attempt is attached for context.
- **D-5 Result finalization**: a result is finalized when the exam provider reports final score and outcome; no internal review step in v1.
- **D-6 Staff accounts**: stored on the same account entity with a `role`, created only by the seeding command; no self-service staff creation.
- **D-7 Existing data**: assumed to include real paid candidates, so it is migrated rather than dropped. If the database holds only test data, the migration may be skipped and the collection dropped.
- **D-8 Result visibility**: results become visible via the API when the result email is sent. A re-finalized result is a new version and triggers one additional email only if values changed.
- **D-9 Registration profile fields**: `college`, `place`, `city`, `state`, `pincode` stay optional on registration and editable via profile update, to preserve the existing form and data (the LLD request lists only five fields).
- **D-10 Registration duplicate disclosure**: registration returns 409 on duplicates (LLD failure-path; existing behaviour) with a non-specific message and rate limiting; this is the single accepted exception to account non-enumeration.
- **D-11 Completion**: `completed` requires both feedback and result email; a candidate who never submits feedback remains at `exam_completed`.
- **D-12 One feedback per attempt** (LLD allowed "one submission or versioning").
- **Fee, refunds, duplicates** (`LLD §12`): fee INR 500.00 default from configuration; refunds are recorded not initiated; duplicate payments are flagged for manual reconciliation (no automated refund).
- **Retention/privacy**: only ephemeral data auto-expires in v1; a retention and consent policy for candidate data is a pre-production business decision. TA receives the minimum fields in FR-091.
- **Sessions and clients**: credentials are returned in the response body for both clients; the web app's cookie handling and the mobile secure-storage guidance are documented separately by those teams (`LLD §9`).
- **Payment flow change**: the hosted Payment Link redirect used by the current web app is replaced by the Orders + Checkout flow defined in the LLD (`LLD §5.3`, §8). The web client must adopt it (frontend branch, separate spec).
- **Exam magic link**: the current one-time "magic link" redemption page is retired; exam access is gated by an authenticated, server-verified `GET /exams/current` and by whatever expiry/one-time semantics the exam provider applies to its links.
- **Platform**: Node.js 22+, MongoDB without multi-document transactions (state guards are single-document atomic updates), Redis available wherever the worker runs, Docker Desktop for local development (`LLD §10`).
- **Dependencies on other teams/systems**: Razorpay account (test and live keys, webhook secret), Brevo account and sender identity, exam-provider contract sign-off, SMS provider selection, TA mailbox list, frontend/mobile adoption of the v1 contract.

## Traceability to the design documents

| Source | Requirement coverage |
|--------|----------------------|
| HLD §2 goals: register/auth (email+password or OTP) | FR-020–FR-036, US1 |
| HLD §2: demo video with skip | FR-042–FR-047, US2 |
| HLD §2/§7.2: Razorpay fee, access only after verified payment, email + redirect | FR-050–FR-064, FR-070–FR-072, US3 |
| HLD §2/§7.1: TA notified at registration; 24 h unpaid follow-up | FR-024, FR-090–FR-095, US4 |
| HLD §2/§7.3: feedback, thank-you, result email at 24 h | FR-080–FR-086, US5 |
| HLD §2: versioned REST API for web and mobile | FR-001–FR-005, FR-015 |
| HLD §4/§10: idempotency, durable jobs, observability | FR-110–FR-116, FR-006, FR-011, FR-014 |
| HLD §8, LLD §10: Docker, secrets, non-root image | FR-120–FR-123, FR-016 |
| HLD §9, LLD §9: security and privacy | FR-008, FR-012–FR-014, FR-021–FR-034, FR-056, FR-100–FR-102 |
| LLD §3–§4: data model and state machines | [data-model.md](data-model.md), FR-046, FR-053, FR-076, FR-083, FR-098 |
| LLD §5: API contracts | [contracts/rest-api-v1.md](contracts/rest-api-v1.md) |
| LLD §6: envelope and status codes | FR-003, FR-004 |
| LLD §7–§8: jobs and payment sequence | FR-054–FR-058, FR-110–FR-115, [contracts/background-jobs.md](contracts/background-jobs.md) |
| LLD §11: testing strategy | FR-130–FR-135 |
| LLD §12: decisions required | Assumptions D-1–D-12 |
| LLD §13: milestones | tasks.md phase order |
| Existing code (functionality to keep) | FR-147, FR-140–FR-146, US7 |
