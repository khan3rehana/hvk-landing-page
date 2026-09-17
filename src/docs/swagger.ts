import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "HVK Backend API",
      version: "1.0.0",
      description:
        "Candidate registration, Razorpay payment, and acknowledgement email API — shared by the web app and mobile app.",
    },
    servers: [
      { url: "/", description: "Current server" },
    ],
    tags: [
      { name: "Candidates", description: "Registration and status" },
      { name: "Payments", description: "Razorpay order creation and verification" },
    ],
    components: {
      schemas: {
        RegistrationInput: {
          type: "object",
          required: ["name", "email", "phone", "college", "place"],
          properties: {
            name: { type: "string", example: "Priya Sharma" },
            email: { type: "string", example: "priya@example.com" },
            phone: { type: "string", example: "9876543210" },
            college: { type: "string", example: "ABC College of Engineering" },
            place: { type: "string", example: "Lucknow" },
          },
        },
        CreateOrderInput: {
          type: "object",
          required: ["candidateId"],
          properties: {
            candidateId: { type: "string", example: "6650f1c2e1a4a30012a3b456" },
          },
        },
        VerifyPaymentInput: {
          type: "object",
          required: [
            "candidateId",
            "razorpay_order_id",
            "razorpay_payment_id",
            "razorpay_signature",
          ],
          properties: {
            candidateId: { type: "string" },
            razorpay_order_id: { type: "string" },
            razorpay_payment_id: { type: "string" },
            razorpay_signature: { type: "string" },
          },
        },
        ApiSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            error: { type: "null" },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            data: { type: "null" },
            error: { type: "string" },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, "../controllers/*.ts"), path.join(__dirname, "../controllers/*.js")],
};

export const swaggerSpec = swaggerJSDoc(options);
