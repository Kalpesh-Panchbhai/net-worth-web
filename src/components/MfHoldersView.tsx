import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, Typography, Stack, Chip, Collapse, IconButton, Select, MenuItem,
  FormControl, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { getAccounts, getHoldings } from "../api/client";
import type { AccountSummary, HoldingSummary, MfPortfolio } from "../api/types";
import {
  buildHousehold, newPersonId, EMPTY_HOLDERS_CONFIG,
  type HoldersConfig, type PersonGroup, type HolderHolding,
} from "../utils/mfHolders";
import { useSyncedConfig } from "../utils/syncedConfig";
import { formatCurrency } from "../utils/format";
import { DEFAULT_CURRENCY } from "../constants";
import { EmptyState, ErrorState, ListSkeleton } from "./shared";
import { useTokens } from "../context/ColorModeContext";

const CONFIG_KEY = "mf_holders";

export default function MfHoldersView({ userId, pf }: { userId: number; pf: MfPortfolio }) {
  const navigate = useNavigate();
  const { colors, shadow } = useTokens();

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [holdingsByAccount, setHoldingsByAccount] = useState<Map<number, HoldingSummary[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useSyncedConfig<HoldersConfig>(userId, CONFIG_KEY, EMPTY_HOLDERS_CONFIG);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const accs = await getAccounts(userId);
        const lists = await Promise.all(
          accs.map(a => getHoldings(a.id).catch(() => [] as HoldingSummary[])),
        );
        if (cancelled) return;
        const map = new Map<number, HoldingSummary[]>();
        accs.forEach((a, i) => map.set(a.id, lists[i]));
        setAccounts(accs);
        setHoldingsByAccount(map);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load accounts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const household = useMemo(
    () => buildHousehold(accounts, holdingsByAccount, pf, config),
    [accounts, holdingsByAccount, pf, config],
  );

  const currency = useMemo(() => {
    for (const g of household.groups) {
      if (g.holdings[0]) return g.holdings[0].holding.displayCurrency;
    }
    return DEFAULT_CURRENCY;
  }, [household]);

  const money = (v: number) => formatCurrency(v, currency);

  // ── Config mutations ───────────────────────────────────────
  const assignAccount = (accountId: number, personId: string) => {
    const next = { ...config.accountToPerson };
    if (personId) next[String(accountId)] = personId;
    else delete next[String(accountId)];
    setConfig({ ...config, accountToPerson: next });
  };

  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    setConfig({ ...config, people: [...config.people, { id: newPersonId(), name }] });
    setNewName(""); setAddOpen(false);
  };

  const removePerson = (id: string) => {
    const accountToPerson = { ...config.accountToPerson };
    for (const k of Object.keys(accountToPerson)) if (accountToPerson[k] === id) delete accountToPerson[k];
    setConfig({ people: config.people.filter(p => p.id !== id), accountToPerson });
  };

  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (loading) return <ListSkeleton rows={6} />;
  if (error) return <ErrorState message={error} onRetry={() => setAccounts(a => [...a])} />;

  if (household.accountsWithFunds.length === 0) {
    return <EmptyState icon={<GroupsRoundedIcon />} title="No funds found in your accounts"
      description="None of your account holdings match a fund in the analyzer, so there is nothing to attribute to a holder yet." />;
  }

  const dupValue = household.duplicated.reduce((s, d) => s + d.totalValue, 0);
  const dupPct = household.totalValue > 0 ? (dupValue / household.totalValue) * 100 : 0;

  const groupKey = (g: PersonGroup) => g.person?.id ?? "__unassigned__";

  const FundRow = ({ hh, showAccount }: { hh: HolderHolding; showAccount: boolean }) => {
    const pct = hh.mf.percentile;
    const topPct = pct == null ? null : Math.max(1, Math.round(100 - pct));
    const strong = pct != null && (pct >= 90 || (hh.mf.rank != null && hh.mf.rank <= 3));
    const badgeColor = strong ? "#F59E0B" : colors.brand;
    return (
      <Box onClick={() => navigate(`/mutual-funds/${hh.mf.schemeCode}`)}
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 1, borderRadius: 2, cursor: "pointer", border: `1px solid ${colors.gray200}`, transition: "all .15s", "&:hover": { borderColor: alpha(colors.brand, 0.5), boxShadow: shadow.sm } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.83rem", fontWeight: 600 }} noWrap>{hh.mf.name}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }} alignItems="center" useFlexGap flexWrap="wrap">
            <Chip label={hh.mf.subCategory} size="small" sx={{ height: 18, fontSize: "0.62rem", fontWeight: 600, bgcolor: colors.gray100, color: colors.gray500 }} />
            {showAccount && <Chip label={hh.account.name} size="small" sx={{ height: 18, fontSize: "0.62rem", fontWeight: 600, bgcolor: alpha(colors.accent, 0.12), color: colors.accent }} />}
            <Typography variant="caption" color="text.secondary">{money(hh.value)}</Typography>
          </Stack>
        </Box>
        {topPct != null && (
          <Tooltip title={`Rank ${hh.mf.rank} of ${hh.mf.peerCount} · ${hh.mf.rankHorizon ?? ""} CAGR ${hh.mf.rankCagr == null ? "—" : (hh.mf.rankCagr * 100).toFixed(1) + "%"}`}>
            <Chip size="small" icon={strong ? <EmojiEventsRoundedIcon sx={{ fontSize: 14 }} /> : undefined} label={`Top ${topPct}%`}
              sx={{ height: 22, fontWeight: 700, bgcolor: alpha(badgeColor, 0.12), color: badgeColor, "& .MuiChip-icon": { color: badgeColor } }} />
          </Tooltip>
        )}
        <ChevronRightRoundedIcon sx={{ color: colors.gray400, fontSize: 20 }} />
      </Box>
    );
  };

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {/* People & account assignment */}
      <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="subtitle1">Account holders</Typography>
          <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setAddOpen(true)} sx={{ textTransform: "none", fontWeight: 700 }}>Add person</Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Assign each account to a person. Funds are grouped by whoever holds the account they sit in.
        </Typography>

        {config.people.length > 0 && (
          <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }} useFlexGap flexWrap="wrap">
            {config.people.map(p => (
              <Chip key={p.id} size="small" icon={<PersonRoundedIcon sx={{ fontSize: 15 }} />} label={p.name}
                onDelete={() => removePerson(p.id)} deleteIcon={<DeleteOutlineRoundedIcon />}
                sx={{ fontWeight: 600, bgcolor: colors.gray100 }} />
            ))}
          </Stack>
        )}

        <Stack spacing={0.75}>
          {household.accountsWithFunds.map(a => {
            const current = config.accountToPerson[String(a.id)] ?? "";
            return (
              <Box key={a.id} sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 0.75, borderRadius: 2, border: `1px solid ${colors.gray200}` }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.83rem", fontWeight: 600 }} noWrap>{a.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{a.type}</Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select value={current} displayEmpty onChange={e => assignAccount(a.id, e.target.value)}
                    renderValue={v => (v ? config.people.find(p => p.id === v)?.name ?? "Unassigned" : "Unassigned")}
                    sx={{ fontSize: "0.83rem" }}>
                    <MenuItem value=""><em>Unassigned</em></MenuItem>
                    {config.people.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {/* #5 — Household duplication */}
      <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Typography variant="subtitle1" sx={{ mb: 0.5 }}>Held by more than one person</Typography>
        {household.duplicated.length === 0 ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: colors.success }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 20 }} />
            <Typography variant="body2">No fund is held by two or more people — no household duplication.</Typography>
          </Stack>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              <b style={{ color: colors.gray900 }}>{household.duplicated.length} {household.duplicated.length === 1 ? "fund is" : "funds are"}</b> held by more than one person — {money(dupValue)} ({dupPct.toFixed(1)}% of your fund value). Consolidating avoids tracking the same scheme twice.
            </Typography>
            <Stack spacing={0.75}>
              {household.duplicated.map(d => (
                <Box key={d.schemeCode} onClick={() => navigate(`/mutual-funds/${d.schemeCode}`)}
                  sx={{ px: 1.25, py: 1, borderRadius: 2, cursor: "pointer", border: `1px solid ${alpha("#F59E0B", 0.4)}`, bgcolor: alpha("#F59E0B", 0.06), transition: "all .15s", "&:hover": { boxShadow: shadow.sm } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ContentCopyRoundedIcon sx={{ fontSize: 15, color: "#F59E0B" }} />
                    <Typography sx={{ fontSize: "0.83rem", fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{d.name}</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{money(d.totalValue)}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, pl: 3 }} useFlexGap flexWrap="wrap">
                    {d.perPerson.map((pp, i) => (
                      <Chip key={i} size="small" label={`${pp.person?.name ?? "Unassigned"} · ${money(pp.value)}`}
                        sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600, bgcolor: colors.gray100, color: colors.gray500 }} />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </>
        )}
      </Paper>

      {/* #1 — Funds grouped by holder */}
      <Stack spacing={1.5}>
        {household.groups.map(g => {
          const key = groupKey(g);
          const open = !collapsed.has(key);
          const gain = g.value - g.invested;
          const gainPct = g.invested > 0 ? (gain / g.invested) * 100 : 0;
          return (
            <Paper key={key} sx={{ p: { xs: 1.25, sm: 2 } }}>
              <Box onClick={() => toggle(key)} sx={{ display: "flex", alignItems: "center", gap: 1.25, cursor: "pointer" }}>
                <Box sx={{ width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: g.person ? alpha(colors.brand, 0.12) : colors.gray100, color: g.person ? colors.brand : colors.gray400, flexShrink: 0 }}>
                  <PersonRoundedIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.95rem", fontWeight: 700 }} noWrap>{g.person?.name ?? "Unassigned"}</Typography>
                  <Typography variant="caption" color="text.secondary">{g.holdings.length} {g.holdings.length === 1 ? "fund" : "funds"} · {money(g.value)}</Typography>
                </Box>
                <Box sx={{ textAlign: "right", mr: 0.5 }}>
                  <Typography sx={{ fontSize: "0.85rem", fontWeight: 700, color: gain >= 0 ? colors.success : colors.error, fontVariantNumeric: "tabular-nums" }}>
                    {gain >= 0 ? "+" : ""}{money(gain)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: colors.gray400 }}>{gainPct.toFixed(1)}%</Typography>
                </Box>
                <IconButton size="small" sx={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }}>
                  <ExpandMoreRoundedIcon />
                </IconButton>
              </Box>
              <Collapse in={open}>
                <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                  {g.holdings.map(hh => <FundRow key={`${hh.account.id}-${hh.mf.schemeCode}`} hh={hh} showAccount />)}
                </Stack>
              </Collapse>
            </Paper>
          );
        })}
      </Stack>

      {household.unassignedValue > 0 && config.people.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
          Add a person above and assign your accounts to see funds grouped by holder.
        </Typography>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a person</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label="Name" placeholder="e.g. Self, Spouse, Parent"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addPerson(); }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={addPerson} variant="contained" disabled={!newName.trim()} sx={{ textTransform: "none", fontWeight: 700 }}>Add</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
