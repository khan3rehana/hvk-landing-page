import { Router } from "express";
import {
  registerCandidate,
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
  getCandidateStatus,
  resendExamAccessLink,
} from "../controllers/candidateController";
import { requireAdminKey } from "../middleware/adminAuth";

const router = Router();

router.post("/register", registerCandidate);
router.post("/razorpay/order", createRazorpayOrder);
router.post("/razorpay/verify", verifyRazorpayPayment);
router.post("/razorpay/webhook", handleRazorpayWebhook);
router.get("/candidates/:id", getCandidateStatus);
router.post("/candidates/:id/resend-exam-link", requireAdminKey, resendExamAccessLink);

export default router;
