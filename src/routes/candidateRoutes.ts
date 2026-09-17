import { Router } from "express";
import {
  registerCandidate,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getCandidateStatus,
} from "../controllers/candidateController";

const router = Router();

router.post("/register", registerCandidate);
router.post("/razorpay/order", createRazorpayOrder);
router.post("/razorpay/verify", verifyRazorpayPayment);
router.get("/candidates/:id", getCandidateStatus);

export default router;
