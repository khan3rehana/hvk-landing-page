import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND_API_KEY);

interface AcknowledgementEmailParams {
  toEmail: string;
  candidateName: string;
  paymentId: string;
  amountPaise: number;
  examLink?: string; // included only if hvk-exam-backend successfully issued one
}

export async function sendAcknowledgementEmail({
  toEmail,
  candidateName,
  paymentId,
  amountPaise,
  examLink,
}: AcknowledgementEmailParams): Promise<{ success: boolean; error?: string }> {
  const amountRupees = (amountPaise / 100).toFixed(2);

  const examSection = examLink
    ? `
        <div style="margin: 24px 0; padding: 18px; border-radius: 12px; background: #eaf3ff; border: 1px solid #dce7f5;">
          <p style="margin: 0 0 10px; font-weight: 700; color: #0a2452;">Your Exam Access Link</p>
          <p style="margin: 0 0 14px; color: #344762; font-size: 14px;">
            This link is unique to your email and can only be used by you. It stays active
            until you submit your exam.
          </p>
          <a href="${examLink}" style="display: inline-block; background: #1457b8; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 700;">
            Access Your Exam
          </a>
          <p style="margin: 12px 0 0; color: #62718a; font-size: 12px;">
            If the button doesn't work, copy this link: ${examLink}
          </p>
        </div>
      `
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; color: #10213d;">
      <div style="background: #0a2452; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">HVK Registration Confirmed</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #dce7f5; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Hi ${candidateName},</p>
        <p>Thank you for registering with HVK. Your registration fee payment has been received and confirmed.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; color: #62718a;">Payment Reference</td><td style="padding: 8px 0; font-weight: 700;">${paymentId}</td></tr>
          <tr><td style="padding: 8px 0; color: #62718a;">Amount Paid</td><td style="padding: 8px 0; font-weight: 700;">₹${amountRupees}</td></tr>
        </table>
        ${examSection}
        <p>We'll be in touch with next steps shortly. If you have any questions, just reply to this email.</p>
        <p style="margin-top: 24px; color: #62718a; font-size: 13px;">— Team HVK</p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: toEmail,
      subject: "HVK Registration Confirmed — Payment Received",
      html,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}
