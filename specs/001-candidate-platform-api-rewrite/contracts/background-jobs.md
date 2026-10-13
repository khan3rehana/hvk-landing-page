# Contract: Background Jobs

**Spec**: [../spec.md](../spec.md) (FR-110–FR-116) · Source: `LLD §7, §8`, `HLD §6, §10`. Queue: BullMQ on Redis ([research R-11](../research.md)). Work is **always recorded in MongoDB first** and enqueued after, so the queue can be rebuilt from the database ([R-10](../research.md)).

## Common rules

| Rule | Value |
|---|---|
| Job id | deterministic from the business key; `:` replaced by `_` (verify BullMQ id restrictions in the first queue test); duplicate adds collapse |
| Handlers | idempotent; re-read current state first; never trust payload beyond ids |
| Delay | `max(0, dueAt − clock.now())` using the injectable clock (FR-116) |
| Retries | BullMQ `attempts` + exponential `backoff` per job below; transient errors **throw**, permanent errors are recorded and return |
| Terminal failure | DB row marked (`failed` / `needsAttention`), logged `level=error` with `event="job_terminal_failure"`, `jobName`, `jobId`, business ids |
| Retention | `removeOnComplete { age: 7 d, count: 1000 }`, `removeOnFail { age: 30 d, count: 5000 }` |
| Concurrency | worker concurrency 5 per queue |
| Logging | start/finish lines: `jobName, jobId, attempt, durationMs, outcome`; payloads are ids only; `data.token` redacted |
| Shutdown | on SIGTERM: stop fetching, wait ≤ 25 s for active jobs, close queues/connections (FR-017) |

Queues: `notifications`, `followups`, `results`, `exams`, `maintenance`.

## Catalogue (FR-115)

### `candidate-registration-ta-notify` (queue `notifications`)
| Item | Definition |
|---|---|
| Trigger | after the registration commit (FR-024) |
| Job id | `ta-registration_{candidateId}` |
| Payload | `{ notificationId }` |
| DB source of truth | `notifications` row, type `ta_registration_alert`, status `queued`, key `ta-registration:{candidateId}` |
| Handler | skip if notification `sent`/`cancelled` → load candidate + lead → `TaDeliveryAdapter.deliver(minimalPayload)` → mark notification `sent` (`sentAt`, `providerMessageId`) → conditional update lead `new → queued` |
| Retry | 5 attempts, exponential backoff starting at 30 s (30 s, 1 m, 2 m, 4 m, 8 m) |
| Terminal | notification `failed` (`lastErrorCode`), lead stays `new`, error log; registration is unaffected (FR-026) |

### `unpaid-payment-follow-up` (queue `followups`)
| Item | Definition |
|---|---|
| Trigger | registration commit (FR-094) |
| Job id | `unpaid-24h_{candidateId}` |
| Delay | `registeredAt + PAYMENT_FOLLOWUP_DELAY_HOURS (24 h) − now` |
| Payload | `{ followUpId }` |
| DB source | `taFollowUps` row, `dedupeKey unpaid-24h:{candidateId}`, status `scheduled`, `dueAt` |
| Handler | conditional claim `scheduled → …`: re-read candidate payment state; **paid** → follow-up `cancelled`, stop; **unpaid** → find latest payment (optional), set follow-up `open` + `activatedAt` + `paymentId`, create notification `ta-followup:{candidateId}` (type `ta_payment_followup`) and enqueue `notification-retry` for it |
| Retry | 5 attempts, exponential from 60 s |
| Idempotency | re-run after `open`/`cancelled` is a no-op; second notification impossible (unique key) |
| Cancel on payment | the payment effects also set a still-`scheduled` follow-up to `cancelled` and remove the job best-effort (FR-058) |

### `exam-result-email` (queue `results`)
| Item | Definition |
|---|---|
| Trigger | attempt becomes `completed` (FR-082) — once per result |
| Job id | `result-email_{resultId}_{version}_{n}` (`n` = attempt counter, 0 initially) |
| Delay | `emailScheduledAt (completedAt + 24 h) − now` |
| Payload | `{ resultId }` |
| DB source | `results` row: `status`, `emailScheduledAt`, `emailAttempts`, `nextAttemptAt`, `version` |
| Handler | re-read result. **Finalized** (`finalized`/`email_scheduled`) and not `emailed` → create notification `result-email:{resultId}:{version}` and deliver → set `emailed`, `emailSentAt`, `publishedAt` → recompute candidate step (`completed` if feedback exists). **Already emailed** → no-op. **Not finalized** → `emailAttempts += 1`; if attempts < 10 and within 7 days of `emailScheduledAt`: set `nextAttemptAt = now + [1 h, 2 h, 4 h, 8 h, 12 h, 12 h, …][emailAttempts−1]`, enqueue job with `n = emailAttempts`; else `needsAttention = true` + terminal error log |
| Retry | provider send failures use the delivery retry (below); not-finalized uses the schedule above |
| Manual re-trigger | runbook: clear `needsAttention`, set `nextAttemptAt = now`, run `npm run jobs:requeue -- result <resultId>` (reconciler also picks it up) |

### `notification-retry` (queue `notifications`) — generic delivery job
Despite the LLD name it is the **single delivery code path** for every notification, used for the first send of `exam_link`, `ta_payment_followup`, `password_reset` and for retries of any type, so there is one retry policy.
| Item | Definition |
|---|---|
| Job id | `notif_{notificationId}_{attempts}` |
| Payload | `{ notificationId }` (password reset also carries `token`, see below) |
| Handler | claim `queued → sending` (skip if `sent`/`cancelled`/`failed`); resolve recipient and template; send through `EmailProvider`; success → `sent`; transient error (timeout, 429, 5xx) → `sending → queued`, `attempts += 1`, schedule next; permanent error (invalid address, 4xx) → `failed` |
| Retry | 5 attempts max (`maxAttempts`), exponential from 30 s, jitter ±20% |
| Terminal | `failed` + error log; if type is `ta_*`, also raises `event="ta_delivery_failed"` |

### `exam-link-issue` (queue `exams`)
| Item | Definition |
|---|---|
| Trigger | payment effects (FR-070) when inline issuance was skipped or failed |
| Job id | `exam-link_{attemptId}_{n}` |
| Payload | `{ attemptId }` |
| DB source | `examAttempts` row `status=created`, `linkAttempts`, `nextLinkAttemptAt` |
| Handler | if already `link_issued` → no-op; `ExamProvider.createAttempt` → store `externalAttemptId`, `examUrl`, `linkIssuedAt`, status `link_issued` → create notification `exam-link:{paymentId}` and enqueue `notification-retry` |
| Retry | 8 attempts, exponential from 30 s capped at 30 min; permanent rejection or exhaustion → `linkNeedsAttention = true`, error log (candidate sees "being prepared"; staff can use FR-078) |
| Inline variant | `POST /payments/verify` tries `createAttempt` once with a 4 s budget before returning; the webhook path always enqueues (fast ack) |

## Password reset email

`password_reset` notifications carry the **raw reset token in the job payload only** (never in MongoDB; the DB holds its hash). Job options: `attempts: 3`, `removeOnComplete: true`, `removeOnFail: { age: 3600 }`. The reconciler does **not** recreate these jobs (the token is unrecoverable); an unsent reset simply expires and the user requests another. Redis must require authentication and not be exposed beyond the internal network.

## Reconciler (queue `maintenance`, repeatable `reconcile`, every 5 min and once at worker start)

1. **Re-enqueue**: select `notifications` (`queued`, `scheduledAt ≤ now + 1 h`, not `password_reset`), `taFollowUps` (`scheduled`, `dueAt ≤ now + 1 h`), `results` (`pending|processing|finalized|email_scheduled`, `emailScheduledAt`/`nextAttemptAt ≤ now + 1 h`, not `needsAttention`), `examAttempts` (`created`, `nextLinkAttemptAt ≤ now`) and add the deterministic job for each; existing ids collapse. Past-due rows get delay 0.
2. **Expire payments**: `created|pending|failed` with `expiresAt < now` → `expired`.
3. **Resume payment effects**: `payments` with `status=paid` and `effectsAppliedAt = null` older than 60 s → run the idempotent effects (step `exam_ready`, attempt, email notification, cancel follow-up), then set `effectsAppliedAt`.
4. Log counts per category; a non-zero re-enqueue count after start-up is expected only after a queue loss or crash.

## Process model

| Process | Entry | Responsibilities |
|---|---|---|
| API | `dist/server.js` | HTTP; writes DB rows; enqueues (best effort) after commit — an enqueue failure is logged and left to the reconciler |
| Worker | `dist/jobs/worker.js` | consumes all queues; runs reconciler |

`WORKER_ENABLED` is the queue/worker switch. When `false` (default for minimal local runs) the API still records every piece of work in MongoDB but does not enqueue, nothing processes it, and readiness omits the queue check; flipping it to `true` later lets the reconciler enqueue the backlog. When `true`, the API enqueues after commit, `/health/ready` includes Redis, and the worker process may start (it exits with an error if the flag is `false` or `REDIS_URL` is missing).

## Required automated scenarios (FR-130/131, SC-004, SC-006, SC-007)

- Kill the worker mid-job → job retried once the worker returns; no duplicate side effect.
- Flush Redis → reconciler restores every due record exactly once.
- Duplicate enqueue of the same business key → one execution.
- Paid-before-due → no follow-up; unpaid → exactly one, even with 3 forced re-runs.
- Result not finalized at 24 h → rescheduled per schedule, then `needsAttention` after the cap; finalized later → sent once.
- Email provider transient failure → retries then success; permanent → `failed` once, error log.
