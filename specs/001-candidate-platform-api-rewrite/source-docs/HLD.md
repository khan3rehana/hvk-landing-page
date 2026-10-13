<!-- Text extraction of Candidate-Platform-HLD.docx (Version 1.0, Draft for review, 13 October 2026).
     The .docx is the source of truth; section numbers below are cited from the spec as "HLD §n". -->

High-Level Design (HLD)
Candidate Registration, Payment, Examination & Talent Acquisition Platform
Version 1.0  |  Status: Draft for review  |  Date: 13 October 2026

# 1. Purpose
This document describes the high-level architecture, system boundaries, major components, integrations, and operational approach for the Candidate Platform. It is intended to align product, web, mobile, backend, QA, and DevOps teams before implementation.

# 2. Goals and scope
Allow candidates to register and authenticate using email/password or mobile OTP.
Show an onboarding demo video after registration, with the ability to continue after completion or skip.
Collect a registration fee through Razorpay and grant exam access only after verified payment.
Email the exam link and redirect the candidate to the exam destination after successful payment.
Notify Talent Acquisition (TA) immediately after registration and create a payment follow-up when payment remains incomplete after 24 hours.
Collect feedback after exam completion, show a thank-you page, and email the finalized result 24 hours after exam completion.
Expose a versioned REST API that can be shared by the web frontend and mobile application.

# 3. Out of scope / decisions still required
Whether the exam is hosted by a third-party platform or implemented inside this product is not yet confirmed. This design treats the exam as an external destination initially.
The exam provider, exam URL generation method, and how exam completion is securely reported back to this platform must be selected.
The registration fee amount, refund/cancellation policy, payment failure policy, email provider, SMS/OTP provider, and production hosting provider are TBD.
TA delivery channel (admin dashboard, email, CRM, or telecalling system) is TBD. The system should persist the lead internally regardless of the final delivery integration.

# 4. Architecture principles
Separate frontend and backend Git repositories.
Backend is the source of truth for identity, authorization, payment verification, workflow status, and notification scheduling.
Web and mobile clients consume the same versioned API; business rules are not duplicated in clients.
Use asynchronous background processing for delayed follow-ups and result emails.
Use idempotency and durable state transitions to avoid duplicate payments, emails, and follow-up records.
Run local development services in Docker Desktop on Windows; production deployment configuration will be defined separately.

# 5. System context
Candidate uses the web or mobile client. Both clients communicate with the Express API over HTTPS. The API uses MongoDB for persistent data and a background worker/queue for scheduled tasks. External integrations include Razorpay, an email provider, an OTP delivery provider, the exam platform, and the selected TA channel.
WEB CLIENT (Next.js/TypeScript) ─┐
MOBILE CLIENT (framework TBD) ───┴── HTTPS REST API (Node.js + Express + TypeScript)
                                      ├── MongoDB (Mongoose)
                                      ├── Redis + job queue / worker (planned)
                                      ├── Razorpay
                                      ├── Email provider
                                      ├── OTP provider
                                      ├── Exam platform (TBD)
                                      └── TA dashboard / email / CRM (TBD)

# 6. Major components
| Component | Responsibility | Notes |
| Web application | Candidate registration, login, onboarding, payment, exam hand-off, feedback, result status, admin UI if included. | Separate repo: candidate-platform-web. |
| REST API | Authentication, candidate profile, onboarding state, payment orders and verification, exam workflow, feedback, results, TA lead APIs. | Separate repo: candidate-platform-api. |
| MongoDB | Stores candidates, auth identities, payments, onboarding progress, exam attempts, feedback, results, notification and TA follow-up records. | Access through Mongoose; indexes and retention rules required. |
| Background worker | Schedules 24-hour payment follow-ups and result email jobs; retries transient delivery failures. | Redis + BullMQ proposed; add in implementation phase. |
| Razorpay | Checkout and payment processing. | Backend verifies signature and webhook events; browser redirect alone is not trusted. |
| Email service | OTP/verification where configured, exam link, result notification, operational notifications. | Provider TBD; store delivery status and retry. |
| TA workflow | Receives candidate lead at registration and payment follow-up after 24 hours if unpaid. | Channel TBD; internal lead record is mandatory. |
| Exam integration | Creates/returns exam link and communicates completion/result status. | Provider and callback/API contract TBD. |

# 7. End-to-end workflows

## 7.1 Registration and onboarding
Candidate submits registration details. API validates input, checks duplicate email/mobile, hashes password, and persists candidate.
API creates a TA lead and queues immediate notification to the configured TA channel.
Candidate can authenticate and is shown the demo video. Completing the video enables Next; Skip is always available.
Candidate continues to the registration fee page.

## 7.2 Payment and exam access
API creates a payment order with Razorpay and stores a pending payment record.
Candidate completes checkout. API verifies the Razorpay signature and reconciles payment state with a webhook/provider lookup.
Only a verified successful payment changes payment status to paid and enables exam access.
API obtains or constructs an approved exam link, sends it to the candidate's registered email, and returns the link for redirect.
If payment is still incomplete 24 hours after the applicable payment attempt/registration rule, a background job creates or updates a TA follow-up. Successful payment before processing suppresses unnecessary outreach.

## 7.3 Exam completion, feedback and result
Exam provider or trusted completion callback marks the exam attempt completed. Candidate browser navigation alone is not sufficient evidence of completion.
Candidate is shown a feedback form; after submission, the API stores feedback and the UI shows a thank-you page.
A result email job is scheduled for 24 hours after exam completion.
At send time, worker checks that the result is finalized and the email has not already been sent. If not finalized, notification remains pending and is retried or rescheduled according to an agreed policy.

# 8. Deployment view
Local development: Docker Desktop on Windows; Compose services for API and MongoDB initially, then Redis/worker when scheduled jobs are implemented.
Frontend: separate repository and independent deployment.
Backend API and worker: separately deployable containers sharing the same codebase and configuration conventions.
Production: managed secrets, TLS, database backups, monitoring, log aggregation, alerting, and a managed or secured MongoDB deployment are required before launch.

# 9. Security and privacy
Hash passwords with a modern password-hashing algorithm; never store plaintext passwords or OTPs.
Expire OTPs and apply request/verification rate limits. Do not reveal whether a particular email or phone number is registered.
Verify Razorpay signatures server-side and validate webhook authenticity. Use idempotency keys and unique provider event IDs.
Use role-based access control for TA/admin functions and least-privilege database credentials.
Share only necessary candidate data with TA; record access and follow applicable consent, privacy, and retention requirements.
Keep secrets out of Git and Docker images. Use .env locally and a secret manager in production.
Use HTTPS in production, secure cookies/tokens, request validation, security headers, CORS allowlists, and audit logging.

# 10. Reliability and observability
Health endpoints distinguish liveness from readiness, including database connectivity.
Background jobs must be durable, idempotent, retryable, and observable.
Record correlation/request IDs, payment IDs, candidate IDs, job IDs, and notification outcomes without logging secrets or sensitive payloads.
Define backup/restore tests, error alerts, queue-lag monitoring, and payment reconciliation before production.

# 11. Key architectural risks
| Risk | Mitigation / decision |
| Exam completion not reliably reported | Choose exam provider and define authenticated callback/polling contract before finalizing result scheduling. |
| Payment status mismatch | Verify signatures, process webhooks idempotently, reconcile provider state, and do not trust frontend success alone. |
| Duplicate or missed notifications | Use durable jobs, unique business keys, retries, dead-letter/error handling, and delivery status. |
| TA data leakage | Role-based access, minimum necessary fields, audit trail, and approved delivery channel. |
| 24-hour rule ambiguity | Define the exact timer start for unpaid payments and the retry schedule when a result is not finalized. |

# 12. Acceptance criteria for architecture
Web and mobile can use the same versioned API.
Payment verification is server-side and exam access is not granted on an unverified client response.
Registration creates a durable candidate record and TA lead.
24-hour workflows survive API restarts and do not create duplicate follow-ups or result emails.
Data is persisted in MongoDB volume during local Docker restarts.
Secrets are excluded from source control and production deployment uses managed secrets.
