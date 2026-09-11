import InsightsGrid from "../insights/InsightsGrid";

// The landing page is a configurable grid of insight widgets (charts, allocation, income, …).
// Layout and per-widget config persist per user in localStorage; see src/insights/.
function Insights() {
  return <InsightsGrid />;
}

export default Insights;
