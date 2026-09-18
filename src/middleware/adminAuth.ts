import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

// Gate for internal/admin-only routes (e.g. resend-exam-link) shared via x-admin-api-key.
// Uses a constant-time comparison so response timing can't leak the key byte-by-byte.
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  if (!env.ADMIN_API_KEY) {
    return res
      .status(500)
      .json({ success: false, data: null, error: "Admin access is not configured" });
  }

  const provided = Buffer.from(req.get("x-admin-api-key") || "");
  const expected = Buffer.from(env.ADMIN_API_KEY);
  const isValid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

  if (!isValid) {
    return res.status(401).json({ success: false, data: null, error: "Unauthorized" });
  }

  return next();
}
