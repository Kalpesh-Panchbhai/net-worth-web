import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import App from "./App";
import theme from "./theme";
import { ToastProvider } from "./context/ToastContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
