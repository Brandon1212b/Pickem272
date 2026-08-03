import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// When the frontend is hosted separately from the API (e.g. Vercel static +
// Railway/Render/Fly backend), set VITE_API_BASE_URL to the API origin.
// Leave unset for same-origin deployments (Docker / Replit / local proxy).
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById("root")!).render(<App />);
