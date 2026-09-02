import type { ReactNode } from "react";
import { Box, Typography, Button, Skeleton, Paper } from "@mui/material";
import { alpha } from "@mui/material/styles";

// ─── Empty State ─────────────────────────────────────────────
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: "center", py: { xs: 6, sm: 8 }, px: 3 }}>
      <Box sx={{ color: "text.disabled", mb: 2, "& > svg": { fontSize: 56 } }}>{icon}</Box>
      <Typography variant="h6" sx={{ mb: 0.5, color: "text.primary" }}>{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mx: "auto" }}>{description}</Typography>}
      {action && (
        <Button variant="contained" onClick={action.onClick} sx={{ mt: 3 }}>{action.label}</Button>
      )}
    </Box>
  );
}

// ─── Error State ─────────────────────────────────────────────
interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Box sx={{ textAlign: "center", py: { xs: 6, sm: 8 }, px: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Something went wrong</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 320, mx: "auto" }}>{message}</Typography>
      {onRetry && <Button variant="outlined" onClick={onRetry}>Try again</Button>}
    </Box>
  );
}

// ─── Page Header ─────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  action?: ReactNode;
}

export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: { xs: 2, sm: 3 } }}>
      <Typography variant="h5">{title}</Typography>
      {action}
    </Box>
  );
}

// ─── Metric Card ─────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: string;
  accent?: string;
  footer?: ReactNode;
}

export function MetricCard({ label, value, accent, footer }: MetricCardProps) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography variant="overline" sx={{ fontSize: { xs: "0.6rem", sm: "0.75rem" } }}>{label}</Typography>
      <Typography variant="h4" noWrap sx={{ mt: 0.5, color: accent || "text.primary", fontSize: { xs: "1.5rem", sm: "2.125rem" } }}>
        {value}
      </Typography>
      {footer && <Box sx={{ mt: "auto", pt: 1.5 }}>{footer}</Box>}
    </Paper>
  );
}

// ─── Skeleton Loaders ────────────────────────────────────────
export function MetricSkeleton() {
  return (
    <Paper sx={{ p: 3 }}>
      <Skeleton width={80} height={14} sx={{ mb: 1 }} />
      <Skeleton width={140} height={32} />
      <Skeleton width={100} height={14} sx={{ mt: 1.5 }} />
    </Paper>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Paper>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} sx={{ px: { xs: 2, sm: 3 }, py: 2, display: "flex", alignItems: "center", gap: 2, borderBottom: i < rows - 1 ? 1 : 0, borderColor: "divider" }}>
          <Skeleton variant="circular" width={36} height={36} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={16} />
            <Skeleton width="30%" height={12} sx={{ mt: 0.5 }} />
          </Box>
          <Skeleton width={80} height={16} />
        </Box>
      ))}
    </Paper>
  );
}

export function ChartSkeleton() {
  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
        <Skeleton width={140} height={20} />
        <Skeleton width={200} height={32} />
      </Box>
      <Skeleton variant="rounded" height={280} sx={{ borderRadius: 2 }} />
    </Paper>
  );
}

// ─── Tinted Chip ─────────────────────────────────────────────
interface TintedChipProps {
  label: string;
  color: string;
  icon?: ReactNode;
  size?: "small" | "medium";
}

export function TintedChip({ label, color, icon, size = "small" }: TintedChipProps) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex", alignItems: "center", gap: 0.5,
        px: size === "small" ? 1 : 1.5,
        py: size === "small" ? 0.25 : 0.5,
        borderRadius: 1,
        bgcolor: alpha(color, 0.1),
        color,
        fontSize: size === "small" ? "0.6875rem" : "0.8125rem",
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        "& > svg": { fontSize: size === "small" ? 14 : 16 },
      }}
    >
      {icon}{label}
    </Box>
  );
}

// ─── Fade In wrapper ─────────────────────────────────────────
// A plain CSS animation rather than a MUI Fade: this wraps every row of every list, and a
// Transition instance per row costs a mount-time reflow plus timers. The delay goes through an
// inline style so a per-row value does not compile a new emotion class each time.
const fadeInSx = {
  animation: "fadeIn 400ms cubic-bezier(0.4, 0, 0.2, 1) both",
  "@keyframes fadeIn": { from: { opacity: 0 }, to: { opacity: 1 } },
};

export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <Box sx={fadeInSx} style={delay ? { animationDelay: `${delay}ms` } : undefined}>{children}</Box>
  );
}
