import crypto from "crypto";
import { ICandidate } from "../models/Candidate";
import { env } from "../config/env";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mints a new one-time exam-access token for a candidate, overwriting any previous
 * token (its hash is replaced, so the old raw token can never match again). Only the
 * hash is persisted — the raw token is returned for the caller to email/hand out once.
 */
export async function issueExamAccessToken(candidate: ICandidate): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.EXAM_ACCESS_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  candidate.examAccessTokenHash = hashToken(rawToken);
  candidate.examAccessTokenExpiresAt = expiresAt;
  candidate.set("examAccessTokenUsedAt", null);
  await candidate.save();

  return rawToken;
}

export function buildExamAccessUrl(token: string): string {
  return `${env.FRONTEND_URL}/exam/access/${token}`;
}

export { hashToken };
