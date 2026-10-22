/**
 * Credit card bill dates. The backend does not store a bill date, so the day-of-month each card
 * bills on is configured here, keyed by the account name (matched case-insensitively, trimmed).
 * Keys are matched against the whole name first, then as a substring of it, so a card can be keyed
 * by its last four digits.
 */
const BILL_DAYS: Record<string, number> = {
  "2293": 21,
  "9517": 10,
  "6769": 15,
  "6004": 28,
  "0006": 28,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function billDayFor(accountName: string | undefined | null): number | undefined {
  if (!accountName) return undefined;
  const name = accountName.trim().toLowerCase();
  const exact = BILL_DAYS[name];
  if (exact !== undefined) return exact;
  const key = Object.keys(BILL_DAYS).find(k => name.includes(k.toLowerCase()));
  return key === undefined ? undefined : BILL_DAYS[key];
}

/**
 * The next time the card bills, today included. A bill day past the length of the month lands on
 * that month's last day (a 31st bill day bills on Feb 28, or 29 in a leap year).
 */
export function nextBillDate(billDay: number, from: Date = new Date()): Date {
  const today = startOfDay(from);
  const clamped = (year: number, month: number) =>
    new Date(year, month, Math.min(billDay, daysInMonth(year, month)));
  const thisMonth = clamped(today.getFullYear(), today.getMonth());
  if (thisMonth >= today) return thisMonth;
  return clamped(today.getFullYear(), today.getMonth() + 1);
}

/** "Today", "Tomorrow", "10 Nov", or "10 Nov 2027" once the date falls in another year. */
export function formatBillDate(date: Date, from: Date = new Date()): string {
  const today = startOfDay(from);
  const days = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

/** The label to show on a credit card account, or null when no bill day is configured. */
export function nextBillLabel(accountName: string, from: Date = new Date()): string | null {
  const day = billDayFor(accountName);
  if (day === undefined) return null;
  return formatBillDate(nextBillDate(day, from), from);
}
