import { useEffect, useMemo, useState } from "react";
import { Box, Paper, Typography, Slider, IconButton, ToggleButton, ToggleButtonGroup, Chip, Stack, CircularProgress, Tooltip } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import { ResponsiveContainer, AreaChart, Area, ReferenceLine, XAxis, YAxis } from "recharts";
import { useUser } from "../../context/UserContext";
import { useTokens } from "../../context/ColorModeContext";
import { getTimeline } from "../../api/client";
import type { Timeline } from "../../api/types";
import MoneyTreemap, { type TreemapNode } from "../../components/MoneyTreemap";
import { formatCurrency } from "../../utils/format";
import type { InsightsData } from "../useInsightsData";

/** Milliseconds per timeline step at each speed. */
const SPEEDS = { "1x": 160, "2x": 80, "4x": 40 } as const;
type Speed = keyof typeof SPEEDS;

const gainPct = (value: number, invested: number) => (invested > 0 ? (value - invested) / invested : null);

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Scrub or play through net-worth history: the headline, a sparkline cursor and a money map of
 * every account/holding as of the chosen date. The whole weekly timeline loads once, so scrubbing
 * and playback are purely client-side.
 */
export default function TimeMachineWidget({ data }: { data: InsightsData }) {
  const { dataVersion } = useUser();
  const { colors } = useTokens();
  const allId = data.allWatchlist?.id;
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("1x");

  useEffect(() => {
    if (!allId) return;
    let cancelled = false;
    setLoading(true);
    getTimeline(allId)
      .then(t => { if (!cancelled) { setTimeline(t); setIdx(Math.max(0, t.dates.length - 1)); } })
      .catch(() => { if (!cancelled) setTimeline(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allId, dataVersion]);

  const last = (timeline?.dates.length ?? 1) - 1;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setIdx(i => {
        if (i >= last) { setPlaying(false); return i; }
        return i + 1;
      });
    }, SPEEDS[speed]);
    return () => clearInterval(t);
  }, [playing, speed, last]);

  // Net-worth total and invested at every sample date, for the headline and sparkline.
  const totals = useMemo(() => {
    if (!timeline) return [];
    return timeline.dates.map((date, i) => {
      let value = 0, invested = 0;
      for (const a of timeline.accounts) for (const h of a.holdings) { value += h.value[i]; invested += h.invested[i]; }
      return { date, value, invested };
    });
  }, [timeline]);

  const nodes = useMemo<TreemapNode[]>(() => {
    if (!timeline) return [];
    return timeline.accounts.map(a => {
      const children = a.holdings.map<TreemapNode>(h => ({
        id: `h${h.id}`, name: h.name, value: h.value[idx], change: h.value[idx] - h.invested[idx],
        changePct: gainPct(h.value[idx], h.invested[idx]),
      }));
      const value = children.reduce((s, c) => s + c.value, 0);
      const invested = a.holdings.reduce((s, h) => s + h.invested[idx], 0);
      return { id: `a${a.id}`, name: a.name, value, change: value - invested, changePct: gainPct(value, invested), children };
    });
  }, [timeline, idx]);

  if (loading) {
    return <Paper sx={{ p: 3, borderRadius: 3, display: "flex", justifyContent: "center" }}><CircularProgress size={28} /></Paper>;
  }
  if (!timeline || totals.length === 0) {
    return <Paper sx={{ p: 3, borderRadius: 3 }}><Typography color="text.secondary">No history yet for the time machine.</Typography></Paper>;
  }

  const currency = timeline.displayCurrency;
  const now = totals[idx];
  const today = totals[last];
  const gain = now.value - now.invested;
  const vsToday = today.value - now.value;

  // Jump shortcuts: the sample closest to N years before today.
  const jumpTo = (years: number) => {
    const target = new Date(`${today.date}T00:00:00`);
    target.setFullYear(target.getFullYear() - years);
    const iso = target.toISOString().slice(0, 10);
    const i = timeline.dates.findIndex(d => d >= iso);
    setPlaying(false);
    setIdx(i < 0 ? 0 : i);
  };
  const years = (Date.parse(today.date) - Date.parse(totals[0].date)) / (365.25 * 86_400_000);

  const togglePlay = () => {
    if (!playing && idx >= last) setIdx(0);
    setPlaying(p => !p);
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, height: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>Time Machine</Typography>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
          <Chip size="small" label="Start" onClick={() => { setPlaying(false); setIdx(0); }} />
          {[1, 3, 5].filter(y => y < years).map(y => <Chip key={y} size="small" label={`${y}Y ago`} onClick={() => jumpTo(y)} />)}
          <Chip size="small" label="Today" color={idx === last ? "primary" : "default"} onClick={() => { setPlaying(false); setIdx(last); }} />
        </Stack>
      </Box>

      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 2, mb: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">{formatDate(now.date)}</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: "1.6rem", sm: "2rem" }, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {formatCurrency(now.value, currency, { maxDecimals: 0 })}
          </Typography>
          <Typography sx={{ fontSize: "0.85rem", color: gain >= 0 ? colors.success : colors.error, fontVariantNumeric: "tabular-nums" }}>
            {gain >= 0 ? "+" : ""}{formatCurrency(gain, currency, { maxDecimals: 0 })} on {formatCurrency(now.invested, currency, { maxDecimals: 0 })} invested
          </Typography>
        </Box>
        {idx < last && (
          <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
            Since then: <Box component="span" sx={{ fontWeight: 700, color: vsToday >= 0 ? colors.success : colors.error }}>
              {vsToday >= 0 ? "+" : ""}{formatCurrency(vsToday, currency, { maxDecimals: 0 })}
            </Box>
            {now.value > 0 ? ` (${(today.value / now.value).toFixed(1)}×)` : ""}
          </Typography>
        )}
      </Box>

      <Box sx={{ height: 56, mx: -0.5 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={totals} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Area type="monotone" dataKey="value" stroke={colors.success} fill={colors.success} fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} dot={false} />
            <ReferenceLine x={now.date} stroke={colors.success} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
        <Tooltip title={playing ? "Pause" : "Play"}>
          <IconButton onClick={togglePlay} color="primary" size="small" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
          </IconButton>
        </Tooltip>
        <Slider
          size="small" min={0} max={last} value={idx}
          onChange={(_e, v) => { setPlaying(false); setIdx(v as number); }}
          valueLabelDisplay="auto" valueLabelFormat={i => formatDate(timeline.dates[i])}
          aria-label="Timeline date"
        />
        <ToggleButtonGroup size="small" exclusive value={speed} onChange={(_e, v) => { if (v) setSpeed(v); }}>
          {(Object.keys(SPEEDS) as Speed[]).map(s => <ToggleButton key={s} value={s} sx={{ px: 1, py: 0.25, fontSize: "0.7rem" }}>{s}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      <MoneyTreemap nodes={nodes} currency={currency} saturateAt={0.5} changeLabel="Gain" animate={false} height={320} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Size = value · Color = gain vs. invested · weekly snapshots
      </Typography>
    </Paper>
  );
}
