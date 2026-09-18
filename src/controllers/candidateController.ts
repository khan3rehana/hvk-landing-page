import crypto from "crypto";
import { Request, Response } from "express";
import Candidate, { ICandidate } from "../models/Candidate";
import { razorpay } from "../config/razorpay";
import { env } from "../config/env";
import { sendAcknowledgementEmail } from "../services/emailService";
import { requestExamAccessLink } from "../services/examAccessService";
import {
  registrationSchema,
  createOrderSchema,
  verifyPaymentSchema,
} from "../validators/candidateValidator";

/**
 * Shared by /razorpay/verify (client-driven) and /razorpay/webhook (server-to-server):
 * marks a candidate paid, requests their exam access link, and emails the receipt.
 * Idempotent — safe to call again for a candidate that's already marked paid, since
 * both paths can race to confirm the same payment. The "paid" transition is claimed
 * atomically so only one of the two concurrent calls ever requests the exam link /
 * sends the email.
 */
async function finalizeSuccessfulPayment(
  candidate: ICandidate,
  paymentId: string
): Promise<{ emailSent: boolean }> {
  if (candidate.status === "paid") {
    return { emailSent: candidate.acknowledgementEmailSent };
  }

  const claimed = await Candidate.findOneAndUpdate(
    { _id: candidate._id, status: { $ne: "paid" } },
    { status: "paid", razorpayPaymentId: paymentId },
    { new: true }
  );

  if (!claimed) {
    // Lost the race to the other caller (verify vs. webhook) — it already finalized this payment.
    const finalized = await Candidate.findById(candidate._id).select("acknowledgementEmailSent");
    return { emailSent: finalized?.acknowledgementEmailSent ?? false };
  }

  candidate = claimed;

  // Request a one-time exam access link — failure here must not fail the payment response.
  // Persisted on the candidate so a failed attempt can be recovered later via
  // POST /candidates/:id/resend-exam-link instead of silently losing the link.
  const examAccess = await requestExamAccessLink(candidate.email, candidate._id.toString());
  if (!examAccess.success) {
    console.error("Exam access link creation failed:", examAccess.error);
  } else if (examAccess.link) {
    candidate.examLink = examAccess.link;
    candidate.examLinkIssuedAt = new Date();
    await candidate.save();
  }

  const emailResult = await sendAcknowledgementEmail({
    toEmail: candidate.email,
    candidateName: candidate.name,
    paymentId,
    amountPaise: env.RAZORPAY_REGISTRATION_FEE,
    examLink: examAccess.link,
  });

  if (emailResult.success) {
    candidate.acknowledgementEmailSent = true;
    await candidate.save();
  } else {
    console.error("Acknowledgement email failed:", emailResult.error);
  }

  return { emailSent: emailResult.success };
}

/**
 * @openapi
 * /api/register:
 *   post:
 *     summary: Register a new candidate (creates a pending record)
 *     tags: [Candidates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegistrationInput'
 *     responses:
 *       201:
 *         description: Candidate created as pending
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/RegistrationSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       409:
 *         description: Duplicate email or phone
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function registerCandidate(req: Request, res: Response) {
  try {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const { name, email, phone, college, place } = parsed.data;

    const existing = await Candidate.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    });

    if (existing) {
      const duplicateField = existing.email === email.toLowerCase() ? "email" : "phone";
      return res.status(409).json({
        success: false,
        data: null,
        error: `A registration already exists with this ${duplicateField}.`,
      });
    }

    const candidate = await Candidate.create({ name, email, phone, college, place, status: "pending" });

    return res.status(201).json({
      success: true,
      data: { candidateId: candidate._id.toString() },
      error: null,
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({
      success: false,
      data: null,
      error: "Something went wrong while registering. Please try again.",
    });
  }
}

/**
 * @openapi
 * /api/razorpay/order:
 *   post:
 *     summary: Create a Razorpay order for a registered candidate
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderInput'
 *     responses:
 *       200:
 *         description: Razorpay order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CreateOrderSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Candidate already paid or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       404:
 *         description: Candidate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Order creation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function createRazorpayOrder(req: Request, res: Response) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? "candidateId is required",
      });
    }

    const { candidateId } = parsed.data;
    const candidate = await Candidate.findById(candidateId);

    if (!candidate) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }

    if (candidate.status === "paid") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "This candidate has already paid.",
      });
    }

    const order = await razorpay.orders.create({
      amount: env.RAZORPAY_REGISTRATION_FEE,
      currency: "INR",
      receipt: `hvk_reg_${candidateId}`,
      notes: { candidateId, email: candidate.email },
    });

    candidate.razorpayOrderId = order.id;
    await candidate.save();

    return res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: env.RAZORPAY_KEY_ID,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
      },
      error: null,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    return res.status(500).json({
      success: false,
      data: null,
      error: "Could not initiate payment. Please try again.",
    });
  }
}

/**
 * @openapi
 * /api/razorpay/verify:
 *   post:
 *     summary: Verify a Razorpay payment signature and confirm registration
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyPaymentInput'
 *     responses:
 *       200:
 *         description: Payment verified, candidate marked paid, acknowledgement email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VerifyPaymentSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Invalid signature or order mismatch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       404:
 *         description: Candidate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Payment verification failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function verifyRazorpayPayment(req: Request, res: Response) {
  try {
    const parsed = verifyPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid payment payload",
      });
    }

    const { candidateId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const isSignatureValid = expectedSignature === razorpay_signature;

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }

    if (candidate.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Order mismatch for this candidate",
      });
    }

    if (!isSignatureValid) {
      candidate.status = "failed";
      await candidate.save();
      return res.status(400).json({
        success: false,
        data: null,
        error: "Payment verification failed. Please try again.",
      });
    }

    const { emailSent } = await finalizeSuccessfulPayment(candidate, razorpay_payment_id);

    return res.status(200).json({
      success: true,
      data: {
        status: "paid",
        candidateId: candidate._id.toString(),
        emailSent,
      },
      error: null,
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({
      success: false,
      data: null,
      error: "Something went wrong verifying payment. Please contact support.",
    });
  }
}

/**
 * @openapi
 * /api/candidates/{id}:
 *   get:
 *     summary: Get a candidate's registration/payment status (used by mobile app)
 *     tags: [Candidates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: MongoDB Candidate ID
 *         schema:
 *           type: string
 *           example: "6aad9154d93390cdd2688d2d"
 *     responses:
 *       200:
 *         description: Candidate found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CandidateStatusData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       404:
 *         description: Candidate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Could not fetch candidate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function getCandidateStatus(req: Request, res: Response) {
  try {
    const candidate = await Candidate.findById(req.params.id).select(
      "name email phone college place status createdAt"
    );

    if (!candidate) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }

    return res.status(200).json({ success: true, data: candidate, error: null });
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: "Could not fetch candidate" });
  }
}

/**
 * @openapi
 * /api/candidates/{id}/resend-exam-link:
 *   post:
 *     summary: >
 *       Recovery endpoint for candidates who paid but never got an exam link — e.g. the
 *       hvk-exam-backend call in finalizeSuccessfulPayment failed, or the acknowledgement
 *       email bounced. Reuses the previously issued link if one is already on record
 *       instead of requesting a new one, then resends the email. Admin-only —
 *       requires the x-admin-api-key header.
 *     tags: [Candidates]
 *     security:
 *       - AdminApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "6aad9154d93390cdd2688d2d"
 *       - in: header
 *         name: x-admin-api-key
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin secret key configured on server
 *     responses:
 *       200:
 *         description: Exam link ensured and acknowledgement email (re)sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ResendExamLinkSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Candidate has not completed payment
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
 *       404:
 *         description: Candidate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: ADMIN_API_KEY not configured on the server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       502:
 *         description: Exam access service could not issue a link
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function resendExamAccessLink(req: Request, res: Response) {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }

    if (candidate.status !== "paid") {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Candidate has not completed payment yet.",
      });
    }

    let link = candidate.examLink;

    if (!link) {
      const examAccess = await requestExamAccessLink(candidate.email, candidate._id.toString());
      if (!examAccess.success || !examAccess.link) {
        return res.status(502).json({
          success: false,
          data: null,
          error: examAccess.error ?? "Could not create exam access link",
        });
      }

      link = examAccess.link;
      candidate.examLink = link;
      candidate.examLinkIssuedAt = new Date();
      await candidate.save();
    }

    const emailResult = await sendAcknowledgementEmail({
      toEmail: candidate.email,
      candidateName: candidate.name,
      paymentId: candidate.razorpayPaymentId ?? "",
      amountPaise: env.RAZORPAY_REGISTRATION_FEE,
      examLink: link,
    });

    if (emailResult.success) {
      candidate.acknowledgementEmailSent = true;
      await candidate.save();
    } else {
      console.error("Resend acknowledgement email failed:", emailResult.error);
    }

    return res.status(200).json({
      success: true,
      data: { emailSent: emailResult.success },
      error: null,
    });
  } catch (err) {
    console.error("Resend exam link error:", err);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Could not resend exam access link" });
  }
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        status: string;
      };
    };
  };
}

/**
 * @openapi
 * /api/razorpay/webhook:
 *   post:
 *     summary: >
 *       Razorpay server-to-server webhook. Confirms payments even if the client never
 *       calls /razorpay/verify (browser closed mid-checkout, app killed, etc).
 *       Configure this URL + a webhook secret in the Razorpay dashboard.
 *     tags: [Payments]
 *     parameters:
 *       - in: header
 *         name: x-razorpay-signature
 *         required: true
 *         description: HMAC-SHA256 signature calculated with RAZORPAY_WEBHOOK_SECRET
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RazorpayWebhookPayload'
 *     responses:
 *       200:
 *         description: Event processed (or acknowledged/ignored)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/WebhookSuccessData'
 *                 error:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Missing or invalid webhook signature
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Webhook secret not configured on the server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function handleRazorpayWebhook(req: Request, res: Response) {
  try {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      console.error("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured");
      return res.status(500).json({ success: false, data: null, error: "Webhook not configured" });
    }

    const signature = req.get("x-razorpay-signature");
    if (!signature || !req.rawBody) {
      return res.status(400).json({ success: false, data: null, error: "Missing webhook signature" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("hex");

    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    const isValid =
      provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

    if (!isValid) {
      return res.status(400).json({ success: false, data: null, error: "Invalid webhook signature" });
    }

    const event = req.body as RazorpayWebhookPayload;
    const payment = event.payload?.payment?.entity;

    // Only payment.captured moves a candidate to "paid" — other subscribed events are
    // acknowledged (200) so Razorpay doesn't retry, but otherwise ignored.
    if (event.event !== "payment.captured" || !payment) {
      return res.status(200).json({ success: true, data: { received: true }, error: null });
    }

    const candidate = await Candidate.findOne({ razorpayOrderId: payment.order_id });
    if (!candidate) {
      // Nothing to reconcile against (yet, or ever) — acknowledge so Razorpay stops retrying.
      console.error("Webhook payment.captured for unknown order:", payment.order_id);
      return res.status(200).json({ success: true, data: { received: true }, error: null });
    }

    const { emailSent } = await finalizeSuccessfulPayment(candidate, payment.id);

    return res.status(200).json({
      success: true,
      data: { received: true, candidateId: candidate._id.toString(), emailSent },
      error: null,
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ success: false, data: null, error: "Webhook processing failed" });
  }
}
