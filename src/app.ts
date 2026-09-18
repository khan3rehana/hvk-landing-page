import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./docs/swagger";
import candidateRoutes from "./routes/candidateRoutes";
import emailRoutes from "./routes/emailRoutes";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { env } from "./config/env";

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.includes("*") ? true : env.CORS_ORIGINS,
      credentials: true,
    })
  );
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(
    express.json({
      // Keep the exact raw bytes around so the Razorpay webhook handler can verify
      // its HMAC signature — re-serializing req.body would not reliably match it.
      verify: (req: Request, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Health check — used by mobile team / uptime monitors
  /**
   * @openapi
   * /health:
   *   get:
   *     summary: System health check
   *     description: Returns API health status. Used by uptime monitors, mobile app, and web clients.
   *     tags: [System]
   *     responses:
   *       200:
   *         description: Service is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   $ref: '#/components/schemas/HealthCheckSuccessData'
   *                 error:
   *                   type: "null"
   *                   example: null
   */
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { status: "ok" }, error: null });
  });

  // Swagger docs
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "HVK API Documentation",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
      },
    })
  );
  app.get("/api-docs.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // API routes
  app.use("/api", candidateRoutes);
  app.use("/api/email", emailRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
