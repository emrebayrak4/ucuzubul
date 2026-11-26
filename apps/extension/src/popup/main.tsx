import "../shared/zod";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../ui/app.css";
import { BRAND_NAME } from "../shared/env";
import { applySystemTheme } from "../ui/theme";
import { PopupApp } from "./App";

applySystemTheme();
document.title = BRAND_NAME;
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
