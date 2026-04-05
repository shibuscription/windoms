import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { db, hasFirebaseAppConfig, storage } from "../config/firebase";
import { uploadFilesToStorage } from "../uploads/storageUpload";
import { FIXED_ACCOUNTS } from "./fixedAccounts";
import { buildAccountingFiscalYearRange } from "./fiscalYear";
import { compareAccountingAccounts, comparePeriodAccounts } from "./sort";
import type {
  AccountDefinition,
  AccountingAttachment,
  AccountingPeriod,
  AccountingReportNote,
  AccountingStore,
  AccountingTransactionInput,
  AccountingTransaction,
  PeriodAccount,
  PeriodStatus,
  TransactionType,
} from "./model";

const periodsCollection = db ? collection(db, "accountingPeriods") : null;
const accountsCollection = db ? collection(db, "accountingAccounts") : null;
const periodAccountsCollection = db ? collection(db, "accountingPeriodAccounts") : null;
const transactionsCollection = db ? collection(db, "accountingTransactions") : null;
const reportNotesCollection = db ? collection(db, "accountingReportNotes") : null;

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
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type AccountingPeriodAccountDoc = {
  id: string;
  periodId: string;
  accountId: string;
  openingBalance: number;
};

type AccountingTransactionDoc = AccountingTransaction;

type AccountingReportNoteDoc = AccountingReportNote;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !periodsCollection || !accountsCollection || !periodAccountsCollection || !transactionsCollection || !reportNotesCollection) {
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
  name:
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : typeof value.label === "string" && value.label.trim()
        ? value.label.trim()
        : id,
  sortOrder: Number.isFinite(typeof value.sortOrder === "number" ? value.sortOrder : Number(value.sortOrder)) ? Number(value.sortOrder) : 999,
  isActive: value.isActive !== false,
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
          const storagePath = toOptionalString(raw.storagePath);
          if (!name || !storagePath) return null;
          const next: AccountingAttachment = {
            name,
            downloadUrl: toOptionalString(raw.downloadUrl),
            storagePath,
            size: toNonNegativeNumber(raw.size),
            type: toOptionalString(raw.type) ?? "",
          };
          return next;
        })
        .filter((item): item is AccountingAttachment => Boolean(item))
    : [];

const toTransactionSource = (value: unknown): AccountingTransaction["source"] =>
  value === "reimbursement" || value === "purchase" || value === "lunch" ? value : "manual";

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

const toAccountingReportNoteDoc = (id: string, value: Record<string, unknown>): AccountingReportNoteDoc | null => {
  const periodId = toOptionalString(value.periodId);
  const type = value.type;
  const categoryId = toOptionalString(value.categoryId);
  const subjectId = toOptionalString(value.subjectId);
  const note = typeof value.note === "string" ? value.note : "";
  if (!periodId || !categoryId || !subjectId) return null;
  if (type !== "income" && type !== "expense") return null;

  return {
    id,
    periodId,
    type,
    categoryId,
    subjectId,
    note,
    createdAt: toIsoString(value.createdAt),
    updatedAt: toIsoString(value.updatedAt),
  };
};

const buildAccountingStore = (
  periods: AccountingPeriodDoc[],
  accounts: AccountingAccountDoc[],
  periodAccounts: AccountingPeriodAccountDoc[],
  transactions: AccountingTransactionDoc[],
  reportNotes: AccountingReportNoteDoc[],
): AccountingStore => {
  const normalizedAccounts: AccountDefinition[] = accounts
    .map((item) => ({
      accountId: item.id,
      name: item.name,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    }))
    .sort(compareAccountingAccounts);
  const accountsById = new Map(normalizedAccounts.map((item) => [item.accountId, item]));
  const periodAccountsByPeriodId = new Map<string, PeriodAccount[]>();

  for (const item of periodAccounts) {
    const master = accountsById.get(item.accountId);
    const list = periodAccountsByPeriodId.get(item.periodId) ?? [];
    list.push({
      accountId: item.accountId,
      label: master?.name ?? item.accountId,
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
      accounts: (periodAccountsByPeriodId.get(period.id) ?? []).slice().sort(comparePeriodAccounts),
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
    accounts: normalizedAccounts,
    periods: normalizedPeriods,
    reportNotes: reportNotes
      .slice()
      .sort((a, b) => {
        if (a.periodId !== b.periodId) return a.periodId.localeCompare(b.periodId);
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        if (a.categoryId !== b.categoryId) return a.categoryId.localeCompare(b.categoryId);
        return a.subjectId.localeCompare(b.subjectId);
      }),
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
  let latestReportNotes: AccountingReportNoteDoc[] = [];
  let readyPeriods = false;
  let readyAccounts = false;
  let readyPeriodAccounts = false;
  let readyTransactions = false;
  let readyReportNotes = false;

  const emit = () => {
    if (!readyPeriods || !readyAccounts || !readyPeriodAccounts || !readyTransactions || !readyReportNotes) return;
    callback(buildAccountingStore(latestPeriods, latestAccounts, latestPeriodAccounts, latestTransactions, latestReportNotes));
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
    onSnapshot(
      reportNotesCollection!,
      (snapshot) => {
        latestReportNotes = snapshot.docs
          .map((item) => toAccountingReportNoteDoc(item.id, item.data() as Record<string, unknown>))
          .filter((item): item is AccountingReportNoteDoc => Boolean(item));
        readyReportNotes = true;
        emit();
      },
      (error) => onError?.(error instanceof Error ? error : new Error("accountingReportNotes subscription failed")),
    ),
  ];

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
};

export type CreateAccountingTransactionInput = {
  periodId: string;
  type: TransactionType;
} & AccountingTransactionInput;

export type SaveAccountingAccountInput = {
  accountId?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type SaveAccountingReportNoteInput = {
  periodId: string;
  type: "income" | "expense";
  categoryId: string;
  subjectId: string;
  note: string;
};

const uploadAttachments = async (transactionId: string, files: File[]): Promise<AccountingAttachment[]> => {
  if (files.length === 0) return [];
  ensureStorage();
  return uploadFilesToStorage(storage!, `accountingTransactions/${transactionId}`, files);
};

export const getCurrentEditingAccountingPeriodId = async (): Promise<string> => {
  ensureDb();
  const snapshot = await getDocs(query(periodsCollection!, orderBy("fiscalYear", "desc")));
  const period = snapshot.docs
    .map((item) => toAccountingPeriodDoc(item.id, item.data() as Record<string, unknown>))
    .find((item) => item.state === "editing");
  if (!period) {
    throw new Error("現在の会計期が見つかりません。");
  }
  return period.id;
};

export const createAccountingTransaction = async (input: CreateAccountingTransactionInput): Promise<string> => {
  ensureDb();
  const transactionRef = input.transactionId
    ? doc(transactionsCollection!, input.transactionId)
    : doc(transactionsCollection!);
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
  return transactionRef.id;
};

export const updateAccountingTransaction = async (
  transactionId: string,
  input: CreateAccountingTransactionInput,
): Promise<void> => {
  ensureDb();
  const transactionRef = doc(transactionsCollection!, transactionId);
  const snapshot = await getDoc(transactionRef);
  if (!snapshot.exists()) {
    throw new Error("更新対象の明細が見つかりません。");
  }

  const current = toAccountingTransactionDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
  if (!current) {
    throw new Error("更新対象の明細が読み込めませんでした。");
  }

  const nextAttachments =
    input.type === "transfer"
      ? []
      : [
          ...(current.attachments ?? []),
          ...(await uploadAttachments(transactionId, input.files ?? [])),
        ];

  await setDoc(
    transactionRef,
    {
      periodId: input.periodId,
      type: input.type,
      date: input.date,
      amount: input.amount,
      categoryId: input.type === "transfer" ? null : input.categoryId ?? null,
      memo: input.memo?.trim() ? input.memo : null,
      accountId: input.type === "transfer" ? null : input.accountId ?? null,
      fromAccountId: input.type === "transfer" ? input.fromAccountId ?? null : null,
      toAccountId: input.type === "transfer" ? input.toAccountId ?? null : null,
      attachments: nextAttachments,
      source: input.source ?? current.source ?? "manual",
      createdAt: current.createdAt,
      updatedAt: serverTimestamp(),
    },
    { merge: false },
  );
};

export const deleteAccountingTransaction = async (transactionId: string): Promise<void> => {
  ensureDb();
  const transactionRef = doc(transactionsCollection!, transactionId);
  const snapshot = await getDoc(transactionRef);
  if (!snapshot.exists()) {
    return;
  }

  const current = toAccountingTransactionDoc(snapshot.id, snapshot.data() as Record<string, unknown>);
  if (!current) {
    await deleteDoc(transactionRef);
    return;
  }

  if (storage && current.attachments?.length) {
    await Promise.all(
      current.attachments.map(async (attachment) => {
        try {
          await deleteObject(ref(storage!, attachment.storagePath));
        } catch {
          return;
        }
      }),
    );
  }

  await deleteDoc(transactionRef);
};

export const saveAccountingAccount = async (input: SaveAccountingAccountInput): Promise<void> => {
  ensureDb();
  const accountRef = input.accountId ? doc(accountsCollection!, input.accountId) : doc(accountsCollection!);
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedAt: serverTimestamp(),
  };
  if (!input.accountId) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(
    accountRef,
    payload,
    { merge: true },
  );
};

export const saveAccountingReportNote = async (input: SaveAccountingReportNoteInput): Promise<void> => {
  ensureDb();
  const noteId = `${input.periodId}_${input.type}_${input.subjectId}`;
  const noteRef = doc(reportNotesCollection!, noteId);
  const normalizedNote = input.note.trim();

  if (!normalizedNote) {
    const existing = await getDoc(noteRef);
    if (existing.exists()) {
      await deleteDoc(noteRef);
    }
    return;
  }

  const existing = await getDoc(noteRef);
  const payload: Record<string, unknown> = {
    periodId: input.periodId,
    type: input.type,
    categoryId: input.categoryId,
    subjectId: input.subjectId,
    note: normalizedNote,
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(
    noteRef,
    payload,
    { merge: true },
  );
};

export const createInitialAccountingAccounts = async (): Promise<void> => {
  ensureDb();
  const snapshot = await getDocs(accountsCollection!);
  if (!snapshot.empty) return;
  const batch = writeBatch(db!);
  FIXED_ACCOUNTS.forEach((account) => {
    batch.set(
      doc(accountsCollection!, account.accountId),
      {
        name: account.name,
        sortOrder: account.sortOrder,
        isActive: account.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
  await batch.commit();
};

export type StartAccountingPeriodInput = {
  fiscalYear: number;
  openingBalances: Record<string, number>;
};

export const startAccountingPeriod = async (input: StartAccountingPeriodInput): Promise<void> => {
  ensureDb();
  const periodsSnapshot = await getDocs(periodsCollection!);
  const hasEditing = periodsSnapshot.docs.some(
    (item) => toPeriodState((item.data() as Record<string, unknown>).state) === "editing",
  );
  if (hasEditing) {
    throw new Error("開始済みの会計期があります。画面を更新して確認してください。");
  }

  const accountsSnapshot = await getDocs(accountsCollection!);
  const accounts = accountsSnapshot.docs
    .map((item) => toAccountingAccountDoc(item.id, item.data() as Record<string, unknown>))
    .filter((item) => item.isActive)
    .sort((a, b) =>
      compareAccountingAccounts(
        { accountId: a.id, name: a.name, sortOrder: a.sortOrder, isActive: a.isActive },
        { accountId: b.id, name: b.name, sortOrder: b.sortOrder, isActive: b.isActive },
      ),
    );

  if (accounts.length === 0) {
    throw new Error("有効な口座がありません。先に口座設定を行ってください。");
  }

  const periodId = `fy-${input.fiscalYear}`;
  const periodRef = doc(periodsCollection!, periodId);
  const existingPeriod = await getDoc(periodRef);
  if (existingPeriod.exists()) {
    throw new Error("同じ年度の会計期がすでに存在します。年度を確認してください。");
  }
  const batch = writeBatch(db!);
  const range = buildPeriodRange(input.fiscalYear);

  batch.set(periodRef, {
    label: buildPeriodLabel(input.fiscalYear),
    fiscalYear: input.fiscalYear,
    startDate: range.startDate,
    endDate: range.endDate,
    state: "editing",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  accounts.forEach((account) => {
    batch.set(
      doc(periodAccountsCollection!, `${periodId}_${account.id}`),
      {
        periodId,
        accountId: account.id,
        openingBalance: input.openingBalances[account.id] ?? 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
  });

  await batch.commit();
};

const buildPeriodLabel = (fiscalYear: number): string => `${fiscalYear}年度`;

const buildPeriodRange = (fiscalYear: number) => buildAccountingFiscalYearRange(fiscalYear);

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
