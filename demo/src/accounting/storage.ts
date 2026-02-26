import { FIXED_ACCOUNTS } from "./fixedAccounts";
import type { AccountingPeriod, AccountingStore, AccountingTransaction, PeriodAccount } from "./model";

export const ACCOUNTING_STORAGE_KEY = "windoms_demo_accounting_v1";

const currentFiscalYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month <= 3 ? year - 1 : year;
};

const buildPeriodAccounts = (openingByKey?: Record<string, number>): PeriodAccount[] =>
  FIXED_ACCOUNTS.map((item) => ({
    accountKey: item.accountKey,
    label: item.label,
    sortOrder: item.sortOrder,
    openingBalance: openingByKey?.[item.accountKey] ?? 0,
  }));

const createPeriod = (fiscalYear: number, accounts?: PeriodAccount[]): AccountingPeriod => {
  const periodId = `fy-${fiscalYear}`;
  const createdAt = new Date().toISOString();
  return {
    periodId,
    label: `${fiscalYear}年度`,
    fiscalYear,
    startDate: `${fiscalYear}-04-01`,
    endDate: `${fiscalYear + 1}-03-31`,
    status: "editing",
    accounts: accounts ?? buildPeriodAccounts(),
    transactions: [],
    createdAt,
  };
};

const seedStore = (): AccountingStore => {
  const fiscalYear = currentFiscalYear();
  const period = createPeriod(fiscalYear);
  return {
    version: 1,
    currentPeriodId: period.periodId,
    periods: [period],
  };
};

const isStoreShape = (value: unknown): value is AccountingStore => {
  if (!value || typeof value !== "object") return false;
  const store = value as AccountingStore;
  return store.version === 1 && Array.isArray(store.periods) && typeof store.currentPeriodId === "string";
};

export const loadAccountingStore = (): AccountingStore => {
  if (typeof window === "undefined") return seedStore();
  const raw = window.localStorage.getItem(ACCOUNTING_STORAGE_KEY);
  if (!raw) return seedStore();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoreShape(parsed)) return seedStore();
    const normalizedPeriods = parsed.periods.map((period) => {
      const rawStatus = (period as { status?: string }).status;
      return {
        ...period,
        status: rawStatus === "open" ? "editing" : period.status,
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
