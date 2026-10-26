import { useEffect, useState } from "react";
import {
  Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useTokens } from "../context/ColorModeContext";
import NumericField, { isAmount } from "../components/NumericField";
import { fmt } from "./model";
import type { CardSpendAccount } from "../api/types";
import { dayLabel, todayIso, yesterdayIso, type Purchase } from "./model";

export interface FormState {
  /** A refund form only has amount and date; it always belongs to `purchase`. */
  kind: "spend" | "refund";
  purchase?: Purchase;
  id: number | null;
  accountId: number | "";
  cardLast4: string;
  spentOn: string;
  amount: string;
  /** Email spends are flagged "edited" once saved. */
  fromEmail?: boolean;
}

const LAST_CARD_KEY = "cardspends:lastCard";

/** The card last used in the add form, so adding several spends in a row needs no re-picking. */
export function readLastCard(): { accountId: number; cardLast4: string } | null {
  try {
    const raw = localStorage.getItem(LAST_CARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeLastCard(accountId: number, cardLast4: string) {
  try { localStorage.setItem(LAST_CARD_KEY, JSON.stringify({ accountId, cardLast4 })); } catch { /* ignore */ }
}

/**
 * Add/edit a spend, or add/edit a refund of one. Date chips cover the usual today/yesterday; "Save &
 * add another" keeps the dialog open with the same card for entering several spends in a row.
 */
export default function SpendForm({ form, setForm, cards, cardNumbers, currency, onSave }: {
  form: FormState | null;
  setForm: (f: FormState | null) => void;
  cards: CardSpendAccount[];
  /** Card last-4s seen in spends, per account, most recent first. */
  cardNumbers: Map<number, string[]>;
  currency: string;
  /** Resolves when saved; rejects (with the page already showing why) to keep the dialog open. */
  onSave: (f: FormState) => Promise<void>;
}) {
  const { colors } = useTokens();
  const [saving, setSaving] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  // Re-keys the amount field so it remounts focused after "Save & add another".
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!form) return;
    setPickDate(form.spentOn !== todayIso() && form.spentOn !== yesterdayIso());
  }, [form?.id, form?.kind, form?.purchase?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Most a refund may be: what is left, plus this refund's own amount when editing it.
  const refundMax = form?.kind === "refund" && form.purchase
    ? form.purchase.net + (form.id != null ? -(form.purchase.refunds.find(r => r.id === form.id)?.amount ?? 0) : 0)
    : null;
  const refundTooBig = refundMax != null && Number(form?.amount) > refundMax + 1e-9;
  const last4Valid = !form || form.cardLast4 === "" || /^\d{4}$/.test(form.cardLast4);
  const valid = !!form && form.accountId !== "" && !!form.spentOn && isAmount(form.amount) && Number(form.amount) > 0
    && last4Valid && !refundTooBig;

  const save = async (addAnother: boolean) => {
    if (!form || !valid || saving) return;
    setSaving(true);
    try {
      await onSave(form);
      if (form.kind === "spend") writeLastCard(form.accountId as number, form.cardLast4);
      if (addAnother && form.kind === "spend" && form.id == null) {
        setForm({ ...form, amount: "" });
        setRound(r => r + 1);
      } else {
        setForm(null);
      }
    } catch {
      /* stay open so the entry isn't lost */
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(false); }
  };

  const dateField = form && (
    <Box>
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: colors.gray500, mb: 0.75 }}>
        {form.kind === "refund" ? "Refund date" : "Date"}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip label="Today" color={!pickDate && form.spentOn === todayIso() ? "primary" : "default"}
          onClick={() => { setPickDate(false); setForm({ ...form, spentOn: todayIso() }); }} />
        <Chip label="Yesterday" color={!pickDate && form.spentOn === yesterdayIso() ? "primary" : "default"}
          onClick={() => { setPickDate(false); setForm({ ...form, spentOn: yesterdayIso() }); }} />
        <Chip label={pickDate ? dayLabel(form.spentOn) : "Pick date"} color={pickDate ? "primary" : "default"} onClick={() => setPickDate(true)} />
      </Stack>
      {pickDate && (
        <TextField type="date" size="small" value={form.spentOn} fullWidth sx={{ mt: 1.5 }} InputLabelProps={{ shrink: true }}
          inputProps={{ "aria-label": "Date", max: todayIso() }}
          onChange={e => setForm({ ...form, spentOn: e.target.value })} />
      )}
    </Box>
  );

  const isRefund = form?.kind === "refund";
  const title = isRefund ? (form?.id == null ? "Add refund" : "Edit refund") : form?.id == null ? "Add spend" : "Edit spend";

  return (
    <Dialog open={!!form} onClose={() => !saving && setForm(null)} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      {form && (
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: "16px !important" }}>
          {isRefund && form.purchase ? (
            <>
              <Typography sx={{ fontSize: "0.85rem", color: colors.gray500 }}>
                {form.purchase.accountName}{form.purchase.cardLast4 ? ` ·· ${form.purchase.cardLast4}` : ""} · {fmt(form.purchase.amount, currency)} on {dayLabel(form.purchase.spentOn)}
              </Typography>
              <NumericField label="Refund amount" value={form.amount} onChange={v => setForm({ ...form, amount: v })}
                currency={currency} maxDecimals={2} fullWidth autoFocus onKeyDown={onKey}
                error={refundTooBig}
                helperText={refundMax != null
                  ? (refundTooBig ? `Can't be more than ${fmt(refundMax, currency)}` : `Up to ${fmt(refundMax, currency)}. Lower it if a fee was kept.`)
                  : undefined} />
              {dateField}
              <Typography sx={{ fontSize: "0.75rem", color: colors.gray400 }}>
                Counts in the purchase's month, so its spend becomes the amount not refunded.
              </Typography>
            </>
          ) : (
            <>
              <NumericField key={round} label="Amount" value={form.amount} onChange={v => setForm({ ...form, amount: v })}
                currency={currency} maxDecimals={2} fullWidth autoFocus onKeyDown={onKey} />
              <Stack direction="row" spacing={1.5}>
                <TextField select label="Card" value={form.accountId} sx={{ flex: 1 }}
                  onChange={e => {
                    const accountId = Number(e.target.value);
                    setForm({ ...form, accountId, cardLast4: cardNumbers.get(accountId)?.[0] ?? "" });
                  }}>
                  {cards.map(c => <MenuItem key={c.accountId} value={c.accountId}>{c.name}</MenuItem>)}
                </TextField>
                <Autocomplete freeSolo disableClearable sx={{ width: 120 }}
                  options={form.accountId === "" ? [] : cardNumbers.get(form.accountId) ?? []}
                  inputValue={form.cardLast4}
                  onInputChange={(_, v) => setForm({ ...form, cardLast4: v.replace(/\D/g, "").slice(0, 4) })}
                  renderInput={params => (
                    <TextField {...params} label="Last 4" error={!last4Valid} helperText={!last4Valid ? "4 digits" : "Optional"}
                      inputProps={{ ...params.inputProps, inputMode: "numeric", autoComplete: "off" }} onKeyDown={onKey} />
                  )} />
              </Stack>
              {dateField}
              {form.fromEmail && (
                <Typography sx={{ fontSize: "0.75rem", color: colors.gray400 }}>
                  This spend came from an alert email. Saving marks it as edited.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
      )}
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {form?.kind === "spend" && form.id == null && (
          <Button onClick={() => save(true)} disabled={!valid || saving}>Save & add another</Button>
        )}
        <Button onClick={() => save(false)} variant="contained" disabled={!valid || saving}>
          {form?.id == null ? "Add" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
