import { useState } from "react";
import { Box, Button, Collapse, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useTokens } from "../context/ColorModeContext";
import { formatCurrency as fmt } from "../utils/format";
import { dayLabel, type Issue } from "./model";

/** Show this many warnings before "Show all". */
const COLLAPSED_COUNT = 3;

/**
 * Pinned above the list: rows that look wrong (bill payment read as a purchase, unusually large,
 * duplicate, partial refund). Each can be fixed in one tap or dismissed with "It's fine".
 */
export default function ReviewPanel({ issues, currency, onDelete, onDismiss, onShow }: {
  issues: Issue[];
  currency: string;
  onDelete: (i: Issue) => void;
  onDismiss: (i: Issue) => void;
  onShow: (i: Issue) => void;
}) {
  const { colors } = useTokens();
  const [expanded, setExpanded] = useState(false);
  if (issues.length === 0) return null;
  const visible = expanded ? issues : issues.slice(0, COLLAPSED_COUNT);

  return (
    <Paper sx={{ borderRadius: 3, border: `1px solid ${alpha(colors.warning, 0.4)}`, bgcolor: alpha(colors.warning, 0.06), overflow: "hidden" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: { xs: 2, sm: 2.5 }, pt: 1.5, pb: 0.5 }}>
        <WarningAmberRoundedIcon sx={{ fontSize: 18, color: colors.warning }} />
        <Typography sx={{ fontWeight: 700, fontSize: "0.88rem" }}>
          Needs a look · {issues.length}
        </Typography>
      </Stack>
      <Collapse in timeout="auto">
        {visible.map(i => (
          <Stack key={i.key} direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.75, sm: 1.5 }} alignItems={{ xs: "stretch", sm: "center" }}
            sx={{ px: { xs: 2, sm: 2.5 }, py: 1.25, borderTop: `1px solid ${alpha(colors.warning, 0.2)}` }}>
            <Box sx={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onShow(i)}>
              <Typography sx={{ fontSize: "0.85rem", fontWeight: 650 }} noWrap>
                {fmt(i.purchase.amount, currency)} · {i.purchase.accountName} · {dayLabel(i.purchase.spentOn)}
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: colors.gray500 }}>{i.message}</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              {i.kind !== "partialRefund" && (
                <Button size="small" color="error" variant="outlined" onClick={() => onDelete(i)}>Delete</Button>
              )}
              <Button size="small" onClick={() => onDismiss(i)}>It's fine</Button>
            </Stack>
          </Stack>
        ))}
      </Collapse>
      {issues.length > COLLAPSED_COUNT && (
        <Button fullWidth size="small" onClick={() => setExpanded(e => !e)} endIcon={<ExpandMoreRoundedIcon sx={{ transform: expanded ? "rotate(180deg)" : "none" }} />}
          sx={{ borderRadius: 0, borderTop: `1px solid ${alpha(colors.warning, 0.2)}`, color: colors.gray600 }}>
          {expanded ? "Show less" : `Show all ${issues.length}`}
        </Button>
      )}
    </Paper>
  );
}
