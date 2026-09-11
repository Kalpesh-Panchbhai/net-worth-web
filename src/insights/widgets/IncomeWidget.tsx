import { useMemo } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { useUser } from "../../context/UserContext";
import IncomeChart from "../../components/IncomeChart";
import CumulativeIncomeChart from "../../components/CumulativeIncomeChart";
import TaxRateChart from "../../components/TaxRateChart";
import { buildIncomeChartData, buildIncomeForecastLabels, pickIncomeCurrency } from "../../utils/income";
import type { IncomeConfig } from "../types";
import type { InsightsData } from "../useInsightsData";

const TITLES: Record<IncomeConfig["chart"], string> = {
  cumulative: "Cumulative Income",
  bar: "Income Breakdown",
  tax: "Tax Rate",
};

export default function IncomeWidget({ config, data }: { config: IncomeConfig; data: InsightsData }) {
  const { preferredCurrency } = useUser();

  const { chartData, displayCcy, forecastLabels } = useMemo(() => {
    const displayCcy = pickIncomeCurrency(data.incomes, preferredCurrency);
    const sourceLookup = new Map(data.sources.map(s => [s.id, s.name]));
    const tagLookup = new Map(data.tags.map(t => [t.id, t.name]));
    const chartData = buildIncomeChartData(data.incomes, config.grouping, { sourceLookup, tagLookup, displayCcy });
    const forecastLabels = buildIncomeForecastLabels(data.incomes, config.grouping);
    return { chartData, displayCcy, forecastLabels };
  }, [data.incomes, data.sources, data.tags, config.grouping, preferredCurrency]);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", mb: 2 }}>{TITLES[config.chart]}</Typography>
      {chartData.length < 2 ? (
        <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>Not enough income data for this grouping.</Typography>
      ) : (
        <Box sx={{ mx: { xs: -1, sm: 0 } }}>
          {config.chart === "cumulative" && <CumulativeIncomeChart data={chartData} currency={displayCcy} forecastLabels={forecastLabels} />}
          {config.chart === "bar" && <IncomeChart data={chartData} currency={displayCcy} />}
          {config.chart === "tax" && <TaxRateChart data={chartData} />}
        </Box>
      )}
    </Paper>
  );
}
