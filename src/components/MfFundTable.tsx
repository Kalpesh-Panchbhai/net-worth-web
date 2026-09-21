import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, TablePagination, Typography, Tooltip, Chip, Checkbox, IconButton,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { useTokens } from "../context/ColorModeContext";
import { useShortlist } from "../context/ShortlistContext";
import { metricMeta, formatMetricValue, isSignedMetric, assetClassLabel } from "../utils/mfMetrics";
import type { MfTableRow } from "../api/types";

type SortKey = "name" | "category" | string;

interface Props {
  rows: MfTableRow[];
  /** Metric codes to render as columns, in order. */
  metrics: string[];
  /** Show a category column (used by the all-funds view). */
  showCategory?: boolean;
  /** When set, a compare checkbox column appears; selection is controlled by the parent. */
  selected?: Set<number>;
  onToggleSelect?: (schemeCode: number) => void;
  /** Disable ticking more rows once the compare cap is hit (already-ticked rows stay tickable off). */
  selectionFull?: boolean;
}

/**
 * A sortable, paginated grid of funds. Every metric is a column; clicking a header sorts by it,
 * defaulting to the metric's natural "best first" direction. Funds missing a value sort last.
 */
export default function MfFundTable({ rows, metrics, showCategory = false, selected, onToggleSelect, selectionFull = false }: Props) {
  const navigate = useNavigate();
  const { colors } = useTokens();
  const { isStarred, toggle: toggleStar } = useShortlist();
  const selectable = !!onToggleSelect;

  const [orderBy, setOrderBy] = useState<SortKey>(metrics[0] ?? "name");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // A changed dataset (new category / horizon) should start back on the first page.
  useEffect(() => { setPage(0); }, [rows, orderBy, order, rowsPerPage]);

  const handleSort = (key: SortKey) => {
    if (key === orderBy) { setOrder(o => (o === "asc" ? "desc" : "asc")); return; }
    setOrderBy(key);
    setOrder(key === "name" || key === "category" ? "asc" : metricMeta(key).higherIsBetter ? "desc" : "asc");
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let av: number | string | undefined;
      let bv: number | string | undefined;
      if (orderBy === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (orderBy === "category") { av = a.subCategory.toLowerCase(); bv = b.subCategory.toLowerCase(); }
      else { av = a.values[orderBy]; bv = b.values[orderBy]; }
      // Missing values always sink to the bottom, regardless of sort direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const c = typeof av === "string" ? (av < (bv as string) ? -1 : av > (bv as string) ? 1 : 0) : (av as number) - (bv as number);
      return order === "asc" ? c : -c;
    });
    return arr;
  }, [rows, orderBy, order]);

  const paged = useMemo(
    () => sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sorted, page, rowsPerPage],
  );

  const headCell = {
    fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em",
    color: colors.gray500, whiteSpace: "nowrap", borderBottom: `1px solid ${colors.gray200}`,
    py: 1,
  } as const;

  const stickyLeft = {
    position: "sticky" as const, left: 0, zIndex: 2,
    bgcolor: "background.paper",
  };

  return (
    <Box>
      <TableContainer sx={{ borderRadius: 2, border: `1px solid ${colors.gray200}` }}>
        <Table size="small" stickyHeader sx={{ minWidth: 620 }}>
          <TableHead>
            <TableRow>
              {selectable && <TableCell padding="checkbox" sx={{ ...headCell }} />}
              <TableCell sx={{ ...headCell, width: 36 }} />
              <TableCell sx={{ ...headCell, ...stickyLeft, zIndex: 3, minWidth: 200 }}
                sortDirection={orderBy === "name" ? order : false}>
                <TableSortLabel active={orderBy === "name"} direction={orderBy === "name" ? order : "asc"}
                  onClick={() => handleSort("name")}>Fund</TableSortLabel>
              </TableCell>
              {showCategory && (
                <TableCell sx={{ ...headCell }} sortDirection={orderBy === "category" ? order : false}>
                  <TableSortLabel active={orderBy === "category"} direction={orderBy === "category" ? order : "asc"}
                    onClick={() => handleSort("category")}>Category</TableSortLabel>
                </TableCell>
              )}
              {metrics.map(m => (
                <TableCell key={m} align="right" sx={{ ...headCell }} sortDirection={orderBy === m ? order : false}>
                  <Tooltip title={metricMeta(m).help} placement="top">
                    <TableSortLabel active={orderBy === m} direction={orderBy === m ? order : "desc"}
                      onClick={() => handleSort(m)}>{metricMeta(m).short}</TableSortLabel>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map(r => (
              <TableRow key={r.schemeCode} hover onClick={() => navigate(`/mutual-funds/${r.schemeCode}`)}
                sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 } }}>
                {selectable && (
                  <TableCell padding="checkbox" sx={{ borderBottom: `1px solid ${colors.gray100}` }} onClick={e => e.stopPropagation()}>
                    <Checkbox size="small" checked={selected?.has(r.schemeCode) ?? false}
                      disabled={selectionFull && !(selected?.has(r.schemeCode))}
                      onChange={() => onToggleSelect!(r.schemeCode)} />
                  </TableCell>
                )}
                <TableCell sx={{ borderBottom: `1px solid ${colors.gray100}`, pr: 0 }} onClick={e => e.stopPropagation()}>
                  <IconButton size="small" onClick={() => toggleStar(r.schemeCode)}
                    sx={{ color: isStarred(r.schemeCode) ? "#F59E0B" : colors.gray300 }}>
                    {isStarred(r.schemeCode) ? <StarRoundedIcon sx={{ fontSize: 18 }} /> : <StarBorderRoundedIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </TableCell>
                <TableCell sx={{ ...stickyLeft, borderBottom: `1px solid ${colors.gray100}` }}>
                  <Typography sx={{ fontSize: "0.82rem", fontWeight: 600, lineHeight: 1.25 }} noWrap>{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{r.amc}</Typography>
                </TableCell>
                {showCategory && (
                  <TableCell sx={{ borderBottom: `1px solid ${colors.gray100}` }}>
                    <Chip size="small" label={r.subCategory}
                      sx={{ height: 20, fontSize: "0.68rem", fontWeight: 600, bgcolor: alpha(colors.brand, 0.1), color: colors.brand }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>{assetClassLabel(r.assetClass)}</Typography>
                  </TableCell>
                )}
                {metrics.map(m => {
                  const v = r.values[m];
                  const signed = isSignedMetric(m);
                  const color = v == null ? colors.gray400 : !signed ? "text.primary" : v >= 0 ? colors.success : colors.error;
                  return (
                    <TableCell key={m} align="right"
                      sx={{ fontSize: "0.82rem", fontWeight: 700, color, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${colors.gray100}` }}>
                      {v == null ? "—" : formatMetricValue(m, v)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={sorted.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={e => setRowsPerPage(parseInt(e.target.value, 10))}
        rowsPerPageOptions={[25, 50, 100]}
        sx={{ ".MuiTablePagination-toolbar": { minHeight: 44 } }}
      />
    </Box>
  );
}
