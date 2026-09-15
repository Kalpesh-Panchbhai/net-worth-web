import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, Box, TextField, InputAdornment, Typography, List, ListItemButton,
  ListItemIcon, ListItemText, Avatar, CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { useUser } from "../context/UserContext";
import { useTokens } from "../context/ColorModeContext";
import { getAccounts, getHoldings, getWatchlists } from "../api/client";
import { isInternalAccount, isInternalHolding } from "../utils/account";

type ResultType = "account" | "holding" | "watchlist";

interface SearchItem {
  type: ResultType;
  key: string;
  label: string;
  sublabel: string;
  haystack: string;
  path: string;
}

const TYPE_META: Record<ResultType, { icon: React.ReactNode; label: string }> = {
  account: { icon: <AccountBalanceWalletRoundedIcon sx={{ fontSize: 18 }} />, label: "Account" },
  holding: { icon: <ShowChartRoundedIcon sx={{ fontSize: 18 }} />, label: "Holding" },
  watchlist: { icon: <VisibilityRoundedIcon sx={{ fontSize: 18 }} />, label: "Watchlist" },
};

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useUser();
  const navigate = useNavigate();
  const { colors } = useTokens();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Build the index once per open. Accounts and watchlists are one request each; holdings need one
  // request per account, fired in parallel. Everything is served from the client cache on reopen.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [allAccounts, watchlists] = await Promise.all([getAccounts(userId), getWatchlists(userId)]);
        // Drop the backend's synthetic aggregate account — and therefore its holdings — from the index.
        const accounts = allAccounts.filter(a => !isInternalAccount(a.name));
        const holdingLists = await Promise.all(accounts.map(a => getHoldings(a.id).catch(() => [])));
        if (cancelled) return;
        const next: SearchItem[] = [];
        for (const a of accounts) {
          next.push({
            type: "account", key: `a-${a.id}`, label: a.name,
            sublabel: `${a.type.replace("_", " ").toLowerCase()} · ${a.currency}`,
            haystack: `${a.name} ${a.type}`.toLowerCase(), path: `/accounts/${a.id}`,
          });
        }
        accounts.forEach((a, idx) => {
          for (const h of holdingLists[idx]) {
            if (isInternalHolding(h)) continue;
            next.push({
              type: "holding", key: `h-${h.id}`, label: h.name,
              sublabel: `${h.symbol} · ${a.name}`,
              haystack: `${h.name} ${h.symbol} ${a.name}`.toLowerCase(),
              path: `/accounts/${a.id}/holdings/${h.id}`,
            });
          }
        });
        for (const w of watchlists) {
          next.push({
            type: "watchlist", key: `w-${w.id}`, label: w.name, sublabel: "Watchlist",
            haystack: w.name.toLowerCase(), path: `/watchlists/${w.id}`,
          });
        }
        setItems(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  // Reset the query and focus the field each time it opens.
  useEffect(() => {
    if (open) {
      setQuery(""); setActiveIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? items.filter(i => i.haystack.includes(q)) : items;
    return rows.slice(0, 50);
  }, [items, query]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const go = (item: SearchItem) => { navigate(item.path); onClose(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[activeIndex]) go(results[activeIndex]); }
  };

  // Keep the highlighted row scrolled into view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 3, position: "fixed", top: { xs: 16, sm: 72 }, m: 0, alignSelf: "center" } }}
    >
      <Box sx={{ p: 1.5, borderBottom: `1px solid ${colors.gray200}` }}>
        <TextField
          inputRef={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search accounts, holdings, watchlists…"
          fullWidth
          variant="standard"
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ color: colors.gray400 }} />
              </InputAdornment>
            ),
            sx: { fontSize: "1rem", fontWeight: 500 },
          }}
        />
      </Box>

      <Box sx={{ maxHeight: 420, overflowY: "auto" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}><CircularProgress size={24} /></Box>
        ) : results.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5, px: 3 }}>
            <Typography sx={{ color: colors.gray400, fontSize: "0.9rem" }}>
              {query ? `No matches for "${query}"` : "Start typing to search"}
            </Typography>
          </Box>
        ) : (
          <List ref={listRef} dense sx={{ py: 0.5 }}>
            {results.map((item, idx) => {
              const meta = TYPE_META[item.type];
              const active = idx === activeIndex;
              return (
                <ListItemButton
                  key={item.key}
                  data-idx={idx}
                  selected={active}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => go(item)}
                  sx={{
                    mx: 1, borderRadius: 2, py: 0.75,
                    "&.Mui-selected": { bgcolor: colors.brandLight },
                    "&.Mui-selected:hover": { bgcolor: colors.brandLight },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Avatar sx={{ width: 30, height: 30, borderRadius: 2, bgcolor: alpha(colors.brand, 0.1), color: colors.brand }}>
                      {meta.icon}
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={item.sublabel}
                    primaryTypographyProps={{ fontSize: "0.88rem", fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ fontSize: "0.72rem", noWrap: true, sx: { textTransform: "capitalize" } }}
                  />
                  <Typography sx={{ fontSize: "0.65rem", fontWeight: 600, color: colors.gray400, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {meta.label}
                  </Typography>
                </ListItemButton>
              );
            })}
          </List>
        )}
      </Box>
    </Dialog>
  );
}

export default GlobalSearch;
