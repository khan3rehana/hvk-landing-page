# Contract: REST API v1

**Spec**: [../spec.md](../spec.md) · **Data**: [../data-model.md](../data-model.md) · Source: `LLD §1, §5, §6` (rows marked **[ext]** add what the LLD leaves implicit). The OpenAPI 3.1 document served at `/api-docs.json` is generated from the same Zod schemas; if this file and the generated document disagree, the contract test fails the build (FR-015) and this file is corrected in the same change.

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` for everything below except `/health*` and `/api-docs*` |
| Content | `application/json; charset=utf-8` in and out (415 otherwise). Webhook and provider-callback routes read the raw body first. |
| Auth | `Authorization: Bearer <accessToken>` on every route marked **Auth: session**. Missing/invalid/expired/revoked → 401 `UNAUTHENTICATED`. |
| Roles | `candidate`, `ta`, `admin` (FR-100). Wrong role → 403 `FORBIDDEN`. |
| Request ID | optional inbound `X-Request-Id` (`[A-Za-z0-9._-]{8,64}`); always returned as `X-Request-Id` and `meta.requestId`. |
| Client platform | optional `X-Client-Platform: web \| mobile` (recorded as registration source; no behaviour difference). |
| Success | `{ "data": <object>, "meta": { "requestId": "…" } }`; `204` has no body. |
| Error | `{ "error": { "code": "…", "message": "…", "details": [] }, "meta": { "requestId": "…" } }` — `details` is `[{ "path": "body.email", "issue": "…" }]` for `VALIDATION_ERROR`, else `[]`. |
| Validation | strict objects: unknown keys → 400; strings trimmed; max lengths enforced; ids are 24-hex else 404. |
| Pagination | query `page` (≥ 1, default 1), `pageSize` (1–100, default 20), `sort` (whitelisted, `-field` = descending); response `data: { items, page, pageSize, total }`. |
| Caching | `Cache-Control: no-store` on `/auth/*`, `/payments/*`, `/candidates/me`, `/exams/current`, `/results/me`. |
| Dates | ISO-8601 UTC (`2026-10-13T09:30:00.000Z`). Money: `amountMinor` integer + `currency`. |

### Session object (returned by login, OTP verify, refresh)

```json
{ "data": {
    "accessToken": "<jwt>", "accessTokenExpiresAt": "2026-10-13T09:45:00.000Z",
    "refreshToken": "<opaque>", "refreshTokenExpiresAt": "2026-11-12T09:30:00.000Z",
    "candidate": { "id": "…", "fullName": "…", "email": "…", "phone": "+91…", "onboardingStep": "demo_pending", "status": "active", "role": "candidate" } },
  "meta": { "requestId": "…" } }
```

### Rate-limit classes (defaults; env-configurable)

| Class | Limit | Key |
|---|---|---|
| `global` | 300 / 15 min | IP |
| `register` | 5 / hour | IP |
| `login` | 10 / 15 min and 30 / 15 min | IP + normalised identifier; IP |
| `otpRequest` | 1 / 60 s and 5 / hour; 20 / hour | phone; IP |
| `otpVerify` | 10 / 15 min (+ 5 attempts per challenge in DB) | IP + phone |
| `passwordForgot` | 5 / hour; 10 / hour | email; IP |
| `passwordReset` | 10 / hour | IP |
| `payments` | 20 / 15 min | candidate |
| `admin` | 600 / 15 min | staff user |
| `provider` | 1 000 / min | none by IP; signature checked first |

Breach → 429 `RATE_LIMITED` with `Retry-After` (seconds).

## Endpoint index

| # | Method & path | Auth | Rate | Story | FRs |
|---|---|---|---|---|---|
| 1 | `GET /health`, `/health/live`, `/health/ready` | none | – | – | FR-011 |
| 2 | `GET /api-docs`, `/api-docs.json` | none | – | – | FR-015 |
| 3 | `POST /auth/register` | none | register | US1 | FR-020–026 |
| 4 | `POST /auth/login` | none | login | US1 | FR-027 |
| 5 | `POST /auth/refresh` **[ext]** | none (refresh token) | login | US1 | FR-031 |
| 6 | `POST /auth/logout` | access credential (signature only) | global | US1 | FR-032 |
| 7 | `POST /auth/otp/request` | none | otpRequest | US1 | FR-028 |
| 8 | `POST /auth/otp/verify` | none | otpVerify | US1 | FR-029 |
| 9 | `POST /auth/password/forgot` | none | passwordForgot | US1 | FR-033 |
| 10 | `POST /auth/password/reset` | none | passwordReset | US1 | FR-034 |
| 11 | `GET /candidates/me` | session | global | US1 | FR-040 |
| 12 | `PATCH /candidates/me` | session | global | US1 | FR-041 |
| 13 | `GET /onboarding/status` | session | global | US2 | FR-042 |
| 14 | `POST /onboarding/demo/complete` | session | global | US2 | FR-043 |
| 15 | `POST /onboarding/demo/skip` | session | global | US2 | FR-044 |
| 16 | `POST /payments/orders` | session | payments | US3 | FR-050–052 |
| 17 | `POST /payments/verify` | session | payments | US3 | FR-054–055 |
| 18 | `POST /payments/webhook` | provider signature | provider | US3 | FR-056–057 |
| 19 | `GET /payments/me` | session | payments | US3 | FR-060 |
| 20 | `GET /exams/current` | session | global | US3 | FR-072 |
| 21 | `POST /exams/provider-callback` | provider signature | provider | US5 | FR-073–074 |
| 22 | `POST /exams/attempts/:id/complete` | session | global | US5 | FR-075 |
| 23 | `POST /exams/attempts/:id/feedback` | session | global | US5 | FR-080–081 |
| 24 | `GET /results/me` | session | global | US5 | FR-086 |
| 25 | `GET /admin/ta-leads` | ta, admin | admin | US6 | FR-096 |
| 26 | `GET /admin/ta-leads/:id` | ta, admin | admin | US6 | FR-097 |
| 27 | `PATCH /admin/ta-leads/:id` | ta, admin | admin | US6 | FR-098 |
| 28 | `GET /admin/payments/pending-follow-up` | ta, admin | admin | US6 | FR-099 |
| 29 | `POST /admin/candidates/:id/exam-link/resend` **[ext]** | admin | admin | US6 | FR-078 |

---

## 1–2. System

**`GET /health`** (alias of live) and **`GET /health/live`** → `200 { "status": "ok" }` as long as the process runs (enveloped like all responses).
**`GET /health/ready`** → `200 { "status": "ready", "checks": { "database": "up", "queue": "up" } }`; any failing check → `503 NOT_READY` with the failing checks in `details`. `queue` is reported only when `WORKER_ENABLED=true`.
**`GET /api-docs`** (Swagger UI), **`GET /api-docs.json`** (OpenAPI 3.1).

## 3. `POST /auth/register`

Request (strict):

| Field | Rule |
|---|---|
| `fullName` | 2–100 chars |
| `email` | valid email ≤ 254, normalised (R-08) |
| `phone` | parses to a valid number in `DEFAULT_PHONE_REGION` or is `+`-prefixed E.164; stored E.164 |
| `password` | 8–128, not equal to email/phone/name |
| `acceptTerms` | literal `true` |
| `college`, `place`, `city`, `state` | optional, ≤ 100 |
| `pincode` | optional, `^\d{6}$` |

`201`: `{ candidate: <Candidate DTO>, nextStep: "demo_pending" }`. Side effects (one unit, FR-024): candidate, `taLeads(registration, new)`, `notifications(ta_registration_alert, queued)` + `taFollowUps(scheduled)`; jobs enqueued after commit.
Errors: `400 VALIDATION_ERROR`; `409 CONFLICT` (message: "An account with these details already exists. Sign in or reset your password." — never names the field); `429`.

## 4. `POST /auth/login`

Request: `{ emailOrPhone: string(3–254), password: string(1–128) }`. The identifier is classified (contains `@` → email, else phone) and normalised.
`200`: Session object. `401 INVALID_CREDENTIALS` for unknown identity, wrong password, disabled account, or account without a password hash (generic message, equalised work). `429`.
Side effect: `lastLoginAt`.

## 5. `POST /auth/refresh` **[ext]**

Request: `{ refreshToken: string }`. `200`: Session object (new pair; old refresh invalid). `401 INVALID_REFRESH_TOKEN` for unknown/expired/revoked; presenting a previously-rotated token additionally revokes the session (`revokedReason: refresh_reuse`).

## 6. `POST /auth/logout`

Auth: access credential, **signature and expiry-agnostic session check** — the route verifies the JWT signature, issuer and audience but does *not* require the session to still be active or the token unexpired. No body. `204` always when the credential is genuine: it revokes the session if still active (`revokedReason: logout`) and is a no-op otherwise, so retries, double-taps and logout-after-expiry all succeed (FR-032, US1 scenario 8). A missing or forged credential → `401 UNAUTHENTICATED`. Every *other* route requires an active session (FR-030).

## 7. `POST /auth/otp/request`

Request: `{ phoneE164: string (E.164), purpose: "login" }`.
`202`: `{ challengeId, expiresAt, resendAvailableAt }` for any well-formed number (decoy challenge for unknown/disabled numbers, no message sent).
Errors: `400`; `429` (cooldown or limits; `Retry-After`). Disabled globally by `OTP_ENABLED=false` → `404 NOT_FOUND` for both OTP routes.

## 8. `POST /auth/otp/verify`

Request: `{ phoneE164, challengeId, otp: string(6 digits) }`.
`200`: Session object. `401 INVALID_OTP` for every failure (wrong, expired, consumed, locked, decoy, mismatched phone). Each attempt increments `attempts`; the 5th failure locks the challenge.

## 9. `POST /auth/password/forgot`

Request: `{ email }`. Always `202` with `{ "accepted": true }`. If the email belongs to an active account: create `passwordResets` row (60 min), enqueue `password_reset` email. `429`.

## 10. `POST /auth/password/reset`

Request: `{ resetToken: string, newPassword: string(8–128) }`. `204`. `400 INVALID_RESET_TOKEN` (unknown/expired/used — single generic message), `400 VALIDATION_ERROR`. Atomically consumes the token, sets the hash, revokes all sessions (`password_reset`).

## 11. `GET /candidates/me`

`200`: Candidate DTO. Staff receive their own record (with `role`).

## 12. `PATCH /candidates/me`

Request (all optional, at least one): `fullName`, `college`, `place`, `city`, `state`, `pincode`. Any other key → `400 VALIDATION_ERROR` (mass-assignment guard). `200`: Candidate DTO.

## 13. `GET /onboarding/status`

`200`: `{ step, nextAction, payment: { status | "none" }, exam: { status | "none" } }` where `nextAction ∈ { "watch_or_skip_demo", "pay_registration_fee", "start_exam", "take_exam", "submit_feedback", "await_result", "done" }`.

## 14–15. `POST /onboarding/demo/complete`, `POST /onboarding/demo/skip`

No body. `200`: same shape as status, with `changed: boolean`. Idempotent; never regresses. `422 WORKFLOW_STATE_INVALID` only for staff accounts.

## 16. `POST /payments/orders`

Auth: session (candidate). No body (`{}` accepted; any key → 400).
Preconditions: step `fee_pending` (else `422 WORKFLOW_STATE_INVALID`); not already paid (`409 PAYMENT_ALREADY_COMPLETED`).
`201` (new) / `200` (existing open order reused):

```json
{ "data": { "paymentId": "…", "orderId": "order_Abc123", "amountMinor": 50000, "currency": "INR",
            "keyId": "rzp_test_…", "expiresAt": "…",
            "prefill": { "name": "…", "email": "…", "contact": "+91…" } } }
```
Errors: `502`-class provider failures map to `503 PROVIDER_UNAVAILABLE` (row left `created` without order id and swept). `keyId` is the *publishable* Razorpay key id; the key secret never leaves the server.

## 17. `POST /payments/verify`

Request (strict): `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` (the standard Checkout success fields).
Algorithm (FR-054): load payment by `providerOrderId` **and** `candidateId = caller` (else `404 NOT_FOUND`) → constant-time compare `HMAC_SHA256(secret, order_id + "|" + payment_id)` → `payments.fetch(payment_id)` must be `captured` with matching order/amount/currency → atomic claim to `paid` → effects.
`200`:

```json
{ "data": { "paymentId": "…", "status": "paid", "onboardingStep": "exam_ready",
            "exam": { "status": "link_issued", "redirectUrl": "https://exam…" } } }
```
`redirectUrl` is `null` and `exam.status = "created"` while the provider link is pending. Repeat calls return the same `200`.
Errors: `400 PAYMENT_VERIFICATION_FAILED` (bad signature, mismatch, not captured) — state unchanged, audit entry written; `404`; `503 PROVIDER_UNAVAILABLE`.

## 18. `POST /payments/webhook`

Headers: `X-Razorpay-Signature`, `X-Razorpay-Event-Id`. Body: Razorpay event JSON (≤ 1 MB, read raw).
`200 { "received": true }` for processed, duplicate and ignored events. `400 INVALID_SIGNATURE` for missing/invalid signature (nothing parsed). `500` only if the webhook secret is unconfigured (blocked by FR-016 in production) or recording fails (Razorpay will retry).
Event handling:

| Event | Effect |
|---|---|
| `payment.authorized` | `created` → `pending` |
| `payment.captured`, `order.paid` | verified success path (same claim as #17), looked up by `payload.payment.entity.order_id` |
| `payment.failed` | `created`/`pending` → `failed`, `failureCode` |
| `refund.processed` | `paid` → `refunded`, `requiresReview` |
| anything else | acknowledged, ignored |

Unknown order → `200` + warning log. Amount/currency mismatch → flagged, no grant.

## 19. `GET /payments/me`

`200`: `{ payments: [<Payment DTO>] }` newest first (max 20).

## 20. `GET /exams/current`

`200`: `{ attemptId, status, examUrl: string | null, startedAt, completedAt }`. `examUrl` present when `status ∈ { link_issued, in_progress }`. `422 PAYMENT_REQUIRED` if no `paid` payment. While the attempt is `created` the response is `200` with `examUrl: null`, `status: "created"`.

## 21. `POST /exams/provider-callback`

See [exam-provider.md](exam-provider.md). `200 { received, duplicate?, ignored? }`, `401 INVALID_SIGNATURE` (bad/missing signature or stale timestamp), `400 VALIDATION_ERROR` (signed but malformed body).

## 22. `POST /exams/attempts/:id/complete`

Auth: session. No body. Owner only (`404` otherwise). `202`: `{ attemptId, status, pendingProviderConfirmation: boolean }`. `409 CONFLICT` if already `completed`; `422 WORKFLOW_STATE_INVALID` if `created`.

## 23. `POST /exams/attempts/:id/feedback`

Request: `{ rating: int 1–5, answers?: [{ questionId, value }] (≤ 50), comments?: string(≤ 2000) }`.
`201`: `{ feedbackId, submittedAt, onboardingStep }`. Errors: `404` (not owner/unknown), `422 WORKFLOW_STATE_INVALID` (attempt not `completed`), `409 FEEDBACK_ALREADY_SUBMITTED`, `400`.

## 24. `GET /results/me`

`200`: `{ status }` always (`not_available` if no completed attempt); with `score`, `outcome`, `finalizedAt`, `publishedAt` once `emailed` (D-8).

## 25. `GET /admin/ta-leads`

Query: `page`, `pageSize`, `sort` ∈ `{createdAt, -createdAt, nextActionAt, -nextActionAt, status}`, `status`, `assignedTo`, `createdFrom`, `createdTo` (ISO dates, `from ≤ to`), `q` (2–50 chars; anchored prefix match on name, email, phone). Unknown key → 400. `200`: `{ items: [<Lead DTO>], page, pageSize, total }`.

## 26. `GET /admin/ta-leads/:id`

`200`: Lead DTO incl. notes. Writes audit `lead.read`. `404`.

## 27. `PATCH /admin/ta-leads/:id`

Request: `{ expectedVersion: int, status?, assignedTo?: staffId|null, nextActionAt?: date|null, lastContactAt?: date, note?: string(≤ 1000) }` (≥ 1 change besides `expectedVersion`). `200`: Lead DTO (new `version`). `409 STALE_UPDATE` if `expectedVersion` ≠ stored; `422 WORKFLOW_STATE_INVALID` for an illegal status move; `422` if `assignedTo` is not an active staff user. Audit `lead.update` with before/after of `status`, `assignedTo`.

## 28. `GET /admin/payments/pending-follow-up`

Query: `page`, `pageSize`, `status` ∈ `{open, in_progress, completed, dismissed}` (default `open,in_progress`), `dueFrom`, `dueTo`. `200`: `{ items: [<Follow-up DTO>], page, pageSize, total }`. Only activated follow-ups (never `scheduled`/`cancelled`).

## 29. `POST /admin/candidates/:id/exam-link/resend` **[ext]**

Admin only. No body. `202`: `{ notificationId, reissued: boolean }`. `422 PAYMENT_REQUIRED` if candidate unpaid; `404`. Re-sends the current valid link; if the attempt's link is expired/invalid (adapter reports), invalidates it, requests a fresh one (`reissued: true`), then emails. Audit `exam_link.resend`.

---

## Error code catalogue

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | schema/format/unknown-key failure; `details[]` per field |
| `MALFORMED_JSON` | 400 | body is not parseable JSON |
| `INVALID_SIGNATURE` | 400 (webhook) / 401 (provider-callback) | provider signature missing/invalid/stale |
| `PAYMENT_VERIFICATION_FAILED` | 400 | checkout signature or provider reconciliation failed |
| `INVALID_RESET_TOKEN` | 400 | reset token unknown/expired/used |
| `UNAUTHENTICATED` | 401 | missing/invalid/expired/revoked access credential |
| `INVALID_CREDENTIALS` | 401 | login failed (generic) |
| `INVALID_OTP` | 401 | OTP verification failed (generic) |
| `INVALID_REFRESH_TOKEN` | 401 | refresh failed |
| `FORBIDDEN` | 403 | role not allowed |
| `NOT_FOUND` | 404 | unknown route/resource, not owned, bad id, feature disabled |
| `CONFLICT` | 409 | duplicate registration / state conflict |
| `PAYMENT_ALREADY_COMPLETED` | 409 | candidate already paid |
| `FEEDBACK_ALREADY_SUBMITTED` | 409 | second feedback for an attempt |
| `STALE_UPDATE` | 409 | optimistic-concurrency mismatch |
| `API_VERSION_RETIRED` | 410 | legacy `/api/*` path (FR-145) |
| `PAYLOAD_TOO_LARGE` | 413 | body over limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | not JSON |
| `WORKFLOW_STATE_INVALID` | 422 | valid request, wrong state |
| `PAYMENT_REQUIRED` | 422 | exam access before verified payment |
| `RATE_LIMITED` | 429 | limit exceeded |
| `INTERNAL_ERROR` | 500 | unexpected |
| `PROVIDER_UNAVAILABLE` | 503 | Razorpay/exam/email dependency unreachable, retry later |
| `NOT_READY` | 503 | readiness probe failed |

## Never in a response or log

Password or hash, OTP or hash, access/refresh/reset token values (other than the one just issued to its owner in the body), `razorpay_signature`, `X-Razorpay-Signature`, key/webhook/JWT/pepper secrets, raw provider payloads, stack traces, Mongo error text.
