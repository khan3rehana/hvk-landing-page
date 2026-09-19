import type {
  ApiResponse,
  CreatePaymentLinkData,
  RegisterCandidateData,
  VerifyPaymentData,
} from "@/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

export class ApiError extends Error {}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "Could not reach the server. Please check your connection and try again."
    );
  }

  const body: ApiResponse<T> = await response.json().catch(() => ({
    success: false,
    data: null,
    error: "Unexpected response from the server.",
  }));

  if (!response.ok || !body.success || body.data === null) {
    throw new ApiError(body.error ?? "Something went wrong. Please try again.");
  }

  return body.data;
}

export interface RegisterCandidatePayload {
  name: string;
  email: string;
  phone: string;
  college: string;
  place: string;
  city: string;
  state: string;
  pincode: string;
}

export function registerCandidate(payload: RegisterCandidatePayload) {
  return apiFetch<RegisterCandidateData>("/api/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Creates a hosted Razorpay Payment Link — no Razorpay key ever reaches the browser. */
export function createPaymentLink(candidateId: string) {
  return apiFetch<CreatePaymentLinkData>("/api/razorpay/payment-link", {
    method: "POST",
    body: JSON.stringify({ candidateId }),
  });
}

export interface VerifyPaymentLinkPayload {
  candidateId: string;
  razorpay_payment_id: string;
  razorpay_payment_link_id: string;
  razorpay_payment_link_reference_id: string;
  razorpay_payment_link_status: string;
  razorpay_signature: string;
}

/** Called by the /registration/callback page once Razorpay redirects back. */
export function verifyPaymentLink(payload: VerifyPaymentLinkPayload) {
  return apiFetch<VerifyPaymentData>("/api/razorpay/payment-link/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
