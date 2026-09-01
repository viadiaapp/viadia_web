import express from "express";
import swaggerUi from "swagger-ui-express";
import dotenv from "dotenv";

import tripsRoutes from "./routes/trips";
import usersRoutes from "./routes/users";
import subscriptionsRoutes from "./routes/subscriptions";
import transactionsRoutes from "./routes/transactions";
import messagesRoutes from "./routes/messages";
import geoRoutes from "./routes/geo";
import geminiRoutes from "./routes/gemini";
import paymentsRoutes from "./routes/payments";
import uploadsRoutes from "./routes/uploads";
import googlePlayRoutes from "./routes/googleplay";
import joinRequestsRoutes from "./routes/joinrequests";
import { openApiSpec } from "./openapi";

dotenv.config();

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Captures the raw request body alongside the parsed one, needed for Razorpay webhook signature checks.
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    })
  );

  // This is a standalone API — the frontend is deployed separately (static hosting), so CORS is
  // wide open by default. Set FRONTEND_ORIGIN to restrict it to your actual frontend domain(s).
  const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", allowedOrigin);
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-secret");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get("/openapi.json", (_req, res) => res.json(openApiSpec));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/trips", tripsRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/subscriptions", subscriptionsRoutes);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api/gemini", geminiRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/uploads", uploadsRoutes);
  app.use("/api/payments/googleplay", googlePlayRoutes);
  app.use("/api/joinrequests", joinRequestsRoutes);
  app.use("/api", geoRoutes);

  // Safety net: any error forwarded via next(err) (see utils/asyncHandler) lands here instead of
  // crashing the process — every route above still gets its own response.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled route error:", err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error." });
  });

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT} (docs at /docs)`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
