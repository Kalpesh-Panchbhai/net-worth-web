import { MenuItem, TextField, Stack } from "@mui/material";
import type {
  WidgetType, WidgetConfig,
  AllocationConfig, PerformanceConfig, IncomeConfig, AllocationSource,
} from "./types";
import type { InsightsData } from "./useInsightsData";

const sel = { size: "small" as const, fullWidth: true };

function encodeSource(s: AllocationSource): string {
  return s.kind === "networth" ? "networth" : s.kind === "watchlist" ? `wl:${s.id}` : `hold:${s.accountId}`;
}
function decodeSource(v: string): AllocationSource {
  if (v.startsWith("wl:")) return { kind: "watchlist", id: Number(v.slice(3)) };
  if (v.startsWith("hold:")) return { kind: "holdings", accountId: Number(v.slice(5)) };
  return { kind: "networth" };
}

/** Config editor for a widget; switches on type. Renders nothing when a type needs no config. */
export default function WidgetConfigForm({ type, config, data, onChange }: {
  type: WidgetType;
  config: WidgetConfig;
  data: InsightsData;
  onChange: (config: WidgetConfig) => void;
}) {
  if (type === "allocation") {
    const c = config as AllocationConfig;
    const brokers = data.accounts.filter(a => a.type === "BROKER");
    // Group-by and metric (Value/Invested) are toggles on the card itself, so the dialog only picks
    // the data source. Changing the source resets an incompatible grouping to a sensible default.
    return (
      <Stack spacing={2} sx={{ pt: 1 }}>
        <TextField {...sel} select label="Source" value={encodeSource(c.source)}
          onChange={e => {
            const source = decodeSource(e.target.value);
            const grouping = source.kind === "holdings" ? "holding" : (c.grouping === "holding" ? "type" : c.grouping);
            onChange({ ...c, source, grouping });
          }}>
          <MenuItem value="networth">Net Worth (all accounts)</MenuItem>
          {data.watchlists.filter(w => w.name !== "All").map(w => <MenuItem key={`wl:${w.id}`} value={`wl:${w.id}`}>Watchlist: {w.name}</MenuItem>)}
          {brokers.map(a => <MenuItem key={`hold:${a.id}`} value={`hold:${a.id}`}>Holdings: {a.name}</MenuItem>)}
        </TextField>
      </Stack>
    );
  }

  // These are fully controlled from the card (chips / period toggle), so they have no dialog settings.
  if (type === "watchlistComparison" || type === "netWorth") return null;

  if (type === "performance" || type === "summary") {
    // Summary and performance share the same entity picker (net worth / watchlist / account).
    const c = config as PerformanceConfig;
    const value = `${c.entityType}:${c.entityId}`;
    return (
      <Stack spacing={2} sx={{ pt: 1 }}>
        <TextField {...sel} select label="Entity" value={value}
          onChange={e => {
            const [kind, idStr] = e.target.value.split(":");
            const entityId = Number(idStr);
            const label = kind === "watchlist" && entityId === 0 ? "Net Worth"
              : kind === "watchlist" ? (data.watchlists.find(w => w.id === entityId)?.name ?? "Watchlist")
              : (data.accounts.find(a => a.id === entityId)?.name ?? "Account");
            onChange({ entityType: kind as PerformanceConfig["entityType"], entityId, label });
          }}>
          <MenuItem value="watchlist:0">Net Worth (All)</MenuItem>
          {data.watchlists.filter(w => w.name !== "All").map(w => <MenuItem key={`watchlist:${w.id}`} value={`watchlist:${w.id}`}>Watchlist: {w.name}</MenuItem>)}
          {data.accounts.map(a => <MenuItem key={`account:${a.id}`} value={`account:${a.id}`}>Account: {a.name}</MenuItem>)}
        </TextField>
      </Stack>
    );
  }

  // income
  const c = config as IncomeConfig;
  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <TextField {...sel} select label="Chart" value={c.chart} onChange={e => onChange({ ...c, chart: e.target.value as IncomeConfig["chart"] })}>
        <MenuItem value="cumulative">Cumulative income</MenuItem>
        <MenuItem value="bar">Income breakdown</MenuItem>
        <MenuItem value="avg">Avg monthly income</MenuItem>
        <MenuItem value="tax">Tax rate</MenuItem>
      </TextField>
      <TextField {...sel} select label="Group by" value={c.grouping} onChange={e => onChange({ ...c, grouping: e.target.value as IncomeConfig["grouping"] })}>
        <MenuItem value="month">Month</MenuItem>
        <MenuItem value="year">Year</MenuItem>
        <MenuItem value="fy">Financial year</MenuItem>
        <MenuItem value="source">Source</MenuItem>
        <MenuItem value="tag">Tag</MenuItem>
      </TextField>
    </Stack>
  );
}
