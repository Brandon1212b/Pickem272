import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Docker / long-running Node serves the built SPA from this process.
// On Vercel the static files come from outputDirectory; skip that here.
const serveStaticFrontend =
  process.env.NODE_ENV === "production" && !process.env.VERCEL;

if (serveStaticFrontend) {
  const publicDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "public",
  );

  app.use(express.static(publicDir));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
