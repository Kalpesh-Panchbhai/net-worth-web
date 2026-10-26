import { useRef, useState, type TouchEvent } from "react";
import { Box, Stack, Typography, IconButton, Tooltip, ButtonBase } from "@mui/material";
import { alpha } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import { useTokens } from "../context/ColorModeContext";
import { TintedChip } from "../components/shared";
import NumericField from "../components/NumericField";
import { fmt } from "./model";
import type { CardSpend } from "../api/types";
import { dayLabel, type Purchase } from "./model";

/** How far a row must be dragged before letting go triggers its swipe action. */
const SWIPE_TRIGGER = 88;
/** Drag past this before it counts as a swipe rather than a scroll or tap. */
const SWIPE_SLOP = 10;

interface Props {
  purchase: Purchase;
  showDate: boolean;
  flagged: boolean;
  isMobile: boolean;
  currency: string;
  onEdit: (p: Purchase) => void;
  onRefund: (p: Purchase) => void;
  onDelete: (s: CardSpend) => void;
  onEditRefund: (p: Purchase, r: CardSpend) => void;
  /** Saves a new amount typed straight into the row; rejects to keep the editor open. */
  onAmountChange: (p: Purchase, amount: number) => Promise<void>;
}

/**
 * One purchase and its refunds. Phone: swipe left to delete, right to refund, tap to edit.
 * Desktop: actions on hover, and clicking the amount edits it in place.
 */
export default function SpendRow({ purchase: p, showDate, flagged, isMobile, currency, onEdit, onRefund, onDelete, onEditRefund, onAmountChange }: Props) {
  const { colors } = useTokens();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; swiping: boolean | null; onButton: boolean } | null>(null);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canRefund = p.net > 0;
  const fullyRefunded = p.refunded > 0 && p.net <= 0;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    // A tap on a refund row's own buttons must not also open the purchase editor.
    start.current = { x: t.clientX, y: t.clientY, swiping: null, onButton: !!(e.target as HTMLElement).closest("button") };
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x, my = t.clientY - s.y;
    // Decide once per gesture whether this is a horizontal swipe or a vertical scroll.
    if (s.swiping == null && (Math.abs(mx) > SWIPE_SLOP || Math.abs(my) > SWIPE_SLOP)) s.swiping = Math.abs(mx) > Math.abs(my);
    if (!s.swiping) return;
    setDragging(true);
    setDx(Math.max(-140, Math.min(canRefund ? 140 : 0, mx)));
  };
  const onTouchEnd = () => {
    const swiped = start.current?.swiping;
    const onButton = start.current?.onButton;
    start.current = null;
    setDragging(false);
    if (swiped && dx <= -SWIPE_TRIGGER) onDelete(p);
    else if (swiped && dx >= SWIPE_TRIGGER && canRefund) onRefund(p);
    else if (swiped == null && isMobile && !onButton) onEdit(p);
    setDx(0);
  };

  const saveAmount = async () => {
    if (editingAmount == null) return;
    const n = Number(editingAmount);
    if (!Number.isFinite(n) || n <= 0 || n === p.amount) { setEditingAmount(null); return; }
    setSaving(true);
    try {
      await onAmountChange(p, n);
      setEditingAmount(null);
    } catch {
      /* the page shows the error; keep the editor open to fix it */
    } finally {
      setSaving(false);
    }
  };

  const armed = Math.abs(dx) >= SWIPE_TRIGGER;

  return (
    <Box sx={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${colors.gray100}` }}>
      {/* Swipe backgrounds, revealed as the row slides */}
      {dx !== 0 && (
        <Stack direction="row" alignItems="center" justifyContent={dx > 0 ? "flex-start" : "flex-end"}
          sx={{ position: "absolute", inset: 0, px: 3, bgcolor: dx > 0 ? alpha(colors.success, armed ? 0.9 : 0.6) : alpha(colors.error, armed ? 0.9 : 0.6), color: colors.pureWhite }}>
          {dx > 0 ? <UndoRoundedIcon /> : <DeleteOutlineIcon />}
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 700, ml: 1 }}>{dx > 0 ? "Refund" : "Delete"}</Typography>
        </Stack>
      )}

      <Box
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchMove={isMobile ? onTouchMove : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
        sx={{
          position: "relative", bgcolor: "background.paper",
          transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 0.2s ease",
        }}>
        <Stack direction="row" alignItems="center" spacing={1.5}
          sx={{ px: { xs: 2, sm: 2.5 }, py: 1.25, "&:hover .row-actions": { opacity: 1 }, "&:focus-within .row-actions": { opacity: 1 } }}>
          {flagged && (
            <Tooltip title="Needs a look — see the box above the list">
              <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: colors.warning, flexShrink: 0 }} aria-label="Needs a look" />
            </Tooltip>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.88rem", fontWeight: 600 }} noWrap>
              {p.accountName}{p.cardLast4 ? ` ·· ${p.cardLast4}` : ""}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
              {showDate && <Typography sx={{ fontSize: "0.72rem", color: colors.gray400 }}>{dayLabel(p.spentOn)}</Typography>}
              <TintedChip label={p.source === "email" ? "Email" : "Manual"} color={p.source === "email" ? colors.brand : colors.accent} />
              {p.edited && <TintedChip label="Edited" color={colors.warning} />}
            </Stack>
          </Box>

          <Box sx={{ textAlign: "right", flexShrink: 0, minWidth: 96 }}>
            {editingAmount != null ? (
              <NumericField
                value={editingAmount} onChange={setEditingAmount} currency={currency} maxDecimals={2}
                size="small" autoFocus disabled={saving} sx={{ width: 140 }}
                inputProps={{ "aria-label": "Amount", style: { textAlign: "right" } }}
                onKeyDown={e => {
                  if (e.key === "Enter") saveAmount();
                  if (e.key === "Escape") setEditingAmount(null);
                }}
                onBlur={() => { if (!saving) setEditingAmount(null); }}
              />
            ) : (
              <Tooltip title={isMobile ? "" : "Click to change the amount"} enterDelay={600}>
                <ButtonBase
                  disabled={isMobile}
                  onClick={() => setEditingAmount(String(p.amount))}
                  sx={{ borderRadius: 1, px: 0.5, mr: -0.5, "&:hover": { bgcolor: colors.gray50 } }}
                  aria-label={`Amount ${fmt(p.amount, currency)}, click to edit`}>
                  <Typography sx={{
                    fontSize: "0.95rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    ...(fullyRefunded ? { textDecoration: "line-through", color: colors.gray400 } : {}),
                  }}>
                    {fmt(p.amount, currency)}
                  </Typography>
                </ButtonBase>
              </Tooltip>
            )}
            {p.refunded > 0 && editingAmount == null && (
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: colors.success, whiteSpace: "nowrap" }}>
                {fullyRefunded ? "Fully refunded" : `Refunded ${fmt(p.refunded, currency)} · net ${fmt(p.net, currency)}`}
              </Typography>
            )}
          </Box>

          {!isMobile && (
            <Stack direction="row" className="row-actions" sx={{ opacity: 0.35, transition: "opacity 0.15s ease" }}>
              <Tooltip title={canRefund ? "Add refund" : "Fully refunded"}>
                <span>
                  <IconButton size="small" onClick={() => onRefund(p)} disabled={!canRefund} aria-label="Add refund" sx={{ "&:hover": { color: colors.success } }}>
                    <UndoRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => onEdit(p)} aria-label="Edit spend"><EditOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => onDelete(p)} aria-label="Delete spend" sx={{ "&:hover": { color: colors.error } }}>
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
        </Stack>

        {p.refunds.map(r => (
          <Stack key={r.id} direction="row" alignItems="center" spacing={1.5}
            sx={{ pl: { xs: 4, sm: 5 }, pr: { xs: 2, sm: 2.5 }, pb: 1, "&:hover .row-actions": { opacity: 1 } }}>
            <UndoRoundedIcon sx={{ fontSize: 15, color: colors.success }} />
            <Typography sx={{ fontSize: "0.78rem", color: colors.gray500, flex: 1 }} noWrap>Refund · {dayLabel(r.spentOn)}</Typography>
            <Typography sx={{ fontSize: "0.85rem", fontWeight: 650, color: colors.success, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              −{fmt(-r.amount, currency)}
            </Typography>
            <Stack direction="row" className="row-actions" sx={{ opacity: { xs: 1, sm: 0.35 }, transition: "opacity 0.15s ease" }}>
              <IconButton size="small" onClick={() => onEditRefund(p, r)} aria-label="Edit refund"><EditOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
              <IconButton size="small" onClick={() => onDelete(r)} aria-label="Delete refund" sx={{ "&:hover": { color: colors.error } }}>
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
