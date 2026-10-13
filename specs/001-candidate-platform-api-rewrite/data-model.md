# Data Model: Candidate Platform API Rewrite (v1)

**Spec**: [spec.md](spec.md) · **Source**: `LLD §3–§4` extended where the LLD is silent (marked **[ext]**). Store `Date` values in MongoDB; serialise ISO-8601 UTC (FR-010). Ids are `ObjectId` internally and strings on the wire. Collection names follow the LLD. "Unique" always means a database unique index (the only race-safe enforcement).

Conventions: `createdAt`/`updatedAt` on every collection via Mongoose timestamps · `purgeAt` fields drive TTL indexes (`expireAfterSeconds: 0`) · `schemaVersion: 2` on documents written by v1 (legacy documents have none — the migration keys off this).

## Collections

### `candidates` (accounts: candidates and staff)

| Field | Type / rule |
|---|---|
| `_id` | ObjectId |
| `schemaVersion` | number, `2` |
| `fullName` | string, trimmed, 2–100 |
| `fullNameNormalized` **[ext]** | lower-cased copy for prefix search (admin `q`) |
| `emailNormalized` | string, required, **unique** (FR-021/022) |
| `phoneE164` | string, required, **unique**, E.164 |
| `passwordHash` | string \| null (null only for migrated accounts until reset/OTP login) |
| `role` | `candidate` \| `ta` \| `admin`, default `candidate`, never client-writable |
| `status` | `active` \| `disabled`, default `active` |
| `onboardingStep` | `registered` \| `demo_pending` \| `fee_pending` \| `exam_ready` \| `exam_in_progress` \| `exam_completed` \| `feedback_submitted` \| `completed` (new accounts are created at `demo_pending`; `registered` is the creation moment, kept as `registeredAt`) |
| `registeredAt`, `termsAcceptedAt` | Date |
| `demoCompletedAt`, `demoSkippedAt` | Date \| null |
| `college`, `place`, `city`, `state` | string \| null, trimmed, ≤ 100 [ext D-9] |
| `pincode` | string \| null, `/^\d{6}$/` [ext D-9] |
| `source` **[ext]** | `web` \| `mobile` \| `unknown` \| `legacy_import` (from optional `X-Client-Platform` header) |
| `lastLoginAt` | Date \| null |
| `legacy` **[ext]** | `{ migratedAt, legacyStatus, legacyId }` \| absent |

Indexes: unique `emailNormalized`; unique `phoneE164`; `{ status: 1, createdAt: -1 }`; `{ role: 1 }`; `{ onboardingStep: 1, createdAt: -1 }`; `{ fullNameNormalized: 1 }`.
Staff are `candidates` documents with `role ∈ {ta, admin}` (D-6); their `onboardingStep` is `completed` and unused.

### `authSessions` (LLD: authSessions / refreshTokens)

| Field | Type / rule |
|---|---|
| `_id` | ObjectId — the `sid` claim |
| `candidateId` | ObjectId |
| `refreshTokenHash` | string, **unique** (SHA-256) |
| `previousRefreshHash`, `rotatedAt` | string \| null, Date \| null (reuse detection) |
| `expiresAt` | Date (refresh expiry) |
| `revokedAt`, `revokedReason` | Date \| null; `logout` \| `password_reset` \| `refresh_reuse` \| `disabled` |
| `clientPlatform`, `userAgent` | strings, UA truncated to 200 |
| `lastUsedAt` | Date |
| `purgeAt` | `expiresAt + 30 d` — TTL index |

Indexes: `candidateId`; unique `refreshTokenHash`; TTL `purgeAt`.

### `otpChallenges`

`_id` (= `challengeId`), `candidateId` \| null (null for decoy), `phoneE164`, `purpose` (`login`), `codeHash` (HMAC with `OTP_PEPPER`), `expiresAt`, `attempts` (int), `maxAttempts` (5), `consumedAt` \| null, `decoy` (bool), `createdAt`, `purgeAt` (`expiresAt + 1 h`, TTL).
Indexes: `{ phoneE164: 1, purpose: 1, createdAt: -1 }`; TTL `purgeAt`. Consumption: `findOneAndUpdate({ _id, consumedAt: null, attempts: { $lt: 5 }, expiresAt: { $gt: now } }, …)`.

### `passwordResets` **[ext]** (needed by `POST /auth/password/*`)

`_id`, `candidateId`, `tokenHash` (**unique**), `expiresAt` (60 min), `consumedAt` \| null, `createdAt`, `purgeAt` (`expiresAt + 1 d`, TTL). The raw token exists only in the email job payload (see [background-jobs](contracts/background-jobs.md#password-reset-email)).

### `payments`

| Field | Type / rule |
|---|---|
| `candidateId` | ObjectId |
| `provider` | `razorpay` |
| `providerOrderId` | string; **unique partial** (only when a string) |
| `providerPaymentId` | string \| null; **unique partial** — id of the latest/successful provider payment |
| `receipt` | `rcpt_<paymentId>` (≤ 40 chars) |
| `amountMinor`, `currency` | int ≥ 1, `INR` |
| `status` | `created` \| `pending` \| `paid` \| `failed` \| `cancelled` \| `expired` \| `refunded` |
| `expiresAt` | Date — payable window end (FR-052) |
| `verifiedAt`, `paidAt`, `failedAt`, `refundedAt` | Date \| null |
| `failureCode` | string \| null (provider error code only) |
| `effectsAppliedAt` | Date \| null — set when candidate step, exam attempt and email notification are all in place (crash-recovery marker, R-09) |
| `flags` | `{ duplicate: bool, requiresReview: bool, amountMismatch: bool }` |
| `duplicateOfPaymentId` | ObjectId \| null |
| `verifyAttemptCount`, `lastVerifyOutcome` | int; `ok` \| `bad_signature` \| `mismatch` \| `provider_unavailable` |
| `migrated` | bool [ext] |

Indexes: unique partial `providerOrderId`; unique partial `providerPaymentId`; `{ candidateId: 1, status: 1, createdAt: -1 }`; `{ status: 1, expiresAt: 1 }` (sweeper); partial `{ status: 1, effectsAppliedAt: 1 }` where `status = paid` and `effectsAppliedAt = null` (recovery).

### `providerEvents` **[ext]** (LLD §9 "store provider event IDs")

`_id`, `provider` (`razorpay` \| `exam`), `eventId` (string), `type`, `entityRef` (order/attempt id), `payloadHash` (SHA-256 of raw body), `receivedAt`, `processedAt` \| null, `outcome` (`processed` \| `ignored` \| `duplicate` \| `failed`), `purgeAt` (`receivedAt + 90 d`, TTL).
Unique `{ provider, eventId }`. A duplicate is short-circuited **only if** `processedAt` is set; otherwise the handler runs again (handlers are idempotent), so a crash between insert and processing never loses an event.

### `examAttempts`

| Field | Type / rule |
|---|---|
| `candidateId`, `paymentId` | ObjectId; unique `{ candidateId, paymentId }` (one attempt per paid payment) |
| `provider` | `hvk-exam` \| `stub` |
| `externalAttemptId` | string \| null; **unique partial** |
| `examUrl` | string \| null — only ever adapter-produced (FR-077) |
| `status` | `created` \| `link_issued` \| `in_progress` \| `completed` \| `abandoned` \| `invalidated` |
| `linkIssuedAt`, `startedAt`, `completedAt` | Date \| null |
| `candidateReportedCompleteAt` | Date \| null (FR-075; informational) |
| `resultStatus` | mirror of `results.status` or `none` |
| `linkAttempts`, `nextLinkAttemptAt`, `linkNeedsAttention` | retry bookkeeping for `exam-link-issue`; flag set when retries are exhausted or the provider rejects permanently |
| `legacy` | `{ examLink }` for migrated rows |

Indexes: unique `{ candidateId, paymentId }`; unique partial `externalAttemptId`; `{ candidateId: 1, status: 1 }`; `{ completedAt: 1 }`; partial unique `{ candidateId }` where `status ∈ {created, link_issued, in_progress}` (at most one live attempt per candidate).

### `feedback`

`_id`, `candidateId`, `examAttemptId` (**unique**), `rating` (int 1–5), `answers` (≤ 50 × `{ questionId ≤ 64 chars, value: string ≤ 1000 \| number \| boolean }`), `comments` (≤ 2000), `submittedAt`. Index `candidateId`.

### `results`

| Field | Type / rule |
|---|---|
| `candidateId`, `examAttemptId` | ObjectId; unique `examAttemptId` |
| `status` | `pending` \| `processing` \| `finalized` \| `email_scheduled` \| `emailed` |
| `score` | number \| null; `outcome` string \| null (provider-defined, ≤ 50) |
| `version` | int, starts 0, incremented when a finalized result changes |
| `finalizedAt`, `publishedAt` | Date \| null (`publishedAt = emailSentAt`, D-8) |
| `emailScheduledAt` | Date — always `completedAt + 24 h` |
| `emailSentAt`, `emailAttempts`, `nextAttemptAt` | Date \| null; int; Date \| null |
| `needsAttention` | bool (FR-085) |

Indexes: unique `examAttemptId`; `{ status: 1, finalizedAt: 1 }`; `{ status: 1, nextAttemptAt: 1 }` (reconciler).

### `notifications`

`_id`, `candidateId` \| null, `type` (`ta_registration_alert` \| `ta_payment_followup` \| `exam_link` \| `result` \| `password_reset`), `channel` (`email`), `status` (`queued` \| `sending` \| `sent` \| `failed` \| `cancelled`), `idempotencyKey` (**unique**), `dataRef` (ids only, e.g. `{ paymentId }`), `scheduledAt`, `queuedAt`, `sentAt`, `attempts`, `maxAttempts` (5), `nextAttemptAt`, `providerMessageId`, `lastErrorCode`. Indexes: unique `idempotencyKey`; `{ status: 1, scheduledAt: 1 }`. Recipients and bodies are **not** stored: candidate mail resolves the address at send time; TA mail uses configuration.

Idempotency keys: `ta-registration:{candidateId}` · `ta-followup:{candidateId}` · `exam-link:{paymentId}` · `result-email:{resultId}:{version}` · `pwreset:{resetId}`.

### `taLeads`

`_id`, `candidateId`, `type` (`registration`), `source`, `status` (`new` \| `queued` \| `assigned` \| `contacted` \| `in_progress` \| `resolved` \| `closed`), `assignedTo` (staff ObjectId \| null), `lastContactAt`, `nextActionAt`, `notes` (≤ 100 × `{ at, by, text ≤ 1000 }`), `version` (optimistic concurrency, FR-098), timestamps. Indexes: unique `{ candidateId, type }`; `{ status: 1, nextActionAt: 1, createdAt: -1 }`; `{ assignedTo: 1, status: 1 }`.

### `taFollowUps`

`_id`, `candidateId`, `paymentId` \| null, `type` (`unpaid_24h`), `dedupeKey` (**unique**, `unpaid-24h:{candidateId}`), `status` (`scheduled` \| `open` \| `in_progress` \| `completed` \| `dismissed` \| `cancelled`), `dueAt`, `activatedAt`, `assignedTo`, `completedAt`, `outcome` (≤ 500), `queuedAt`. Indexes: unique `dedupeKey`; `{ status: 1, dueAt: 1 }`.
(LLD key `paymentId + type` is replaced by `dedupeKey` because D-4 allows a follow-up for candidates who never created an order; the latest payment is attached as context.)

### `auditLogs` **[ext]** (LLD §9)

`_id`, `actorId` \| null, `actorRole`, `action` (e.g. `lead.read`, `lead.update`, `followup.update`, `exam_link.resend`, `payment.verify.rejected`), `entityType`, `entityId`, `changes` (allow-listed `{ field: { from, to } }`), `requestId`, `at`. Append-only; indexes `{ entityType: 1, entityId: 1, at: -1 }`, `{ actorId: 1, at: -1 }`. No TTL (retention is a business decision).

### `migrationRejects` **[ext]**

`_id`, `legacyId`, `reason`, `fields` (non-secret, e.g. `{ phoneRaw }`), `at`. Created only by the migration command.

## State machines

All transitions are single-document conditional updates (`{ _id, <state>: { $in: allowedFrom } }`). A request that finds the document already in the target state is a no-op success where stated; a request that finds an *incompatible* state returns 422 `WORKFLOW_STATE_INVALID` (user-facing) or is ignored with a log line (provider-facing).

### Onboarding step (`candidates.onboardingStep`)

| From → To | Trigger | Notes |
|---|---|---|
| (create) → `demo_pending` | `POST /auth/register` | registration moment stored as `registeredAt` |
| `demo_pending` → `fee_pending` | `demo/complete` or `demo/skip` | both idempotent; later steps unaffected (FR-045) |
| `fee_pending` → `exam_ready` | first transition of a payment to `paid` | effect of FR-058 |
| `exam_ready` → `exam_in_progress` | provider `attempt.started` | optional event |
| `exam_ready` \| `exam_in_progress` → `exam_completed` | attempt becomes `completed` | |
| `exam_completed` → `feedback_submitted` | feedback stored | |
| `exam_completed` \| `feedback_submitted` → `completed` | feedback exists **and** result `emailed` | order-independent (FR-047/D-11) |

### Payment (`payments.status`)

| From → To | Trigger |
|---|---|
| `created` → `pending` | verify call received for the order, or `payment.authorized` |
| `created` \| `pending` \| `failed` \| `expired` → `paid` | verified success: FR-054 or webhook `payment.captured`/`order.paid` (first claim wins) |
| `created` \| `pending` → `failed` | webhook `payment.failed` (latest attempt) |
| `failed` → `pending` | new attempt reported on the same order |
| `created` \| `pending` \| `failed` → `expired` | sweeper: `expiresAt < now` |
| `created` \| `pending` \| `failed` → `cancelled` | superseded by a replacement order (fee/currency changed) |
| `paid` → `refunded` | verified refund event |
| `paid` → (no other) | a late event never regresses `paid`; a *second* captured payment on another order creates a new row flagged `duplicate` |

### Exam attempt (`examAttempts.status`)

| From → To | Trigger |
|---|---|
| (create) → `created` | payment effects (FR-070) |
| `created` → `link_issued` | adapter `createAttempt` success |
| `link_issued` → `in_progress` | provider `attempt.started` |
| `link_issued` \| `in_progress` → `completed` | provider `attempt.completed` (or reconciled `fetchAttemptStatus`) |
| `link_issued` \| `in_progress` → `abandoned` \| `invalidated` | provider events (or staff reissue invalidates the old attempt) |
| any terminal → — | terminal; events ignored |

### Result (`results.status`)

| From → To | Trigger |
|---|---|
| (create) → `pending` | attempt `completed` (FR-082) |
| `pending` → `processing` | provider `result.updated` with scoring in progress |
| `pending` \| `processing` → `finalized` | provider `result.finalized` (score + outcome) |
| `finalized` → `email_scheduled` | finalization occurred before `emailScheduledAt` |
| `finalized` \| `email_scheduled` → `emailed` | result-email job sends (due and not yet sent) |
| `emailed` → `emailed` (`version+1`) | provider re-finalizes with changed values: one further email (D-8) |

### TA lead (`taLeads.status`)

`new → queued → assigned → contacted → in_progress → resolved | closed`. `new → queued` is performed by the system when the TA alert is delivered; the rest by staff. Rules: staff move **one step forward at a time** (no skipping, no moving backwards); `resolved` is reachable only from `in_progress`; `closed` (a dead or invalid lead) is reachable from any non-terminal state; `resolved` and `closed` are terminal. Every change checks `version` (409 on stale).

### TA follow-up (`taFollowUps.status`)

`scheduled → open | cancelled` (system, at due time) · `open → in_progress → completed | dismissed` (staff).

### Notification (`notifications.status`)

`queued → sending → sent` · `sending → queued` (transient failure, `attempts < max`, `nextAttemptAt` set) · `sending → failed` (permanent error or attempts exhausted) · `queued → cancelled` (obsolete, e.g. candidate paid before TA follow-up).

## Relationships

```text
candidates 1──* authSessions        candidates 1──* otpChallenges     candidates 1──* passwordResets
candidates 1──* payments            payments  1──0..1 examAttempts (via paymentId)
candidates 1──* examAttempts        examAttempts 1──0..1 feedback     examAttempts 1──0..1 results
candidates 1──* taLeads (1 per type)   candidates 1──0..1 taFollowUps (unpaid_24h)
candidates/*  ──* notifications     staff(candidates) ──* auditLogs (actor)
```

## DTO exposure rules (FR-008, FR-102)

| DTO | Fields |
|---|---|
| Candidate (self) | `id, fullName, email, phone, college, place, city, state, pincode, onboardingStep, status, registeredAt` (+ `role` for staff) |
| Onboarding status | `step, nextAction, payment{status}, exam{status}` |
| Payment (self) | `id, status, amountMinor, currency, providerOrderId, createdAt, paidAt` |
| Exam (self) | `attemptId, status, examUrl?, startedAt?, completedAt?` |
| Result (self) | `status` always; `score, outcome, finalizedAt, publishedAt` once published |
| TA lead (staff) | `id, candidateId, fullName, email, phone, source, status, assignedTo, onboardingStep, paymentStatus, createdAt, lastContactAt, nextActionAt, notes` |
| TA follow-up (staff) | `id, candidateId, fullName, phone, dueAt, status, assignedTo, outcome, payment{status, amountMinor, lastAttemptAt}` |

Never serialised anywhere: `passwordHash`, any `*TokenHash`/`codeHash`, `payloadHash`, `providerPaymentId` signatures, provider payloads, `legacy.*`, `flags`, `schemaVersion`.

## Legacy document → v1 mapping (migration input shape)

Legacy `candidates` (schema at `105a7b9`): `name, email, phone, college, place, city, state, pincode, status (pending|paid|failed), razorpayOrderId, razorpayPaymentLinkId, razorpayPaymentId, acknowledgementEmailSent, examLink, examLinkIssuedAt, examAccessTokenHash, examAccessTokenExpiresAt, examAccessTokenUsedAt, createdAt, updatedAt` with unique indexes `email_1`, `phone_1` and index on `examAccessTokenHash`.

| Legacy | v1 | Rule |
|---|---|---|
| `name` | `fullName`, `fullNameNormalized` | trim |
| `email` | `emailNormalized` | normalise (R-08) |
| `phone` | `phoneE164` | `libphonenumber-js` region `IN`; invalid → `migrationRejects` |
| `college, place, city, state, pincode` | same | copied (`pincode` kept only if 6 digits) |
| `status=paid` | `onboardingStep=exam_ready` + `payments` row (`status=paid`, `providerOrderId=razorpayOrderId`, `providerPaymentId=razorpayPaymentId`, `amountMinor`= configured fee, `migrated=true`, `effectsAppliedAt=now`) + `examAttempts` (`status=link_issued`, `examUrl=examLink`, `provider=hvk-exam`) | skipped if `razorpayPaymentId` missing → reject with reason |
| `status=pending\|failed` | `onboardingStep=fee_pending` | demo step did not exist |
| `razorpayPaymentLinkId`, `examAccessToken*`, `acknowledgementEmailSent`, `examLinkIssuedAt` | dropped at `--finalize` | magic link and payment links retired |
| `createdAt` | `registeredAt`, `createdAt` | preserved |
| — | `passwordHash=null, role=candidate, status=active, source=legacy_import, schemaVersion=2, legacy={…}` | |
| — | `taLeads` (`registration`, `legacy_import`, `status=new`) | no notification sent |
