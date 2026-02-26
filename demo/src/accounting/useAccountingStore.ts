import { useMemo, useState } from "react";
import { balancesByAccount } from "./calc";
import { FIXED_SUBJECTS } from "./fixedSubjects";
import type { AccountingPeriod, AccountingStore, AccountingTransaction, TransactionType } from "./model";
import {
  addTransactionToPeriod,
  buildNextPeriodFromBalances,
  loadAccountingStore,
  replacePeriod,
  saveAccountingStore,
} from "./storage";

const withPersist = (
  current: AccountingStore,
  setter: (next: AccountingStore) => void,
  updater: (store: AccountingStore) => AccountingStore
) => {
  const next = updater(current);
  setter(next);
  saveAccountingStore(next);
};

const generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export type TransactionInput = {
  periodId: string;
  type: TransactionType;
  date: string;
  amount: number;
  subjectId: string;
  memo?: string;
  accountKey?: string;
  fromAccountKey?: string;
  toAccountKey?: string;
};

export const useAccountingStore = () => {
  const [store, setStore] = useState<AccountingStore>(() => loadAccountingStore());

  const currentPeriod = useMemo(
    () => store.periods.find((item) => item.periodId === store.currentPeriodId) ?? store.periods[0],
    [store]
  );

  const periodsSorted = useMemo(
    () => [...store.periods].sort((a, b) => b.fiscalYear - a.fiscalYear),
    [store.periods]
  );

  const addTransaction = (input: TransactionInput) => {
    const transaction: AccountingTransaction = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      date: input.date,
      type: input.type,
      amount: input.amount,
      subjectId: input.subjectId,
      memo: input.memo?.trim() || undefined,
      accountKey: input.accountKey,
      fromAccountKey: input.fromAccountKey,
      toAccountKey: input.toAccountKey,
    };

    withPersist(store, setStore, (prev) => addTransactionToPeriod(prev, input.periodId, transaction));
  };

  const updatePeriodAccount = (
    periodId: string,
    accountKey: string,
    patch: { label?: string; openingBalance?: number }
  ) => {
    const period = store.periods.find((item) => item.periodId === periodId);
    if (!period) return;
    const next: AccountingPeriod = {
      ...period,
      accounts: period.accounts.map((account) =>
        account.accountKey === accountKey
          ? {
              ...account,
              label: patch.label ?? account.label,
              openingBalance: patch.openingBalance ?? account.openingBalance,
            }
          : account
      ),
    };
    withPersist(store, setStore, (prev) => replacePeriod(prev, next));
  };

  const closeCurrentPeriodAndCarryOver = () => {
    if (!currentPeriod || currentPeriod.status !== "open") return;
    const closingMap = balancesByAccount(currentPeriod);
    const closed: AccountingPeriod = { ...currentPeriod, status: "closed" };
    const nextPeriod = buildNextPeriodFromBalances(closed.fiscalYear + 1, closingMap);
    withPersist(store, setStore, (prev) => {
      const withClosed = replacePeriod(prev, closed);
      return {
        ...withClosed,
        currentPeriodId: nextPeriod.periodId,
        periods: [...withClosed.periods, nextPeriod],
      };
    });
  };

  const reopenPeriod = (periodId: string): { ok: boolean; reason?: string } => {
    const period = store.periods.find((item) => item.periodId === periodId);
    if (!period || period.status !== "closed") return { ok: false, reason: "対象期が見つかりません" };
    const next = store.periods.find((item) => item.fiscalYear === period.fiscalYear + 1);
    if (next && next.transactions.length > 0) {
      return { ok: false, reason: "次期に取引が存在するため、締め解除できません" };
    }
    const reopened: AccountingPeriod = { ...period, status: "open" };
    withPersist(store, setStore, (prev) => replacePeriod(prev, reopened));
    return { ok: true };
  };

  const setCurrentPeriod = (periodId: string) => {
    const exists = store.periods.some((item) => item.periodId === periodId);
    if (!exists) return;
    withPersist(store, setStore, (prev) => ({ ...prev, currentPeriodId: periodId }));
  };

  return {
    store,
    currentPeriod,
    periodsSorted,
    subjects: FIXED_SUBJECTS,
    addTransaction,
    updatePeriodAccount,
    closeCurrentPeriodAndCarryOver,
    reopenPeriod,
    setCurrentPeriod,
  };
};
