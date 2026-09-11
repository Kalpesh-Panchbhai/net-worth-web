import { useMemo } from "react";
import { Stack, Chip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useUser } from "../../context/UserContext";
import { useTokens } from "../../context/ColorModeContext";
import type { WatchlistSummary } from "../../api/types";
import AllocationBreakdown, { type AllocationGrouping } from "../../components/AllocationBreakdown";
import type { WatchlistComparisonConfig } from "../types";
import type { InsightsData } from "../useInsightsData";

const WATCHLIST_GROUPINGS: AllocationGrouping<WatchlistSummary>[] = [
  { id: "watchlist", label: "Watchlist", keyOf: w => w.name },
];

export default function WatchlistComparisonWidget({ config, data, onConfigChange }: {
  config: WatchlistComparisonConfig;
  data: InsightsData;
  onConfigChange: (c: WatchlistComparisonConfig) => void;
}) {
  const { preferredCurrency } = useUser();
  const { colors } = useTokens();

  const real = useMemo(() => data.watchlists.filter(w => w.name !== "All"), [data.watchlists]);
  const excluded = new Set(config.excludedIds);
  const items = real.filter(w => !excluded.has(w.id));

  const toggle = (id: number) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else if (items.length > 1) next.add(id); // keep at least one visible
    onConfigChange({ ...config, excludedIds: [...next] });
  };

  return (
    <AllocationBreakdown
      items={items}
      groupings={WATCHLIST_GROUPINGS}
      currency={preferredCurrency}
      title="Watchlist Comparison"
      itemNoun="watchlists"
      initialMetric={config.metric}
      headerExtra={
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {real.map(w => {
            const on = !excluded.has(w.id);
            return (
              <Chip
                key={w.id} label={w.name} size="small" onClick={() => toggle(w.id)}
                variant={on ? "filled" : "outlined"}
                sx={{
                  fontWeight: 600, fontSize: "0.72rem", cursor: "pointer",
                  bgcolor: on ? alpha(colors.brand, 0.12) : "transparent",
                  color: on ? colors.brand : colors.gray500,
                  border: `1px solid ${on ? alpha(colors.brand, 0.35) : colors.gray200}`,
                  "&:hover": { bgcolor: on ? alpha(colors.brand, 0.18) : alpha(colors.gray400, 0.08) },
                }}
              />
            );
          })}
        </Stack>
      }
    />
  );
}
