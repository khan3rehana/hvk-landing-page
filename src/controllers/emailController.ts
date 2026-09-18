import { Request, Response } from "express";
import { sendEmail } from "../services/emailService";
import { listAvailableTemplates } from "../services/templateService";
import { sendEmailSchema } from "../validators/emailValidator";

/**
 * @openapi
 * /api/email/send:
 *   post:
 *     summary: Send an email directly (supports custom HTML or templates)
 *     description: >
 *       Sends an email via Brevo. Can provide custom inline HTML or specify a template name
 *       from the templates directory (e.g. 'acknowledgement', 'notification') with dynamic template data.
 *       Protected endpoint requiring the x-admin-api-key header.
 *     tags: [Email]
 *     security:
 *       - AdminApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: x-admin-api-key
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin secret key configured on the server
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendEmailInput'
 *     responses:
 *       200:
 *         description: Email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SendEmailSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Validation error or template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Missing or invalid x-admin-api-key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Error delivering email via Brevo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function sendDirectEmail(req: Request, res: Response) {
  try {
    const parsed = sendEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid email request payload",
      });
    }

    const { to, subject, html, template, templateData, senderName, senderEmail } = parsed.data;

    const sender =
      senderEmail || senderName
        ? {
            email: senderEmail,
            name: senderName,
          }
        : undefined;

    const result = await sendEmail({
      to,
      subject,
      html,
      template,
      templateData,
      sender,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: result.error ?? "Failed to send email",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        sent: true,
        messageId: result.messageId || null,
        to,
        template: template || "custom-html",
      },
      error: null,
    });
  } catch (err: any) {
    console.error("Direct email send error:", err);
    return res.status(500).json({
      success: false,
      data: null,
      error: err?.message ?? "Internal server error while sending email",
    });
  }
}

/**
 * @openapi
 * /api/email/templates:
 *   get:
 *     summary: List available HTML email templates
 *     description: Returns the names of all HTML email templates found in the email templates directory.
 *     tags: [Email]
 *     security:
 *       - AdminApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: x-admin-api-key
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin secret key configured on the server
 *     responses:
 *       200:
 *         description: List of available templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/EmailTemplatesSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       401:
 *         description: Missing or invalid x-admin-api-key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function getTemplates(_req: Request, res: Response) {
  try {
    const templates = listAvailableTemplates();
    return res.status(200).json({
      success: true,
      data: {
        templates,
        count: templates.length,
      },
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      data: null,
      error: err?.message ?? "Could not list email templates",
    });
  }
}
