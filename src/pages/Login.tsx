import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { Box, Typography, Button, Paper, Avatar, Alert, CircularProgress } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { tokens } from "../theme";

const { colors, gradients } = tokens;

function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${colors.gray50} 0%, ${colors.gray100} 50%, ${alpha(colors.brand, 0.04)} 100%)`,
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, sm: 5 },
          borderRadius: 4,
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          border: `1px solid ${colors.gray200}`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        {/* Logo */}
        <Avatar
          sx={{
            width: 56,
            height: 56,
            background: gradients.hero,
            fontSize: "1.1rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            mx: "auto",
            mb: 2.5,
          }}
        >
          NW
        </Avatar>

        <Typography
          sx={{
            fontSize: "1.5rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: colors.gray900,
            mb: 0.5,
          }}
        >
          Net Worth
        </Typography>

        <Typography
          sx={{
            fontSize: "0.9rem",
            color: colors.gray500,
            mb: 4,
            lineHeight: 1.5,
          }}
        >
          Track your finances, investments, and income — all in one place.
        </Typography>

        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            sx={{ mb: 3, textAlign: "left" }}
          >
            {error}
          </Alert>
        )}

        {/* Google Sign-In Button */}
        <Button
          onClick={handleGoogleSignIn}
          disabled={loading}
          fullWidth
          sx={{
            py: 1.5,
            px: 3,
            borderRadius: 3,
            textTransform: "none",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: colors.gray700,
            bgcolor: colors.white,
            border: `1.5px solid ${colors.gray200}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: colors.gray50,
              borderColor: colors.gray300,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transform: "translateY(-1px)",
            },
            "&:active": {
              transform: "translateY(0)",
            },
          }}
        >
          {loading ? (
            <CircularProgress size={22} sx={{ mr: 1.5, color: colors.gray500 }} />
          ) : (
            <Box
              component="img"
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt=""
              sx={{ width: 20, height: 20, mr: 1.5 }}
            />
          )}
          {loading ? "Signing in…" : "Continue with Google"}
        </Button>

        <Typography
          sx={{
            fontSize: "0.72rem",
            color: colors.gray400,
            mt: 3,
            lineHeight: 1.5,
          }}
        >
          Your data stays private. We only use your Google account for authentication.
        </Typography>
      </Paper>
    </Box>
  );
}

export default Login;
