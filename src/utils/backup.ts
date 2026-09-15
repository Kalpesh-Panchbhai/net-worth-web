import {
  getAccounts, getHoldings, getTransactions, getWatchlists, getWatchlistAccounts,
  getIncomeSources, getIncomeTags, getIncomes,
  createAccount, createHolding, createTransaction, createWatchlist, linkWatchlistAccount,
  createIncomeSource, createIncomeTag, createIncome, setDefaultIncomeSource, setDefaultIncomeTag,
  invalidateCache,
} from "../api/client";
import { isInternalAccount, isInternalHolding } from "./account";
import type { AccountType, Transaction } from "../api/types";

export const BACKUP_VERSION = 1;

interface BackupHolding {
  name: string;
  symbol: string;
  transactions: Transaction[];
}

interface BackupAccount {
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  needsDailyData: boolean;
  investable: boolean;
  holdings: BackupHolding[];
}

interface BackupWatchlist {
  name: string;
  /** Names of the accounts linked to this watchlist (matched back up on restore). */
  accountNames: string[];
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  preferredCurrency: string;
  accounts: BackupAccount[];
  watchlists: BackupWatchlist[];
  incomeSources: { name: string; isDefault: boolean }[];
  incomeTags: { name: string; isDefault: boolean }[];
  incomes: {
    sourceName: string;
    tagName: string;
    netAmount: number;
    taxPaid: number;
    currency: string;
    creditedDate: string;
  }[];
}

export interface ImportSummary {
  accounts: number;
  holdings: number;
  transactions: number;
  watchlists: number;
  incomeSources: number;
  incomeTags: number;
  incomes: number;
  errors: string[];
}

/** Gathers the user's entire dataset into a single serialisable object. */
export async function exportData(userId: number, preferredCurrency: string): Promise<BackupFile> {
  const [allAccounts, watchlists, incomeSources, incomeTags, incomes] = await Promise.all([
    getAccounts(userId), getWatchlists(userId), getIncomeSources(userId), getIncomeTags(userId), getIncomes(userId),
  ]);

  // The synthetic aggregate account is maintained by the backend, not the user, so it is neither
  // exported nor restored.
  const accounts = allAccounts.filter(a => !isInternalAccount(a.name));
  const accountById = new Map(accounts.map(a => [a.id, a]));

  const backupAccounts: BackupAccount[] = await Promise.all(accounts.map(async (a) => {
    const holdings = (await getHoldings(a.id)).filter(h => !isInternalHolding(h));
    const backupHoldings: BackupHolding[] = await Promise.all(holdings.map(async (h) => ({
      name: h.name,
      symbol: h.symbol,
      transactions: (await getTransactions({ holdingId: h.id })).slice().sort((x, y) => x.txnDate.localeCompare(y.txnDate)),
    })));
    return {
      name: a.name, type: a.type, currency: a.currency,
      isActive: a.isActive, needsDailyData: a.needsDailyData,
      investable: a.type === "BROKER" || a.needsDailyData,
      holdings: backupHoldings,
    };
  }));

  const backupWatchlists: BackupWatchlist[] = await Promise.all(watchlists.map(async (w) => ({
    name: w.name,
    accountNames: (await getWatchlistAccounts(w.id))
      .map(link => accountById.get(link.id)?.name)
      .filter((n): n is string => !!n),
  })));

  const sourceById = new Map(incomeSources.map(s => [s.id, s.name]));
  const tagById = new Map(incomeTags.map(t => [t.id, t.name]));

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    preferredCurrency,
    accounts: backupAccounts,
    watchlists: backupWatchlists,
    incomeSources: incomeSources.map(s => ({ name: s.name, isDefault: s.isDefault })),
    incomeTags: incomeTags.map(t => ({ name: t.name, isDefault: t.isDefault })),
    incomes: incomes.map(i => ({
      sourceName: sourceById.get(i.incomeSourceId) ?? "",
      tagName: tagById.get(i.incomeTagId) ?? "",
      netAmount: i.netAmount,
      taxPaid: i.taxPaid,
      currency: i.currency,
      creditedDate: i.creditedDate,
    })),
  };
}

/** Triggers a browser download of the backup as a JSON file. */
export function downloadBackup(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `net-worth-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !Array.isArray(data.accounts)) {
    throw new Error("This file is not a valid Net Worth backup.");
  }
  if (data.version > BACKUP_VERSION) {
    throw new Error("This backup was created by a newer version of the app.");
  }
  return data as BackupFile;
}

/**
 * Additive restore: everything in the backup is re-created under the current user, with fresh ids.
 * It does NOT delete or overwrite existing data, so importing into a non-empty account creates
 * duplicates — the caller must confirm that with the user first. Transactions are replayed in date
 * order using "add" mode so each holding's running totals rebuild exactly.
 */
export async function importData(userId: number, backup: BackupFile): Promise<ImportSummary> {
  const summary: ImportSummary = {
    accounts: 0, holdings: 0, transactions: 0, watchlists: 0,
    incomeSources: 0, incomeTags: 0, incomes: 0, errors: [],
  };

  const sourceIdByName = new Map<string, number>();
  const tagIdByName = new Map<string, number>();
  const accountIdByName = new Map<string, number>();

  // Income sources & tags first — incomes reference them by name.
  for (const s of backup.incomeSources ?? []) {
    try {
      const created = await createIncomeSource(userId, s.name, s.isDefault);
      sourceIdByName.set(s.name, created.id);
      if (s.isDefault) await setDefaultIncomeSource(created.id).catch(() => {});
      summary.incomeSources++;
    } catch (e) { summary.errors.push(`Income source "${s.name}": ${msg(e)}`); }
  }
  for (const t of backup.incomeTags ?? []) {
    try {
      const created = await createIncomeTag(userId, t.name, t.isDefault);
      tagIdByName.set(t.name, created.id);
      if (t.isDefault) await setDefaultIncomeTag(created.id).catch(() => {});
      summary.incomeTags++;
    } catch (e) { summary.errors.push(`Income tag "${t.name}": ${msg(e)}`); }
  }

  // Accounts → holdings → transactions.
  for (const a of backup.accounts ?? []) {
    try {
      const created = await createAccount({
        userId, name: a.name, type: a.type as AccountType, currency: a.currency,
        isActive: a.isActive, needsDailyData: a.needsDailyData,
      });
      accountIdByName.set(a.name, created.id);
      summary.accounts++;

      for (const h of a.holdings ?? []) {
        try {
          const newHolding = await createHolding({ accountId: created.id, name: h.name, symbol: h.symbol });
          summary.holdings++;
          for (const t of h.transactions ?? []) {
            try {
              const valueDelta = t.valueDelta ?? t.value;
              const investedDelta = a.investable ? (t.investedDelta ?? t.invested) : valueDelta;
              await createTransaction({
                accountId: created.id, holdingId: newHolding.id, txnDate: t.txnDate,
                invested: round(investedDelta), value: round(valueDelta, a.investable ? 3 : 2),
                mode: "add",
              });
              summary.transactions++;
            } catch (e) { summary.errors.push(`Txn ${h.name} @ ${t.txnDate}: ${msg(e)}`); }
          }
        } catch (e) { summary.errors.push(`Holding "${h.name}": ${msg(e)}`); }
      }
    } catch (e) { summary.errors.push(`Account "${a.name}": ${msg(e)}`); }
  }

  // Watchlists and their account links.
  for (const w of backup.watchlists ?? []) {
    try {
      const created = await createWatchlist(userId, w.name);
      summary.watchlists++;
      for (const name of w.accountNames ?? []) {
        const accId = accountIdByName.get(name);
        if (accId) await linkWatchlistAccount(created.id, accId).catch(() => {});
      }
    } catch (e) { summary.errors.push(`Watchlist "${w.name}": ${msg(e)}`); }
  }

  // Incomes last, once their source/tag ids exist.
  for (const i of backup.incomes ?? []) {
    const sourceId = sourceIdByName.get(i.sourceName);
    const tagId = tagIdByName.get(i.tagName);
    if (sourceId == null || tagId == null) {
      summary.errors.push(`Income on ${i.creditedDate}: missing source/tag`);
      continue;
    }
    try {
      await createIncome({
        userId, incomeSourceId: sourceId, incomeTagId: tagId,
        netAmount: i.netAmount, taxPaid: i.taxPaid, currency: i.currency, creditedDate: i.creditedDate,
      });
      summary.incomes++;
    } catch (e) { summary.errors.push(`Income on ${i.creditedDate}: ${msg(e)}`); }
  }

  invalidateCache();
  return summary;
}

function round(v: number, digits = 2): number {
  return parseFloat(v.toFixed(digits));
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "failed";
}
