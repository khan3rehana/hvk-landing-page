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
      { name: "Email", description: "Direct email sending and template management" },
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
            city: { type: "string", example: "Lucknow" },
            state: { type: "string", example: "Uttar Pradesh" },
            pincode: { type: "string", example: "226001" },
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
        CreatePaymentLinkInput: {
          type: "object",
          required: ["candidateId"],
          properties: {
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
          },
        },
        CreatePaymentLinkSuccessData: {
          type: "object",
          properties: {
            paymentLinkUrl: {
              type: "string",
              example: "https://rzp.io/i/aBc123Xy",
              description: "Hosted Razorpay checkout URL — redirect the browser here directly.",
            },
          },
        },
        VerifyPaymentLinkInput: {
          type: "object",
          required: [
            "candidateId",
            "razorpay_payment_id",
            "razorpay_payment_link_id",
            "razorpay_payment_link_reference_id",
            "razorpay_payment_link_status",
            "razorpay_signature",
          ],
          properties: {
            candidateId: { type: "string", example: "6aad9154d93390cdd2688d2d" },
            razorpay_payment_id: { type: "string", example: "pay_EkW87654321" },
            razorpay_payment_link_id: { type: "string", example: "plink_EkW12345678" },
            razorpay_payment_link_reference_id: {
              type: "string",
              example: "6aad9154d93390cdd2688d2d",
              description: "Set to candidateId when the Payment Link was created.",
            },
            razorpay_payment_link_status: { type: "string", example: "paid" },
            razorpay_signature: { type: "string", example: "9ef5421c0b347b5..." },
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
            city: { type: "string", example: "Lucknow" },
            state: { type: "string", example: "Uttar Pradesh" },
            pincode: { type: "string", example: "226001" },
            status: { type: "string", enum: ["pending", "paid", "failed"], example: "paid" },
            createdAt: { type: "string", format: "date-time", example: "2026-09-19T00:00:00.000Z" },
          },
        },
        ResetExamAccessSuccessData: {
          type: "object",
          properties: {
            emailSent: { type: "boolean", example: true },
            examAccessUrl: {
              type: "string",
              example: "http://localhost:3000/exam/access/AbCdEf123...",
            },
          },
        },
        VerifyExamAccessSuccessData: {
          type: "object",
          properties: {
            examLink: { type: "string", example: "https://hvk-infotech.example.com/exam/start" },
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
        SendEmailInput: {
          type: "object",
          required: ["to", "subject"],
          properties: {
            to: {
              oneOf: [
                { type: "string", example: "priya@example.com" },
                {
                  type: "array",
                  items: { type: "string" },
                  example: ["candidate1@example.com", "candidate2@example.com"],
                },
                {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      email: { type: "string", example: "priya@example.com" },
                      name: { type: "string", example: "Priya Sharma" },
                    },
                  },
                },
              ],
            },
            subject: { type: "string", example: "Important Update from HVK" },
            html: {
              type: "string",
              example: "<h1>Custom Header</h1><p>This is custom HTML content sent directly.</p>",
              description: "Direct HTML string to send. Provide either 'html' or 'template'.",
            },
            template: {
              type: "string",
              example: "notification",
              description: "Name of template in src/templates/emails/ without .html extension (e.g. 'acknowledgement', 'notification').",
            },
            templateData: {
              type: "object",
              example: {
                title: "Schedule Reminder",
                greeting: "Hello Candidate,",
                message: "Your upcoming exam session will commence tomorrow at 10:00 AM.",
                buttonText: "Go to Portal",
                buttonUrl: "https://hvk.org/portal",
                footerText: "If you have any questions, reach out to support@hvk.org",
              },
              description: "Key-value pairs to interpolate into the template placeholders.",
            },
            senderName: { type: "string", example: "HVK Support" },
            senderEmail: { type: "string", example: "support@yourdomain.com" },
          },
        },
        SendEmailSuccessData: {
          type: "object",
          properties: {
            sent: { type: "boolean", example: true },
            messageId: { type: "string", example: "<202609190100.12345678@smtp-relay.brevo.com>" },
            to: {
              oneOf: [
                { type: "string", example: "priya@example.com" },
                { type: "array", items: { type: "string" } },
              ],
            },
            template: { type: "string", example: "notification" },
          },
        },
        EmailTemplatesSuccessData: {
          type: "object",
          properties: {
            templates: {
              type: "array",
              items: { type: "string" },
              example: ["acknowledgement", "notification"],
            },
            count: { type: "number", example: 2 },
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
