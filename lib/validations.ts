import { z } from "zod";

export const candidateRegistrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name")
    .max(80, "Name is too long"),
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Please enter a valid email address"),
  contactNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10 digit mobile number"),
  college: z
    .string()
    .trim()
    .min(2, "Please enter your college or university"),
  place: z.string().trim().min(2, "Please enter your locality"),
  city: z.string().trim().min(2, "Please enter your city"),
  state: z.string().trim().min(1, "Please select your state"),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6 digit pincode"),
});

export type CandidateRegistrationInput = z.infer<
  typeof candidateRegistrationSchema
>;
