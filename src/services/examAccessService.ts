import { env } from "../config/env";

interface CreateExamAccessResult {
  success: boolean;
  link?: string;
  error?: string;
}

export async function requestExamAccessLink(
  email: string,
  candidateId: string
): Promise<CreateExamAccessResult> {
  if (!env.EXAM_API_URL || !env.INTERNAL_EXAM_API_KEY) {
    return { success: false, error: "Exam access service is not configured" };
  }

  try {
    const res = await fetch(`${env.EXAM_API_URL}/api/exam-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": env.INTERNAL_EXAM_API_KEY,
      },
      body: JSON.stringify({ email, candidateId }),
    });

    const data = (await res.json()) as {
      success: boolean;
      data?: { link: string };
      error?: string;
    };

    if (!res.ok || !data.success || !data.data) {
      return { success: false, error: data.error ?? "Could not create exam access link" };
    }

    return { success: true, link: data.data.link };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Exam access service unreachable",
    };
  }
}
