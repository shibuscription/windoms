import { useEffect, useMemo, useState } from "react";
import { FIXED_CATEGORIES } from "./fixedCategories";
import type { AccountingStore, TransactionType } from "./model";
import {
  closeAccountingPeriodAndCarryOver,
  createAccountingTransaction,
  subscribeAccountingStore,
} from "./service";

export type TransactionInput = {
  periodId: string;
  type: TransactionType;
  date: string;
  source?: "manual" | "reimbursement" | "purchase";
  amount: number;
  categoryId?: string;
  memo?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  files?: File[];
};

export const useAccountingStore = () => {
  const [store, setStore] = useState<AccountingStore>({ currentPeriodId: null, periods: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeAccountingStore(
      (next) => {
        setStore(next);
        setLoading(false);
        setError(null);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const currentPeriod = useMemo(
    () => store.periods.find((item) => item.periodId === store.currentPeriodId) ?? null,
    [store]
  );

  const periodsSorted = useMemo(
    () => [...store.periods].sort((a, b) => b.fiscalYear - a.fiscalYear),
    [store.periods]
  );

  const addTransaction = async (input: TransactionInput) => {
    await createAccountingTransaction(input);
  };

  const closeCurrentPeriod = async () => {
    if (!currentPeriod || currentPeriod.state !== "editing") return;
    await closeAccountingPeriodAndCarryOver(currentPeriod);
  };

  return {
    loading,
    error,
    store,
    currentPeriod,
    periodsSorted,
    categories: FIXED_CATEGORIES,
    addTransaction,
    closeCurrentPeriodAndCarryOver: closeCurrentPeriod,
  };
};
