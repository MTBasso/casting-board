import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SeasonApp } from "./ui/season/SeasonApp.js";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");
createRoot(root).render(
  <StrictMode>
    <SeasonApp />
  </StrictMode>,
);
