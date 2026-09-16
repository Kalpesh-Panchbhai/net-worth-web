import { useNavigate } from "react-router-dom";
import { Box, Paper, Typography, Stack, LinearProgress, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { useUser } from "../../context/UserContext";
import { useTokens } from "../../context/ColorModeContext";
import { useSyncedConfig } from "../../utils/syncedConfig";
import { useGoalValues } from "../../utils/useGoalValues";
import { evaluateGoal, goalSourceLabel, formatDuration, type Goal } from "../../utils/goals";
import { formatCurrency as fmt } from "../../utils/format";

/** Dashboard widget: live progress toward each goal, reading the same synced goals as the Goals page. */
export default function GoalsWidget() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { userId, preferredCurrency } = useUser();
  const { colors } = useTokens();
  const [goals] = useSyncedConfig<Goal[]>(userId, "goals", []);
  const { valueOf } = useGoalValues(goals);

  const success = isDark ? "#34D399" : colors.success;

  return (
    <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, height: "100%", display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(colors.brand, 0.1), color: colors.brand }}>
          <FlagRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, color: colors.gray500 }}>Goals</Typography>
        <Box sx={{ flex: 1 }} />
        <Box
          onClick={() => navigate("/goals")}
          sx={{ display: "flex", alignItems: "center", cursor: "pointer", color: colors.gray400, "&:hover": { color: colors.brand } }}
        >
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 600 }}>Manage</Typography>
          <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
      </Stack>

      {goals.length === 0 ? (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", py: 3, color: colors.gray400 }}>
          <FlagRoundedIcon sx={{ fontSize: 34, mb: 1 }} />
          <Typography sx={{ fontSize: "0.82rem", mb: 1.5 }}>No goals yet.</Typography>
          <Typography onClick={() => navigate("/goals")} sx={{ fontSize: "0.78rem", fontWeight: 700, color: colors.brand, cursor: "pointer" }}>
            Create a goal
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.75} sx={{ overflowY: "auto" }}>
          {goals.map(g => {
            const current = valueOf(g);
            const st = evaluateGoal(g, current);
            const progress = Math.min(100, Math.max(0, st.progressPct));
            const done = progress >= 100;
            const barColor = done ? success : g.targetDate && st.onTrack === false ? colors.error : colors.brand;
            return (
              <Box key={g.id}>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                  {done && <CheckCircleRoundedIcon sx={{ fontSize: 15, color: success }} />}
                  <Typography sx={{ fontSize: "0.82rem", fontWeight: 650, color: colors.gray800, flex: 1, minWidth: 0 }} noWrap>
                    {g.name}
                  </Typography>
                  <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: barColor }}>{progress.toFixed(0)}%</Typography>
                </Stack>
                <LinearProgress
                  variant="determinate" value={progress}
                  sx={{ height: 7, borderRadius: 4, bgcolor: colors.gray100, "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: barColor } }}
                />
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                  <Typography sx={{ fontSize: "0.68rem", color: colors.gray400 }} noWrap>
                    {fmt(current, preferredCurrency)} of {fmt(g.targetAmount, preferredCurrency)}
                  </Typography>
                  <Typography sx={{ fontSize: "0.68rem", color: colors.gray400, flexShrink: 0, ml: 1 }}>
                    {done ? goalSourceLabel(g.source) : `~${formatDuration(st.monthsToGoal)}`}
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
