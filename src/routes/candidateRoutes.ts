import { Router } from "express";
import {
  registerCandidate,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createPaymentLink,
  verifyPaymentLink,
  handleRazorpayWebhook,
  getCandidateStatus,
  resendExamAccessLink,
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
router.post("/candidates/:id/resend-exam-link", requireAdminKey, resendExamAccessLink);

export default router;
