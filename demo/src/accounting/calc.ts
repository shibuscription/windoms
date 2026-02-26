import { FIXED_CATEGORIES } from "./fixedCategories";
import { FIXED_SUBJECTS } from "./fixedSubjects";
import type {
  AccountingPeriod,
  AccountingTransaction,
  CategoryDefinition,
  SubjectDefinition,
  TransactionType,
} from "./model";

type SubjectSummary = {
  subjectId: string;
  label: string;
  amount: number;
};

type CategorySummary = {
  categoryId: string;
  label: string;
  amount: number;
  subjects: SubjectSummary[];
};

export type LedgerRow = {
  transactionId: string;
  date: string;
  kindLabel: string;
  subjectLabel: string;
  memo: string;
  signedAmount: number;
  balance: number;
};

export const sortTransactions = (transactions: AccountingTransaction[]): AccountingTransaction[] =>
  [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });

const kindLabel = (type: TransactionType, accountDelta: number): string => {
  if (type === "income") return "収入";
  if (type === "expense") return "支出";
  return accountDelta >= 0 ? "振替（入金）" : "振替（出金）";
};

const findSubject = (subjectId: string): SubjectDefinition | undefined =>
  FIXED_SUBJECTS.find((item) => item.subjectId === subjectId);

const findCategory = (categoryId: string): CategoryDefinition | undefined =>
  FIXED_CATEGORIES.find((item) => item.categoryId === categoryId);

export const accountDeltaForTransaction = (
  accountKey: string,
  transaction: AccountingTransaction
): number => {
  if (transaction.type === "income") {
    return transaction.accountKey === accountKey ? transaction.amount : 0;
  }
  if (transaction.type === "expense") {
    return transaction.accountKey === accountKey ? -transaction.amount : 0;
  }
  if (transaction.fromAccountKey === accountKey) return -transaction.amount;
  if (transaction.toAccountKey === accountKey) return transaction.amount;
  return 0;
};

export const closingBalanceForAccount = (period: AccountingPeriod, accountKey: string): number => {
  const account = period.accounts.find((item) => item.accountKey === accountKey);
  if (!account) return 0;
  const delta = period.transactions.reduce(
    (sum, transaction) => sum + accountDeltaForTransaction(accountKey, transaction),
    0
  );
  return account.openingBalance + delta;
};

export const balancesByAccount = (period: AccountingPeriod): Record<string, number> => {
  const result: Record<string, number> = {};
  period.accounts.forEach((account) => {
    result[account.accountKey] = closingBalanceForAccount(period, account.accountKey);
  });
  return result;
};

export const totalOpeningBalance = (period: AccountingPeriod): number =>
  period.accounts.reduce((sum, account) => sum + account.openingBalance, 0);

export const totalClosingBalance = (period: AccountingPeriod): number => {
  const map = balancesByAccount(period);
  return Object.values(map).reduce((sum, value) => sum + value, 0);
};

export const totalIncome = (period: AccountingPeriod): number =>
  period.transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

export const totalExpense = (period: AccountingPeriod): number =>
  period.transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

export const ledgerRowsForAccount = (period: AccountingPeriod, accountKey: string): LedgerRow[] => {
  const account = period.accounts.find((item) => item.accountKey === accountKey);
  if (!account) return [];
  let running = account.openingBalance;
  return sortTransactions(period.transactions)
    .map((transaction) => {
      const delta = accountDeltaForTransaction(accountKey, transaction);
      if (delta === 0) return null;
      running += delta;
      const subject = transaction.type === "transfer" ? undefined : findSubject(transaction.subjectId);
      return {
        transactionId: transaction.id,
        date: transaction.date,
        kindLabel: kindLabel(transaction.type, delta),
        subjectLabel: transaction.type === "transfer" ? "-" : subject?.label ?? transaction.subjectId,
        memo: transaction.memo ?? "",
        signedAmount: delta,
        balance: running,
      };
    })
    .filter((item): item is LedgerRow => Boolean(item));
};

export const reportCategorySummary = (
  period: AccountingPeriod,
  type: "income" | "expense"
): CategorySummary[] => {
  const subjectTotals = new Map<string, number>();
  period.transactions
    .filter((item) => item.type === type)
    .forEach((transaction) => {
      const current = subjectTotals.get(transaction.subjectId) ?? 0;
      subjectTotals.set(transaction.subjectId, current + transaction.amount);
    });

  const byCategory = new Map<string, SubjectSummary[]>();
  subjectTotals.forEach((amount, subjectId) => {
    const subject = findSubject(subjectId);
    if (!subject) return;
    const list = byCategory.get(subject.categoryId) ?? [];
    list.push({ subjectId, label: subject.label, amount });
    byCategory.set(subject.categoryId, list);
  });

  return [...byCategory.entries()]
    .map(([categoryId, subjects]) => {
      const category = findCategory(categoryId);
      const sortedSubjects = subjects.sort((a, b) => {
        const sa = findSubject(a.subjectId)?.sortOrder ?? 999;
        const sb = findSubject(b.subjectId)?.sortOrder ?? 999;
        return sa - sb;
      });
      return {
        categoryId,
        label: category?.label ?? categoryId,
        amount: sortedSubjects.reduce((sum, item) => sum + item.amount, 0),
        subjects: sortedSubjects,
      };
    })
    .sort((a, b) => {
      const ca = findCategory(a.categoryId)?.sortOrder ?? 999;
      const cb = findCategory(b.categoryId)?.sortOrder ?? 999;
      return ca - cb;
    });
};

export const expenseTopSubjects = (period: AccountingPeriod, limit = 5): SubjectSummary[] => {
  const map = new Map<string, number>();
  period.transactions
    .filter((item) => item.type === "expense")
    .forEach((transaction) => {
      const current = map.get(transaction.subjectId) ?? 0;
      map.set(transaction.subjectId, current + transaction.amount);
    });
  return [...map.entries()]
    .map(([subjectId, amount]) => {
      const subject = findSubject(subjectId);
      return { subjectId, label: subject?.label ?? subjectId, amount };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

