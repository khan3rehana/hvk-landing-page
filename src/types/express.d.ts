import "express";

// Populated by the express.json() verify hook in app.ts so webhook handlers
// can check signatures against the exact bytes Razorpay signed.
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export {};
