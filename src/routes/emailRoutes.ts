import { Router } from "express";
import { sendDirectEmail, getTemplates } from "../controllers/emailController";
import { requireAdminKey } from "../middleware/adminAuth";

const router = Router();

// Send an email directly (supports custom HTML or templates)
router.post("/send", requireAdminKey, sendDirectEmail);

// List available HTML templates
router.get("/templates", requireAdminKey, getTemplates);

export default router;
