import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, hasFirebaseAppConfig, storage } from "../config/firebase";
import type {
  AccountingAttachment,
  AccountingPeriod,
  AccountingStore,
  AccountingTransaction,
  PeriodAccount,
  PeriodStatus,
  TransactionType,
} from "./model";

const periodsCollection = db ? collection(db, "accountingPeriods") : null;
const accountsCollection = db ? collection(db, "accountingAccounts") : null;
const periodAccountsCollection = db ? collection(db, "accountingPeriodAccounts") : null;
const transactionsCollection = db ? collection(db, "accountingTransactions") : null;

type AccountingPeriodDoc = {
  id: string;
  label: string;
  fiscalYear: number;
  startDate: string;
  endDate: string;
  state: PeriodStatus;
  createdAt: string;
  updatedAt: string;
};

type AccountingAccountDoc = {
  id: string;
  label: string;
  sortOrder: number;
};

type AccountingPeriodAccountDoc = {
  id: string;
  periodId: string;
  accountId: string;
  openingBalance: number;
};

type AccountingTransactionDoc = AccountingTransaction;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !periodsCollection || !accountsCollection || !periodAccountsCollection || !transactionsCollection) {
    throw new Error("Firebase 設定が未完了のため、会計データを Firestore で扱えません。");
  }
};

const ensureStorage = () => {
  if (!storage) {
    throw new Error("Firebase Storage が未設定のため、画像を保存できません。");
  }
};

const toIsoString = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date(0).toISOString();
};

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
};

const toNonNegativeNumber = (value: unknown): number => {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
};

const toPeriodState = (value: unknown): PeriodStatus => (value === "closed" ? "closed" : "editing");

const toAccountingPeriodDoc = (id: string, value: Record<string, unknown>): AccountingPeriodDoc => ({
  id,
  label: typeof value.label === "string" && value.label.trim() ? value.label : id,
  fiscalYear: Number.isFinite(typeof value.fiscalYear === "number" ? value.fiscalYear : Number(value.fiscalYear)) ? Number(value.fiscalYear) : 0,
  startDate: typeof value.startDate === "string" ? value.startDate : "",
  endDate: typeof value.endDate === "string" ? value.endDate : "",
  state: toPeriodState(value.state),
  createdAt: toIsoString(value.createdAt),
  updatedAt: toIsoString(value.updatedAt),
});

const toAccountingAccountDoc = (id: string, value: Record<string, unknown>): AccountingAccountDoc => ({
  id,
  label: typeof value.label === "string" && value.label.trim() ? value.label : id,
  sortOrder: Number.isFinite(typeof value.sortOrder === "number" ? value.sortOrder : Number(value.sortOrder)) ? Number(value.sortOrder) : 999,
});

const toAccountingPeriodAccountDoc = (id: string, value: Record<string, unknown>): AccountingPeriodAccountDoc | null => {
  const periodId = toOptionalString(value.periodId);
  const accountId = toOptionalString(value.accountId);
  if (!periodId || !accountId) return null;
  return {
    id,
    periodId,
    accountId,
    openingBalance: toNonNegativeNumber(value.openingBalance),
  };
};

const toAttachments = (value: unknown): AccountingAttachment[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const raw = item as Record<string, unknown>;
          const name = toOptionalString(raw.name);
          const downloadUrl = toOptionalString(raw.downloadUrl);
          const storagePath = toOptionalString(raw.storagePath);
          if (!name || !downloadUrl || !storagePath) return null;
          return {
            name,
            downloadUrl,
            storagePath,
            size: toNonNegativeNumber(raw.size),
            type: toOptionalString(raw.type) ?? "",
          };
        })
        .filter((item): item is AccountingAttachment => Boolean(item))
    : [];

const toTransactionSource = (value: unknown): AccountingTransaction["source"] =>
  value === "reimbursement" || value === "purchase" ? value : "manual";

const toAccountingTransactionDoc = (id: string, value: Record<string, unknown>): AccountingTransactionDoc | null => {
  const periodId = toOptionalString(value.periodId);
  const type = value.type;
  const date = toOptionalString(value.date);
  if (!periodId || !date) return null;
  if (type !== "income" && type !== "expense" && type !== "transfer") return null;

  return {
    id,
    periodId,
    type,
    date,
    amount: toNonNegativeNumber(value.amount),
    categoryId: toOptionalString(value.categoryId),
    memo: toOptionalString(value.memo),
    accountId: toOptionalString(value.accountId),
    fromAccountId: toOptionalString(value.fromAccountId),
    toAccountId: toOptionalString(value.toAccountId),
    createdAt: toIsoString(value.createdAt),
    updatedAt: toIsoString(value.updatedAt),
    source: toTransactionSource(value.source),
    attachments: toAttachments(value.attachments),
  };
};

const sanitizeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, "_");

const buildAccountingStore = (
  periods: AccountingPeriodDoc[],
  accounts: AccountingAccountDoc[],
  periodAccounts: AccountingPeriodAccountDoc[],
  transactions: AccountingTransactionDoc[],
): AccountingStore => {
  const accountsById = new Map(accounts.map((item) => [item.id, item]));
  const periodAccountsByPeriodId = new Map<string, PeriodAccount[]>();

  for (const item of periodAccounts) {
    const master = accountsById.get(item.accountId);
    const list = periodAccountsByPeriodId.get(item.periodId) ?? [];
    list.push({
      accountId: item.accountId,
      label: master?.label ?? item.accountId,
      sortOrder: master?.sortOrder ?? 999,
      openingBalance: item.openingBalance,
    });
    periodAccountsByPeriodId.set(item.periodId, list);
  }

  const transactionsByPeriodId = new Map<string, AccountingTransaction[]>();
  for (const item of transactions) {
    const list = transactionsByPeriodId.get(item.periodId) ?? [];
    list.push(item);
    transactionsByPeriodId.set(item.periodId, list);
  }

  const normalizedPeriods: AccountingPeriod[] = periods
    .map((period) => ({
      periodId: period.id,
      label: period.label,
      fiscalYear: period.fiscalYear,
      startDate: period.startDate,
      endDate: period.endDate,
      state: period.state,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      accounts: (periodAccountsByPeriodId.get(period.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
      transactions: (transactionsByPeriodId.get(period.id) ?? []).slice().sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
        return a.id.localeCompare(b.id);
      }),
    }))
    .sort((a, b) => b.fiscalYear - a.fiscalYear);

  const currentPeriod =
    normalizedPeriods.find((item) => item.state === "editing") ?? null;

  return {
    currentPeriodId: currentPeriod?.periodId ?? null,
    periods: normalizedPeriods,
  };
};

export const subscribeAccountingStore = (
  callback: (store: AccountingStore) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  let latestPeriods: AccountingPeriodDoc[] = [];
  let latestAccounts: AccountingAccountDoc[] = [];
  let latestPeriodAccounts: AccountingPeriodAccountDoc[] = [];
  let latestTransactions: AccountingTransactionDoc[] = [];
  let readyPeriods = false;
  let readyAccounts = false;
  let readyPeriodAccounts = false;
  let readyTransactions = false;

  const emit = () => {
    if (!readyPeriods || !readyAccounts || !readyPeriodAccounts || !readyTransactions) return;
    callback(buildAccountingStore(latestPeriods, latestAccounts, latestPeriodAccounts, latestTransactions));
  };

  const unsubscribes = [
    onSnapshot(
      query(periodsCollection!, orderBy("fiscalYear", "desc")),
      (snapshot) => {
        latestPeriods = snapshot.docs.map((item) => toAccountingPeriodDoc(item.id, item.data() as Record<string, unknown>));
        readyPeriods = true;
        emit();
      },
      (error) => onError?.(error instanceof Error ? error : new Error("accountingPeriods subscription failed")),
    ),
    onSnapshot(
      query(accountsCollection!, orderBy("sortOrder", "asc")),
      (snapshot) => {
        latestAccounts = snapshot.docs.map((item) => toAccountingAccountDoc(item.id, item.data() as Record<string, unknown>));
        readyAccounts = true;
        emit();
      },
      (error) => onError?.(error instanceof Error ? error : new Error("accountingAccounts subscription failed")),
    ),
    onSnapshot(
      periodAccountsCollection!,
      (snapshot) => {
        latestPeriodAccounts = snapshot.docs
          .map((item) => toAccountingPeriodAccountDoc(item.id, item.data() as Record<string, unknown>))
          .filter((item): item is AccountingPeriodAccountDoc => Boolean(item));
        readyPeriodAccounts = true;
        emit();
      },
      (error) => onError?.(error instanceof Error ? error : new Error("accountingPeriodAccounts subscription failed")),
    ),
    onSnapshot(
      transactionsCollection!,
      (snapshot) => {
        latestTransactions = snapshot.docs
          .map((item) => toAccountingTransactionDoc(item.id, item.data() as Record<string, unknown>))
          .filter((item): item is AccountingTransactionDoc => Boolean(item));
        readyTransactions = true;
        emit();
      },
      (error) => onError?.(error instanceof Error ? error : new Error("accountingTransactions subscription failed")),
    ),
  ];

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
};

export type CreateAccountingTransactionInput = {
  periodId: string;
  type: TransactionType;
  date: string;
  amount: number;
  categoryId?: string;
  memo?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  files?: File[];
  source?: AccountingTransaction["source"];
};

const uploadAttachments = async (transactionId: string, files: File[]): Promise<AccountingAttachment[]> => {
  if (files.length === 0) return [];
  ensureStorage();

  return Promise.all(
    files.map(async (file, index) => {
      const storagePath = `accountingTransactions/${transactionId}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
      const attachmentRef = ref(storage!, storagePath);
      await uploadBytes(attachmentRef, file, file.type ? { contentType: file.type } : undefined);
      const downloadUrl = await getDownloadURL(attachmentRef);
      return {
        name: file.name,
        size: file.size,
        type: file.type,
        downloadUrl,
        storagePath,
      };
    }),
  );
};

export const createAccountingTransaction = async (input: CreateAccountingTransactionInput): Promise<void> => {
  ensureDb();
  const transactionRef = doc(transactionsCollection!);
  const attachments =
    input.type === "transfer" ? [] : await uploadAttachments(transactionRef.id, input.files ?? []);

  await setDoc(transactionRef, {
    periodId: input.periodId,
    type: input.type,
    date: input.date,
    amount: input.amount,
    categoryId: input.type === "transfer" ? null : input.categoryId ?? null,
    memo: input.memo?.trim() ? input.memo : null,
    accountId: input.type === "transfer" ? null : input.accountId ?? null,
    fromAccountId: input.type === "transfer" ? input.fromAccountId ?? null : null,
    toAccountId: input.type === "transfer" ? input.toAccountId ?? null : null,
    attachments,
    source: input.source ?? "manual",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

const buildPeriodLabel = (fiscalYear: number): string => `${fiscalYear}年度`;

const buildPeriodRange = (fiscalYear: number) => ({
  startDate: `${fiscalYear}-04-01`,
  endDate: `${fiscalYear + 1}-03-31`,
});

export const closeAccountingPeriodAndCarryOver = async (period: AccountingPeriod): Promise<void> => {
  ensureDb();
  const editingSnapshot = await getDocs(query(periodsCollection!));
  const editingPeriods = editingSnapshot.docs.filter(
    (item) => toPeriodState((item.data() as Record<string, unknown>).state) === "editing",
  );
  if (editingPeriods.length !== 1 || editingPeriods[0]?.id !== period.periodId) {
    throw new Error("現在の期が更新されました。画面を再読み込みしてからやり直してください。");
  }

  const nextFiscalYear = period.fiscalYear + 1;
  const nextPeriodId = `fy-${nextFiscalYear}`;
  const nextPeriodRef = doc(periodsCollection!, nextPeriodId);
  const batch = writeBatch(db!);

  batch.set(
    doc(periodsCollection!, period.periodId),
    {
      state: "closed",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const nextRange = buildPeriodRange(nextFiscalYear);
  batch.set(
    nextPeriodRef,
    {
      label: buildPeriodLabel(nextFiscalYear),
      fiscalYear: nextFiscalYear,
      startDate: nextRange.startDate,
      endDate: nextRange.endDate,
      state: "editing",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  period.accounts.forEach((account) => {
    const periodAccountRef = doc(periodAccountsCollection!, `${nextPeriodId}_${account.accountId}`);
    const accountDelta = period.transactions.reduce((sum, transaction) => {
      if (transaction.type === "income") {
        return transaction.accountId === account.accountId ? sum + transaction.amount : sum;
      }
      if (transaction.type === "expense") {
        return transaction.accountId === account.accountId ? sum - transaction.amount : sum;
      }
      if (transaction.fromAccountId === account.accountId) return sum - transaction.amount;
      if (transaction.toAccountId === account.accountId) return sum + transaction.amount;
      return sum;
    }, 0);
    batch.set(
      periodAccountRef,
      {
        periodId: nextPeriodId,
        accountId: account.accountId,
        openingBalance: account.openingBalance + accountDelta,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};
