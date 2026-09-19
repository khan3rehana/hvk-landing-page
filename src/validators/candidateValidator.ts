import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(15, "Phone number is too long"),
  college: z.string().trim().min(2, "College is required"),
  place: z.string().trim().min(2, "Place is required"),
  // Optional so existing clients (mobile app) that don't collect these keep working.
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits").optional(),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const createOrderSchema = z.object({
  candidateId: z.string().min(1, "candidateId is required"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const verifyPaymentSchema = z.object({
  candidateId: z.string().min(1, "candidateId is required"),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const createPaymentLinkSchema = z.object({
  candidateId: z.string().min(1, "candidateId is required"),
});
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;

export const verifyPaymentLinkSchema = z.object({
  candidateId: z.string().min(1, "candidateId is required"),
  razorpay_payment_id: z.string().min(1),
  razorpay_payment_link_id: z.string().min(1),
  razorpay_payment_link_reference_id: z.string().min(1),
  razorpay_payment_link_status: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export type VerifyPaymentLinkInput = z.infer<typeof verifyPaymentLinkSchema>;
