import { useEffect, useState } from "react";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { syncMfCallback } from "../api/client";

function KiteCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get("request_token");
    const kiteStatus = params.get("status");

    if (kiteStatus !== "success" || !requestToken) {
      setStatus("error");
      setErrorMsg("Login was cancelled or failed.");
      return;
    }

    syncMfCallback(requestToken)
      .then(() => {
        setStatus("success");
        // Notify the parent window that login succeeded
        if (window.opener) {
          window.opener.postMessage({ type: "kite-auth-success" }, "*");
          setTimeout(() => window.close(), 1500);
        }
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Token exchange failed");
      });
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 2, p: 3 }}>
      {status === "loading" && (
        <>
          <CircularProgress size={48} />
          <Typography variant="h6" fontWeight={600}>Connecting to Kite...</Typography>
          <Typography color="text.secondary">Exchanging authentication token</Typography>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircleOutlineIcon sx={{ fontSize: 64, color: "success.main" }} />
          <Typography variant="h6" fontWeight={600}>Login Successful</Typography>
          <Typography color="text.secondary">This window will close automatically</Typography>
          <Button variant="outlined" onClick={() => window.close()}>Close</Button>
        </>
      )}
      {status === "error" && (
        <>
          <ErrorOutlineIcon sx={{ fontSize: 64, color: "error.main" }} />
          <Typography variant="h6" fontWeight={600}>Login Failed</Typography>
          <Typography color="text.secondary">{errorMsg}</Typography>
          <Button variant="outlined" onClick={() => window.close()}>Close</Button>
        </>
      )}
    </Box>
  );
}

export default KiteCallback;
