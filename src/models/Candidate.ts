import mongoose, { Schema, Document, Model } from "mongoose";

export type CandidateStatus = "pending" | "paid" | "failed";

export interface ICandidate extends Document {
  name: string;
  email: string;
  phone: string;
  college: string;
  place: string;
  status: CandidateStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  acknowledgementEmailSent: boolean;
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
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    acknowledgementEmailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CandidateSchema.index({ email: 1 }, { unique: true });
CandidateSchema.index({ phone: 1 }, { unique: true });

const Candidate: Model<ICandidate> =
  mongoose.models.Candidate || mongoose.model<ICandidate>("Candidate", CandidateSchema);

export default Candidate;
