import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import {
  createAccountingTransaction,
  getCurrentEditingAccountingPeriodId,
} from "../accounting/service";
import type { InstructorStipendRecord } from "../types";

const instructorStipendsCollection = db ? collection(db, "instructorStipends") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !instructorStipendsCollection) {
    throw new Error(
      "Firebase 設定が未設定のため、講師謝礼データを Firestore で扱えません。",
    );
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

const toBoolean = (value: unknown): boolean | undefined => {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
};

const isMonthKey = (value: string): boolean => /^\d{4}-\d{2}$/.test(value);

const buildRecordTitle = (teacherNameSnapshot: string, monthKey: string): string =>
  `${teacherNameSnapshot} ${monthKey.replace("-", "/")}分講師謝礼`;

const toInstructorStipendRecord = (
  id: string,
  value: Record<string, unknown>,
): InstructorStipendRecord | null => {
  const teacherMemberId = toOptionalString(value.teacherMemberId);
  const teacherNameSnapshot = toOptionalString(value.teacherNameSnapshot);
  const monthKey = toOptionalString(value.monthKey);
  const paidOn = toOptionalString(value.paidOn);
  const paidByUid = toOptionalString(value.paidByUid);
  const fiscalYearRaw =
    typeof value.fiscalYear === "number" ? value.fiscalYear : Number(value.fiscalYear);
  if (
    !teacherMemberId ||
    !teacherNameSnapshot ||
    !monthKey ||
    !isMonthKey(monthKey) ||
    !paidOn ||
    !paidByUid ||
    !Number.isFinite(fiscalYearRaw)
  ) {
    return null;
  }

  return {
    id,
    teacherMemberId,
    teacherNameSnapshot,
    fiscalYear: Number(fiscalYearRaw),
    monthKey,
    title: toOptionalString(value.title) ?? buildRecordTitle(teacherNameSnapshot, monthKey),
    amount: toNonNegativeNumber(value.amount),
    paidOn,
    paidByUid,
    createdAt: toIsoString(value.createdAt),
    updatedAt: toIsoString(value.updatedAt),
    accountingRequested: toBoolean(value.accountingRequested),
    accountingLinked: toBoolean(value.accountingLinked),
    accountingEntryId: toOptionalString(value.accountingEntryId),
    accountingSourceType:
      value.accountingSourceType === "instructorStipend" ? "instructorStipend" : undefined,
    accountingSourceId: toOptionalString(value.accountingSourceId),
    accountingAccountId: toOptionalString(value.accountingAccountId),
    accountingCategoryId: toOptionalString(value.accountingCategoryId),
    accountingMemo: toOptionalString(value.accountingMemo),
  };
};

const sortInstructorStipends = (
  left: InstructorStipendRecord,
  right: InstructorStipendRecord,
): number => {
  if (left.fiscalYear !== right.fiscalYear) return right.fiscalYear - left.fiscalYear;
  if (left.monthKey !== right.monthKey) return left.monthKey.localeCompare(right.monthKey);
  if (left.teacherNameSnapshot !== right.teacherNameSnapshot) {
    return left.teacherNameSnapshot.localeCompare(right.teacherNameSnapshot, "ja");
  }
  return left.id.localeCompare(right.id, "ja");
};

export const subscribeInstructorStipends = (
  callback: (items: InstructorStipendRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(
    query(instructorStipendsCollection!),
    (snapshot) => {
      const next = snapshot.docs
        .map((item) =>
          toInstructorStipendRecord(item.id, item.data() as Record<string, unknown>),
        )
        .filter((item): item is InstructorStipendRecord => Boolean(item))
        .sort(sortInstructorStipends);
      callback(next);
    },
    (error) =>
      onError?.(
        error instanceof Error ? error : new Error("instructorStipends subscription failed"),
      ),
  );
};

export const buildInstructorStipendMemo = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  return `${Number(year)}年${Number(month)}月分講師代`;
};

export const createInstructorStipendPayment = async (input: {
  teacherMemberId: string;
  teacherNameSnapshot: string;
  fiscalYear: number;
  monthKey: string;
  amount: number;
  paidOn: string;
  paidByUid: string;
  accountId: string;
  memo?: string;
}): Promise<void> => {
  ensureDb();
  if (!input.teacherMemberId) {
    throw new Error("対象先生を選択してください。");
  }
  if (!isMonthKey(input.monthKey)) {
    throw new Error("対象月の形式が不正です。");
  }
  if (!input.accountId) {
    throw new Error("出金元口座を選択してください。");
  }
  if (!(Number.isFinite(input.amount) && input.amount > 0)) {
    throw new Error("金額は1円以上で入力してください。");
  }
  if (!input.paidOn) {
    throw new Error("支払日を入力してください。");
  }

  const recordId = `${input.teacherMemberId}_${input.monthKey}`;
  const recordRef = doc(instructorStipendsCollection!, recordId);
  const existing = await getDoc(recordRef);
  if (existing.exists()) {
    throw new Error("この先生の対象月分は、すでに支払済みです。");
  }

  const accountingMemo = input.memo?.trim() || buildInstructorStipendMemo(input.monthKey);
  const periodId = await getCurrentEditingAccountingPeriodId();
  const accountingEntryId = await createAccountingTransaction({
    transactionId: `instructorStipend_${recordId}`,
    periodId,
    type: "expense",
    accountId: input.accountId,
    categoryId: "EXPENSE_INSTRUCTOR_HONORARIUM",
    memo: accountingMemo,
    amount: input.amount,
    date: input.paidOn,
    source: "instructorStipend",
  });

  await setDoc(recordRef, {
    teacherMemberId: input.teacherMemberId,
    teacherNameSnapshot: input.teacherNameSnapshot,
    fiscalYear: input.fiscalYear,
    monthKey: input.monthKey,
    title: buildRecordTitle(input.teacherNameSnapshot, input.monthKey),
    amount: input.amount,
    paidOn: input.paidOn,
    paidByUid: input.paidByUid,
    accountingRequested: true,
    accountingLinked: true,
    accountingEntryId,
    accountingSourceType: "instructorStipend",
    accountingSourceId: recordId,
    accountingAccountId: input.accountId,
    accountingCategoryId: "EXPENSE_INSTRUCTOR_HONORARIUM",
    accountingMemo,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateInstructorStipendPayment = async (input: {
  teacherMemberId: string;
  teacherNameSnapshot: string;
  fiscalYear: number;
  monthKey: string;
  amount: number;
  paidOn: string;
  accountId: string;
  memo?: string;
}): Promise<void> => {
  ensureDb();
  if (!input.teacherMemberId) {
    throw new Error("対象先生を選択してください。");
  }
  if (!isMonthKey(input.monthKey)) {
    throw new Error("対象月の形式が不正です。");
  }
  if (!input.accountId) {
    throw new Error("出金元口座を選択してください。");
  }
  if (!(Number.isFinite(input.amount) && input.amount > 0)) {
    throw new Error("金額は1円以上で入力してください。");
  }
  if (!input.paidOn) {
    throw new Error("支払日を入力してください。");
  }

  const recordId = `${input.teacherMemberId}_${input.monthKey}`;
  const recordRef = doc(instructorStipendsCollection!, recordId);
  const existing = await getDoc(recordRef);
  if (!existing.exists()) {
    throw new Error("対象月の講師謝礼が見つかりません。");
  }

  const accountingMemo = input.memo?.trim() || buildInstructorStipendMemo(input.monthKey);
  await updateDoc(recordRef, {
    teacherNameSnapshot: input.teacherNameSnapshot,
    fiscalYear: input.fiscalYear,
    monthKey: input.monthKey,
    title: buildRecordTitle(input.teacherNameSnapshot, input.monthKey),
    amount: input.amount,
    paidOn: input.paidOn,
    accountingAccountId: input.accountId,
    accountingMemo,
    updatedAt: serverTimestamp(),
  });
};
