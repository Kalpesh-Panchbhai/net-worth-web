import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { Snackbar, Alert, type AlertColor } from "@mui/material";

interface Toast {
  message: string;
  severity: AlertColor;
}

interface ToastContextValue {
  showToast: (message: string, severity?: AlertColor) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, severity: AlertColor = "success") => {
    setToast({ message, severity });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: "100%", borderRadius: 2.5, fontWeight: 600 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
