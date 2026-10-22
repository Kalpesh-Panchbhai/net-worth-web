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

/** The most recent bill day, today included — the bill that may still be sitting unpaid. */
function lastBillDate(billDay: number, from: Date): Date {
  const next = nextBillDate(billDay, from);
  if (next.getTime() === startOfDay(from).getTime()) return next;
  const year = next.getFullYear();
  const month = next.getMonth() - 1;
  return new Date(year, month, Math.min(billDay, daysInMonth(year, month)));
}

/** "21 Nov", or "21 Nov 2027" once the date falls in another year. */
export function formatBillDate(date: Date, from: Date = new Date()): string {
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === startOfDay(from).getFullYear() ? label : `${label} ${date.getFullYear()}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** Days a bill gets to be paid once it is generated. */
export const BILL_PAYMENT_WINDOW_DAYS = 20;

export type BillState = "upcoming" | "paid" | "due" | "overdue";

export interface BillStatus {
  label: string;
  state: BillState;
  /** Days until the payment due date; negative once it has passed. Null while `upcoming`. */
  daysToDue: number | null;
}

/**
 * What to show on a credit card: the bill it is currently paying off, or the next one to come.
 * A bill generated on the bill day is due `BILL_PAYMENT_WINDOW_DAYS` later; a zero balance inside
 * that window means it has been paid. `balance` is the account's value, in either sign.
 */
export function billStatus(
  accountName: string,
  balance: number,
  from: Date = new Date(),
): BillStatus | null {
  const day = billDayFor(accountName);
  if (day === undefined) return null;

  const due = addDays(lastBillDate(day, from), BILL_PAYMENT_WINDOW_DAYS);
  const daysToDue = daysBetween(from, due);

  // Past the due date the last bill is settled either way, so look ahead to the next one.
  if (daysToDue < 0 && Math.abs(balance) < 0.01) {
    const next = nextBillDate(day, from);
    return { label: `Next bill on ${formatBillDate(next, from)}`, state: "upcoming", daysToDue: null };
  }

  if (Math.abs(balance) < 0.01) {
    const next = nextBillDate(day, addDays(from, 1));
    return { label: `Paid · next bill on ${formatBillDate(next, from)}`, state: "paid", daysToDue };
  }
  if (daysToDue < 0) return { label: "Overdue", state: "overdue", daysToDue };
  if (daysToDue === 0) return { label: "Due today", state: "due", daysToDue };
  if (daysToDue === 1) return { label: "Due tomorrow", state: "due", daysToDue };
  return { label: `Due in ${daysToDue} days`, state: "due", daysToDue };
}

function addDays(d: Date, n: number): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + n);
  return out;
}
