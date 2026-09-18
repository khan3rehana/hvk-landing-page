import { z } from "zod";

const recipientObjectSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  name: z.string().trim().optional(),
});

export const sendEmailSchema = z
  .object({
    to: z.union([
      z.string().trim().min(1, "Recipient email is required"),
      recipientObjectSchema,
      z.array(z.union([z.string().trim().min(1), recipientObjectSchema])).min(1, "At least one recipient is required"),
    ]),
    subject: z.string().trim().min(1, "Subject is required"),
    html: z.string().trim().optional(),
    template: z.string().trim().optional(),
    templateData: z.record(z.string(), z.any()).optional(),
    senderName: z.string().trim().optional(),
    senderEmail: z.string().trim().email("Invalid sender email").optional(),
  })
  .refine(
    (data) => Boolean((data.html && data.html.trim().length > 0) || (data.template && data.template.trim().length > 0)),
    {
      message: "Either 'html' or 'template' must be provided",
      path: ["template"],
    }
  );

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
