import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// The app font, the code font and the document fonts of `src/lib/fonts.ts`.
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/ibm-plex-sans/wght-italic.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource-variable/source-sans-3/wght-italic.css";
import "@fontsource-variable/noto-sans/wght.css";
import "@fontsource-variable/noto-sans/wght-italic.css";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource-variable/public-sans/wght-italic.css";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/400-italic.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/fira-sans/600-italic.css";
import "@fontsource/fira-sans/700.css";
import "@fontsource/fira-sans/700-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@/styles/index.css";
import "@/styles/markdown.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
