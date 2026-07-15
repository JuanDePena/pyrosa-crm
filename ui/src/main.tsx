import React from "react";
import { createRoot } from "react-dom/client";
import { FatalErrorBoundary } from "./FatalErrorLanding";
import { CrmApp } from "./CrmApp";
import "@pyrosa/ui/styles.css";
import "@pyrosa/ui-layouts/styles.css";
import "@pyrosa/ui-templates/styles.css";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("CRM root element is missing");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <FatalErrorBoundary>
      <CrmApp />
    </FatalErrorBoundary>
  </React.StrictMode>
);
