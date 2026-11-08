import { ConvexError } from "convex/values";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOAN_DAYS = 30;

/** Today as YYYY-MM-DD in UTC. Loans are counted in whole days. */
export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function checkRange(startDate: string, endDate: string, now = Date.now()) {
  if (!DAY.test(startDate) || !DAY.test(endDate) || Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) {
    throw new ConvexError("Dates must be YYYY-MM-DD.");
  }
  if (startDate < today(now)) throw new ConvexError("The loan can't start in the past.");
  if (endDate < startDate) throw new ConvexError("The return date is before the start date.");
  if (daysBetween(startDate, endDate) > MAX_LOAN_DAYS) throw new ConvexError(`Loans are limited to ${MAX_LOAN_DAYS} days.`);
}

/** Two inclusive day ranges share at least one day. */
export const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;
