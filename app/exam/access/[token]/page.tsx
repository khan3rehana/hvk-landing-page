import type { Metadata } from "next";
import { ExamAccessContent } from "./exam-access-content";

export const metadata: Metadata = {
  title: "Exam Access | HVK Infotech",
  robots: { index: false, follow: false },
};

export default async function ExamAccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ExamAccessContent token={token} />;
}
