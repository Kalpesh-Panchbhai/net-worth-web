import { useMemo } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { useUser } from "../../context/UserContext";
import IncomeChart from "../../components/IncomeChart";
import IncomeLineChart from "../../components/IncomeLineChart";
import CumulativeIncomeChart from "../../components/CumulativeIncomeChart";
import TaxRateChart from "../../components/TaxRateChart";
import { buildIncomeChartData, buildIncomeAvgChartData, buildIncomeForecastLabels, pickIncomeCurrency } from "../../utils/income";
import type { IncomeConfig } from "../types";
import type { InsightsData } from "../useInsightsData";

const TITLES: Record<IncomeConfig["chart"], string> = {
  cumulative: "Cumulative Income",
  bar: "Income Breakdown",
  avg: "Avg Monthly Income",
  tax: "Tax Rate",
};

export default function IncomeWidget({ config, data }: { config: IncomeConfig; data: InsightsData }) {
  const { preferredCurrency } = useUser();
  // Avg is progressive over time (line) but categorical for source/tag (bars).
  const isTimeGrouping = config.grouping === "month" || config.grouping === "year" || config.grouping === "fy";

  const { chartData, avgData, displayCcy, forecastLabels } = useMemo(() => {
    const displayCcy = pickIncomeCurrency(data.incomes, preferredCurrency);
    const sourceLookup = new Map(data.sources.map(s => [s.id, s.name]));
    const tagLookup = new Map(data.tags.map(t => [t.id, t.name]));
    const lookups = { sourceLookup, tagLookup, displayCcy };
    const chartData = buildIncomeChartData(data.incomes, config.grouping, lookups);
    const avgData = config.chart === "avg" ? buildIncomeAvgChartData(data.incomes, config.grouping, lookups) : chartData;
    const forecastLabels = buildIncomeForecastLabels(data.incomes, config.grouping);
    return { chartData, avgData, displayCcy, forecastLabels };
  }, [data.incomes, data.sources, data.tags, config.grouping, config.chart, preferredCurrency]);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", mb: 2 }}>{TITLES[config.chart]}</Typography>
      {chartData.length < 2 ? (
        <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>Not enough income data for this grouping.</Typography>
      ) : (
        <Box sx={{ mx: { xs: -1, sm: 0 } }}>
          {config.chart === "cumulative" && <CumulativeIncomeChart data={chartData} currency={displayCcy} forecastLabels={forecastLabels} />}
          {config.chart === "bar" && <IncomeChart data={chartData} currency={displayCcy} />}
          {config.chart === "avg" && (isTimeGrouping
            ? <IncomeLineChart data={avgData} currency={displayCcy} />
            : <IncomeChart data={avgData} currency={displayCcy} />)}
          {config.chart === "tax" && <TaxRateChart data={chartData} />}
        </Box>
      )}
    </Paper>
  );
}
