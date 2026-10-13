# Contract: Exam Provider (outbound port + inbound signed callback)

**Spec**: [../spec.md](../spec.md) · Decision **D-1** · Source: `HLD §3, §6, §7.3, §11`, `LLD §3 (examAttempts), §5.3, §12`.

> **Status: proposal.** The HLD leaves the exam platform and its completion contract undecided. Everything below isolates that decision behind one port. The *outbound* half matches what the current code already calls; the *inbound* half is a new contract that **must be agreed with the exam-provider owner before production**. Until then the callback route is fully implemented and tested against a fake provider, and the candidate-triggered status check (`fetchAttemptStatus`) is the fallback.

## 1. Port (`exams/exam-provider.adapter.ts`)

```ts
export interface ExamProvider {
  readonly name: "hvk-exam" | "stub";

  /** Idempotent per attemptRef: a repeat call returns the same attempt/link (or a fresh link for the same attempt). */
  createAttempt(input: {
    attemptRef: string;       // our examAttempts._id — the provider echoes it in callbacks
    candidateId: string;
    email: string;
    fullName: string;
  }): Promise<{ externalAttemptId: string; examUrl: string; expiresAt?: Date }>;

  /** Provider's current view of an attempt, or { status: "unsupported" } if it cannot answer. */
  fetchAttemptStatus(externalAttemptId: string): Promise<
    | { status: "not_started" | "in_progress" | "abandoned" | "invalidated" }
    | { status: "completed"; completedAt: Date; result?: { final: boolean; score?: number; outcome?: string } }
    | { status: "unsupported" }
  >;
}
```

Errors thrown by adapters: `ProviderUnavailableError` (timeout, network, 5xx → retryable) and `ProviderRejectedError` (4xx, malformed response → permanent). Adapter calls use an 8-second timeout (`AbortController`). Adapters never log request bodies containing the internal API key.

Selected by `EXAM_PROVIDER=hvk-exam|stub`; `stub` is refused when `NODE_ENV=production` (FR-016).

## 2. `hvk-exam` adapter — outbound HTTP (matches today's `examAccessService`)

```http
POST {EXAM_API_URL}/api/exam-access
Content-Type: application/json
x-internal-api-key: {INTERNAL_EXAM_API_KEY}

{ "email": "…", "candidateId": "…", "attemptRef": "<attempt id>" }
```

Success: `200 { "success": true, "data": { "link": "https://…", "externalAttemptId": "…"?, "expiresAt": "…"? } }`.
Failure: non-2xx or `success:false` → `error` string.

Compatibility rule: `attemptRef` is a **new, ignorable** request field. If the provider does not return `externalAttemptId`, the adapter uses `attemptRef` as the external id and the provider must echo `attemptRef` in callbacks. If `link` is missing → `ProviderRejectedError`. The returned `link` is validated as an `https:` URL (or `http:` outside production) before being stored (FR-077).

`fetchAttemptStatus` is implemented only if the provider offers a status endpoint (proposed: `GET {EXAM_API_URL}/api/attempts/{externalAttemptId}`); otherwise it returns `{ status: "unsupported" }`.

## 3. Inbound callback — `POST /api/v1/exams/provider-callback`

### Headers

| Header | Value |
|---|---|
| `X-Exam-Timestamp` | Unix seconds when the provider signed the request |
| `X-Exam-Event-Id` | unique event id, ≤ 100 chars; **must equal** `eventId` in the body |
| `X-Exam-Signature` | `sha256=` + lowercase hex of `HMAC_SHA256(secret, X-Exam-Timestamp + "." + rawBody)` |

`secret` = `EXAM_PROVIDER_CALLBACK_SECRET` (≥ 32 random bytes). During rotation `EXAM_PROVIDER_CALLBACK_SECRET_PREVIOUS` is also accepted.

### Body

```json
{
  "eventId": "evt_01HZ…",
  "type": "attempt.completed",
  "occurredAt": "2026-10-14T08:00:00Z",
  "attempt": { "attemptRef": "665f…", "externalAttemptId": "ext_9" },
  "result":  { "final": true, "score": 78.5, "outcome": "pass" }
}
```

`type` ∈ `attempt.started`, `attempt.completed`, `attempt.abandoned`, `attempt.invalidated`, `result.updated` (`result.final=false`), `result.finalized` (`result.final=true`, `score` and `outcome` required). `score` is a finite number 0–100000; `outcome` ≤ 50 chars. `result` is absent for `attempt.*`.

### Verification order (all failures before any state change)

1. Body ≤ 1 MB read as raw bytes; headers present.
2. `|now − X-Exam-Timestamp| ≤ 300 s` else `401 INVALID_SIGNATURE`.
3. Recompute HMAC over `timestamp + "." + rawBody` and compare with `crypto.timingSafeEqual` (equal-length buffers) else `401 INVALID_SIGNATURE`.
4. Parse JSON → Zod schema (`400 VALIDATION_ERROR`); header event id equals body `eventId`.
5. Insert `providerEvents { provider: "exam", eventId }`: unique violation with `processedAt` set → `200 { received: true, duplicate: true }`.
6. Resolve the attempt by `attempt.attemptRef` (preferred) or `externalAttemptId`; unknown → `200 { received: true, ignored: true }` + warning log.
7. Apply the event (below), set `processedAt`, respond `200 { received: true }`.

### Event → effect (monotonic, idempotent)

| Event | Guard (current attempt status) | Effect |
|---|---|---|
| `attempt.started` | `link_issued` | → `in_progress`, `startedAt`; candidate `exam_ready → exam_in_progress` |
| `attempt.completed` | `link_issued`, `in_progress` | → `completed`, `completedAt = occurredAt`; candidate → `exam_completed`; create `results(pending)` with `emailScheduledAt = completedAt + 24 h`; enqueue `exam-result-email` — **once** (unique `examAttemptId`) |
| `attempt.abandoned` / `attempt.invalidated` | `link_issued`, `in_progress` | → terminal state |
| `result.updated` | `completed` (else held, see below) | result `pending → processing` |
| `result.finalized` | `completed` (else held, see below) | result → `finalized` with score/outcome (`email_scheduled` if before `emailScheduledAt`); a *changed* re-finalization of an `emailed` result bumps `version` and schedules one more email (D-8) |
| any event on a terminal attempt | terminal | ignored (200), debug log |

**Out-of-order rule**: `result.updated`/`result.finalized` received while the attempt is still `link_issued`/`in_progress` implies completion — the handler first applies `attempt.completed` (using `occurredAt`), then the result event. `attempt.completed` arriving before `attempt.started` is accepted from `link_issued`. A late `attempt.started` after completion is ignored.

### Responses

| Status | Body |
|---|---|
| 200 | `{ "data": { "received": true, "duplicate"?: true, "ignored"?: true }, "meta": … }` |
| 400 | `VALIDATION_ERROR` — signed but malformed |
| 401 | `INVALID_SIGNATURE` — missing/invalid signature or timestamp outside tolerance |
| 413/415 | body too large / not JSON |

The route accepts **no** end-user credential and is excluded from CORS (server-to-server).

## 4. Candidate-triggered check — `POST /exams/attempts/:id/complete`

Records `candidateReportedCompleteAt`, then calls `fetchAttemptStatus`. If the provider says `completed`, the same handler path as `attempt.completed` runs (so there is one place that completes attempts). If `unsupported`/`not_started`/`in_progress` the attempt is left unchanged and the response says `pendingProviderConfirmation: true`.

## 5. Open items for the provider owner

1. Confirm event names, signature scheme (or propose HMAC alternative), and retry policy (expect ≥ 3 retries with backoff on non-2xx).
2. Confirm whether `externalAttemptId` and `expiresAt` are returned at link creation and whether links are one-time.
3. Provide a status endpoint (or confirm none).
4. Confirm when a result is "final" and whether it can change afterwards.
5. Provide a sandbox for contract testing.
