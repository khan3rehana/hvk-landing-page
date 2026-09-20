import crypto from "crypto";
import { Request, Response } from "express";
import Candidate, { ICandidate } from "../models/Candidate";
import { razorpay } from "../config/razorpay";
import { env } from "../config/env";
import { sendAcknowledgementEmail, sendExamAccessResetEmail } from "../services/emailService";
import { requestExamAccessLink } from "../services/examAccessService";
import {
  issueExamAccessToken,
  buildExamAccessUrl,
  hashToken,
} from "../services/examAccessTokenService";
import {
  registrationSchema,
  createOrderSchema,
  verifyPaymentSchema,
  createPaymentLinkSchema,
  verifyPaymentLinkSchema,
  examAccessVerifySchema,
} from "../validators/candidateValidator";

// Constant-time HMAC comparison so response timing can't leak the signature byte-by-byte.
function isValidSignature(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// Mongo unique-index violation — can still occur even after a pre-check findOne()
// when two requests for the same email/phone race each other.
function isDuplicateKeyError(err: unknown): err is { code: 11000; keyPattern?: Record<string, unknown> } {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

// Thrown by Mongoose when a route param isn't a valid ObjectId — treat it as "not found"
// rather than letting it fall through to a generic 500.
function isCastError(err: unknown): boolean {
  return err instanceof Error && err.name === "CastError";
}

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

  // Request the real exam destination — failure here must not fail the payment response.
  // Falls back to a placeholder while hvk-exam-backend isn't live yet, so the magic-link
  // flow below always has something real to redirect to once redeemed.
  const examAccess = await requestExamAccessLink(candidate.email, candidate._id.toString());
  if (!examAccess.success) {
    console.error("Exam access link creation failed, using placeholder:", examAccess.error);
  }
  candidate.examLink = examAccess.link ?? env.EXAM_PLACEHOLDER_URL;
  candidate.examLinkIssuedAt = new Date();
  await candidate.save();

  // Mint our own one-time magic link that gates the real exam destination above —
  // this is what actually gets emailed, never candidate.examLink directly.
  const accessToken = await issueExamAccessToken(candidate);
  const examAccessUrl = buildExamAccessUrl(accessToken);

  const emailResult = await sendAcknowledgementEmail({
    toEmail: candidate.email,
    candidateName: candidate.name,
    paymentId,
    amountPaise: env.RAZORPAY_REGISTRATION_FEE,
    examLink: examAccessUrl,
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

    const { name, email, phone, college, place, city, state, pincode } = parsed.data;

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

    const candidate = await Candidate.create({
      name,
      email,
      phone,
      college,
      place,
      city,
      state,
      pincode,
      status: "pending",
    });

    return res.status(201).json({
      success: true,
      data: { candidateId: candidate._id.toString() },
      error: null,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const duplicateField = Object.keys(err.keyPattern ?? {})[0] === "phone" ? "phone" : "email";
      return res.status(409).json({
        success: false,
        data: null,
        error: `A registration already exists with this ${duplicateField}.`,
      });
    }
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
    if (isCastError(err)) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }
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
 * /api/razorpay/payment-link:
 *   post:
 *     summary: >
 *       Create a Razorpay Payment Link for a registered candidate. Unlike
 *       /razorpay/order, this never exposes a Razorpay key to the client — the
 *       browser is simply redirected to the returned hosted checkout URL and
 *       Razorpay redirects back to FRONTEND_URL/registration/callback afterwards.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentLinkInput'
 *     responses:
 *       200:
 *         description: Payment Link created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CreatePaymentLinkSuccessData'
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
 *         description: Payment Link creation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
export async function createPaymentLink(req: Request, res: Response) {
  try {
    const parsed = createPaymentLinkSchema.safeParse(req.body);
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

    const paymentLink = await razorpay.paymentLink.create({
      amount: env.RAZORPAY_REGISTRATION_FEE,
      currency: "INR",
      accept_partial: false,
      description: "HVK Infotech Candidate Registration Fee",
      customer: {
        name: candidate.name,
        email: candidate.email,
        contact: candidate.phone,
      },
      notify: { sms: false, email: false },
      reference_id: candidateId,
      callback_url: `${env.FRONTEND_URL}/registration/callback`,
      callback_method: "get",
      notes: { candidateId },
    });

    candidate.razorpayPaymentLinkId = paymentLink.id;
    await candidate.save();

    return res.status(200).json({
      success: true,
      data: { paymentLinkUrl: paymentLink.short_url },
      error: null,
    });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }
    console.error("Payment link creation error:", err);
    return res.status(500).json({
      success: false,
      data: null,
      error: "Could not initiate payment. Please try again.",
    });
  }
}

/**
 * @openapi
 * /api/razorpay/payment-link/verify:
 *   post:
 *     summary: >
 *       Verify a Razorpay Payment Link callback and confirm registration. Called by
 *       the web app's /registration/callback page with the query params Razorpay
 *       appended to the redirect.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyPaymentLinkInput'
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
 *         description: Invalid signature, payment link mismatch, or payment not completed
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
export async function verifyPaymentLink(req: Request, res: Response) {
  try {
    const parsed = verifyPaymentLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid payment payload",
      });
    }

    const {
      candidateId,
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature,
    } = parsed.data;

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }

    if (
      candidate.razorpayPaymentLinkId !== razorpay_payment_link_id ||
      razorpay_payment_link_reference_id !== candidateId
    ) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Payment link mismatch for this candidate",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(
        `${razorpay_payment_link_id}|${razorpay_payment_link_reference_id}|${razorpay_payment_link_status}|${razorpay_payment_id}`
      )
      .digest("hex");

    const isSignatureValid = isValidSignature(expectedSignature, razorpay_signature);

    if (!isSignatureValid || razorpay_payment_link_status !== "paid") {
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
    if (isCastError(err)) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }
    console.error("Payment link verification error:", err);
    return res.status(500).json({
      success: false,
      data: null,
      error: "Something went wrong verifying payment. Please contact support.",
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

    const isSignatureValid = isValidSignature(expectedSignature, razorpay_signature);

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
    if (isCastError(err)) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }
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
      "name email phone college place city state pincode status createdAt"
    );

    if (!candidate) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }

    return res.status(200).json({ success: true, data: candidate, error: null });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }
    return res.status(500).json({ success: false, data: null, error: "Could not fetch candidate" });
  }
}

/**
 * @openapi
 * /api/candidates/{id}/reset-exam-access:
 *   post:
 *     summary: >
 *       Mints a fresh one-time exam-access magic link for a candidate and emails it,
 *       permanently invalidating whatever link (used or unused) they had before. Also
 *       mounted at the legacy path POST /candidates/:id/resend-exam-link for backward
 *       compatibility. Admin-only — requires the x-admin-api-key header.
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
 *     responses:
 *       200:
 *         description: New exam access token issued and email (re)sent
 *       400:
 *         description: Candidate has not completed payment
 *       401:
 *         description: Missing or invalid x-admin-api-key
 *       404:
 *         description: Candidate not found
 */
export async function resetExamAccess(req: Request, res: Response) {
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

    if (!candidate.examLink) {
      const examAccess = await requestExamAccessLink(candidate.email, candidate._id.toString());
      candidate.examLink = examAccess.link ?? env.EXAM_PLACEHOLDER_URL;
      candidate.examLinkIssuedAt = new Date();
      await candidate.save();
    }

    const accessToken = await issueExamAccessToken(candidate);
    const examAccessUrl = buildExamAccessUrl(accessToken);

    const emailResult = await sendExamAccessResetEmail({
      toEmail: candidate.email,
      candidateName: candidate.name,
      examLink: examAccessUrl,
    });

    if (!emailResult.success) {
      console.error("Exam access reset email failed:", emailResult.error);
    }

    return res.status(200).json({
      success: true,
      data: { emailSent: emailResult.success, examAccessUrl },
      error: null,
    });
  } catch (err) {
    if (isCastError(err)) {
      return res.status(404).json({ success: false, data: null, error: "Candidate not found" });
    }
    console.error("Reset exam access error:", err);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Could not reset exam access" });
  }
}

/**
 * @openapi
 * /api/exam-access/verify:
 *   post:
 *     summary: >
 *       Redeems a one-time exam-access magic link token. Atomically claims the token
 *       (only one caller can ever succeed for a given token) and returns the real exam
 *       URL to redirect to. Called by the web app's /exam/access/[token] page.
 *     tags: [Candidates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token redeemed, exam URL returned
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Invalid access link
 *       410:
 *         description: Link expired or already used
 */
export async function verifyExamAccess(req: Request, res: Response) {
  try {
    const parsed = examAccessVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const tokenHash = hashToken(parsed.data.token);

    const claimed = await Candidate.findOneAndUpdate(
      {
        examAccessTokenHash: tokenHash,
        examAccessTokenExpiresAt: { $gt: new Date() },
        examAccessTokenUsedAt: null,
      },
      { examAccessTokenUsedAt: new Date() },
      { new: true }
    );

    if (claimed) {
      return res.status(200).json({
        success: true,
        data: { examLink: claimed.examLink },
        error: null,
      });
    }

    // Claim failed — look up by hash alone (no filters) to report why.
    const existing = await Candidate.findOne({ examAccessTokenHash: tokenHash });

    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: "Invalid access link" });
    }

    if (existing.examAccessTokenUsedAt) {
      return res.status(410).json({
        success: false,
        data: null,
        error: "This link has already been used. Contact support to get a new one.",
      });
    }

    return res.status(410).json({
      success: false,
      data: null,
      error: "This link has expired. Contact support to get a new one.",
    });
  } catch (err) {
    console.error("Exam access verification error:", err);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Could not verify exam access link" });
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
    payment_link?: {
      entity: {
        id: string;
        reference_id: string;
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
    const paymentLink = event.payload?.payment_link?.entity;

    // Only these two events move a candidate to "paid" — other subscribed events are
    // acknowledged (200) so Razorpay doesn't retry, but otherwise ignored.
    // - payment.captured: fired for both the Orders flow (mobile) and Payment Links flow (web).
    // - payment_link.paid: Payment Links-specific, used as a fallback to look up the
    //   candidate when a Payment Link's underlying order was never recorded on our side.
    let candidate: ICandidate | null = null;

    if (event.event === "payment.captured" && payment) {
      candidate = await Candidate.findOne({ razorpayOrderId: payment.order_id });
      if (!candidate && paymentLink) {
        candidate = await Candidate.findOne({ razorpayPaymentLinkId: paymentLink.id });
      }
    } else if (event.event === "payment_link.paid" && paymentLink && payment) {
      candidate = await Candidate.findOne({ razorpayPaymentLinkId: paymentLink.id });
    } else {
      return res.status(200).json({ success: true, data: { received: true }, error: null });
    }

    if (!candidate || !payment) {
      // Nothing to reconcile against (yet, or ever) — acknowledge so Razorpay stops retrying.
      console.error(`Webhook ${event.event} for unknown candidate`, {
        orderId: payment?.order_id,
        paymentLinkId: paymentLink?.id,
      });
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
