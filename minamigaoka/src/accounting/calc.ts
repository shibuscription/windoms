import { FIXED_CATEGORIES } from "./fixedCategories";
import { findAccountingSubject } from "./fixedSubjects";
import { accountingFiscalMonthLabels } from "./fiscalYear";
import type { AccountingPeriod, AccountingTransaction, CategoryDefinition, TransactionType } from "./model";

type CategoryItemSummary = {
  categoryId: string;
  label: string;
  amount: number;
};

type CategorySummary = {
  categoryId: string;
  label: string;
  amount: number;
  items: CategoryItemSummary[];
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

const findCategory = (categoryId: string): CategoryDefinition | undefined =>
  FIXED_CATEGORIES.find((item) => item.categoryId === categoryId);

const resolveStoredCategory = (
  storedCategoryId: string
): { parentCategoryId: string; itemId: string; label: string; sortOrder: number } => {
  const subject = findAccountingSubject(storedCategoryId);
  if (subject) {
    return {
      parentCategoryId: subject.categoryId,
      itemId: subject.subjectId,
      label: subject.label,
      sortOrder: subject.sortOrder,
    };
  }

  const category = findCategory(storedCategoryId);
  if (category) {
    return {
      parentCategoryId: category.categoryId,
      itemId: category.categoryId,
      label: category.label,
      sortOrder: category.sortOrder,
    };
  }

  return {
    parentCategoryId: storedCategoryId,
    itemId: storedCategoryId,
    label: storedCategoryId,
    sortOrder: 999,
  };
};

export const accountDeltaForTransaction = (
  accountId: string,
  transaction: AccountingTransaction
): number => {
  if (transaction.type === "income") {
    return transaction.accountId === accountId ? transaction.amount : 0;
  }
  if (transaction.type === "expense") {
    return transaction.accountId === accountId ? -transaction.amount : 0;
  }
  if (transaction.fromAccountId === accountId) return -transaction.amount;
  if (transaction.toAccountId === accountId) return transaction.amount;
  return 0;
};

export const closingBalanceForAccount = (period: AccountingPeriod, accountId: string): number => {
  const account = period.accounts.find((item) => item.accountId === accountId);
  if (!account) return 0;
  const delta = period.transactions.reduce(
    (sum, transaction) => sum + accountDeltaForTransaction(accountId, transaction),
    0
  );
  return account.openingBalance + delta;
};

export const balancesByAccount = (period: AccountingPeriod): Record<string, number> => {
  const result: Record<string, number> = {};
  period.accounts.forEach((account) => {
    result[account.accountId] = closingBalanceForAccount(period, account.accountId);
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

export const ledgerRowsForAccount = (period: AccountingPeriod, accountId: string): LedgerRow[] => {
  const account = period.accounts.find((item) => item.accountId === accountId);
  if (!account) return [];
  let running = account.openingBalance;
  return sortTransactions(period.transactions)
    .map((transaction) => {
      const delta = accountDeltaForTransaction(accountId, transaction);
      if (delta === 0) return null;
      running += delta;
      const category = transaction.type === "transfer" ? undefined : resolveStoredCategory(transaction.categoryId ?? "");
      return {
        transactionId: transaction.id,
        date: transaction.date,
        kindLabel: kindLabel(transaction.type, delta),
        subjectLabel: transaction.type === "transfer" ? "-" : category?.label ?? transaction.categoryId ?? "-",
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
  const byCategory = new Map<string, CategoryItemSummary[]>();
  period.transactions
    .filter((item) => item.type === type)
    .forEach((transaction) => {
      const categoryId = transaction.categoryId;
      if (!categoryId) return;
      const resolved = resolveStoredCategory(categoryId);
      const items = byCategory.get(resolved.parentCategoryId) ?? [];
      const existing = items.find((item) => item.categoryId === resolved.itemId);
      if (existing) {
        existing.amount += transaction.amount;
      } else {
        items.push({
          categoryId: resolved.itemId,
          label: resolved.label,
          amount: transaction.amount,
        });
      }
      byCategory.set(resolved.parentCategoryId, items);
    });

  return [...byCategory.entries()]
    .map(([categoryId, items]) => {
      const category = findCategory(categoryId);
      const sortedItems = items.sort((a, b) => {
        const ra = resolveStoredCategory(a.categoryId).sortOrder;
        const rb = resolveStoredCategory(b.categoryId).sortOrder;
        if (ra !== rb) return ra - rb;
        return a.label.localeCompare(b.label, "ja");
      });
      return {
        categoryId,
        label: category?.label ?? categoryId,
        amount: sortedItems.reduce((sum, item) => sum + item.amount, 0),
        items: sortedItems,
      };
    })
    .sort((a, b) => {
      const ca = findCategory(a.categoryId)?.sortOrder ?? 999;
      const cb = findCategory(b.categoryId)?.sortOrder ?? 999;
      return ca - cb;
    });
};

export const expenseTopSubjects = (period: AccountingPeriod, limit = 5): CategoryItemSummary[] => {
  const map = new Map<string, number>();
  period.transactions
    .filter((item) => item.type === "expense")
    .forEach((transaction) => {
      const categoryId = transaction.categoryId;
      if (!categoryId) return;
      const current = map.get(categoryId) ?? 0;
      map.set(categoryId, current + transaction.amount);
    });
  return [...map.entries()]
    .map(([categoryId, amount]) => {
      const resolved = resolveStoredCategory(categoryId);
      return { categoryId, label: resolved.label, amount };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

export const monthlyExpenseByMonth = (period: AccountingPeriod): { month: string; value: number }[] => {
  const result = new Map<string, number>();
  period.transactions
    .filter((item) => item.type === "expense")
    .forEach((transaction) => {
      const monthKey = transaction.date.slice(5, 7);
      if (!monthKey) return;
      result.set(monthKey, (result.get(monthKey) ?? 0) + transaction.amount);
    });

  return accountingFiscalMonthLabels().map(({ monthKey, label }) => ({
    month: label,
    value: result.get(monthKey) ?? 0,
  }));
};

export const transactionMemoSuggestions = (
  periods: AccountingPeriod[],
  type: "income" | "expense"
): string[] => {
  const suggestions: string[] = [];
  const seen = new Set<string>();

  periods
    .flatMap((period) => period.transactions)
    .filter((transaction) => transaction.type === type)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .forEach((transaction) => {
      const memo = transaction.memo?.trim();
      if (!memo || seen.has(memo)) return;
      seen.add(memo);
      suggestions.push(memo);
    });

  return suggestions;
};

