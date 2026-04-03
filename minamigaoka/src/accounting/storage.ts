import { FIXED_ACCOUNTS } from "./fixedAccounts";
import { buildAccountingFiscalYearRange, resolveAccountingFiscalYear } from "./fiscalYear";
import type { AccountingPeriod, AccountingStore, AccountingTransaction, PeriodAccount, PeriodStatus } from "./model";

export const ACCOUNTING_STORAGE_KEY = "windoms_minamigaoka_accounting_v1";

const currentFiscalYear = () => resolveAccountingFiscalYear(new Date());

const buildPeriodAccounts = (openingByKey?: Record<string, number>): PeriodAccount[] =>
  FIXED_ACCOUNTS.map((item) => ({
    accountId: item.accountId,
    label: item.name,
    sortOrder: item.sortOrder,
    openingBalance: openingByKey?.[item.accountId] ?? 0,
  }));

const createPeriod = (fiscalYear: number, accounts?: PeriodAccount[]): AccountingPeriod => {
  const periodId = `fy-${fiscalYear}`;
  const createdAt = new Date().toISOString();
  const range = buildAccountingFiscalYearRange(fiscalYear);
  return {
    periodId,
    label: `${fiscalYear}年度`,
    fiscalYear,
    startDate: range.startDate,
    endDate: range.endDate,
    state: "editing",
    accounts: accounts ?? buildPeriodAccounts(),
    transactions: [],
    createdAt,
    updatedAt: createdAt,
  };
};

const seedStore = (): AccountingStore => {
  const fiscalYear = currentFiscalYear();
  const period = createPeriod(fiscalYear);
  return {
    currentPeriodId: period.periodId,
    accounts: FIXED_ACCOUNTS,
    periods: [period],
  };
};

const isStoreShape = (value: unknown): value is AccountingStore => {
  if (!value || typeof value !== "object") return false;
  const store = value as AccountingStore;
  return Array.isArray(store.periods) && (typeof store.currentPeriodId === "string" || store.currentPeriodId === null);
};

export const loadAccountingStore = (): AccountingStore => {
  if (typeof window === "undefined") return seedStore();
  const raw = window.localStorage.getItem(ACCOUNTING_STORAGE_KEY);
  if (!raw) return seedStore();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoreShape(parsed)) return seedStore();
    const normalizedPeriods: AccountingPeriod[] = parsed.periods.map((period) => {
      const rawStatus = (period as { status?: string; state?: string }).status;
      const state: PeriodStatus =
        rawStatus === "open"
          ? "editing"
          : (period as { state?: string }).state === "closed"
            ? "closed"
            : "editing";
      return {
        ...period,
        state,
      };
    });
    return {
      ...parsed,
      periods: normalizedPeriods,
    };
  } catch {
    return seedStore();
  }
};

export const saveAccountingStore = (store: AccountingStore): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNTING_STORAGE_KEY, JSON.stringify(store));
};

export const replacePeriod = (store: AccountingStore, period: AccountingPeriod): AccountingStore => ({
  ...store,
  periods: store.periods.map((item) => (item.periodId === period.periodId ? period : item)),
});

export const addTransactionToPeriod = (
  store: AccountingStore,
  periodId: string,
  transaction: AccountingTransaction
): AccountingStore => {
  const period = store.periods.find((item) => item.periodId === periodId);
  if (!period) return store;
  const updated: AccountingPeriod = {
    ...period,
    transactions: [...period.transactions, transaction],
  };
  return replacePeriod(store, updated);
};

export const buildNextPeriodFromBalances = (
  nextFiscalYear: number,
  closingByAccountKey: Record<string, number>
): AccountingPeriod => {
  const accounts = buildPeriodAccounts(closingByAccountKey);
  return createPeriod(nextFiscalYear, accounts);
};
