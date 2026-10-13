<!-- Text extraction of Candidate-Platform-LLD.docx (Version 1.0, Draft for review, 13 October 2026).
     The .docx is the source of truth; section numbers below are cited from the spec as "LLD §n". -->

Low-Level Design (LLD)
API contracts, data model, module boundaries, state transitions & implementation details
Version 1.0  |  Status: Draft for review  |  Date: 13 October 2026

# 1. Purpose and conventions
This LLD turns the approved product requirements into implementation-level contracts. It is a draft: fields and endpoints may be refined after the exam provider, TA channel, OTP provider, and production email provider are selected.
API prefix: /api/v1.
Content type: application/json unless an endpoint explicitly requires another type.
IDs: MongoDB ObjectId internally; expose string IDs to clients.
Timestamps: ISO-8601 UTC in API responses; store Date values in MongoDB.
All mutating endpoints require validation, authorization as applicable, structured error handling, and request correlation IDs.
Do not expose internal database documents directly; use response DTOs.

# 2. Proposed module layout
src/
  config/          env.ts, database.ts, redis.ts
  modules/
    auth/           auth.routes.ts, auth.controller.ts, auth.service.ts, auth.schemas.ts
    candidates/     candidate.model.ts, candidate.repository.ts, candidate.service.ts
    onboarding/     onboarding.routes.ts, onboarding.service.ts
    payments/       payment.model.ts, payment.service.ts, razorpay.client.ts, payment.webhook.ts
    exams/          exam-attempt.model.ts, exam.service.ts, exam-provider.adapter.ts
    feedback/       feedback.model.ts, feedback.service.ts
    results/        result.model.ts, result.service.ts
    notifications/  notification.model.ts, email.provider.ts, notification.service.ts
    talent-acquisition/ lead.model.ts, lead.service.ts, ta-delivery.adapter.ts
  middleware/       auth.middleware.ts, validate.middleware.ts, error.middleware.ts, rate-limit.middleware.ts
  jobs/             queue.ts, payment-followup.worker.ts, result-email.worker.ts
  shared/           errors.ts, logger.ts, types.ts
  app.ts
  server.ts

# 3. Data model
Use separate collections for workflow entities so payment, exam, notification, and TA histories remain auditable. Candidate PII should be restricted to authorized services and roles.
| Collection | Key fields | Indexes / constraints |
| candidates | _id, fullName, emailNormalized, phoneE164, passwordHash, status, onboardingStep, createdAt, updatedAt | Unique sparse indexes on normalized email and phone, after deciding whether both are mandatory; index status and createdAt. |
| authSessions / refreshTokens (if used) | candidateId, tokenHash, expiresAt, revokedAt, createdAt | Index candidateId; TTL on expiresAt where compatible with revocation/audit requirements. Store token hashes, not raw refresh tokens. |
| otpChallenges | candidateId or normalizedPhone, codeHash, purpose, expiresAt, attempts, consumedAt, createdAt | Index phone/purpose/createdAt; TTL expiresAt; never store raw OTP. |
| payments | candidateId, provider, providerOrderId, providerPaymentId, amountMinor, currency, status, verifiedAt, createdAt | Unique providerOrderId; unique providerPaymentId when present; index candidateId/status/createdAt. |
| examAttempts | candidateId, provider, externalAttemptId, examUrl, status, startedAt, completedAt, resultStatus | Unique externalAttemptId when available; index candidateId/status and completedAt. |
| feedback | candidateId, examAttemptId, rating, answers, comments, submittedAt | Unique examAttemptId if one feedback submission per attempt is the rule; index candidateId. |
| results | candidateId, examAttemptId, score, outcome, finalizedAt, publishedAt, emailScheduledAt, emailSentAt | Unique examAttemptId; index status/finalizedAt. |
| notifications | candidateId, type, channel, status, idempotencyKey, scheduledAt, sentAt, attempts, providerMessageId, lastErrorCode | Unique idempotencyKey; index status/scheduledAt. |
| taLeads | candidateId, source, status, assignedTo, createdAt, lastContactAt, nextActionAt, notes | Unique candidateId + lead type or other agreed key; index status/nextActionAt/createdAt. |
| taFollowUps | candidateId, paymentId, dueAt, status, assignedTo, completedAt, outcome | Unique paymentId + follow-up type; index status/dueAt. |

# 4. Candidate and workflow states
| Entity | States | Transition rule |
| Candidate onboarding | registered → demo_pending → fee_pending → exam_ready → exam_in_progress → exam_completed → feedback_submitted → completed | Skipping demo moves forward exactly as video completion does; store onboarding progress server-side. |
| Payment | created → pending → paid | failed | cancelled | expired | refunded | Only backend-verified provider state may set paid. Late webhook events must not regress a paid state. |
| Exam attempt | created → link_issued → in_progress → completed | abandoned | invalidated | Completion must come from trusted exam-provider integration or a validated server-side event. |
| Result | pending → processing → finalized → email_scheduled → emailed | If not finalized at the 24-hour deadline, keep email pending and retry based on configured policy. |
| TA lead | new → queued → assigned → contacted → in_progress → resolved | closed | Create lead at registration. Add/update payment follow-up if payment remains incomplete at the 24-hour deadline. |

# 5. API contracts

## 5.1 Authentication
| Method and path | Request | Success response / behavior |
| POST /api/v1/auth/register | fullName, email, phone, password, acceptTerms | 201; candidate DTO and next onboarding step. Hash password; normalize email/phone; create TA lead and notification job idempotently. |
| POST /api/v1/auth/login | emailOrPhone, password | 200; access/session credential and candidate DTO. Apply rate limits and generic invalid-credential response. |
| POST /api/v1/auth/otp/request | phoneE164, purpose | 202; generic accepted response. Enforce resend cooldown, per-number/IP limits, short expiry, and provider delivery. |
| POST /api/v1/auth/otp/verify | phoneE164, challengeId, otp | 200; session/access credential after OTP validation and one-time consumption. |
| POST /api/v1/auth/logout | authenticated session | 204; revoke session/refresh token. |
| POST /api/v1/auth/password/forgot | email | 202; generic response to prevent account enumeration. |
| POST /api/v1/auth/password/reset | resetToken, newPassword | 204; single-use expiring token, invalidate relevant sessions. |

## 5.2 Onboarding and candidate profile
| Method and path | Purpose | Rules |
| GET /api/v1/candidates/me | Read candidate profile | Candidate can only read their own record. |
| PATCH /api/v1/candidates/me | Update permitted profile fields | Allowlist fields; never permit client updates to roles, payment state, result, or verification flags. |
| GET /api/v1/onboarding/status | Return current step and status | Server is source of truth; client may resume after login. |
| POST /api/v1/onboarding/demo/complete | Record video completion | Optional analytics; client completion is not a security boundary if viewing is non-mandatory. |
| POST /api/v1/onboarding/demo/skip | Record skip action | Advance to fee_pending; idempotent. |

## 5.3 Payment and exam
| Method and path | Purpose | Rules |
| POST /api/v1/payments/orders | Create Razorpay order | Authenticated candidate; amount/currency come from server configuration, never trust client amount; persist pending order. |
| POST /api/v1/payments/verify | Verify checkout response | Validate Razorpay signature on backend; reconcile provider status; idempotent. |
| POST /api/v1/payments/webhook | Receive Razorpay events | Verify webhook signature using raw request body; deduplicate provider event ID; acknowledge promptly and process safely. |
| GET /api/v1/payments/me | Get candidate payment state | Return safe payment DTO, never secrets or signing values. |
| GET /api/v1/exams/current | Get exam eligibility/link status | Require verified paid status and valid exam attempt; issue only approved destination. |
| POST /api/v1/exams/provider-callback | Receive completion/result updates | Provider-specific authentication/signature and replay protection required; contract TBD. |
| POST /api/v1/exams/attempts/:id/complete | Candidate-side completion request if provider supports it | Do not trust client alone for official completion; reconcile with provider data. |

## 5.4 Feedback, results, and TA
| Method and path | Purpose | Rules |
| POST /api/v1/exams/attempts/:id/feedback | Submit feedback | Only for a completed attempt; validate rating/answers; enforce one submission or versioning rule. |
| GET /api/v1/results/me | Read published result status | Return only the authenticated candidate's result and published fields. |
| GET /api/v1/admin/ta-leads | Search TA leads | TA/admin role required; pagination, filters, audit logging. |
| GET /api/v1/admin/ta-leads/:id | Read lead details | Role-based authorization and least-privilege fields. |
| PATCH /api/v1/admin/ta-leads/:id | Update assignment/contact/follow-up status | Validate allowed transitions; capture actor and timestamps. |
| GET /api/v1/admin/payments/pending-follow-up | List payment follow-ups | TA role; do not expose payment credentials or unnecessary PII. |

# 6. Standard response and error format
Success example:
{"data":{"candidateId":"...","nextStep":"demo_pending"},"meta":{"requestId":"..."}}
Error example:
{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed","details":[]},"meta":{"requestId":"..."}}
Use 400 for malformed/invalid input, 401 for unauthenticated requests, 403 for insufficient permission, 404 for missing resources, 409 for conflicts, 422 for valid syntax but invalid workflow state, 429 for rate limiting, and 500 for unexpected errors.
Never return stack traces, password hashes, OTP values, Razorpay secrets, raw provider payloads, or database internals.

# 7. Background job design
| Job | Schedule/trigger | Processing rules |
| candidate-registration-ta-notify | Enqueue after candidate and TA lead are persisted | Unique key candidateId + registration notification; retry transient failures; keep delivery state. |
| unpaid-payment-follow-up | Due 24 hours after the agreed payment-incomplete reference time | Re-read payment state at execution; no-op if paid; create/update one TA follow-up using unique key; channel TBD. |
| exam-result-email | Due 24 hours after exam completion | Re-read result; send only if finalized and not already sent; if not finalized, reschedule with bounded backoff; idempotency key per result/version. |
| notification-retry | On transient provider failure | Exponential backoff with max attempts; record terminal failure and surface operational alert. |
Recommended queue: Redis + BullMQ. A scheduled job must be persisted in the queue and/or represented in MongoDB so an API restart does not lose business-critical work. Avoid relying on in-process setTimeout.

# 8. Payment processing sequence
Client requests an order; API loads configured fee and creates Razorpay order.
API persists payment record with status pending and provider order ID.
Client opens Razorpay Checkout.
Checkout result is sent to API for signature verification; provider webhook independently updates status.
A transaction/state guard prevents duplicate paid transitions and duplicate exam access grants.
On verified payment, API marks candidate eligible, obtains exam link through the configured exam adapter, schedules exam-link email, and returns an approved redirect URL.
If payment remains incomplete at 24 hours, the worker rechecks provider/payment state before creating TA follow-up.

# 9. Security implementation requirements
Use Argon2id or bcrypt with an appropriate work factor for password hashing; never encrypt passwords for later recovery.
Use secure, expiring access credentials and refresh-token rotation/revocation where applicable. Web cookie strategy and mobile token storage should be documented separately.
Rate-limit registration, login, OTP request/verification, password reset, and payment endpoints.
Use allowlisted CORS origins; CORS is not authentication.
Validate request bodies with Zod and centralize error mapping.
Verify webhook signatures against raw bytes before JSON mutation; store provider event IDs to prevent replay/duplicate processing.
Use role-based access control for TA/admin routes and audit changes to candidate lead status.
Do not log authorization headers, passwords, OTPs, reset tokens, payment signatures, or full sensitive payloads.

# 10. Docker development specification
Docker Desktop on Windows with Linux containers.
Compose services initially: api and mongo; later add redis and worker.
API binds to 0.0.0.0 inside the container and uses mongodb service DNS name (mongo), not localhost, for its connection string.
MongoDB data persists in a named Docker volume. The host port should bind to 127.0.0.1 for local development only.
Health checks: liveness checks process; readiness checks MongoDB connectivity.
Use .env locally but commit only .env.example. Production secrets must be injected by the deployment platform/secret manager.
Use a non-root user in the production image, pinned/maintained base images, and a separate production Compose/deployment profile.

# 11. Testing strategy
| Test level | Coverage |
| Unit | Auth service, state transitions, payment status guards, idempotency keys, result eligibility, follow-up decisions. |
| Integration | MongoDB repositories, API validation, authentication, Razorpay adapter mocks, webhook signature verification, queue behavior. |
| Contract | OpenAPI schema compatibility for web/mobile clients; provider callback payloads. |
| End-to-end | Registration → demo skip/complete → payment success → exam link → exam completion → feedback → result email. |
| Failure-path | Duplicate registration, invalid OTP, expired OTP, payment cancelled, duplicate webhook, late webhook, job retry, email provider failure, result not finalized at 24 hours. |
| Security | Authorization/IDOR tests, rate limits, CORS, validation, secret leakage, role separation for TA/admin. |

# 12. Decisions required before production
Exam platform and secure completion callback or polling contract.
TA delivery channel and team roles/assignment rules.
Email and OTP providers, sender identity, templates, and delivery policy.
Exact timer origin for the 24-hour unpaid follow-up (registration time vs payment order creation vs last payment attempt).
Result-not-ready retry policy and whether results require internal review/finalization.
Fee, currency, refunds, duplicate payment handling, and reconciliation process.
Production hosting, MongoDB hosting/backup, Redis availability, observability, data retention, and privacy/consent policy.

# 13. Implementation milestones
Dockerized Express/TypeScript skeleton, MongoDB connectivity, health checks, lint/typecheck/test setup.
Candidate model, registration, password login, mobile OTP integration, session/token strategy.
Onboarding status and demo skip/complete endpoints.
Razorpay order, signature/webhook handling, payment persistence, exam eligibility.
Email service, exam link adapter, registration-to-TA lead creation.
Redis/BullMQ worker, 24-hour payment follow-up, result email scheduling and retries.
Exam integration, feedback, results, TA dashboard APIs, authorization, end-to-end tests.
