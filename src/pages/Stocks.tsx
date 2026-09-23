import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box, Paper, Typography, Stack, TextField, InputAdornment, MenuItem, Grid,
  ToggleButton, ToggleButtonGroup, Chip, Select, FormControl, IconButton, Button, Link,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, CircularProgress,
  TableSortLabel, Collapse, Switch, FormControlLabel,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import {
  getStockSignals, getStockDetail, getStockEquity, getStockClosed,
  getStockPortfolio, addStockPosition, updateStockPosition, deleteStockPosition,
  getStockAlerts, updateStockAlert,
} from "../api/client";
import type {
  StockMarket, EnrichedStockSignal, StockSignalsResponse,
  StockDetailResponse, StockTrade,
  StockEquityPoint, StockPortfolioResponse, ValuedPosition, StockAlertConfig,
} from "../api/types";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "../components/shared";
import { formatCurrency } from "../utils/format";
import { useTokens } from "../context/ColorModeContext";
import { useToast } from "../context/ToastContext";

const LAKH = 100000;
// Categorical palette for donuts / per-series colours — tuned to read well on light & dark surfaces.
const DONUT_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#8B5CF6", "#F43F5E", "#84CC16", "#0EA5E9", "#D946EF"];
// Slack channel deep links per market.
const SLACK_CHANNELS: Record<StockMarket, string> = {
  in: "https://app.slack.com/client/T0BV1M7J9E0/C0BV1QR6YMA",
  us: "https://app.slack.com/client/T0BV1M7J9E0/C0BUTPAHUCV",
};
// Font stack matching the app shell (Inter first) so chart text isn't the browser default serif/sans.
const CHART_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function prettySector(s: string): string { return (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function tvUrl(stock: string, market: StockMarket): string {
  const ex = market === "us" ? "NASDAQ" : "NSE";
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`${ex}:${stock.replace(".NS", "")}`)}`;
}
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));
const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a) return null;
  const start = new Date(a).getTime(), end = b ? new Date(b).getTime() : Date.now();
  return Math.round((end - start) / 86400000);
}

// ── design primitives ────────────────────────────────────────────────
const LABEL_SX = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const };

/** Bordered stat card with an optional left accent stripe. Used for status + KPI grids. */
function StatCard({ label, value, sub, color, accent, center }:
  { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; accent?: string; center?: boolean }) {
  const { colors } = useTokens();
  return (
    <Paper variant="outlined" sx={{
      p: 1.5, flex: 1, minWidth: 120, borderRadius: 2.5, position: "relative", overflow: "hidden",
      textAlign: center ? "center" : "left", transition: "box-shadow .15s, transform .15s",
      "&:hover": { boxShadow: 3, transform: "translateY(-1px)" },
    }}>
      {accent && <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, bgcolor: accent }} />}
      <Typography sx={{ ...LABEL_SX, color: colors.gray500 }}>{label}</Typography>
      <Typography sx={{ fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.25, color: color ?? colors.gray900 }}>{value}</Typography>
      {sub != null && <Typography sx={{ fontSize: "0.68rem", fontWeight: 600, color: color ?? colors.gray500 }}>{sub}</Typography>}
    </Paper>
  );
}

/** Horizontal stat bar with divider-separated items (a clean summary strip). */
function StatBar({ items }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; primary?: boolean }[] }) {
  const { colors } = useTokens();
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2.5, px: 1, py: 1.5, mb: 2, display: "flex", alignItems: "stretch", overflowX: "auto" }}>
      {items.map((it, i) => (
        <Box key={i} sx={{ px: 2.25, minWidth: it.primary ? 168 : 116, display: "flex", flexDirection: "column", justifyContent: "center",
          borderLeft: i ? `1px solid ${colors.gray100}` : "none" }}>
          <Typography sx={{ ...LABEL_SX, color: colors.gray500, whiteSpace: "nowrap" }}>{it.label}</Typography>
          <Typography sx={{ fontSize: it.primary ? "1.5rem" : "1.15rem", fontWeight: 800, lineHeight: 1.3, color: it.color ?? colors.gray900, whiteSpace: "nowrap" }}>{it.value}</Typography>
          {it.sub != null && <Typography sx={{ fontSize: "0.68rem", fontWeight: 600, color: it.color ?? colors.gray500, whiteSpace: "nowrap" }}>{it.sub}</Typography>}
        </Box>
      ))}
    </Paper>
  );
}

/** Section heading used above charts/tables. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTokens();
  return <Typography sx={{ fontSize: "0.8rem", fontWeight: 700, color: colors.gray700, mb: 1 }}>{children}</Typography>;
}

function ClickableStock({ stock, market, onOpen }: { stock: string; market: StockMarket; onOpen: (s: string) => void }) {
  const { colors } = useTokens();
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box component="span" sx={{ fontWeight: 600, color: colors.brand, cursor: "pointer" }} onClick={() => onOpen(stock)}>{stock.replace(".NS", "")}</Box>
      <Link href={tvUrl(stock, market)} target="_blank" rel="noopener" sx={{ display: "inline-flex", color: colors.gray400 }} onClick={e => e.stopPropagation()}>
        <OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
      </Link>
    </Stack>
  );
}

// ── Stock detail dialog ──────────────────────────────────────────────
function StockDetailDialog({ market, stock, onClose }: { market: StockMarket; stock: string | null; onClose: () => void }) {
  const { colors } = useTokens();
  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [equity, setEquity] = useState<StockEquityPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const currency = market === "us" ? "USD" : "INR";
  useEffect(() => {
    if (!stock) return;
    setLoading(true);
    Promise.all([getStockDetail(market, stock), getStockEquity(market, { stock })])
      .then(([d, e]) => { setDetail(d); setEquity(e.points); }).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [market, stock]);
  const p = detail?.performance;
  return (
    <Dialog open={!!stock} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pr: 6 }}>
        <Typography component="span" sx={{ fontSize: "1.25rem", fontWeight: 800 }}>{stock?.replace(".NS", "")}</Typography>
        {p?.sector && <Chip label={prettySector(p.sector)} size="small" sx={{ height: 22, bgcolor: alpha(colors.brand, 0.1), color: colors.brand, fontWeight: 600 }} />}
        {stock && <Link href={tvUrl(stock, market)} target="_blank" rel="noopener" sx={{ display: "inline-flex", color: colors.gray400 }}><OpenInNewRoundedIcon sx={{ fontSize: 18 }} /></Link>}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12, color: colors.gray400 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress /></Box> : (
          <>
            {p && (
              <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ mb: 2 }}>
                <StatCard center label="CAGR" value={pct(p.cagr, 1)} color={(p.cagr ?? 0) >= 0 ? colors.success : colors.error} />
                <StatCard center label="Win Rate" value={pct(p.wr, 1)} />
                <StatCard center label="PF" value={num(p.pf)} />
                <StatCard center label="Trades" value={String(p.trades ?? "—")} />
                <StatCard center label="Sharpe" value={num(p.sharpe)} />
                <StatCard center label="Max DD" value={pct(p.mdd, 1)} color={colors.error} />
              </Stack>
            )}
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2.5 }}>
              <SectionTitle>Backtest Equity Curve</SectionTitle>
              <EquityArea points={equity} color={colors.brand} />
            </Paper>
            <SectionTitle>Trade History ({detail?.trades.length ?? 0})</SectionTitle>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 340, borderRadius: 2.5 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>
                  <TableCell>#</TableCell><TableCell>Entry</TableCell><TableCell align="right">Entry</TableCell><TableCell>Exit</TableCell>
                  <TableCell align="right">Exit</TableCell><TableCell align="right">P&L %</TableCell><TableCell align="right">MaxDD %</TableCell>
                  <TableCell align="right">Run-Up %</TableCell><TableCell>Comment</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {(detail?.trades ?? []).map(t => (
                    <TableRow key={t.tradeNum} hover>
                      <TableCell>{t.tradeNum}</TableCell><TableCell>{t.entryDate}</TableCell>
                      <TableCell align="right">{t.entryPrice != null ? formatCurrency(t.entryPrice, currency) : "—"}</TableCell>
                      <TableCell>{t.exitDate ?? <Chip label="OPEN" size="small" color="warning" sx={{ height: 18 }} />}</TableCell>
                      <TableCell align="right">{t.exitPrice != null ? formatCurrency(t.exitPrice, currency) : "—"}</TableCell>
                      <TableCell align="right" sx={{ color: (t.pnlPct ?? 0) >= 0 ? colors.success : colors.error, fontWeight: 600 }}>{pct(t.pnlPct)}</TableCell>
                      <TableCell align="right" sx={{ color: colors.error }}>{pct(t.maePct)}</TableCell>
                      <TableCell align="right" sx={{ color: colors.success }}>{pct(t.mfePct)}</TableCell>
                      <TableCell sx={{ color: colors.gray500, fontSize: "0.75rem" }}>{t.comment}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

const compactNum = (v: number) =>
  Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L`
    : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${Math.round(v)}`;

/** White, rounded, shadowed tooltip matching the app's chart style. */
function ChartTooltip({ active, payload, label, valueLabel, fmt }:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { active?: boolean; payload?: any[]; label?: string; valueLabel: string; fmt: (v: number) => string }) {
  const { colors, shadow } = useTokens();
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  const color = payload[0]?.color ?? colors.brand;
  return (
    <Box sx={{ bgcolor: colors.white, border: `1px solid ${colors.gray200}`, borderRadius: 2, boxShadow: shadow.md, px: 1.25, py: 1, minWidth: 130 }}>
      <Typography sx={{ fontSize: 11, color: colors.gray400, mb: 0.5, fontWeight: 500 }}>{label}</Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
        <Typography sx={{ fontSize: 12, color: colors.gray500 }}>{valueLabel}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: (v ?? 0) >= 0 ? color : colors.error }}>{fmt(v)}</Typography>
      </Box>
    </Box>
  );
}

function EquityArea({ points, color, valueLabel = "Equity", percent = false }: { points: StockEquityPoint[]; color: string; valueLabel?: string; percent?: boolean }) {
  const { colors } = useTokens();
  const gid = useMemo(() => `eq-${Math.random().toString(36).slice(2, 8)}`, []);
  if (!points?.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No equity data.</Typography>;
  const fmt = (v: number) => (percent ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : v.toLocaleString());
  const tickFmt = (v: number) => (percent ? `${compactNum(v)}%` : compactNum(v));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={points} margin={{ top: 8, right: 14, bottom: 0, left: 4 }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} /><stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient></defs>
        <CartesianGrid vertical={false} stroke={colors.gray100} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={44} tick={{ fontSize: 11, fill: colors.gray400, fontFamily: CHART_FONT }} />
        <YAxis tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} tick={{ fontSize: 11, fill: colors.gray400, fontFamily: CHART_FONT }} tickFormatter={tickFmt} />
        <RTooltip content={<ChartTooltip valueLabel={valueLabel} fmt={fmt} />} cursor={{ stroke: colors.gray200, strokeDasharray: "4 4" }} />
        <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: colors.white, fill: color }} isAnimationActive animationDuration={700} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Buy Stock / Close Position dialog ────────────────────────────────
function PositionDialog({ open, mode, market, initialStock, onClose, onSaved }:
  { open: boolean; mode: "buy" | "close"; market: StockMarket; initialStock?: { stock: string; sector?: string; strategy?: string; price?: number; id?: string; qty?: number };
    onClose: () => void; onSaved: (r: StockPortfolioResponse) => void }) {
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [stock, setStock] = useState(""); const [date, setDate] = useState(today);
  const [price, setPrice] = useState(""); const [qty, setQty] = useState(""); const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setStock(initialStock?.stock ?? ""); setDate(today);
      setPrice(initialStock?.price != null ? String(initialStock.price) : "");
      setQty(initialStock?.qty != null ? String(initialStock.qty) : ""); setNotes("");
    }
  }, [open, initialStock]);
  const save = async () => {
    setSaving(true);
    try {
      if (mode === "buy") {
        const r = await addStockPosition({ market, stock, sector: initialStock?.sector, strategy: initialStock?.strategy,
          entryDate: date, entryPrice: price ? Number(price) : undefined, quantity: qty ? Number(qty) : undefined, notes });
        onSaved(r); showToast(`Added ${stock}`, "success");
      } else {
        const r = await updateStockPosition({ id: initialStock!.id!, market, stock: initialStock!.stock, status: "closed",
          exitPrice: price ? Number(price) : null, exitDate: date });
        onSaved(r); showToast(`Closed ${initialStock!.stock}`, "success");
      }
      onClose();
    } catch { showToast("Save failed", "error"); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{mode === "buy" ? "Buy Stock" : `Close ${initialStock?.stock ?? ""}`}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {mode === "buy" && <TextField label="Stock (e.g. RELIANCE.NS)" size="small" value={stock} onChange={e => setStock(e.target.value)} fullWidth />}
          <TextField label={mode === "buy" ? "Entry date" : "Exit date"} type="date" size="small" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label={mode === "buy" ? "Entry price" : "Exit price"} type="number" size="small" value={price} onChange={e => setPrice(e.target.value)} fullWidth />
          {mode === "buy" && <TextField label="Quantity" type="number" size="small" value={qty} onChange={e => setQty(e.target.value)} fullWidth />}
          {mode === "buy" && <TextField label="Notes" size="small" value={notes} onChange={e => setNotes(e.target.value)} fullWidth />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || (mode === "buy" && !stock)}>{saving ? "Saving…" : "Save"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Alert settings dialog (per-market Slack schedule) ────────────────
function AlertSettingsDialog({ open, onClose, initialMarket = "in" }: { open: boolean; onClose: () => void; initialMarket?: StockMarket }) {
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [rows, setRows] = useState<StockAlertConfig[] | null>(null);
  const [sel, setSel] = useState<StockMarket>(initialMarket);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(initialMarket);
    setRows(null);
    getStockAlerts().then(setRows).catch(() => setRows([]));
  }, [open, initialMarket]);

  const cfg = rows?.find(r => r.market === sel) ?? null;

  // Auto-save any field change (patch locally for instant feedback, then persist → EventBridge).
  const apply = async (partial: Partial<StockAlertConfig>) => {
    if (!cfg) return;
    const merged = { ...cfg, ...partial };
    setRows(rs => rs?.map(r => r.market === sel ? merged : r) ?? rs);
    setSaving(true);
    try {
      setRows(await updateStockAlert({ market: merged.market, enabled: merged.enabled, hour: merged.hour, minute: merged.minute, timezone: merged.timezone, weekdaysOnly: merged.weekdaysOnly }));
    } catch { showToast("Couldn't save alert", "error"); } finally { setSaving(false); }
  };

  const fmtTime = (h: number, m: number) => new Date(2020, 0, 1, h, m).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const tzShort = (tz: string) => tz === "America/New_York" ? "ET" : tz === "UTC" ? "UTC" : "IST";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1.5 }}>
        <NotificationsRoundedIcon sx={{ color: colors.brand }} />
        <Typography component="span" sx={{ fontWeight: 800, fontSize: "1.15rem" }}>Slack Alert Settings</Typography>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12, color: colors.gray400 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: colors.gray50 }}>
        {rows == null || !cfg ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress /></Box> : (
          <>
            {/* market switch */}
            <ToggleButtonGroup exclusive size="small" value={sel} onChange={(_, v) => v && setSel(v)} fullWidth
              sx={{ mb: 2, bgcolor: colors.gray100, borderRadius: 2.5, p: "3px", gap: "2px",
                "& .MuiToggleButtonGroup-grouped": { border: "none !important", borderRadius: "10px !important", textTransform: "none", fontWeight: 600, py: 0.6 },
                "& .Mui-selected": { bgcolor: `${colors.white} !important`, boxShadow: 1, color: `${colors.gray900} !important` } }}>
              <ToggleButton value="in">🇮🇳 India</ToggleButton>
              <ToggleButton value="us">🇺🇸 US</ToggleButton>
            </ToggleButtonGroup>

            <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
              {/* header row: status summary + enable */}
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: cfg.enabled ? 2 : 0 }}>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>Daily digest</Typography>
                  <Typography sx={{ fontSize: "0.8rem", color: colors.gray500 }}>
                    {cfg.enabled ? `Posts at ${fmtTime(cfg.hour, cfg.minute)} ${tzShort(cfg.timezone)}${cfg.weekdaysOnly ? " · weekdays" : " · every day"}` : "Alerts are off"}
                  </Typography>
                </Box>
                <FormControlLabel labelPlacement="start" sx={{ mr: 0 }}
                  control={<Switch checked={cfg.enabled} onChange={e => apply({ enabled: e.target.checked })} />}
                  label={<Typography sx={{ fontSize: "0.8rem", color: colors.gray500 }}>{cfg.enabled ? "On" : "Off"}</Typography>} />
              </Stack>

              {cfg.enabled && (
                <>
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <TextField label="Time" type="time" size="small"
                      value={`${String(cfg.hour).padStart(2, "0")}:${String(cfg.minute).padStart(2, "0")}`}
                      onChange={e => { const [h, m] = e.target.value.split(":").map(Number); apply({ hour: h || 0, minute: m || 0 }); }}
                      InputLabelProps={{ shrink: true }} sx={{ width: 140, "& .MuiOutlinedInput-root": { borderRadius: 2 } }} />
                    <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
                      <Select value={cfg.timezone} onChange={e => apply({ timezone: e.target.value })} sx={{ borderRadius: 2 }}>
                        <MenuItem value="Asia/Kolkata">India (IST)</MenuItem>
                        <MenuItem value="America/New_York">US Eastern (ET)</MenuItem>
                        <MenuItem value="UTC">UTC</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                  <FormControlLabel sx={{ mt: 1 }}
                    control={<Switch size="small" checked={cfg.weekdaysOnly} onChange={e => apply({ weekdaysOnly: e.target.checked })} />}
                    label={<Typography sx={{ fontSize: "0.82rem" }}>Weekdays only</Typography>} />

                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1.5, flexWrap: "wrap" }}>
                    {cfg.lastSentDate && <Chip label={`last sent ${cfg.lastSentDate}`} size="small" sx={{ height: 20, fontSize: "0.62rem", bgcolor: alpha(colors.success, 0.12), color: colors.success }} />}
                    {cfg.awsCron && <>
                      <Typography sx={{ fontSize: "0.62rem", color: colors.gray400 }}>AWS:</Typography>
                      <Box component="code" sx={{ fontSize: "0.64rem", fontFamily: "monospace", bgcolor: colors.gray100, color: colors.gray600, px: 0.75, py: 0.25, borderRadius: 1 }}>{cfg.awsCron}</Box>
                    </>}
                    {saving && <CircularProgress size={13} sx={{ ml: 0.5 }} />}
                  </Stack>
                </>
              )}
            </Paper>

            {/* Open Slack channel — only for the selected market */}
            <Button fullWidth variant="contained" disableElevation
              href={SLACK_CHANNELS[sel]} target="_blank" rel="noopener"
              endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />}
              sx={{ mt: 2, py: 1.1, borderRadius: 2.5, textTransform: "none", fontWeight: 700,
                bgcolor: "#4A154B", "&:hover": { bgcolor: "#611f5f" } }}>
              Open {sel === "us" ? "US" : "India"} Slack channel
            </Button>
            <Typography sx={{ fontSize: "0.72rem", color: colors.gray400, mt: 1.5, textAlign: "center" }}>
              A daily BUY/SELL digest is posted here. SELL alerts are limited to stocks you own.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
    </Dialog>
  );
}

// ── main page ────────────────────────────────────────────────────────
type TabKey = "buy" | "sell" | "hold" | "portfolio" | "closed" | "history";

function Stocks() {
  const { colors } = useTokens();
  const { showToast } = useToast();
  const [market, setMarket] = useState<StockMarket>("in");
  const [tab, setTab] = useState<TabKey>("buy");
  const [filter, setFilter] = useState("");
  const currency = market === "us" ? "USD" : "INR";

  const [signals, setSignals] = useState<StockSignalsResponse | null>(null);
  const [portfolio, setPortfolio] = useState<StockPortfolioResponse | null>(null);
  const [closed, setClosed] = useState<StockTrade[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stockDetail, setStockDetail] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [closePos, setClosePos] = useState<ValuedPosition | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([getStockSignals(market), getStockPortfolio(market), getStockClosed(market)])
      .then(([s, p, c]) => { setSignals(s); setPortfolio(p); setClosed(c.trades); })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load")).finally(() => setLoading(false));
  }, [market]);
  useEffect(load, [load]);

  const all = signals?.signals ?? [];
  const q = filter.trim().toLowerCase();
  const matchQ = (s: string, sector: string, strat: string) => !q || s.toLowerCase().includes(q) || sector.toLowerCase().includes(q) || (strat || "").toLowerCase().includes(q);

  const buys = all.filter(r => r.signal.type === "BUY" && r.signal.actionableTomorrow);
  const sells = all.filter(r => r.signal.type === "SELL" && r.signal.actionableTomorrow);
  const holds = all.filter(r => r.signal.type === "HOLD");
  const filledToday = all.filter(r => (r.signal.type === "BUY" || r.signal.type === "SELL") && !r.signal.actionableTomorrow).length;
  const positions = portfolio?.positions ?? [];
  const openPos = positions.filter(p => p.position.status === "open");
  const closedPos = positions.filter(p => p.position.status === "closed");

  if (loading) return <Box><PageHeader title="Stock Analyzer" /><ListSkeleton rows={8} /></Box>;
  if (error) return <Box><PageHeader title="Stock Analyzer" /><ErrorState message={error} onRetry={load} /></Box>;

  const headerActions = (
    <Stack direction="row" spacing={1} alignItems="center">
      <ToggleButtonGroup size="small" exclusive value={market} onChange={(_, v) => v && setMarket(v)}>
        <ToggleButton value="in">🇮🇳 India</ToggleButton><ToggleButton value="us">🇺🇸 US</ToggleButton>
      </ToggleButtonGroup>
      <Tooltip title="Slack alert settings">
        <IconButton onClick={() => setAlertsOpen(true)} sx={{ border: `1px solid ${colors.gray200}`, borderRadius: 2 }}>
          <NotificationsRoundedIcon sx={{ fontSize: 20, color: colors.gray600 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  return (
    <Box>
      <PageHeader title="Stock Analyzer" action={headerActions} />

      {/* 4 status cards with accent stripe */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap">
        <StatCard label="Buy" value={buys.length} sub="execute at next open" color={colors.success} accent={colors.success} />
        <StatCard label="Sell" value={sells.length} sub="exit at next open" color={colors.error} accent={colors.error} />
        <StatCard label="Hold" value={holds.length} sub="in position" color={colors.warning} accent={colors.warning} />
        <StatCard label="Filled Today" value={filledToday} sub="already executed" accent={colors.gray300} />
      </Stack>

      {/* toolbar: tabs + filter + buy — in one bordered strip */}
      <Paper variant="outlined" sx={{ borderRadius: 2.5, px: 1.5, mb: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{
            flex: 1, minHeight: 52,
            "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: "0.85rem", minHeight: 52, color: colors.gray500, px: 1.75 },
            "& .Mui-selected": { fontWeight: 700 },
            "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0" },
          }}>
          <Tab value="buy" label={`Buy (${buys.length})`} />
          <Tab value="sell" label={`Sell (${sells.length})`} />
          <Tab value="hold" label={`Hold (${holds.length})`} />
          <Tab value="portfolio" label={`My Portfolio (${openPos.length})`} />
          <Tab value="closed" label={`Closed (${closed?.length ?? 0})`} />
          <Tab value="history" label={`Trade History (${closedPos.length})`} />
        </Tabs>
        <TextField size="small" placeholder="Filter stock, sector, strategy…" value={filter} onChange={e => setFilter(e.target.value)}
          sx={{ minWidth: 240, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: colors.gray400 }} /></InputAdornment> }} />
        {tab === "portfolio" && <Button variant="contained" disableElevation startIcon={<AddRoundedIcon />} onClick={() => setBuyOpen(true)} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, whiteSpace: "nowrap" }}>Buy Stock</Button>}
      </Paper>

      {/* ── BUY tab ── */}
      {tab === "buy" && (
        buys.length === 0
          ? <EmptyState icon={<ShowChartRoundedIcon />} title="No actionable BUY signals" description="No new entries to execute at next open." />
          : <SignalStatsTable rows={buys.filter(r => matchQ(r.signal.stock, r.signal.sector, r.signal.strategy))} market={market} currency={currency} onStock={setStockDetail} onAdd={(r) => { setStockDetail(null); addFromSignal(r); }} />
      )}

      {/* ── SELL tab ── */}
      {tab === "sell" && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Stock</TableCell><TableCell>Sector</TableCell><TableCell align="right">Price</TableCell><TableCell>Strategy</TableCell><TableCell>Comment</TableCell></TableRow></TableHead>
            <TableBody>
              {sells.filter(r => matchQ(r.signal.stock, r.signal.sector, r.signal.strategy)).map(r => (
                <TableRow key={r.signal.stock} hover>
                  <TableCell><ClickableStock stock={r.signal.stock} market={market} onOpen={setStockDetail} /></TableCell>
                  <TableCell sx={{ color: colors.gray500 }}>{prettySector(r.signal.sector)}</TableCell>
                  <TableCell align="right">{formatCurrency(r.signal.price, currency)}</TableCell>
                  <TableCell sx={{ color: colors.brand, fontSize: "0.8rem" }}>{r.signal.strategy}</TableCell>
                  <TableCell sx={{ color: colors.gray500, fontSize: "0.8rem" }}>{r.signal.comment}</TableCell>
                </TableRow>
              ))}
              {sells.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ color: colors.gray500, py: 3 }}>No actionable SELL signals.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── HOLD tab ── */}
      {tab === "hold" && <HoldTab rows={holds.filter(r => matchQ(r.signal.stock, r.signal.sector, r.signal.strategy))} market={market} currency={currency} onStock={setStockDetail} />}

      {/* ── MY PORTFOLIO tab ── */}
      {tab === "portfolio" && <PortfolioTab data={portfolio} market={market} currency={currency} onStock={setStockDetail} onClose={setClosePos}
        onDelete={async (id) => { try { setPortfolio(await deleteStockPosition(id)); } catch { showToast("Delete failed", "error"); } }} />}

      {/* ── CLOSED tab ── */}
      {tab === "closed" && <ClosedTab trades={(closed ?? []).filter(t => matchQ(t.stock, t.sector, t.strategy))} allTrades={closed ?? []} market={market} currency={currency} onStock={setStockDetail} />}

      {/* ── TRADE HISTORY tab ── */}
      {tab === "history" && <HistoryTab positions={closedPos} market={market} currency={currency} onStock={setStockDetail} />}

      <AlertSettingsDialog open={alertsOpen} onClose={() => setAlertsOpen(false)} initialMarket={market} />
      <StockDetailDialog market={market} stock={stockDetail} onClose={() => setStockDetail(null)} />
      <PositionDialog open={buyOpen} mode="buy" market={market} onClose={() => setBuyOpen(false)} onSaved={setPortfolio} />
      <PositionDialog open={!!closePos} mode="close" market={market}
        initialStock={closePos ? { stock: closePos.position.stock, id: closePos.position.id, price: closePos.currentPrice ?? undefined } : undefined}
        onClose={() => setClosePos(null)} onSaved={setPortfolio} />
    </Box>
  );

  function addFromSignal(r: EnrichedStockSignal) {
    addStockPosition({ market, stock: r.signal.stock, sector: r.signal.sector, strategy: r.signal.strategy, entryPrice: r.signal.price, entryDate: new Date().toISOString().slice(0, 10) })
      .then(setPortfolio).then(() => showToast(`Added ${r.signal.stock}`, "success")).catch(() => showToast("Add failed", "error"));
  }
}

// ── Signals-with-stats table (BUY) ───────────────────────────────────
function SignalStatsTable({ rows, market, currency, onStock, onAdd }:
  { rows: EnrichedStockSignal[]; market: StockMarket; currency: string; onStock: (s: string) => void; onAdd: (r: EnrichedStockSignal) => void }) {
  const { colors } = useTokens();
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead><TableRow>
          <TableCell padding="checkbox" /><TableCell>Stock</TableCell><TableCell>Sector</TableCell>
          <TableCell align="right">Price</TableCell><TableCell align="right">SL</TableCell><TableCell align="right">TP</TableCell>
          <TableCell align="right">WR%</TableCell><TableCell align="right">PF</TableCell><TableCell align="right">CAGR</TableCell>
          <TableCell align="right">Avg P&L</TableCell><TableCell align="right">Avg MaxDD</TableCell><TableCell align="right">Avg Run-Up</TableCell>
          <TableCell align="right">Avg Hold</TableCell><TableCell>Strategy</TableCell><TableCell>Comment</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.signal.stock} hover>
              <TableCell padding="checkbox"><Tooltip title="Add to My Portfolio"><IconButton size="small" onClick={() => onAdd(r)}><AddRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip></TableCell>
              <TableCell><ClickableStock stock={r.signal.stock} market={market} onOpen={onStock} /></TableCell>
              <TableCell sx={{ color: colors.gray500 }}>{prettySector(r.signal.sector)}</TableCell>
              <TableCell align="right">{formatCurrency(r.signal.price, currency)}</TableCell>
              <TableCell align="right">{r.signal.stopLoss != null ? formatCurrency(r.signal.stopLoss, currency) : "—"}</TableCell>
              <TableCell align="right">{r.signal.takeProfit != null ? formatCurrency(r.signal.takeProfit, currency) : "—"}</TableCell>
              <TableCell align="right">{r.btWr == null ? "—" : `${r.btWr.toFixed(0)}%`}</TableCell>
              <TableCell align="right">{r.btPf == null ? "—" : (r.btPf > 100 ? "∞" : r.btPf.toFixed(1))}</TableCell>
              <TableCell align="right">{r.btCagr == null ? "—" : `${r.btCagr.toFixed(1)}%`}</TableCell>
              <TableCell align="right" sx={{ color: c2(r.btAvgPnl, colors) }}>{pct(r.btAvgPnl)}</TableCell>
              <TableCell align="right" sx={{ color: colors.error }}>{pct(r.btAvgMae)}</TableCell>
              <TableCell align="right" sx={{ color: colors.success }}>{pct(r.btAvgMfe)}</TableCell>
              <TableCell align="right">{r.btAvgHoldDays == null ? "—" : `${Math.round(r.btAvgHoldDays)}d`}</TableCell>
              <TableCell sx={{ color: colors.brand, fontSize: "0.75rem" }}>{r.signal.strategy}</TableCell>
              <TableCell sx={{ color: colors.gray500, fontSize: "0.75rem" }}>{r.signal.comment}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
function c2(v: number | null, colors: ReturnType<typeof useTokens>["colors"]) { return v == null ? colors.gray500 : v >= 0 ? colors.success : colors.error; }

// ── HOLD tab (₹1L/stock hypothetical positions) ──────────────────────
function HoldTab({ rows, market, currency, onStock }: { rows: EnrichedStockSignal[]; market: StockMarket; currency: string; onStock: (s: string) => void }) {
  const { colors } = useTokens();
  const computed = rows.map(r => {
    const s = r.signal;
    const entry = s.entryPrice ?? s.price;
    const qty = entry ? LAKH / entry : 0;
    const value = qty * s.price;
    const pnlPct = entry ? (s.price - entry) / entry * 100 : 0;
    const pnlAbs = value - LAKH;
    const dayAbs = s.dayChangePct != null ? value * s.dayChangePct / 100 : null;
    return { r, entry, value, pnlPct, pnlAbs, dayPct: s.dayChangePct, dayAbs };
  });
  const totPnl = computed.reduce((a, x) => a + x.pnlAbs, 0);
  const totInv = computed.length * LAKH;
  const totVal = computed.reduce((a, x) => a + x.value, 0);
  const todayPnl = computed.reduce((a, x) => a + (x.dayAbs ?? 0), 0);
  const winning = computed.filter(x => x.pnlAbs > 0).length;

  return (
    <>
      <StatBar items={[
        { label: "Total P&L (₹1L/stock)", value: formatCurrency(totPnl, currency), sub: pct(totInv ? totPnl / totInv * 100 : 0, 2), color: totPnl >= 0 ? colors.success : colors.error, primary: true },
        { label: "Today's P&L", value: formatCurrency(todayPnl, currency), color: todayPnl >= 0 ? colors.success : colors.error },
        { label: "Stocks", value: computed.length },
        { label: "Winning", value: winning, color: colors.success },
        { label: "Losing", value: computed.length - winning, color: colors.error },
        { label: "Invested", value: formatCurrency(totInv, currency) },
        { label: "Current Value", value: formatCurrency(totVal, currency) },
      ]} />
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Stock</TableCell><TableCell>Sector</TableCell><TableCell>Entry Date</TableCell><TableCell align="right">Entry</TableCell>
            <TableCell align="right">CMP</TableCell><TableCell align="right">Value (₹1L)</TableCell><TableCell align="right">P&L %</TableCell>
            <TableCell align="right">P&L ₹</TableCell><TableCell align="right">1D %</TableCell><TableCell align="right">SL</TableCell><TableCell align="right">TP</TableCell><TableCell>Strategy</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {computed.map(({ r, entry, value, pnlPct, pnlAbs, dayPct }) => (
              <TableRow key={r.signal.stock} hover>
                <TableCell><ClickableStock stock={r.signal.stock} market={market} onOpen={onStock} /></TableCell>
                <TableCell sx={{ color: colors.gray500 }}>{prettySector(r.signal.sector)}</TableCell>
                <TableCell>{r.signal.entryDate ?? "—"}</TableCell>
                <TableCell align="right">{formatCurrency(entry, currency)}</TableCell>
                <TableCell align="right">{formatCurrency(r.signal.price, currency)}</TableCell>
                <TableCell align="right">{formatCurrency(value, currency)}</TableCell>
                <TableCell align="right" sx={{ color: pnlPct >= 0 ? colors.success : colors.error, fontWeight: 600 }}>{pct(pnlPct)}</TableCell>
                <TableCell align="right" sx={{ color: pnlAbs >= 0 ? colors.success : colors.error }}>{formatCurrency(pnlAbs, currency)}</TableCell>
                <TableCell align="right" sx={{ color: (dayPct ?? 0) >= 0 ? colors.success : colors.error }}>{pct(dayPct)}</TableCell>
                <TableCell align="right">{r.signal.stopLoss != null ? formatCurrency(r.signal.stopLoss, currency) : "—"}</TableCell>
                <TableCell align="right">{r.signal.takeProfit != null ? formatCurrency(r.signal.takeProfit, currency) : "—"}</TableCell>
                <TableCell sx={{ color: colors.brand, fontSize: "0.72rem" }}>{r.signal.strategy}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

// ── MY PORTFOLIO tab ─────────────────────────────────────────────────
function PortfolioTab({ data, market, currency, onStock, onClose, onDelete }:
  { data: StockPortfolioResponse | null; market: StockMarket; currency: string; onStock: (s: string) => void; onClose: (p: ValuedPosition) => void; onDelete: (id: string) => void }) {
  const { colors } = useTokens();
  if (!data || data.positions.filter(p => p.position.status === "open").length === 0)
    return <EmptyState icon={<ShowChartRoundedIcon />} title="No open positions" description="Use Buy Stock, or add from the Signals tab." />;
  const s = data.summary;
  const open = data.positions.filter(p => p.position.status === "open");

  // sector allocation
  const bySector = new Map<string, { inv: number; cur: number; n: number }>();
  for (const v of open) {
    const sec = v.position.sector || "—";
    const e = bySector.get(sec) ?? { inv: 0, cur: 0, n: 0 };
    e.inv += v.invested ?? 0; e.cur += v.currentValue ?? 0; e.n += 1; bySector.set(sec, e);
  }
  const sectorRows = [...bySector.entries()].map(([sec, e]) => ({ sec, ...e, pnlPct: e.inv ? (e.cur - e.inv) / e.inv * 100 : 0 }));
  const donut = sectorRows.map((r, i) => ({ name: prettySector(r.sec), value: r.inv, fill: DONUT_COLORS[i % DONUT_COLORS.length] }));
  const perStock = open.map(v => ({ name: v.position.stock.replace(".NS", ""), pnl: v.unrealizedPct ?? 0 })).sort((a, b) => b.pnl - a.pnl);

  return (
    <>
      <StatBar items={[
        { label: "Total P&L", value: formatCurrency(s.unrealized, currency), sub: pct(s.unrealizedPct, 2), color: s.unrealized >= 0 ? colors.success : colors.error, primary: true },
        { label: "Today's P&L", value: formatCurrency(s.todaysPnl, currency), sub: pct(s.todaysPnlPct, 2), color: s.todaysPnl >= 0 ? colors.success : colors.error },
        { label: "Positions", value: s.open },
        { label: "Invested", value: formatCurrency(s.invested, currency) },
        { label: "Current Value", value: formatCurrency(s.currentValue, currency) },
        { label: "Realized", value: formatCurrency(s.realized, currency), color: s.realized >= 0 ? colors.success : colors.error },
      ]} />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Sector Allocation</Typography>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box sx={{ position: "relative", width: 150, height: 150 }}>
                <ResponsiveContainer width={150} height={150}>
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={46} outerRadius={68} paddingAngle={2} stroke={colors.white} strokeWidth={2}
                      isAnimationActive animationDuration={600}>
                      {donut.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <RTooltip content={<ChartTooltip valueLabel="Invested" fmt={(v) => formatCurrency(v, currency)} />} />
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                  <Typography sx={{ fontSize: "0.62rem", color: colors.gray400 }}>Invested</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: "0.85rem" }}>{compactNum(s.invested)}</Typography>
                </Box>
              </Box>
              <Box sx={{ flex: 1 }}>
                {sectorRows.map((r, i) => (
                  <Stack key={r.sec} direction="row" justifyContent="space-between" alignItems="center" sx={{ fontSize: "0.75rem", py: 0.35 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                      <Box sx={{ width: 9, height: 9, borderRadius: "3px", bgcolor: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                      <Typography noWrap sx={{ fontSize: "0.75rem", color: colors.gray700 }}>{prettySector(r.sec)}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: r.pnlPct >= 0 ? colors.success : colors.error, flexShrink: 0, ml: 1 }}>{pct(r.pnlPct, 1)}</Typography>
                  </Stack>
                ))}
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Per-Stock P&L %</Typography>
            <ResponsiveContainer width="100%" height={Math.max(140, perStock.length * 34)}>
              <BarChart data={perStock} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }} barCategoryGap="24%">
                <CartesianGrid horizontal={false} stroke={colors.gray100} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: colors.gray400, fontFamily: CHART_FONT }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={92} tick={{ fontSize: 11, fill: colors.gray600, fontFamily: CHART_FONT }} />
                <RTooltip cursor={{ fill: alpha(colors.gray300, 0.15) }} content={<ChartTooltip valueLabel="P&L" fmt={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`} />} />
                <Bar dataKey="pnl" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={600}>
                  {perStock.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? colors.success : colors.error} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Stock</TableCell><TableCell>Sector</TableCell><TableCell>Entry Date</TableCell><TableCell align="right">Days</TableCell>
            <TableCell align="right">Qty</TableCell><TableCell align="right">Entry</TableCell><TableCell align="right">CMP</TableCell>
            <TableCell align="right">Invested</TableCell><TableCell align="right">Current</TableCell><TableCell align="right">P&L %</TableCell>
            <TableCell align="right">P&L ₹</TableCell><TableCell align="right">1D %</TableCell><TableCell align="right" />
          </TableRow></TableHead>
          <TableBody>
            {open.map(v => {
              const p = v.position;
              const pnl = v.currentValue != null && v.invested != null ? v.currentValue - v.invested : null;
              return (
                <TableRow key={p.id} hover>
                  <TableCell><ClickableStock stock={p.stock} market={market} onOpen={onStock} /></TableCell>
                  <TableCell sx={{ color: colors.gray500 }}>{prettySector(p.sector || "")}</TableCell>
                  <TableCell>{p.entryDate ?? "—"}</TableCell>
                  <TableCell align="right">{daysBetween(p.entryDate, null) ?? "—"}</TableCell>
                  <TableCell align="right">{p.quantity ?? "—"}</TableCell>
                  <TableCell align="right">{p.entryPrice != null ? formatCurrency(p.entryPrice, currency) : "—"}</TableCell>
                  <TableCell align="right">{v.currentPrice != null ? formatCurrency(v.currentPrice, currency) : "—"}</TableCell>
                  <TableCell align="right">{v.invested != null ? formatCurrency(v.invested, currency) : "—"}</TableCell>
                  <TableCell align="right">{v.currentValue != null ? formatCurrency(v.currentValue, currency) : "—"}</TableCell>
                  <TableCell align="right" sx={{ color: (v.unrealizedPct ?? 0) >= 0 ? colors.success : colors.error, fontWeight: 600 }}>{pct(v.unrealizedPct)}</TableCell>
                  <TableCell align="right" sx={{ color: (pnl ?? 0) >= 0 ? colors.success : colors.error }}>{pnl != null ? formatCurrency(pnl, currency) : "—"}</TableCell>
                  <TableCell align="right" sx={{ color: (v.dayChangePct ?? 0) >= 0 ? colors.success : colors.error }}>{pct(v.dayChangePct)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => onClose(v)}>Sell</Button>
                    <IconButton size="small" onClick={() => onDelete(p.id)}><DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

// ── collapsible panel ────────────────────────────────────────────────
function Panel({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
  const { colors } = useTokens();
  const [open, setOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={{ mb: 1 }}>
      <Box onClick={() => setOpen(o => !o)} sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1.25, cursor: "pointer" }}>
        <Box component="span" sx={{ transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", color: colors.gray500, fontSize: "0.8rem" }}>▶</Box>
        <Typography sx={{ fontWeight: 700, flex: 1 }}>{title}</Typography>
        {badge != null && <Chip label={badge} size="small" sx={{ height: 20 }} />}
      </Box>
      <Collapse in={open} unmountOnExit><Box sx={{ px: 2, pb: 2, overflowX: "auto" }}>{children}</Box></Collapse>
    </Paper>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Sortable header cell.
function SortTh({ id, label, align, sort, onSort }:
  { id: string; label: string; align?: "left" | "right"; sort: { key: string; dir: "asc" | "desc" }; onSort: (k: string) => void }) {
  return (
    <TableCell align={align} sortDirection={sort.key === id ? sort.dir : false}>
      <TableSortLabel active={sort.key === id} direction={sort.key === id ? sort.dir : "asc"} onClick={() => onSort(id)}>{label}</TableSortLabel>
    </TableCell>
  );
}

// ── CLOSED tab (backtest closed trades) ──────────────────────────────
function ClosedTab({ trades, market, currency, onStock }: { trades: StockTrade[]; allTrades: StockTrade[]; market: StockMarket; currency: string; onStock: (s: string) => void }) {
  const { colors } = useTokens();
  const [sector, setSector] = useState(""); const [year, setYear] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "exitDate", dir: "desc" });
  const sectors = useMemo(() => [...new Set(trades.map(t => t.sector))].sort(), [trades]);
  const years = useMemo(() => [...new Set(trades.map(t => (t.exitDate || "").slice(0, 4)).filter(Boolean))].sort().reverse(), [trades]);
  const rows = useMemo(() => trades.filter(t => (!sector || t.sector === sector) && (!year || (t.exitDate || "").startsWith(year))), [trades, sector, year]);

  const agg = useMemo(() => {
    let wins = 0, losers = 0, sumPnl = 0, sumWin = 0, sumLoss = 0, best = -Infinity, worst = Infinity, gp = 0, gl = 0, days = 0, dN = 0, mae = 0, mN = 0;
    for (const t of rows) {
      const p = t.pnlPct ?? 0;
      sumPnl += p; if (p > 0) { wins++; sumWin += p; } else { losers++; sumLoss += p; }
      best = Math.max(best, p); worst = Math.min(worst, p);
      if ((t.pnl ?? 0) > 0) gp += t.pnl!; else gl += Math.abs(t.pnl ?? 0);
      const d = daysBetween(t.entryDate, t.exitDate); if (d != null) { days += d; dN++; }
      if (t.maePct != null) { mae += t.maePct; mN++; }
    }
    const n = rows.length;
    return { n, wins, losers, winRate: n ? wins / n * 100 : 0, avgPnl: n ? sumPnl / n : 0, best: n ? best : 0, worst: n ? worst : 0,
      avgWin: wins ? sumWin / wins : 0, avgLoss: losers ? sumLoss / losers : 0, pf: gl ? gp / gl : (gp > 0 ? Infinity : 0),
      avgDays: dN ? days / dN : 0, avgMae: mN ? mae / mN : 0 };
  }, [rows]);

  const cumulative = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (a.exitDate || "").localeCompare(b.exitDate || ""));
    let cum = 0; const out: { date: string; equity: number }[] = [];
    for (const t of sorted) { cum += t.pnlPct ?? 0; out.push({ date: t.exitDate || "", equity: Math.round(cum * 100) / 100 }); }
    const step = Math.max(1, Math.floor(out.length / 400));
    return out.filter((_, i) => i % step === 0 || i === out.length - 1);
  }, [rows]);

  // ── breakdowns (year, sector, holding, monthly heatmap, calendar) ──
  const bd = useMemo(() => {
    const byYear: Record<string, { n: number; w: number; sum: number }> = {};
    const bySec: Record<string, { n: number; w: number; sum: number }> = {};
    const byMonth: Record<string, { n: number; sum: number }> = {};
    const byDate: Record<string, { n: number; sum: number }> = {};
    const hold = { short: { n: 0, w: 0, sum: 0 }, medium: { n: 0, w: 0, sum: 0 }, long: { n: 0, w: 0, sum: 0 } };
    for (const t of rows) {
      const p = t.pnlPct ?? 0;
      const d = daysBetween(t.entryDate, t.exitDate);
      if (d != null && d >= 0) { const b = d < 30 ? hold.short : d <= 90 ? hold.medium : hold.long; b.n++; b.sum += p; if (p > 0) b.w++; }
      const yr = (t.exitDate || "").slice(0, 4);
      if (yr.length === 4) { (byYear[yr] ??= { n: 0, w: 0, sum: 0 }); byYear[yr].n++; byYear[yr].sum += p; if (p > 0) byYear[yr].w++; }
      if (t.sector) { (bySec[t.sector] ??= { n: 0, w: 0, sum: 0 }); bySec[t.sector].n++; bySec[t.sector].sum += p; if (p > 0) bySec[t.sector].w++; }
      const ym = (t.exitDate || "").slice(0, 7);
      if (ym.length === 7) { (byMonth[ym] ??= { n: 0, sum: 0 }); byMonth[ym].n++; byMonth[ym].sum += p; }
      if (t.exitDate) { (byDate[t.exitDate] ??= { n: 0, sum: 0 }); byDate[t.exitDate].n++; byDate[t.exitDate].sum += p; }
    }
    const yearRows = Object.keys(byYear).sort().reverse().map(y => ({ year: y, trades: byYear[y].n, wins: byYear[y].w, losses: byYear[y].n - byYear[y].w, winRate: byYear[y].w / byYear[y].n * 100, avgPnl: byYear[y].sum / byYear[y].n }));
    const sectorRows = Object.keys(bySec).map(s => ({ sector: s, trades: bySec[s].n, wins: bySec[s].w, losses: bySec[s].n - bySec[s].w, winRate: bySec[s].w / bySec[s].n * 100, avgPnl: bySec[s].sum / bySec[s].n })).sort((a, b) => b.avgPnl - a.avgPnl);
    const holdingRows = [
      { label: "Short (<30d)", ...hold.short }, { label: "Medium (30–90d)", ...hold.medium }, { label: "Long (>90d)", ...hold.long },
    ].filter(h => h.n > 0).map(h => ({ label: h.label, trades: h.n, wins: h.w, losses: h.n - h.w, winRate: h.n ? h.w / h.n * 100 : 0, avgPnl: h.n ? h.sum / h.n : 0 }));
    const hmYears = [...new Set(Object.keys(byMonth).map(k => k.slice(0, 4)))].sort();
    const heatmap = hmYears.map(yr => ({ year: yr, months: MONTHS.map((_, mi) => { const c = byMonth[`${yr}-${String(mi + 1).padStart(2, "0")}`]; return c ? { avg: c.sum / c.n, count: c.n } : null; }) }));
    const calYears = [...new Set(Object.keys(byDate).map(d => d.slice(0, 4)))].sort().reverse();
    return { yearRows, sectorRows, holdingRows, heatmap, byDate, calYears };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const val = (t: StockTrade, k: string): number | string => {
      switch (k) {
        case "stock": return t.stock; case "sector": return t.sector; case "entryDate": return t.entryDate || ""; case "exitDate": return t.exitDate || "";
        case "comment": return t.comment || "";
        case "entryPrice": return t.entryPrice ?? -Infinity; case "exitPrice": return t.exitPrice ?? -Infinity;
        case "pnlPct": return t.pnlPct ?? -Infinity; case "maePct": return t.maePct ?? -Infinity; case "mfePct": return t.mfePct ?? -Infinity;
        case "days": return daysBetween(t.entryDate, t.exitDate) ?? -Infinity; default: return "";
      }
    };
    const arr = [...rows];
    arr.sort((a, b) => { const va = val(a, sort.key), vb = val(b, sort.key); if (va < vb) return sort.dir === "asc" ? -1 : 1; if (va > vb) return sort.dir === "asc" ? 1 : -1; return 0; });
    return arr;
  }, [rows, sort]);
  const onSort = (k: string) => setSort(p => p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" });

  const kpi = (l: string, v: string, col?: string) => <StatCard center label={l} value={v} color={col} />;
  const heatColor = (avg: number) => avg >= 0 ? alpha(colors.success, Math.min(0.85, 0.15 + Math.abs(avg) / 60)) : alpha(colors.error, Math.min(0.85, 0.15 + Math.abs(avg) / 60));

  const breakdownTable = (headLabel: string, rowsBd: { label: string; trades: number; wins: number; losses: number; winRate: number; avgPnl: number }[]) => (
    <Table size="small">
      <TableHead><TableRow><TableCell>{headLabel}</TableCell><TableCell align="right">Trades</TableCell><TableCell align="right">Wins</TableCell><TableCell align="right">Losses</TableCell><TableCell align="right">Win Rate</TableCell><TableCell align="right">Avg P&L</TableCell></TableRow></TableHead>
      <TableBody>{rowsBd.map(r => (
        <TableRow key={r.label} hover>
          <TableCell sx={{ fontWeight: 600 }}>{r.label}</TableCell><TableCell align="right">{r.trades}</TableCell>
          <TableCell align="right" sx={{ color: colors.success }}>{r.wins}</TableCell><TableCell align="right" sx={{ color: colors.error }}>{r.losses}</TableCell>
          <TableCell align="right">{r.winRate.toFixed(1)}%</TableCell>
          <TableCell align="right" sx={{ color: r.avgPnl >= 0 ? colors.success : colors.error, fontWeight: 600 }}>{pct(r.avgPnl)}</TableCell>
        </TableRow>))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 150 }}><Select value={sector} displayEmpty onChange={e => setSector(e.target.value)}><MenuItem value="">All Sectors</MenuItem>{sectors.map(s => <MenuItem key={s} value={s}>{prettySector(s)}</MenuItem>)}</Select></FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}><Select value={year} displayEmpty onChange={e => setYear(e.target.value)}><MenuItem value="">All Years</MenuItem>{years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}</Select></FormControl>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap">
        {kpi("TRADES", String(agg.n))}
        {kpi("WINNERS", String(agg.wins), colors.success)}
        {kpi("LOSERS", String(agg.losers), colors.error)}
        {kpi("WIN RATE", `${agg.winRate.toFixed(1)}%`, colors.success)}
        {kpi("AVG P&L/TRADE", pct(agg.avgPnl), agg.avgPnl >= 0 ? colors.success : colors.error)}
        {kpi("BEST TRADE", pct(agg.best), colors.success)}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        {kpi("WORST TRADE", pct(agg.worst), colors.error)}
        {kpi("AVG WIN", pct(agg.avgWin), colors.success)}
        {kpi("AVG LOSS", pct(agg.avgLoss), colors.error)}
        {kpi("AVG HOLDING", `${Math.round(agg.avgDays)}d`)}
        {kpi("PROFIT FACTOR", agg.pf === Infinity ? "∞" : agg.pf.toFixed(2))}
        {kpi("AVG MAE", pct(agg.avgMae), colors.error)}
      </Stack>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Cumulative P&L %</Typography>
        <EquityArea points={cumulative} color={colors.success} valueLabel="Cumulative P&L" percent />
      </Paper>

      {/* collapsible breakdowns */}
      <Panel title="Monthly P&L Heatmap">
        <Table size="small">
          <TableHead><TableRow><TableCell />{MONTHS.map(m => <TableCell key={m} align="center" sx={{ fontSize: "0.7rem" }}>{m}</TableCell>)}</TableRow></TableHead>
          <TableBody>
            {bd.heatmap.map(row => (
              <TableRow key={row.year}>
                <TableCell sx={{ fontWeight: 700 }}>{row.year}</TableCell>
                {row.months.map((c, i) => (
                  <TableCell key={i} align="center" sx={{ p: 0.5, bgcolor: c ? heatColor(c.avg) : "transparent", fontSize: "0.68rem", fontWeight: 600 }}
                    title={c ? `${MONTHS[i]} ${row.year}: ${pct(c.avg)} (${c.count} trades)` : ""}>
                    {c ? `${c.avg >= 0 ? "+" : ""}${c.avg.toFixed(1)}` : ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      <Panel title="Year Breakdown" badge={bd.yearRows.length}>{breakdownTable("Year", bd.yearRows.map(r => ({ label: r.year, ...r })))}</Panel>
      <Panel title="Sector Breakdown" badge={bd.sectorRows.length}>{breakdownTable("Sector", bd.sectorRows.map(r => ({ label: prettySector(r.sector), ...r })))}</Panel>
      <Panel title="Holding Period Analysis">{breakdownTable("Holding period", bd.holdingRows)}</Panel>
      <Panel title="Trade Calendar">
        {bd.calYears.map(yr => (
          <Box key={yr} sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{yr}</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
              {MONTHS.map((mn, mi) => {
                const firstDay = new Date(Number(yr), mi, 1).getDay();
                const dim = new Date(Number(yr), mi + 1, 0).getDate();
                return (
                  <Box key={mi} sx={{ width: 120 }}>
                    <Typography sx={{ fontSize: "0.65rem", color: colors.gray500, mb: 0.25 }}>{mn}</Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                      {Array.from({ length: firstDay }, (_, i) => <Box key={`e${i}`} sx={{ width: 12, height: 12 }} />)}
                      {Array.from({ length: dim }, (_, i) => {
                        const key = `${yr}-${String(mi + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                        const d = bd.byDate[key];
                        const bg = d ? (d.sum > 0 ? colors.success : d.sum < 0 ? colors.error : colors.gray400) : colors.gray200;
                        return <Box key={i} title={d ? `${key}: ${d.n} trade(s), ${pct(d.sum)}` : key} sx={{ width: 12, height: 12, borderRadius: "2px", bgcolor: alpha(bg, d ? 0.85 : 0.25) }} />;
                      })}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Panel>

      <TableContainer component={Paper} sx={{ maxHeight: 560, mt: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead><TableRow>
            <SortTh id="stock" label="Stock" sort={sort} onSort={onSort} />
            <SortTh id="sector" label="Sector" sort={sort} onSort={onSort} />
            <SortTh id="entryDate" label="Entry" sort={sort} onSort={onSort} />
            <SortTh id="exitDate" label="Exit" sort={sort} onSort={onSort} />
            <SortTh id="entryPrice" label="Entry" align="right" sort={sort} onSort={onSort} />
            <SortTh id="exitPrice" label="Exit" align="right" sort={sort} onSort={onSort} />
            <SortTh id="pnlPct" label="P&L %" align="right" sort={sort} onSort={onSort} />
            <SortTh id="maePct" label="MaxDD %" align="right" sort={sort} onSort={onSort} />
            <SortTh id="mfePct" label="Run-Up %" align="right" sort={sort} onSort={onSort} />
            <SortTh id="days" label="Days" align="right" sort={sort} onSort={onSort} />
            <SortTh id="comment" label="Comment" sort={sort} onSort={onSort} />
          </TableRow></TableHead>
          <TableBody>
            {sortedRows.slice(0, 1000).map((t, i) => (
              <TableRow key={i} hover>
                <TableCell><ClickableStock stock={t.stock} market={market} onOpen={onStock} /></TableCell>
                <TableCell sx={{ color: colors.gray500 }}>{prettySector(t.sector)}</TableCell>
                <TableCell>{t.entryDate}</TableCell><TableCell>{t.exitDate}</TableCell>
                <TableCell align="right">{t.entryPrice != null ? formatCurrency(t.entryPrice, currency) : "—"}</TableCell>
                <TableCell align="right">{t.exitPrice != null ? formatCurrency(t.exitPrice, currency) : "—"}</TableCell>
                <TableCell align="right" sx={{ color: (t.pnlPct ?? 0) >= 0 ? colors.success : colors.error, fontWeight: 600 }}>{pct(t.pnlPct)}</TableCell>
                <TableCell align="right" sx={{ color: colors.error }}>{pct(t.maePct)}</TableCell>
                <TableCell align="right" sx={{ color: colors.success }}>{pct(t.mfePct)}</TableCell>
                <TableCell align="right">{daysBetween(t.entryDate, t.exitDate) ?? "—"}</TableCell>
                <TableCell sx={{ color: colors.gray500, fontSize: "0.72rem" }}>{t.comment}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {sortedRows.length > 1000 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>Showing first 1000 of {sortedRows.length} trades. Use filters to narrow.</Typography>}
    </>
  );
}

// ── TRADE HISTORY tab (my closed positions) ──────────────────────────
function HistoryTab({ positions, market, currency, onStock }: { positions: ValuedPosition[]; market: StockMarket; currency: string; onStock: (s: string) => void }) {
  const { colors } = useTokens();
  if (positions.length === 0) return <EmptyState icon={<ShowChartRoundedIcon />} title="No closed trades" description="Sell a position to see it here." />;
  let realised = 0, wins = 0, sumRet = 0; let best = { s: "", v: -Infinity }, worst = { s: "", v: Infinity };
  for (const v of positions) {
    realised += v.realizedPnl ?? 0; const rp = v.realizedPct ?? 0; sumRet += rp; if (rp > 0) wins++;
    if (rp > best.v) best = { s: v.position.stock.replace(".NS", ""), v: rp };
    if (rp < worst.v) worst = { s: v.position.stock.replace(".NS", ""), v: rp };
  }
  const n = positions.length;
  return (
    <>
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2, textAlign: "center", borderRadius: 2.5,
        background: `linear-gradient(180deg, ${alpha(realised >= 0 ? colors.success : colors.error, 0.08)} 0%, transparent 100%)` }}>
        <Typography sx={{ ...LABEL_SX, color: colors.gray500 }}>Realised P&L</Typography>
        <Typography sx={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1.2, color: realised >= 0 ? colors.success : colors.error }}>{formatCurrency(realised, currency)}</Typography>
      </Paper>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap">
        <StatCard center label="Total Trades" value={n} />
        <StatCard center label="Wins" value={wins} color={colors.success} />
        <StatCard center label="Losses" value={n - wins} color={colors.error} />
        <StatCard center label="Win Rate" value={`${(wins / n * 100).toFixed(1)}%`} />
        <StatCard center label="Avg Return" value={pct(sumRet / n)} color={sumRet >= 0 ? colors.success : colors.error} />
        <StatCard center label={`Best (${best.s})`} value={pct(best.v)} color={colors.success} />
        <StatCard center label={`Worst (${worst.s})`} value={pct(worst.v)} color={colors.error} />
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Stock</TableCell><TableCell>Sector</TableCell><TableCell>Entry</TableCell><TableCell>Exit</TableCell>
            <TableCell align="right">Entry ₹</TableCell><TableCell align="right">Exit ₹</TableCell><TableCell align="right">Qty</TableCell>
            <TableCell align="right">P&L %</TableCell><TableCell align="right">P&L ₹</TableCell><TableCell align="right">Days</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {positions.map(v => {
              const p = v.position;
              return (
                <TableRow key={p.id} hover>
                  <TableCell><ClickableStock stock={p.stock} market={market} onOpen={onStock} /></TableCell>
                  <TableCell sx={{ color: colors.gray500 }}>{prettySector(p.sector || "")}</TableCell>
                  <TableCell>{p.entryDate}</TableCell><TableCell>{p.exitDate}</TableCell>
                  <TableCell align="right">{p.entryPrice != null ? formatCurrency(p.entryPrice, currency) : "—"}</TableCell>
                  <TableCell align="right">{p.exitPrice != null ? formatCurrency(p.exitPrice, currency) : "—"}</TableCell>
                  <TableCell align="right">{p.quantity ?? "—"}</TableCell>
                  <TableCell align="right" sx={{ color: (v.realizedPct ?? 0) >= 0 ? colors.success : colors.error, fontWeight: 600 }}>{pct(v.realizedPct)}</TableCell>
                  <TableCell align="right" sx={{ color: (v.realizedPnl ?? 0) >= 0 ? colors.success : colors.error }}>{v.realizedPnl != null ? formatCurrency(v.realizedPnl, currency) : "—"}</TableCell>
                  <TableCell align="right">{daysBetween(p.entryDate, p.exitDate) ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

export default Stocks;
