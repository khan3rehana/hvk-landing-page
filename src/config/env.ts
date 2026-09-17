import dotenv from "dotenv";

dotenv.config();

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
  RESEND_API_KEY: required("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: required("RESEND_FROM_EMAIL"),
  // Comma-separated list of allowed origins (web app, mobile app dev tunnels, etc.)
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "*").split(",").map((o) => o.trim()),
};
