import { createApp } from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

async function start() {
  await connectDB();

  const app = createApp();

  app.listen(Number(env.PORT), () => {
    console.log(`🚀 HVK backend running on port ${env.PORT}`);
    console.log(`📘 Swagger docs at http://localhost:${env.PORT}/api-docs`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
