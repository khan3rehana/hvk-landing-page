# Contract: Legacy → v1 Mapping, Parity Checklist and Removal Inventory

**Spec**: [../spec.md](../spec.md) (FR-140–FR-147, US7) · Baseline analysed: branch `backend` @ `105a7b9` ("feat: add candidate module with registration, validation, payment workflows, and email notifications"). Tag it `legacy-backend-baseline` before deleting anything (FR-140); `git show legacy-backend-baseline:<path>` retrieves any removed file.

## 1. Route mapping

| Legacy route (`/api/…`) | v1 replacement | Status | Notes |
|---|---|---|---|
| `GET /health` | `GET /health`, `/health/live`, `/health/ready` | kept + extended | uptime monitors keep working |
| `GET /api-docs`, `/api-docs.json` | same paths | kept | now generated from Zod |
| `POST /register` | `POST /api/v1/auth/register` | replaced | adds `password`, `acceptTerms`; profile fields optional; response now `{candidate, nextStep}`; **no tokens** — call login |
| `POST /razorpay/order` | `POST /api/v1/payments/orders` | replaced | candidate comes from the session, not the body; amount server-side; returns `keyId` for Checkout |
| `POST /razorpay/verify` | `POST /api/v1/payments/verify` | replaced | adds ownership check + provider lookup; **never marks candidate `failed`** |
| `POST /razorpay/payment-link` | — | **retired** | hosted-redirect flow replaced by Orders + Checkout (LLD §5.3/§8) |
| `POST /razorpay/payment-link/verify` | — | **retired** | relied on browser-supplied redirect parameters (`candidateId` taken from the URL) |
| `POST /razorpay/webhook` | `POST /api/v1/payments/webhook` | replaced | event-id dedupe, `payment.failed`/refund handling; `payment_link.*` events acknowledged and ignored |
| `GET /candidates/:id` | `GET /api/v1/candidates/me` | replaced | unauthenticated by-id read removed (IDOR/PII) |
| `POST /exam-access/verify` | `GET /api/v1/exams/current` | **retired** | magic-link redemption replaced by authenticated, payment-gated access |
| `POST /candidates/:id/reset-exam-access`, `…/resend-exam-link` | `POST /api/v1/admin/candidates/:id/exam-link/resend` | replaced | RBAC (`admin`) instead of shared API key; audited |
| `POST /email/send` | — | **retired** | arbitrary-recipient/HTML sending is not in the LLD and is an abuse risk; all mail is system-generated from templates |
| `GET /email/templates` | — | **retired** | no consumer |
| `x-admin-api-key` auth | JWT roles `ta`/`admin` | replaced | RBAC + audit (LLD §9) |

All retired and replaced legacy paths answer **410 `API_VERSION_RETIRED`** (FR-145) with the replacement in `details` for `LEGACY_410_SUNSET_DAYS` (default 90), then the one module `middleware/legacy-gone.middleware.ts` is deleted.

## 2. Parity checklist (capabilities that must survive; each needs ≥ 1 test — FR-142/147)

| # | Legacy behaviour | v1 location | Test level |
|---|---|---|---|
| P-01 | Duplicate email/phone blocked (pre-check + unique index race) → 409 | FR-022 | integration (race) |
| P-02 | Optional `city/state/pincode` (pincode 6 digits) + college/place | FR-020 | unit + integration |
| P-03 | Fee from config in paise, default 50000, INR | FR-062 | unit |
| P-04 | Candidate already paid cannot create another order | FR-050 | integration |
| P-05 | Order stored on candidate; verify checks order belongs to candidate | FR-054 | integration |
| P-06 | HMAC-SHA256 `order_id\|payment_id` with constant-time compare | FR-054 | unit |
| P-07 | Webhook: signature over raw bytes, constant-time, 500 if secret unset, ack unknown events | FR-056 | integration |
| P-08 | Verify-vs-webhook race → exactly one finalisation / one email (atomic claim) | FR-058, SC-003 | integration (concurrent) |
| P-09 | Failure to create exam link must not fail the payment | FR-070 | integration |
| P-10 | Receipt + exam link email (HTML-escaped template variables) | FR-071 | unit (renderer) + integration |
| P-11 | CastError/invalid id → 404 | R-25 | unit |
| P-12 | CORS multi-origin from `CORS_ORIGINS` | FR-012 | security |
| P-13 | Swagger UI + JSON for the mobile team | FR-015 | contract |
| P-14 | Admin can re-send exam access | FR-078 | integration |
| P-15 | Brevo transactional send with sender override | FR-071 (adapter) | unit (fake SDK) |
| P-16 | Template `{{key}}`, `{{#if key}}` rendering + escaping | email renderer | unit |
| P-17 | Exam backend integration with `x-internal-api-key` | exam adapter | unit (fake HTTP) |

## 3. Removal inventory (what "clean older code" means; verified by SC-013)

**Files (all tracked, delete after parity tests pass):**

```text
src/controllers/candidateController.ts      src/controllers/emailController.ts
src/routes/candidateRoutes.ts               src/routes/emailRoutes.ts
src/models/Candidate.ts                     src/middleware/adminAuth.ts
src/middleware/errorHandler.ts (rewritten)  src/docs/swagger.ts (replaced by openapi.ts)
src/services/emailService.ts                src/services/templateService.ts
src/services/examAccessService.ts           src/services/examAccessTokenService.ts
src/validators/candidateValidator.ts        src/validators/emailValidator.ts
src/config/db.ts (rewritten)                src/config/env.ts (rewritten)
src/config/razorpay.ts (moved to payments/razorpay.client.ts)
src/types/express.d.ts (rewritten)          src/app.ts, src/server.ts (rewritten)
src/templates/emails/acknowledgement.html   → evolves into notifications/templates/exam-link.html
src/templates/emails/exam-access-reset.html → deleted (magic link retired)
src/templates/emails/notification.html      → reviewed; kept only if reused by a new template, else deleted
```

Untracked local output to delete: `dist/` (stale build; `npm run build` will clean first).

**Dependencies removed**: `sib-api-v3-sdk`, `morgan`, `swagger-jsdoc`, `ts-node-dev`, `@types/morgan`, `@types/swagger-jsdoc`. **Behaviour removed**: unconditional `dns.setServers(...)` (now opt-in `MONGODB_DNS_SERVERS`), `express.urlencoded`, `cors({credentials:true})`, `createEmailCampaign`, `EXAM_PLACEHOLDER_URL` fallback, `status:"failed"` mutation on bad signatures, unauthenticated candidate read.

**Docs**: `README.md` rewritten (fix broken code fences; endpoint table → link to OpenAPI), `.env.example` rewritten.

## 4. Environment variable changes

| Legacy variable | v1 | Change |
|---|---|---|
| `PORT`, `NODE_ENV`, `MONGODB_URI`, `CORS_ORIGINS`, `FRONTEND_URL` | same | kept (`FRONTEND_URL` now only for email links) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | same | kept; webhook secret becomes **required** in production |
| `RAZORPAY_REGISTRATION_FEE` | `REGISTRATION_FEE_MINOR` (+ `REGISTRATION_FEE_CURRENCY=INR`) | renamed; same value (paise) |
| `BREVO_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` | same | kept |
| `EXAM_API_URL`, `INTERNAL_EXAM_API_KEY` | same | kept; add `EXAM_PROVIDER` |
| `EXAM_PLACEHOLDER_URL` | — | **removed** (no fake links) |
| `EXAM_ACCESS_TOKEN_TTL_HOURS` | — | **removed** (magic link retired) |
| `ADMIN_API_KEY` | — | **removed** (RBAC) |
| — | `LOG_LEVEL`, `MONGODB_DNS_SERVERS` (opt), `REDIS_URL`, `WORKER_ENABLED`, `WORKER_CONCURRENCY`, `RECONCILE_INTERVAL_SECONDS`, `TRUST_PROXY_HOPS`, `DEFAULT_PHONE_REGION` | new |
| — | `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`, `PASSWORD_RESET_TTL_MINUTES`, `PASSWORD_RESET_URL_TEMPLATE` | new |
| — | `OTP_ENABLED`, `OTP_SENDER`, `OTP_PEPPER`, `OTP_TTL_MINUTES` | new |
| — | `PAYMENT_ORDER_TTL_MINUTES`, `PAYMENT_FOLLOWUP_DELAY_HOURS`, `RESULT_EMAIL_DELAY_HOURS` | new (defaults 60 / 24 / 24) |
| — | `EXAM_PROVIDER_CALLBACK_SECRET`, `EXAM_PROVIDER_CALLBACK_SECRET_PREVIOUS` | new |
| — | `TA_DELIVERY` (`email`), `TA_NOTIFY_EMAILS`, `EMAIL_PROVIDER` (`brevo` \| `log`) | new |
| — | `LEGACY_410_ENABLED`, `LEGACY_410_SUNSET_DAYS` | new, temporary |

## 5. Frontend / mobile impact (branch `frontend`; needs its own spec)

| Area | Change required |
|---|---|
| Base URL/path | `/api/…` → `/api/v1/…`; handle new envelope (`data`/`error.code`/`meta.requestId`) in `lib/api.ts` and `types/index.ts` |
| Registration form | add password + terms checkbox; call `login` after `register`; store session securely; refresh on 401 |
| Payment | replace Payment-Link redirect and `/registration/callback` query handling with Razorpay Checkout using `POST /payments/orders` + `POST /payments/verify` (standard `razorpay_*` fields); show exam link/state from `verify` and `GET /exams/current` |
| Exam access | remove `/exam/access/[token]` page; add exam-status screen using `GET /exams/current` |
| New screens | login/OTP, forgot/reset password, demo video with skip, feedback + thank-you, result status |
| CORS | web origin must be in `CORS_ORIGINS` |

## 6. Migration command (FR-143/144)

```text
npm run migrate:legacy -- --dry-run            # default; writes migration-report-<ts>.json only
npm run migrate:legacy -- --apply              # converts + creates payments/attempts/leads; idempotent
npm run migrate:legacy -- --finalize           # after verification: $unset legacy fields, drop email_1/phone_1
```

Preconditions printed by the tool: take a `mongodump` first; stop the legacy API (or accept that writes during migration may be missed and re-run `--apply`, which is idempotent). Rules are in [data-model.md](../data-model.md#legacy-document--v1-mapping-migration-input-shape).
