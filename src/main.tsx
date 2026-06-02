import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

/* HashRouter so the app works on any static host (GitHub Pages, file://, etc.)
 * without needing server-side SPA fallback. URLs look like /#/workspace.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
