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

// In production we bundle the built frontend (artifacts/nfl-pickem/dist/public)
// into this package's dist/public directory (see Dockerfile) and serve it
// directly, so a single container/process handles both API and static assets.
if (process.env.NODE_ENV === "production") {
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