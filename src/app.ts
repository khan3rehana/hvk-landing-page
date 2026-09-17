import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./docs/swagger";
import candidateRoutes from "./routes/candidateRoutes";
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
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check — used by mobile team / uptime monitors
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: { status: "ok" }, error: null });
  });

  // Swagger docs
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // API routes
  app.use("/api", candidateRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
