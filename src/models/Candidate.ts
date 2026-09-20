import mongoose, { Schema, Document, Model } from "mongoose";

export type CandidateStatus = "pending" | "paid" | "failed";

export interface ICandidate extends Document {
  name: string;
  email: string;
  phone: string;
  college: string;
  place: string;
  city?: string;
  state?: string;
  pincode?: string;
  status: CandidateStatus;
  razorpayOrderId?: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentId?: string;
  acknowledgementEmailSent: boolean;
  examLink?: string;
  examLinkIssuedAt?: Date;
  examAccessTokenHash?: string;
  examAccessTokenExpiresAt?: Date;
  examAccessTokenUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateSchema = new Schema<ICandidate>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    phone: { type: String, required: true, trim: true, unique: true },
    college: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    pincode: { type: String, trim: true, default: null },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentLinkId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    acknowledgementEmailSent: { type: Boolean, default: false },
    examLink: { type: String, default: null },
    examLinkIssuedAt: { type: Date, default: null },
    examAccessTokenHash: { type: String, default: null, index: true },
    examAccessTokenExpiresAt: { type: Date, default: null },
    examAccessTokenUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Candidate: Model<ICandidate> =
  mongoose.models.Candidate || mongoose.model<ICandidate>("Candidate", CandidateSchema);

export default Candidate;
