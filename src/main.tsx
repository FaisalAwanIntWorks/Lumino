import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { GlobalErrorBoundary } from "./components/common/GlobalErrorBoundary";

const preloadPath = window.location.pathname;
const preloadHost = window.location.hostname;
document.body.toggleAttribute(
  "data-embed-preload",
  preloadHost.startsWith("widget.") || /^\/(embed\/|[a-f0-9-]{8,}|diamonds\/|quote\/|grillz\/|custom-enquiry\/|metal-buying\/)/i.test(preloadPath)
);

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
