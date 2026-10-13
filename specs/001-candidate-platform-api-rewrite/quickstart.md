# Quickstart: Run and Validate the v1 API

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · Contracts: [rest-api-v1](contracts/rest-api-v1.md), [background-jobs](contracts/background-jobs.md). This is a validation guide — it proves the feature works end to end once implemented; it contains no implementation code. Commands are run from `E:\hvk\backend`.

## 0. Prerequisites

- Docker Desktop (Linux containers) · Node.js ≥ 22.12 · Git
- Razorpay **test** key id/secret and a webhook secret (only for the manual smoke in §4; automated tests need none)
- Brevo API key (optional locally — with `EMAIL_PROVIDER=log` emails are written to the log instead of sent; `log` is refused in production)

## 1. Bring the stack up (US-ops, FR-120–FR-123, SC-009)

```bash
cp .env.example .env          # fill secrets; never commit .env
docker compose up -d --build  # api, worker, mongo, redis
curl http://127.0.0.1:5000/health/ready
```

Expected: `{"data":{"status":"ready","checks":{"database":"up","queue":"up"}},"meta":{"requestId":"…"}}`.
Restart check (FR-121): register a user (§3), run `docker compose down` then `docker compose up -d`, log in again — the account still exists. Port check: `docker compose ps` shows ports bound to `127.0.0.1` only.

## 2. Automated verification (the primary proof)

```bash
npm ci
npm run verify          # typecheck → lint → unit → integration → contract → e2e → security → audit
npm run test:queue      # needs the compose redis service (TEST_REDIS_URL=redis://127.0.0.1:6379/15)
npm run test:coverage   # enforces FR-134 thresholds
```

Expected: all green; coverage thresholds met; `tests/contract/no-legacy.test.ts` passes (SC-013). The e2e journey (`tests/e2e/journey.test.ts`) walks register → demo skip → order → verify → exam link → provider callbacks → feedback → +24 h result email using the `FakeClock`, so it takes seconds.

## 3. Manual API walk-through (against `docker compose` stack, `EXAM_PROVIDER=stub`, `OTP_SENDER=log`)

```bash
H='Content-Type: application/json'; B=http://127.0.0.1:5000/api/v1

# US1 — register (expects 201, nextStep demo_pending), duplicate (expects 409), login
curl -s -X POST $B/auth/register -H "$H" -d '{"fullName":"Test User","email":"test@example.com","phone":"9876543210","password":"CorrectHorse9!","acceptTerms":true}'
curl -s -X POST $B/auth/register -H "$H" -d '{"fullName":"Test User","email":"TEST@example.com","phone":"+919876543210","password":"CorrectHorse9!","acceptTerms":true}'
TOKEN=$(curl -s -X POST $B/auth/login -H "$H" -d '{"emailOrPhone":"test@example.com","password":"CorrectHorse9!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')
curl -s $B/candidates/me -H "Authorization: Bearer $TOKEN"

# US2 — skip demo (twice: second call changed=false)
curl -s -X POST $B/onboarding/demo/skip -H "Authorization: Bearer $TOKEN"
curl -s -X POST $B/onboarding/demo/skip -H "Authorization: Bearer $TOKEN"

# US3 — unpaid access is refused; create order
curl -s -i $B/exams/current -H "Authorization: Bearer $TOKEN"        # expect 422 PAYMENT_REQUIRED
curl -s -X POST $B/payments/orders -H "$H" -H "Authorization: Bearer $TOKEN" -d '{}'
```

Check in Mongo (`docker compose exec mongo mongosh hvk`): one `candidates`, one `taLeads` (`new`), one `notifications` (`ta_registration_alert`), one `taFollowUps` (`scheduled`).
In the worker logs: `job finished candidate-registration-ta-notify` and (with a configured Brevo key) the TA mailbox receives the alert → lead becomes `queued`.

## 4. Manual payment smoke with Razorpay test mode

1. Use the order from §3 with Razorpay test Checkout (the web app on the `frontend` branch once adapted, or Razorpay's hosted test page for the order) and pay with a Razorpay test card.
2. Expose the API for the webhook (e.g. a tunnel) and configure the dashboard webhook to `…/api/v1/payments/webhook` with events `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and the secret from `.env`.
3. Call `POST /payments/verify` with the three `razorpay_*` fields from the Checkout success handler.

Expected: `200` with `status:"paid"`; `GET /exams/current` returns the stub exam URL; exactly one `examAttempts`, one `exam_link` notification (sent), `payments.effectsAppliedAt` set. Replay the same verify call and re-deliver the webhook from the dashboard: counts unchanged (SC-003). Tamper one character of the signature: `400 PAYMENT_VERIFICATION_FAILED`, payment and candidate state unchanged (FR-055).

## 5. Time-dependent behaviour without waiting 24 hours (SC-004–SC-007)

Set short windows in `.env` and recreate the worker: `PAYMENT_FOLLOWUP_DELAY_HOURS=0.02`, `RESULT_EMAIL_DELAY_HOURS=0.02`, `RECONCILE_INTERVAL_SECONDS=30` (≈ 72 s).

| Check | Steps | Expected |
|---|---|---|
| Unpaid follow-up | register a second user, do not pay, wait ~75 s | one `taFollowUps` row `open`, one TA follow-up mail; the paid user from §4 has `cancelled` |
| Idempotence | `docker compose restart worker` right after the due time | still exactly one follow-up |
| Queue loss | `docker compose exec redis redis-cli FLUSHALL`, register another user, wait for the reconciler tick | the follow-up still activates once |
| Exam completion | `npm run dev:send-exam-callback -- --attempt <id> --type attempt.completed` then `--type result.finalized --score 80 --outcome pass` (dev helper signs with `EXAM_PROVIDER_CALLBACK_SECRET`) | attempt `completed`, result `email_scheduled`; after ~75 s result `emailed`, `GET /results/me` returns score/outcome |
| Result not final | send only `attempt.completed`, wait | result stays pending; job reschedules; `emailAttempts` increases |
| Feedback | `POST /exams/attempts/<id>/feedback {"rating":5}` twice | `201`, then `409 FEEDBACK_ALREADY_SUBMITTED` |

## 6. Staff and RBAC (US6)

```bash
npm run seed:staff -- --email ta@example.com --phone +919000000001 --role ta     # prompts for password, no echo
```

Log in as the TA user and call `GET $B/admin/ta-leads?page=1&pageSize=20&status=queued`; as the candidate token the same call returns `403 FORBIDDEN`; without a token `401`. Patch a lead `contacted → in_progress` (needs `expectedVersion`), then try `new → resolved` on another (expect `422`). `auditLogs` shows the entries.

## 7. Legacy migration rehearsal (US7, SC-010)

Use a **scratch** database, never production first.

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/hvk_rehearsal npm run seed:legacy-fixture      # inserts legacy-shaped docs (paid, pending, failed, bad phone)
npm run migrate:legacy -- --dry-run     # report only; nothing written
npm run migrate:legacy -- --apply       # migrates; bad phone → migrationRejects
npm run migrate:legacy -- --apply       # second run: 0 changes
```

Expected: paid fixture candidates have a paid payment, a `link_issued` attempt, `exam_ready`; pending/failed → `fee_pending`; each candidate has a lead (no notification sent); report lists every record. Then: OTP login or forgot-password works for a migrated user. Only after verification run `--finalize`. Legacy paths: `curl -i -X POST http://127.0.0.1:5000/api/register` → `410 API_VERSION_RETIRED`.

## 8. Prove the clean-up (FR-141, SC-013)

```bash
git grep -nEi "adminAuth|x-admin-api-key|examAccessToken|payment-link|sib-api-v3-sdk|morgan|swagger-jsdoc|EXAM_PLACEHOLDER_URL|ADMIN_API_KEY" -- src package.json .env.example README.md
```

Expected: no output (the 410 module may mention retired path names only inside `legacy-gone.middleware.ts`, which is allow-listed by the contract test). `git ls-files src/controllers src/routes src/models/Candidate.ts` prints nothing.

## 9. Operational runbook pointers

- Re-queue stuck work: `npm run jobs:requeue -- result <resultId>` / `notification <id>` / `followup <candidateId>`.
- Duplicate-payment review: `db.payments.find({ "flags.duplicate": true })`; refunded/under review: `db.payments.find({ "flags.requiresReview": true })`.
- Attention lists: `db.results.find({ needsAttention: true })`, `db.examAttempts.find({ linkNeedsAttention: true })`, `db.notifications.find({ status: "failed" })`.
- Rotate the exam callback secret: set the new value as `EXAM_PROVIDER_CALLBACK_SECRET` and the old as `…_PREVIOUS`, redeploy, then remove `…_PREVIOUS`.

## Acceptance mapping

| Section | Proves |
|---|---|
| §1 | FR-011, FR-120–123, SC-009 |
| §2 | FR-130–135, SC-008, SC-011, SC-012, SC-013 |
| §3 | US1, US2, FR-024, FR-050, FR-072 |
| §4 | US3, SC-002, SC-003, FR-055 |
| §5 | US4, US5, SC-004–SC-007 |
| §6 | US6, FR-100–FR-101 |
| §7–§8 | US7, SC-010, SC-013 |
