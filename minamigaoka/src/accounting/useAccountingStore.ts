import { useEffect, useMemo, useState } from "react";
import { FIXED_CATEGORIES } from "./fixedCategories";
import type { AccountingStore, AccountingTransactionInput, TransactionType } from "./model";
import {
  createInitialAccountingAccounts,
  closeAccountingPeriodAndCarryOver,
  createAccountingTransaction,
  deleteAccountingTransaction,
  saveAccountingReportNote,
  saveAccountingAccount,
  startAccountingPeriod,
  subscribeAccountingStore,
  updateAccountingTransaction,
} from "./service";

export type TransactionInput = {
  periodId: string;
  type: TransactionType;
} & AccountingTransactionInput;

export type SaveAccountingAccountInput = {
  accountId?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type StartAccountingPeriodInput = {
  fiscalYear: number;
  openingBalances: Record<string, number>;
};

export const useAccountingStore = () => {
  const [store, setStore] = useState<AccountingStore>({ currentPeriodId: null, accounts: [], periods: [], reportNotes: [] });
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

  const accountsSorted = useMemo(() => store.accounts, [store.accounts]);

  const addTransaction = async (input: TransactionInput) => {
    await createAccountingTransaction(input);
  };

  const updateTransaction = async (transactionId: string, input: TransactionInput) => {
    await updateAccountingTransaction(transactionId, input);
  };

  const deleteTransaction = async (transactionId: string) => {
    await deleteAccountingTransaction(transactionId);
  };

  const saveAccount = async (input: SaveAccountingAccountInput) => {
    await saveAccountingAccount(input);
  };

  const saveReportNote = async (input: {
    periodId: string;
    type: "income" | "expense";
    categoryId: string;
    subjectId: string;
    note: string;
  }) => {
    await saveAccountingReportNote(input);
  };

  const createInitialAccounts = async () => {
    await createInitialAccountingAccounts();
  };

  const createPeriod = async (input: StartAccountingPeriodInput) => {
    await startAccountingPeriod(input);
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
    accountsSorted,
    categories: FIXED_CATEGORIES,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    saveAccountingReportNote: saveReportNote,
    saveAccountingAccount: saveAccount,
    createInitialAccountingAccounts: createInitialAccounts,
    startAccountingPeriod: createPeriod,
    closeCurrentPeriodAndCarryOver: closeCurrentPeriod,
  };
};
