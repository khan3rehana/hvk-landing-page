try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to variables already set in the environment.
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  PORT: process.env.PORT || "5000",
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: required("MONGODB_URI"),
  RAZORPAY_KEY_ID: required("RAZORPAY_KEY_ID"),
  RAZORPAY_KEY_SECRET: required("RAZORPAY_KEY_SECRET"),
  RAZORPAY_REGISTRATION_FEE: Number(process.env.RAZORPAY_REGISTRATION_FEE ?? "50000"),
  // Secret configured on the Razorpay dashboard webhook — separate from RAZORPAY_KEY_SECRET.
  // Optional so the app still boots without it, but the webhook route refuses requests until it's set.
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  RESEND_API_KEY: required("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: required("RESEND_FROM_EMAIL"),
  // hvk-exam-backend base URL and shared secret (server-to-server auth)
  EXAM_API_URL: process.env.EXAM_API_URL || "",
  INTERNAL_EXAM_API_KEY: process.env.INTERNAL_EXAM_API_KEY || "",
  // Shared secret for internal/admin-only routes (e.g. resend-exam-link). Optional so the
  // app still boots without it, but those routes refuse requests until it's set.
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || "",
  // Comma-separated list of allowed origins (web app, mobile app dev tunnels, etc.)
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "*").split(",").map((o) => o.trim()),
};
