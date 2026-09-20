import { BrevoClient } from "@getbrevo/brevo";
import { env } from "../config/env";
import { renderTemplate } from "./templateService";

export const brevo = new BrevoClient({ apiKey: env.BREVO_KEY });

/**
 * Parses sender from string, supporting both "Name <email@domain.com>"
 * and plain "email@domain.com" formats.
 */
export function parseSender(
  fromStr: string,
  defaultName = "HVK Registrations"
): { name: string; email: string } {
  const match = fromStr.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim() || defaultName, email: match[2].trim() };
  }
  return { name: defaultName, email: fromStr.trim() };
}

export type EmailRecipient = string | { email: string; name?: string };

export interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  html?: string;
  template?: string;
  templateData?: Record<string, any>;
  sender?: { name?: string; email?: string };
}

/**
 * Normalizes recipients into Brevo's expected format: Array<{ email: string, name?: string }>.
 */
function normalizeRecipients(
  recipients: EmailRecipient | EmailRecipient[]
): Array<{ email: string; name?: string }> {
  const list = Array.isArray(recipients) ? recipients : [recipients];

  return list
    .map((r) => {
      if (typeof r === "string") {
        const parsed = parseSender(r, "");
        return parsed.name ? { email: parsed.email, name: parsed.name } : { email: parsed.email };
      }
      return { email: r.email.trim(), ...(r.name?.trim() ? { name: r.name.trim() } : {}) };
    })
    .filter((r) => Boolean(r.email));
}

/**
 * General-purpose email sending function via Brevo.
 * Supports:
 * - Direct custom HTML (`html`)
 * - Pre-built HTML templates from `src/templates/emails/` (`template` + `templateData`)
 * - Single or multiple recipients (`to`)
 * - Optional custom sender overrides (`sender`)
 */
export async function sendEmail({
  to,
  subject,
  html,
  template,
  templateData = {},
  sender,
}: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const toRecipients = normalizeRecipients(to);
    if (toRecipients.length === 0) {
      return { success: false, error: "At least one valid recipient email is required" };
    }

    let finalHtml: string;
    if (html && html.trim()) {
      finalHtml = html;
    } else if (template) {
      finalHtml = renderTemplate(template, templateData);
    } else {
      return {
        success: false,
        error: "Either 'html' or a valid 'template' name must be provided",
      };
    }

    const defaultSender = parseSender(env.BREVO_FROM_EMAIL, env.BREVO_FROM_NAME);
    const resolvedSender = {
      name: sender?.name?.trim() || defaultSender.name,
      email: sender?.email?.trim() || defaultSender.email,
    };

    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: resolvedSender,
      to: toRecipients,
      subject,
      htmlContent: finalHtml,
    });

    return { success: true, messageId: response.messageId };
  } catch (err: any) {
    console.error("Brevo sendEmail error:", err);
    return {
      success: false,
      error: err?.message ?? "Unknown error sending email via Brevo",
    };
  }
}

interface AcknowledgementEmailParams {
  toEmail: string;
  candidateName: string;
  paymentId: string;
  amountPaise: number;
  examLink?: string;
}

/**
 * Sends the candidate registration confirmation and payment receipt email
 * using the 'acknowledgement' HTML template.
 */
export async function sendAcknowledgementEmail({
  toEmail,
  candidateName,
  paymentId,
  amountPaise,
  examLink,
}: AcknowledgementEmailParams): Promise<{ success: boolean; error?: string }> {
  const amountRupees = (amountPaise / 100).toFixed(2);

  return sendEmail({
    to: [{ email: toEmail, name: candidateName }],
    subject: "HVK Registration Confirmed — Payment Received",
    template: "acknowledgement",
    templateData: {
      candidateName,
      paymentId,
      amountRupees,
      examLink: examLink || "",
    },
  });
}

interface ExamAccessResetEmailParams {
  toEmail: string;
  candidateName: string;
  examLink: string;
}

/**
 * Sends a fresh exam-access magic link after an admin reset (previous link, if any,
 * is now permanently invalid). Reuses the 'acknowledgement' template's exam-link
 * section but with its own subject so it reads as a reset, not a duplicate receipt.
 */
export async function sendExamAccessResetEmail({
  toEmail,
  candidateName,
  examLink,
}: ExamAccessResetEmailParams): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: [{ email: toEmail, name: candidateName }],
    subject: "Your HVK Exam Access Link Has Been Reset",
    template: "exam-access-reset",
    templateData: {
      candidateName,
      examLink,
    },
  });
}

export interface CreateCampaignParams {
  name: string;
  subject: string;
  htmlContent: string;
  sender?: { name: string; email: string };
  listIds?: number[];
  scheduledAt?: string;
}

/**
 * Creates an email campaign via the Brevo EmailCampaigns API.
 */
export async function createEmailCampaign({
  name,
  subject,
  htmlContent,
  sender,
  listIds,
  scheduledAt,
}: CreateCampaignParams): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const defaultSender = parseSender(env.BREVO_FROM_EMAIL, env.BREVO_FROM_NAME);
    const result = await brevo.emailCampaigns.createEmailCampaign({
      name,
      subject,
      sender: sender ?? defaultSender,
      htmlContent,
      recipients: listIds && listIds.length > 0 ? { listIds } : undefined,
      scheduledAt,
    });

    return { success: true, data: result };
  } catch (err: any) {
    console.error("Brevo campaign error:", err);
    return {
      success: false,
      error: err?.message ?? "Failed to create email campaign",
    };
  }
}
