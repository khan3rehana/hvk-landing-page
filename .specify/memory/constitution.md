# HVK Candidate Platform API Constitution

## Core Principles

### I. Backend Is the Source of Truth (NON-NEGOTIABLE)

The API is the only authority for identity, authorization, payment verification, workflow status and
notification scheduling. Web and mobile clients MUST NOT be able to grant themselves any state: a browser
redirect, a client-reported "payment success", or a client-reported "exam completed" is never evidence on its own.
Only a server-verified provider fact (verified Razorpay signature plus provider lookup or webhook; an authenticated
exam-provider callback) may move a payment to `paid` or an exam attempt to `completed`. Business rules MUST live in
the API and MUST NOT be duplicated in clients.

### II. One Versioned Contract for Every Client

Every business endpoint MUST live under `/api/v1` and be shared unchanged by the web and mobile clients. There are no
client-specific code paths in business logic. Success and error responses MUST use the standard envelope
(`{ data, meta }` / `{ error, meta }`) with the status-code semantics defined in the LLD. The published OpenAPI document
MUST be generated from the same schemas that validate requests, so documentation cannot drift from behaviour. A
breaking contract change requires a new API version (or a MAJOR constitution amendment while v1 is unreleased).

### III. Durable, Idempotent Workflows

Every state change that matters (payment, exam attempt, result, TA lead, notification) MUST be a guarded, monotonic
transition performed atomically (conditional update on the expected prior state); a late or duplicate event MUST NOT
regress state or repeat a side effect. Delayed or retried work (24-hour follow-ups, result emails, notification retries)
MUST be persisted — in the queue and represented in MongoDB — and MUST survive process restarts; in-process timers
(`setTimeout`/`setInterval`) MUST NOT carry business-critical work. Every side effect (email, TA alert, exam grant) MUST
be protected by a unique business/idempotency key, and every job handler MUST re-read current state before acting.

### IV. Security and Privacy by Default (NON-NEGOTIABLE)

Passwords MUST be hashed with Argon2id (or bcrypt at an adequate work factor) and never stored or logged in plaintext;
OTPs, refresh tokens and reset tokens MUST be stored only as hashes, expire, and be single-use. All input MUST be
validated at the boundary with Zod before reaching business logic; unknown request properties are rejected. Secrets MUST
never be committed, baked into images, logged, or returned (`.env.example` is committed, `.env` is not). Webhook and
callback signatures MUST be verified against the raw request bytes with constant-time comparison, and provider event IDs
stored to defeat replay. Authentication endpoints MUST be rate limited and MUST NOT reveal whether an email or phone is
registered (the single documented exception is the 409 on registration). TA/admin access MUST use role-based access
control, share only the minimum candidate data, and be audit-logged. CORS MUST be an allow-list; wildcard origins are
forbidden in production.

### V. Test-First with Failure-Path Coverage (NON-NEGOTIABLE)

Tests for state machines, payment guards, idempotency, authorization (including IDOR) and security behaviour MUST be
written before the code that satisfies them and MUST be seen to fail first. Coverage MUST span the levels defined in
LLD §11 (unit, integration, contract, end-to-end, failure-path, security). The suite MUST run offline: external
providers (Razorpay, email, OTP, exam provider) are exercised through fakes at their adapter boundary. A change is not
mergeable while typecheck, lint or any test fails.

### VI. Observable by Design

Logs MUST be structured JSON carrying the request/correlation ID plus relevant business IDs (candidate, payment, job,
notification), with a redaction list that guarantees authorization headers, passwords, OTPs, tokens, signatures and raw
provider payloads never reach a log line. The service MUST expose separate liveness and readiness probes (readiness
includes database connectivity, and queue connectivity once the worker is enabled). Background jobs MUST record outcomes
and surface terminal failures as an alertable `error`-level event; a silent job failure is a defect.

### VII. Simplicity and Replaceable Integrations

The system is a modular monolith organised by the LLD module layout, deployed as two processes (API and worker) from
one codebase. Every external dependency whose provider is still undecided or may change — email, OTP/SMS, exam
platform, TA delivery channel, Razorpay — MUST sit behind a port/adapter interface so that choosing or swapping a
provider touches only its adapter. Prefer the existing stack (Express 5, TypeScript strict, Mongoose, Zod) over new
frameworks; introduce a new dependency, service or abstraction only when a requirement cannot be met without it, and
record the justification in the plan's Complexity Tracking.

## Technology and Operational Constraints

- Runtime: Node.js 22 LTS or newer, TypeScript with `strict` enabled, Express 5, MongoDB via Mongoose, Redis with
  BullMQ for queues, Zod for validation, Razorpay for payments.
- Frontend (branch `frontend`) and backend (branch `backend`) of the single remote are independently buildable and
  deployable; the backend MUST NOT import from, or depend on files in, the frontend checkout.
- Local development runs in Docker Desktop (Linux containers) on Windows: Compose services `api` and `mongo`, later
  `redis` and `worker`. MongoDB data lives in a named volume; published host ports bind to `127.0.0.1` only.
- Production images run as a non-root user from pinned, maintained base images. Production secrets are injected by the
  platform/secret manager, never read from a committed file.
- Timestamps are stored as `Date` and serialised as ISO-8601 UTC; MongoDB ObjectIds are exposed to clients as strings;
  internal documents are never returned — responses use DTOs.
- Configuration is validated at start-up and the process MUST fail fast on missing or unsafe values (for example a
  stub provider or wildcard CORS in production).

## Development Workflow and Quality Gates

- Work follows the Spec Kit cycle: specify → clarify (when ambiguous) → plan → tasks → analyze → implement. Feature
  artifacts live in `specs/NNN-name/`. All work happens on the `backend` branch (or short-lived branches from it).
- Gates before merge: `npm run typecheck`, `npm run lint`, and the unit + integration + contract suites pass; no
  committed secrets; documentation and `.env.example` updated with any behaviour or configuration change.
- Plan-time gate: the Constitution Check in every `plan.md` MUST pass, or the deviation MUST be justified in
  Complexity Tracking.
- Database changes ship with an idempotent, dry-run-first migration script; destructive steps require an explicit flag
  and a documented backup step.
- Commit messages follow the existing `type: summary` convention (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
  `chore:`).
- Legacy code is removed only after its behaviour is mapped to a v1 replacement in
  `contracts/legacy-mapping.md`; git history is the archive, so dead code is deleted rather than commented out.

## Governance

This constitution supersedes other practices and style preferences for this repository. Amendments are made by pull
request that states the rationale, the affected principles, and any migration of existing code; they are approved by a
repository maintainer. Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR for
adding a principle or materially expanding guidance, PATCH for clarifications. Every plan and every review MUST verify
compliance; a violation without a recorded justification blocks merge. Runtime guidance for contributors lives in
`README.md` and `specs/*/quickstart.md`.

**Version**: 1.0.0 | **Ratified**: 2026-10-13 | **Last Amended**: 2026-10-13
