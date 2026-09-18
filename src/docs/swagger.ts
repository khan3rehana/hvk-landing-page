import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

// Helper to convert Windows backslashes into forward slashes for glob patterns
const normalizeGlob = (filePath: string) => filePath.replace(/\\/g, "/");

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
      { name: "System", description: "Health check and system monitoring" },
      { name: "Candidates", description: "Candidate registration, lookup, and management" },
      { name: "Payments", description: "Razorpay order creation, payment verification, and webhooks" },
    ],
    components: {
      securitySchemes: {
        AdminApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-admin-api-key",
          description: "Admin API Key for protected administrative endpoints",
        },
      },
      schemas: {
        RegistrationInput: {
          type: "object",
          required: ["name", "email", "phone", "college", "place"],
          properties: {
            name: { type: "string", example: "Priya Sharma" },
            email: { type: "string", format: "email", example: "priya@example.com" },
            phone: { type: "string", example: "9876543210" },
            college: { type: "string", example: "ABC College of Engineering" },
            place: { type: "string", example: "Lucknow" },
          },
        },
        RegistrationSuccessData: {
          type: "object",
          properties: {
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
          },
        },
        CreateOrderInput: {
          type: "object",
          required: ["candidateId"],
          properties: {
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
          },
        },
        CreateOrderSuccessData: {
          type: "object",
          properties: {
            orderId: { type: "string", example: "order_EkW12345678" },
            amount: { type: "number", example: 49900, description: "Amount in paise (e.g. 49900 = ₹499)" },
            currency: { type: "string", example: "INR" },
            keyId: { type: "string", example: "rzp_test_12345678" },
            candidateName: { type: "string", example: "Priya Sharma" },
            candidateEmail: { type: "string", example: "priya@example.com" },
            candidatePhone: { type: "string", example: "9876543210" },
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
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
            razorpay_order_id: { type: "string", example: "order_EkW12345678" },
            razorpay_payment_id: { type: "string", example: "pay_EkW87654321" },
            razorpay_signature: { type: "string", example: "9ef5421c0b347b5..." },
          },
        },
        VerifyPaymentSuccessData: {
          type: "object",
          properties: {
            status: { type: "string", example: "paid" },
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
            emailSent: { type: "boolean", example: true },
          },
        },
        CandidateStatusData: {
          type: "object",
          properties: {
            _id: { type: "string", example: "6aad9154d93390cdd2688d2d" },
            name: { type: "string", example: "Priya Sharma" },
            email: { type: "string", example: "priya@example.com" },
            phone: { type: "string", example: "9876543210" },
            college: { type: "string", example: "ABC College of Engineering" },
            place: { type: "string", example: "Lucknow" },
            status: { type: "string", enum: ["pending", "paid", "failed"], example: "paid" },
            createdAt: { type: "string", format: "date-time", example: "2026-09-19T00:00:00.000Z" },
          },
        },
        ResendExamLinkSuccessData: {
          type: "object",
          properties: {
            emailSent: { type: "boolean", example: true },
          },
        },
        RazorpayWebhookPayload: {
          type: "object",
          required: ["event", "payload"],
          properties: {
            event: { type: "string", example: "payment.captured" },
            payload: {
              type: "object",
              properties: {
                payment: {
                  type: "object",
                  properties: {
                    entity: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "pay_29PSczqbuaMSge" },
                        order_id: { type: "string", example: "order_DBJOWzybf0sJbb" },
                        status: { type: "string", example: "captured" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        WebhookSuccessData: {
          type: "object",
          properties: {
            received: { type: "boolean", example: true },
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
            emailSent: { type: "boolean", example: true },
          },
        },
        HealthCheckSuccessData: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
          },
        },
        ApiSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            error: { type: "null", example: null },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            data: { type: "null", example: null },
            error: { type: "string", example: "Error message description" },
          },
        },
      },
    },
  },
  apis: [
    normalizeGlob(path.join(__dirname, "../controllers/*.ts")),
    normalizeGlob(path.join(__dirname, "../controllers/*.js")),
    normalizeGlob(path.join(__dirname, "../routes/*.ts")),
    normalizeGlob(path.join(__dirname, "../routes/*.js")),
    normalizeGlob(path.join(__dirname, "../app.ts")),
    normalizeGlob(path.join(__dirname, "../app.js")),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
