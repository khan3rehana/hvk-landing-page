# HVK Backend

Standalone Node.js + Express + TypeScript API for HVK candidate registration, Razorpay
payments, and Resend acknowledgement emails. Shared by the **web app** and the
**mobile app** — CORS is configured for multiple origins.

## Stack
Express 5 · TypeScript · MongoDB/Mongoose · Razorpay · Resend · Zod · Swagger (OpenAPI 3)

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
| POST | /api/razorpay/order | Create Razorpay order for a candidate |
| POST | /api/razorpay/verify | Verify payment signature, mark paid, send email |
| POST | /api/razorpay/webhook | Razorpay server-to-server webhook (payment.captured) — confirms payment even if the client never calls /verify |
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
