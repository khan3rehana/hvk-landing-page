import crypto from "crypto";
import { Request, Response } from "express";
import Candidate from "../models/Candidate";
import { razorpay } from "../config/razorpay";
import { env } from "../config/env";
import { sendAcknowledgementEmail } from "../services/emailService";
import {
  registrationSchema,
  createOrderSchema,
  verifyPaymentSchema,
} from "../validators/candidateValidator";

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
 *               $ref: '#/components/schemas/ApiSuccess'
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate email or phone
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
 *       404:
 *         description: Candidate not found
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
 *       400:
 *         description: Invalid signature or order mismatch
 *       404:
 *         description: Candidate not found
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

    candidate.status = "paid";
    candidate.razorpayPaymentId = razorpay_payment_id;
    await candidate.save();

    const emailResult = await sendAcknowledgementEmail({
      toEmail: candidate.email,
      candidateName: candidate.name,
      paymentId: razorpay_payment_id,
      amountPaise: env.RAZORPAY_REGISTRATION_FEE,
    });

    if (emailResult.success) {
      candidate.acknowledgementEmailSent = true;
      await candidate.save();
    } else {
      console.error("Acknowledgement email failed:", emailResult.error);
    }

    return res.status(200).json({
      success: true,
      data: {
        status: "paid",
        candidateId: candidate._id.toString(),
        emailSent: emailResult.success,
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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Candidate found
 *       404:
 *         description: Candidate not found
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
