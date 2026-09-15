/** The internal marker the backend uses to name its synthetic aggregate rows. */
const INTERNAL_MARKER = "_ACCT_";

function hasMarker(value: string | undefined | null): boolean {
  return !!value && value.toUpperCase().includes(INTERNAL_MARKER);
}

/**
 * The backend keeps a synthetic per-user roll-up account used to store net-worth aggregates. It is
 * never something the user created, so it must not surface in the UI — and it must never be summed
 * alongside the real accounts, or net worth would be counted twice.
 */
export function isInternalAccount(name: string | undefined | null): boolean {
  return hasMarker(name);
}

/**
 * The backend also stores a synthetic "Account Aggregate" holding (symbol `__ACCT__`) inside real
 * accounts to hold each account's roll-up. Like the aggregate account, it is internal and should
 * never be shown to the user.
 */
export function isInternalHolding(holding: { name?: string | null; symbol?: string | null }): boolean {
  return hasMarker(holding.symbol) || hasMarker(holding.name);
}
