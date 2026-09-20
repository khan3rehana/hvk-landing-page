import { Router } from "express";
import {
  registerCandidate,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createPaymentLink,
  verifyPaymentLink,
  handleRazorpayWebhook,
  getCandidateStatus,
  resetExamAccess,
  verifyExamAccess,
} from "../controllers/candidateController";
import { requireAdminKey } from "../middleware/adminAuth";

const router = Router();

router.post("/register", registerCandidate);
// Orders flow — used by clients (mobile app) that embed the Razorpay SDK directly.
router.post("/razorpay/order", createRazorpayOrder);
router.post("/razorpay/verify", verifyRazorpayPayment);
// Payment Links flow — used by the web app. Never exposes a Razorpay key to the browser.
router.post("/razorpay/payment-link", createPaymentLink);
router.post("/razorpay/payment-link/verify", verifyPaymentLink);
router.post("/razorpay/webhook", handleRazorpayWebhook);
router.get("/candidates/:id", getCandidateStatus);
// Public — redeems a one-time exam-access magic link token (called by /exam/access/[token]).
router.post("/exam-access/verify", verifyExamAccess);
router.post("/candidates/:id/reset-exam-access", requireAdminKey, resetExamAccess);
// Legacy alias, kept for backward compatibility with any existing callers.
router.post("/candidates/:id/resend-exam-link", requireAdminKey, resetExamAccess);

export default router;
