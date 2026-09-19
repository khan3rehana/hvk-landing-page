# HVK Backend

Standalone Node.js + Express + TypeScript API for HVK candidate registration, Razorpay
payments, and Brevo acknowledgement emails. Shared by the **web app** and the
**mobile app** — CORS is configured for multiple origins.

## Stack
Express 5 · TypeScript · MongoDB/Mongoose · Razorpay · Brevo · Zod · Swagger (OpenAPI 3)

## Setup
\`\`\`bash
npm install
cp .env.example .env   # fill in real values
npm run dev             # starts on http://localhost:5000
\`\`\`

## API Docs (Swagger)
Once running: **http://localhost:5000/api-docs**
Raw OpenAPI JSON: **http://localhost:5000/api-docs.json** — mobile team can import this
directly into Postman / their codegen tooling.

## Endpoints
| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| POST | /api/register | Create pending candidate (blocks duplicate email/phone) |
| POST | /api/razorpay/order | Create Razorpay order for a candidate — Orders flow, used by clients (mobile app) that embed the Razorpay SDK directly with a key_id |
| POST | /api/razorpay/verify | Verify Orders-flow payment signature, mark paid, send email |
| POST | /api/razorpay/payment-link | Create a Razorpay Payment Link for a candidate — Payment Links flow, used by the web app. Never exposes a Razorpay key to the browser; the client just redirects to the returned URL |
| POST | /api/razorpay/payment-link/verify | Verify a Payment Link callback (called by the web app's /registration/callback page), mark paid, send email |
| POST | /api/razorpay/webhook | Razorpay server-to-server webhook (payment.captured, payment_link.paid) — confirms payment even if the client never calls /verify or /payment-link/verify |
| GET | /api/candidates/:id | Get candidate status (used by mobile app) |

## Scripts
- \`npm run dev\` — dev server with hot reload
- \`npm run build\` — compile to \`dist/\`
- \`npm start\` — run compiled build
- \`npm run typecheck\` — type-check only

## CORS for mobile
Set \`CORS_ORIGINS\` in \`.env\` to a comma-separated list including your web app's
domain and mobile dev/prod origins (or app scheme if applicable). Avoid \`*\` in production.

## Response shape
All endpoints return: \`{ success: boolean, data: object | null, error: string | null }\`
