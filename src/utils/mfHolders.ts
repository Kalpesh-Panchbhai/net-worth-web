// Household ("account holder") model for the Mutual Fund Analyzer.
//
// The backend's pooled `getMfPortfolio` merges the same scheme held in several accounts into one
// row, which hides who actually owns what — so per-person attribution has to be rebuilt on the
// client from the per-account holdings (`getAccounts` + `getHoldings`), which are still split by
// account. Each account is assigned to a person by the user; a fund inherits its account's person.
//
// There is no MF-vs-stock flag on a holding, so the analyzer's own portfolio (which already
// classified every held fund) is the authoritative "is this a mutual fund" detector: a holding is
// treated as a fund only when its name matches one in the portfolio. That same match also enriches
// the holding with the fund's category and category ranking.

import type { AccountSummary, HoldingSummary, MfPortfolio, MfPortfolioHolding } from "../api/types";

/** A user-defined account holder (e.g. Self, Spouse). Ids are opaque and stable across renames. */
export interface Person {
  id: string;
  name: string;
}

/** Persisted in the per-user config store under `mf_holders`. */
export interface HoldersConfig {
  people: Person[];
  /** accountId (stringified, since JSON object keys are strings) → personId. */
  accountToPerson: Record<string, string>;
}

export const EMPTY_HOLDERS_CONFIG: HoldersConfig = { people: [], accountToPerson: {} };

export function newPersonId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Normalise a fund name so the analyzer's AMFI scheme name and the synced holding name (from the
 * broker) collapse to the same key. Plan/option words and punctuation carry no identity, so they
 * are stripped; what remains is the AMC + scheme identity, e.g.
 * "Parag Parikh Flexi Cap Fund - Direct Growth" → "parag parikh flexi cap".
 */
export function normalizeFundName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(direct|regular|growth|idcw|dividend|reinvestment|payout|plan|option|scheme|fund|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One held fund row kept at account granularity, enriched with the analyzer's category standing. */
export interface HolderHolding {
  account: AccountSummary;
  holding: HoldingSummary;
  mf: MfPortfolioHolding;
  /** Per-account current value / cost, in `holding.displayCurrency`. */
  value: number;
  invested: number;
}

/** All funds attributed to one person (or the unassigned bucket when `person` is null). */
export interface PersonGroup {
  person: Person | null;
  holdings: HolderHolding[];
  value: number;
  invested: number;
}

/** A fund held under accounts that belong to two or more different people. */
export interface DuplicatedFund {
  schemeCode: number;
  name: string;
  amc: string;
  subCategory: string;
  totalValue: number;
  perPerson: { person: Person | null; value: number }[];
}

export interface Household {
  groups: PersonGroup[];
  duplicated: DuplicatedFund[];
  totalValue: number;
  totalInvested: number;
  /** Distinct schemes matched into the household. */
  matchedFunds: number;
  /** Accounts that hold at least one matched fund — the only ones worth assigning. */
  accountsWithFunds: AccountSummary[];
  /** Value held under accounts not yet assigned to a person. */
  unassignedValue: number;
}

const UNASSIGNED_KEY = "__unassigned__";

/**
 * Rebuild the per-person household view from the raw per-account data. Pure and memo-friendly:
 * pass the fetched accounts, their holdings, the analyzer portfolio, and the saved assignment.
 */
export function buildHousehold(
  accounts: AccountSummary[],
  holdingsByAccount: Map<number, HoldingSummary[]>,
  pf: MfPortfolio,
  config: HoldersConfig,
): Household {
  // Analyzer portfolio → the set of names that count as funds, plus their enrichment.
  const mfByName = new Map<string, MfPortfolioHolding>();
  for (const h of pf.holdings) mfByName.set(normalizeFundName(h.name), h);

  const peopleById = new Map(config.people.map(p => [p.id, p]));
  const personFor = (accountId: number): Person | null => {
    const pid = config.accountToPerson[String(accountId)];
    return pid ? peopleById.get(pid) ?? null : null;
  };

  const groupsByKey = new Map<string, PersonGroup>();
  const dupByScheme = new Map<number, Map<string, { person: Person | null; value: number }>>();
  const accountsWithFunds: AccountSummary[] = [];
  let totalValue = 0;
  let totalInvested = 0;
  let unassignedValue = 0;

  for (const account of accounts) {
    const holdings = holdingsByAccount.get(account.id) ?? [];
    let accountHasFund = false;

    for (const holding of holdings) {
      const mf = mfByName.get(normalizeFundName(holding.name));
      if (!mf) continue; // not a fund the analyzer knows — treat as a stock / balance and skip.
      accountHasFund = true;

      const value = holding.currentDayValue;
      const invested = holding.invested;
      const person = personFor(account.id);
      const key = person ? person.id : UNASSIGNED_KEY;

      let group = groupsByKey.get(key);
      if (!group) { group = { person, holdings: [], value: 0, invested: 0 }; groupsByKey.set(key, group); }
      group.holdings.push({ account, holding, mf, value, invested });
      group.value += value;
      group.invested += invested;

      totalValue += value;
      totalInvested += invested;
      if (!person) unassignedValue += value;

      // Track distinct people per scheme, summing value when a person holds it in several accounts.
      let perPerson = dupByScheme.get(mf.schemeCode);
      if (!perPerson) { perPerson = new Map(); dupByScheme.set(mf.schemeCode, perPerson); }
      const existing = perPerson.get(key);
      if (existing) existing.value += value;
      else perPerson.set(key, { person, value });
    }

    if (accountHasFund) accountsWithFunds.push(account);
  }

  // People first (by value desc), unassigned bucket always last.
  const groups = [...groupsByKey.values()].sort((a, b) => {
    if (!a.person) return 1;
    if (!b.person) return -1;
    return b.value - a.value;
  });
  for (const g of groups) g.holdings.sort((a, b) => b.value - a.value);

  const duplicated: DuplicatedFund[] = [];
  for (const [schemeCode, perPerson] of dupByScheme) {
    if (perPerson.size < 2) continue;
    const mf = pf.holdings.find(h => h.schemeCode === schemeCode)!;
    const parts = [...perPerson.values()].sort((a, b) => b.value - a.value);
    duplicated.push({
      schemeCode,
      name: mf.name,
      amc: mf.amc,
      subCategory: mf.subCategory,
      totalValue: parts.reduce((s, p) => s + p.value, 0),
      perPerson: parts,
    });
  }
  duplicated.sort((a, b) => b.totalValue - a.totalValue);

  return {
    groups,
    duplicated,
    totalValue,
    totalInvested,
    matchedFunds: dupByScheme.size,
    accountsWithFunds,
    unassignedValue,
  };
}
