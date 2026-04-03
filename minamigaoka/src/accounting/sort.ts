import type { AccountDefinition, PeriodAccount } from "./model";

const normalizedSortOrder = (value: number | undefined): number =>
  Number.isFinite(value) ? Number(value) : Number.MAX_SAFE_INTEGER;

export const compareAccountingAccounts = (a: AccountDefinition, b: AccountDefinition): number => {
  const sortDiff = normalizedSortOrder(a.sortOrder) - normalizedSortOrder(b.sortOrder);
  if (sortDiff !== 0) return sortDiff;
  const nameDiff = a.name.localeCompare(b.name, "ja");
  if (nameDiff !== 0) return nameDiff;
  return a.accountId.localeCompare(b.accountId, "en");
};

export const comparePeriodAccounts = (a: PeriodAccount, b: PeriodAccount): number => {
  const sortDiff = normalizedSortOrder(a.sortOrder) - normalizedSortOrder(b.sortOrder);
  if (sortDiff !== 0) return sortDiff;
  const nameDiff = a.label.localeCompare(b.label, "ja");
  if (nameDiff !== 0) return nameDiff;
  return a.accountId.localeCompare(b.accountId, "en");
};
