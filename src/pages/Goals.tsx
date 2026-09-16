import { useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Typography, TextField, Stack, Slider, Button, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Fab, Avatar,
  LinearProgress, useMediaQuery, useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import LocalFireDepartmentRoundedIcon from "@mui/icons-material/LocalFireDepartmentRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { useUser } from "../context/UserContext";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";
import { getHoldings } from "../api/client";
import { PageHeader, MetricCard, FadeIn, EmptyState, TintedChip } from "../components/shared";
import { formatCurrency as fmt, formatCurrencyCompact as fmtC } from "../utils/format";
import {
  newGoalId, evaluateGoal, computeFire, goalSourceLabel,
  formatDuration, formatMonthYear, type Goal, type GoalSource,
} from "../utils/goals";
import { useSyncedConfig } from "../utils/syncedConfig";
import { useGoalValues } from "../utils/useGoalValues";
import NumericField from "../components/NumericField";
import { DEFAULT_CURRENCY } from "../constants";
import type { HoldingSummary } from "../api/types";

const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : 0; };

function numberField(
  label: string, value: string, setter: (v: string) => void,
  adornment: string, adornmentPos: "start" | "end" = "start", helper?: string,
) {
  return (
    <NumericField
      label={label} value={value} onChange={setter}
      adornment={adornment} adornmentPos={adornmentPos}
      currency={adornmentPos === "start" ? adornment : DEFAULT_CURRENCY}
      size="small" fullWidth helperText={helper}
    />
  );
}

// ─── FIRE calculator ─────────────────────────────────────────

interface FireSettings {
  expenses: string; monthly: string; annualReturn: string;
  inflation: string; withdrawal: string; retireYears: number;
}
const DEFAULT_FIRE: FireSettings = {
  expenses: "1200000", monthly: "50000", annualReturn: "12", inflation: "6", withdrawal: "4", retireYears: 25,
};

function FireCalculator({ netWorth, prefilled }: { netWorth: number; prefilled: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { userId, preferredCurrency } = useUser();
  const { colors } = useTokens();

  const [s, setS] = useSyncedConfig<FireSettings>(userId, "fire", DEFAULT_FIRE);
  const patch = (k: keyof FireSettings, v: string | number) => setS({ ...s, [k]: v });
  const { expenses, monthly, annualReturn, inflation, withdrawal, retireYears } = s;

  const fire = useMemo(() => computeFire({
    netWorth,
    monthlyContribution: num(monthly),
    annualExpenses: num(expenses),
    annualReturnPct: num(annualReturn),
    inflationPct: num(inflation),
    withdrawalRatePct: num(withdrawal),
    yearsToRetirement: retireYears,
  }), [netWorth, monthly, expenses, annualReturn, inflation, withdrawal, retireYears]);

  const brand = colors.brand;
  const fireColor = isDark ? "#FBBF24" : colors.warning;
  const progress = Math.min(100, Math.max(0, fire.progressPct));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = fire.points[label] ?? {};
    return (
      <Paper sx={{ p: 1.5, borderRadius: 2, boxShadow: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.8rem", mb: 0.5 }}>Year {label}</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: brand, fontWeight: 600 }}>
          Net worth: {fmt(p.balance ?? 0, preferredCurrency)}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: fireColor, fontWeight: 600 }}>
          FIRE number: {fmt(fire.fireNumber, preferredCurrency)}
        </Typography>
      </Paper>
    );
  };

  return (
    <FadeIn>
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <LocalFireDepartmentRoundedIcon sx={{ color: fireColor }} />
          <Typography sx={{ fontWeight: 700 }}>Financial Independence (FIRE)</Typography>
        </Stack>
        <Typography sx={{ fontSize: "0.75rem", color: colors.gray500, mb: 2 }}>
          Everything below is in today's money — the return is adjusted for inflation.
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, mb: 2 }}>
          {numberField("Current net worth", String(Math.round(netWorth)), () => {}, preferredCurrency, "start",
            prefilled ? "From your active accounts" : "No accounts found")}
          {numberField("Annual expenses", expenses, v => patch("expenses", v), preferredCurrency, "start", "Yearly spend you want covered")}
          {numberField("Monthly contribution", monthly, v => patch("monthly", v), preferredCurrency, "start")}
          {numberField("Expected annual return", annualReturn, v => patch("annualReturn", v), "%", "end")}
          {numberField("Inflation", inflation, v => patch("inflation", v), "%", "end")}
          {numberField("Safe withdrawal rate", withdrawal, v => patch("withdrawal", v), "%", "end", "4% is the classic rule of thumb")}
        </Box>

        <Box sx={{ px: 1, mb: 2.5 }}>
          <Typography sx={{ fontSize: "0.75rem", color: colors.gray500, mb: 0.5 }}>
            Coast-FIRE horizon: <strong>{retireYears} years</strong> until traditional retirement
          </Typography>
          <Slider value={retireYears} onChange={(_, v) => patch("retireYears", v as number)} min={1} max={40}
            marks={[{ value: 1, label: "1y" }, { value: 25, label: "25y" }, { value: 40, label: "40y" }]} sx={{ mx: 1 }} />
        </Box>

        {/* Progress toward FI */}
        <Box sx={{ mb: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: colors.gray500 }}>Progress to FI</Typography>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: brand }}>{progress.toFixed(1)}%</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={progress}
            sx={{ height: 8, borderRadius: 4, bgcolor: colors.gray100, "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: brand } }} />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: { xs: 1.5, sm: 2 }, mb: 3 }}>
          <MetricCard label="FIRE number" value={fmt(fire.fireNumber, preferredCurrency)} accent={fireColor} />
          <MetricCard label="Time to FI" value={formatDuration(fire.monthsToFI)} accent={brand} footer={
            <Typography sx={{ fontSize: "0.7rem", color: colors.gray400 }}>{formatMonthYear(fire.fiDate)}</Typography>
          } />
          <MetricCard label="Real return" value={`${fire.realReturnPct.toFixed(1)}%`} />
          <MetricCard label={`Coast FIRE (${retireYears}y)`} value={fmt(fire.coastNumber, preferredCurrency)} accent={fire.isCoasting ? colors.success : undefined} footer={
            <Typography sx={{ fontSize: "0.7rem", color: fire.isCoasting ? colors.success : colors.gray400 }}>
              {fire.isCoasting ? "You can stop saving" : "Keep contributing"}
            </Typography>
          } />
        </Box>

        <Typography sx={{ fontWeight: 700, mb: 1.5, fontSize: "0.9rem" }}>Projected net worth vs FIRE number</Typography>
        <Box sx={{ height: { xs: 260, sm: 320 } }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fire.points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="fireBal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={brand} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.gray200} vertical={false} />
              <XAxis dataKey="year" tickFormatter={(y) => `${y}y`} tick={{ fontSize: 11, fill: colors.gray400 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => fmtC(v, preferredCurrency)} tick={{ fontSize: 11, fill: colors.gray400 }} tickLine={false} axisLine={false} width={54} />
              <Tooltip content={<CustomTooltip />} />
              {Number.isFinite(fire.fireNumber) && (
                <ReferenceLine y={fire.fireNumber} stroke={fireColor} strokeDasharray="5 4" strokeWidth={1.5}
                  label={{ value: "FIRE", position: "insideTopRight", fill: fireColor, fontSize: 11, fontWeight: 700 }} />
              )}
              <Area type="monotone" dataKey="balance" name="Net worth" stroke={brand} strokeWidth={2.5} fill="url(#fireBal)" />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
        <Typography sx={{ fontSize: "0.7rem", color: colors.gray400, mt: 1.5 }}>
          Illustrative only. Assumes constant real returns and a fixed monthly contribution.
        </Typography>
      </Paper>
    </FadeIn>
  );
}

// ─── Goals list ──────────────────────────────────────────────

type SourceKind = "networth" | "account" | "watchlist" | "holding" | "manual";

const SOURCE_OPTIONS: { value: SourceKind; label: string }[] = [
  { value: "networth", label: "Overall net worth" },
  { value: "account", label: "An account / broker" },
  { value: "holding", label: "A holding" },
  { value: "watchlist", label: "A watchlist" },
  { value: "manual", label: "Manual amount" },
];

interface GoalForm {
  name: string;
  sourceKind: SourceKind;
  accountId: string;   // account source, and the account a holding belongs to
  watchlistId: string; // watchlist source
  holdingId: string;   // holding source
  targetAmount: string;
  currentAmount: string; // manual source only
  monthlyContribution: string;
  annualReturnPct: string;
  targetDate: string;
}

const emptyForm = (): GoalForm => ({
  name: "", sourceKind: "networth", accountId: "", watchlistId: "", holdingId: "",
  targetAmount: "", currentAmount: "0",
  monthlyContribution: "25000", annualReturnPct: "12", targetDate: "",
});

/** Reconstruct the editable form fields from a saved goal. */
function formFromGoal(g: Goal): GoalForm {
  const src = g.source;
  const base = emptyForm();
  base.name = g.name;
  base.targetAmount = String(g.targetAmount);
  base.currentAmount = String(g.currentAmount);
  base.monthlyContribution = String(g.monthlyContribution);
  base.annualReturnPct = String(g.annualReturnPct);
  base.targetDate = g.targetDate ?? "";
  base.sourceKind = src?.kind ?? "manual";
  if (src?.kind === "account") base.accountId = String(src.id);
  if (src?.kind === "watchlist") base.watchlistId = String(src.id);
  if (src?.kind === "holding") { base.accountId = String(src.accountId); base.holdingId = String(src.id); }
  return base;
}

function Goals() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { userId, preferredCurrency } = useUser();
  const { colors } = useTokens();
  const { showToast } = useToast();

  const [goals, setGoals] = useSyncedConfig<Goal[]>(userId, "goals", []);
  const { netWorth, accounts, watchlists, valueOf } = useGoalValues(goals);
  const prefilled = netWorth > 0;
  // Only broker accounts hold holdings, so the holding picker's account list is broker-only.
  const brokerAccounts = accounts.filter(a => a.type === "BROKER");

  const [createOpen, setCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalForm>(emptyForm());

  // Holdings for the account picked in the form's "holding" source.
  const [holdingOptions, setHoldingOptions] = useState<HoldingSummary[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  useEffect(() => {
    if (form.sourceKind !== "holding" || !form.accountId) { setHoldingOptions([]); return; }
    let cancelled = false;
    setLoadingHoldings(true);
    getHoldings(Number(form.accountId))
      .then(hs => { if (!cancelled) setHoldingOptions(hs); })
      .catch(() => { if (!cancelled) setHoldingOptions([]); })
      .finally(() => { if (!cancelled) setLoadingHoldings(false); });
    return () => { cancelled = true; };
  }, [form.sourceKind, form.accountId]);

  const openCreate = () => { setForm(emptyForm()); setCreateOpen(true); };
  const openEdit = (g: Goal) => { setForm(formFromGoal(g)); setEditGoal(g); };

  const setField = (k: keyof GoalForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  // Resolve the picked entity into a GoalSource; null while a required entity isn't chosen yet.
  const buildSource = (): GoalSource | null => {
    switch (form.sourceKind) {
      case "manual": return { kind: "manual" };
      case "networth": return { kind: "networth" };
      case "account": {
        if (!form.accountId) return null;
        const a = accounts.find(x => x.id === Number(form.accountId));
        return { kind: "account", id: Number(form.accountId), label: a?.name ?? "Account" };
      }
      case "watchlist": {
        if (!form.watchlistId) return null;
        const w = watchlists.find(x => x.id === Number(form.watchlistId));
        return { kind: "watchlist", id: Number(form.watchlistId), label: w?.name ?? "Watchlist" };
      }
      case "holding": {
        if (!form.accountId || !form.holdingId) return null;
        const h = holdingOptions.find(x => x.id === Number(form.holdingId));
        return { kind: "holding", id: Number(form.holdingId), accountId: Number(form.accountId), label: h?.name ?? "Holding" };
      }
    }
  };

  const resolvedSource = buildSource();
  const formValid = num(form.targetAmount) > 0 && resolvedSource !== null;
  const effectiveName = () => form.name.trim() || goalSourceLabel(resolvedSource ?? undefined);

  // Live value for the source currently chosen in the form (for the preview line).
  const currentPreview = (() => {
    if (!resolvedSource) return 0;
    switch (resolvedSource.kind) {
      case "networth": return netWorth;
      case "account": return accounts.find(a => a.id === resolvedSource.id)?.currentDayValue ?? 0;
      case "watchlist": return watchlists.find(w => w.id === resolvedSource.id)?.currentDayValue ?? 0;
      case "holding": return holdingOptions.find(h => h.id === resolvedSource.id)?.currentDayValue ?? 0;
      default: return num(form.currentAmount);
    }
  })();

  const handleCreate = () => {
    if (!formValid || !resolvedSource) return;
    const goal: Goal = {
      id: newGoalId(), name: effectiveName(), source: resolvedSource,
      targetAmount: num(form.targetAmount),
      currentAmount: resolvedSource.kind === "manual" ? num(form.currentAmount) : 0,
      monthlyContribution: num(form.monthlyContribution), annualReturnPct: num(form.annualReturnPct),
      targetDate: form.targetDate || undefined, createdAt: new Date().toISOString(),
    };
    setGoals([...goals, goal]);
    setCreateOpen(false);
    showToast(`Goal "${goal.name}" created`);
  };

  const handleUpdate = () => {
    if (!editGoal || !formValid || !resolvedSource) return;
    const name = effectiveName();
    setGoals(goals.map(g => g.id === editGoal.id ? {
      ...g, name, source: resolvedSource,
      targetAmount: num(form.targetAmount),
      currentAmount: resolvedSource.kind === "manual" ? num(form.currentAmount) : 0,
      monthlyContribution: num(form.monthlyContribution), annualReturnPct: num(form.annualReturnPct),
      targetDate: form.targetDate || undefined,
    } : g));
    setEditGoal(null);
    showToast(`Goal "${name}" updated`);
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    setGoals(goals.filter(g => g.id !== deleteConfirm.id));
    showToast(`Goal "${deleteConfirm.name}" deleted`);
    setDeleteConfirm(null);
  };

  const isDark = theme.palette.mode === "dark";
  const success = isDark ? "#34D399" : colors.success;

  const goalDialog = (mode: "create" | "edit") => (
    <Dialog
      open={mode === "create" ? createOpen : !!editGoal}
      onClose={() => mode === "create" ? setCreateOpen(false) : setEditGoal(null)}
      fullScreen={isMobile} fullWidth maxWidth="sm"
    >
      <DialogTitle>{mode === "create" ? "New Goal" : "Edit Goal"}</DialogTitle>
      <DialogContent sx={{ pt: "16px !important" }}>
        <Stack spacing={2}>
          <TextField
            select label="Track" value={form.sourceKind} fullWidth
            onChange={e => setForm(f => ({ ...f, sourceKind: e.target.value as SourceKind, accountId: "", watchlistId: "", holdingId: "" }))}
            helperText="What this goal measures progress against"
          >
            {SOURCE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>

          {form.sourceKind === "account" && (
            <TextField select label="Account" value={form.accountId} onChange={e => setField("accountId")(e.target.value)} fullWidth>
              {accounts.length === 0 && <MenuItem value="" disabled>No accounts</MenuItem>}
              {accounts.map(a => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
            </TextField>
          )}

          {form.sourceKind === "watchlist" && (
            <TextField select label="Watchlist" value={form.watchlistId} onChange={e => setField("watchlistId")(e.target.value)} fullWidth>
              {watchlists.length === 0 && <MenuItem value="" disabled>No watchlists</MenuItem>}
              {watchlists.map(w => <MenuItem key={w.id} value={String(w.id)}>{w.name}</MenuItem>)}
            </TextField>
          )}

          {form.sourceKind === "holding" && (
            <>
              <TextField select label="Account" value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value, holdingId: "" }))} fullWidth>
                {brokerAccounts.length === 0 && <MenuItem value="" disabled>No broker accounts</MenuItem>}
                {brokerAccounts.map(a => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
              </TextField>
              <TextField
                select label="Holding" value={form.holdingId} onChange={e => setField("holdingId")(e.target.value)} fullWidth
                disabled={!form.accountId || loadingHoldings}
                helperText={loadingHoldings ? "Loading holdings…" : !form.accountId ? "Pick an account first" : undefined}
              >
                {holdingOptions.length === 0 && <MenuItem value="" disabled>No holdings</MenuItem>}
                {holdingOptions.map(h => <MenuItem key={h.id} value={String(h.id)}>{h.name}</MenuItem>)}
              </TextField>
            </>
          )}

          <TextField
            label="Name (optional)" value={form.name} onChange={e => setField("name")(e.target.value)}
            fullWidth placeholder={goalSourceLabel(resolvedSource ?? undefined)}
          />
          {numberField("Target amount", form.targetAmount, setField("targetAmount"), preferredCurrency)}
          {form.sourceKind === "manual"
            ? numberField("Already saved", form.currentAmount, setField("currentAmount"), preferredCurrency)
            : (
              <Typography sx={{ fontSize: "0.75rem", color: colors.gray500, px: 0.5 }}>
                Current value is read live from <strong>{goalSourceLabel(resolvedSource ?? undefined)}</strong>
                {resolvedSource && resolvedSource.kind !== "manual" ? ` — ${fmt(currentPreview, preferredCurrency)}` : ""}.
              </Typography>
            )}
          {numberField("Monthly contribution", form.monthlyContribution, setField("monthlyContribution"), preferredCurrency)}
          {numberField("Expected annual return", form.annualReturnPct, setField("annualReturnPct"), "%", "end")}
          <TextField
            label="Target date (optional)" type="date" value={form.targetDate}
            onChange={e => setField("targetDate")(e.target.value)} fullWidth InputLabelProps={{ shrink: true }}
            helperText="Leave empty to just track a projected date"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => mode === "create" ? setCreateOpen(false) : setEditGoal(null)}>Cancel</Button>
        <Button variant="contained" onClick={mode === "create" ? handleCreate : handleUpdate} disabled={!formValid}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Stack spacing={{ xs: 2.5, sm: 3 }}>
      <PageHeader title="Goals & FIRE" />

      <FireCalculator netWorth={netWorth} prefilled={prefilled} />

      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: "1rem", mb: 1.5 }}>Your Goals</Typography>
        {goals.length === 0 ? (
          <Paper>
            <EmptyState
              icon={<FlagRoundedIcon />}
              title="No goals yet"
              description="Set a target amount and date, and track how your contributions get you there."
              action={{ label: "Add Goal", onClick: openCreate }}
            />
          </Paper>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {goals.map((g, i) => {
              const current = valueOf(g);
              const s = evaluateGoal(g, current);
              const progress = Math.min(100, Math.max(0, s.progressPct));
              const done = progress >= 100;
              const barColor = done ? success : g.targetDate && s.onTrack === false ? colors.error : colors.brand;
              const linked = g.source && g.source.kind !== "manual";
              return (
                <FadeIn key={g.id} delay={i * 40}>
                  <Paper sx={{ p: 2.5, borderRadius: 3, borderLeft: `4px solid ${barColor}`, height: "100%", display: "flex", flexDirection: "column" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <Avatar sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(barColor, 0.1), color: barColor }}>
                        {done ? <CheckCircleRoundedIcon sx={{ fontSize: 20 }} /> : <FlagRoundedIcon sx={{ fontSize: 20 }} />}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650, fontSize: "0.9rem", lineHeight: 1.3 }} noWrap>{g.name}</Typography>
                        <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>
                          {fmt(current, preferredCurrency)} of {fmt(g.targetAmount, preferredCurrency)}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0}>
                        <IconButton size="small" onClick={() => openEdit(g)} sx={{ color: colors.brand, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.brand, 0.08) } }}>
                          <EditOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => setDeleteConfirm(g)} sx={{ color: colors.error, opacity: 0.6, "&:hover": { opacity: 1, bgcolor: alpha(colors.error, 0.08) } }}>
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    </Box>

                    <Box sx={{ mb: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: colors.gray500 }}>Progress</Typography>
                        <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: barColor }}>{progress.toFixed(1)}%</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={progress}
                        sx={{ height: 8, borderRadius: 4, bgcolor: colors.gray100, "& .MuiLinearProgress-bar": { borderRadius: 4, bgcolor: barColor } }} />
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: "auto" }}>
                      {linked && <TintedChip label={`Tracking: ${goalSourceLabel(g.source)}`} color={colors.accent} />}
                      <TintedChip label={done ? "Reached" : `~${formatDuration(s.monthsToGoal)}`} color={done ? success : colors.brand} />
                      {!done && <TintedChip label={formatMonthYear(s.projectedDate)} color={colors.gray500} />}
                      {g.targetDate && !done && (
                        <TintedChip
                          label={s.onTrack ? `On track · ${formatMonthYear(g.targetDate)}` : `Behind · need ${fmt(s.requiredContribution ?? 0, preferredCurrency)}/mo`}
                          color={s.onTrack ? success : colors.error}
                        />
                      )}
                    </Stack>
                  </Paper>
                </FadeIn>
              );
            })}
          </Box>
        )}
      </Box>

      {goalDialog("create")}
      {goalDialog("edit")}

      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete Goal</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteConfirm?.name}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Fab onClick={openCreate}
        variant={isMobile ? "circular" : "extended"}
        sx={{
          position: "fixed",
          bottom: { xs: "calc(24px + env(safe-area-inset-bottom, 0px))", sm: 24 },
          right: { xs: 16, sm: 24 },
          bgcolor: colors.accent, color: colors.pureWhite,
          boxShadow: `0 4px 20px ${alpha(colors.accent, 0.4)}`,
          "&:hover": { bgcolor: colors.accentDark, boxShadow: `0 6px 28px ${alpha(colors.accent, 0.5)}` },
        }}>
        <AddIcon sx={isMobile ? {} : { mr: 0.5 }} />
        {!isMobile && "Add Goal"}
      </Fab>
    </Stack>
  );
}

export default Goals;
