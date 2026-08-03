import app from "./app";
import { logger } from "./lib/logger";

// On Vercel / other serverless platforms the platform invokes the exported
// handler; we must not call app.listen().
const isServerless =
  process.env.VERCEL === "1" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
  process.env.SERVERLESS === "1";

if (isServerless) {
  // Export the Express app so the platform can wrap it.
  // (Vercel will use the default export when configured correctly.)
} else {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, "0.0.0.0", (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening on 0.0.0.0");
  });
}

export default app;
