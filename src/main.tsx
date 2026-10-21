import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Experience from "./Experience";
import "./style.css";
import "./bubble.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Experience />
    <App />
  </React.StrictMode>,
);
