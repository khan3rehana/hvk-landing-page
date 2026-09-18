import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env";

// Some local networks (VPNs, router DNS proxies) point Node's resolver at a
// stub server that can't handle SRV/TXT lookups, which breaks mongodb+srv://
// connection strings even though the records resolve fine elsewhere. Fall
// back to public resolvers so the SRV lookup succeeds.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}
