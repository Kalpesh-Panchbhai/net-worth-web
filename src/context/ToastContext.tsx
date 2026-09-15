import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Snackbar, Alert, Button, type AlertColor } from "@mui/material";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  /** An action button rendered inside the toast — e.g. "Undo" for a delete. */
  action?: ToastAction;
  /** Override the auto-hide duration (ms). Defaults to 3s, or 6s when an action is present. */
  duration?: number;
}

interface Toast {
  message: string;
  severity: AlertColor;
  action?: ToastAction;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, severity: AlertColor = "success", options?: ToastOptions) => {
    setToast({
      message,
      severity,
      action: options?.action,
      // An action needs longer to notice and click than a plain confirmation.
      duration: options?.duration ?? (options?.action ? 6000 : 3000),
    });
  }, []);

  const close = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.duration ?? 3000}
        onClose={(_, reason) => { if (reason !== "clickaway") close(); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            onClose={close}
            severity={toast.severity}
            variant="filled"
            sx={{ width: "100%", borderRadius: 2.5, fontWeight: 600, alignItems: "center" }}
            action={toast.action ? (
              <Button
                size="small"
                onClick={() => { toast.action?.onClick(); close(); }}
                sx={{ color: "inherit", fontWeight: 800, textTransform: "none", mr: 0.5 }}
              >
                {toast.action.label}
              </Button>
            ) : undefined}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
