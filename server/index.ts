// ✅ Patch Web Crypto for Node.js (for Vite or anything using getRandomValues)
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

// ✅ Load environment variables early
import * as dotenv from 'dotenv';
dotenv.config();
console.log('Loaded environment variables:', {
  SUPABASE_URL: process.env.SUPABASE_URL ? '✓ defined' : '✗ missing',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? '✓ defined' : '✗ missing'
});

import express, { type Request, type Response, type NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Increase body limits for large photo data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// ✅ API Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const server = await registerRoutes(app);

    // Central error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      console.error(err);
    });

    // Vite dev middleware or serve static build
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = process.env.PORT || 5000;

    // 🎯 Start listening and handle port conflicts
    server.listen(port, () => {
      log(`✅ Server running at http://localhost:${port}`);
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        const fallbackPort = 3000;
        console.warn(`⚠️ Port ${port} is in use. Trying fallback port ${fallbackPort}...`);
        server.listen(fallbackPort, () => {
          log(`✅ Server running on fallback port http://localhost:${fallbackPort}`);
        });
      } else {
        console.error("❌ Server error:", err);
      }
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
})();
