import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import {
  createAccountingTransaction,
  getCurrentEditingAccountingPeriodId,
} from "../accounting/service";
import type { MembershipFeeRecord } from "../types";

const membershipFeeRecordsCollection = db ? collection(db, "membershipFeeRecords") : null;

const MONTHLY_FEE_DEFAULT = 4000;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !membershipFeeRecordsCollection) {
    throw new Error("Firebase 設定が未設定のため、会費管理データを Firestore で扱えません。");
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

const sortMonthKeys = (monthKeys: string[]): string[] =>
  [...new Set(monthKeys.filter((item) => /^\d{4}-\d{2}$/.test(item)))].sort((left, right) =>
    left.localeCompare(right),
  );

const toMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  return `${year}/${month}`;
};

export const buildMembershipFeeTitle = (memberName: string, monthKeys: string[]): string => {
  const sorted = sortMonthKeys(monthKeys);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  if (!start || !end) {
    return `会費（${memberName}）`;
  }
  return `会費（${memberName} ${toMonthLabel(start)}〜${toMonthLabel(end)}）`;
};

const toMembershipFeeRecord = (id: string, value: Record<string, unknown>): MembershipFeeRecord | null => {
  const memberId = toOptionalString(value.memberId);
  const memberNameSnapshot = toOptionalString(value.memberNameSnapshot);
  const fiscalYearRaw = typeof value.fiscalYear === "number" ? value.fiscalYear : Number(value.fiscalYear);
  const monthKeys = sortMonthKeys(
    Array.isArray(value.monthKeys) ? value.monthKeys.filter((item): item is string => typeof item === "string") : [],
  );
  if (!memberId || !memberNameSnapshot || !Number.isFinite(fiscalYearRaw) || monthKeys.length === 0) {
    return null;
  }

  return {
    id,
    memberId,
    memberNameSnapshot,
    fiscalYear: Number(fiscalYearRaw),
    monthKeys,
    title:
      toOptionalString(value.title) ??
      buildMembershipFeeTitle(memberNameSnapshot, monthKeys),
    monthlyAmount: toNonNegativeNumber(value.monthlyAmount) || MONTHLY_FEE_DEFAULT,
    amount: toNonNegativeNumber(value.amount),
    status: value.status === "received" ? "received" : "requested",
    requestedOn: toOptionalString(value.requestedOn) ?? "",
    receivedOn: toOptionalString(value.receivedOn),
    createdByUid: toOptionalString(value.createdByUid) ?? "",
    receivedByUid: toOptionalString(value.receivedByUid),
    createdAt: toIsoString(value.createdAt),
    updatedAt: toIsoString(value.updatedAt),
    accountingRequested: toBoolean(value.accountingRequested),
    accountingLinked: toBoolean(value.accountingLinked),
    accountingEntryId: toOptionalString(value.accountingEntryId),
    accountingSourceType: value.accountingSourceType === "membershipFee" ? "membershipFee" : undefined,
    accountingSourceId: toOptionalString(value.accountingSourceId),
    accountingAccountId: toOptionalString(value.accountingAccountId),
    accountingCategoryId: toOptionalString(value.accountingCategoryId),
    accountingMemo: toOptionalString(value.accountingMemo),
  };
};

const sortMembershipFeeRecords = (left: MembershipFeeRecord, right: MembershipFeeRecord): number => {
  if (left.fiscalYear !== right.fiscalYear) return right.fiscalYear - left.fiscalYear;
  const leftMonth = left.monthKeys[0] ?? "";
  const rightMonth = right.monthKeys[0] ?? "";
  if (leftMonth !== rightMonth) return leftMonth.localeCompare(rightMonth);
  if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
  return left.id.localeCompare(right.id);
};

const todayDateKey = (): string => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const subscribeMembershipFeeRecords = (
  callback: (items: MembershipFeeRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(
    membershipFeeRecordsCollection!,
    (snapshot) => {
      const next = snapshot.docs
        .map((item) => toMembershipFeeRecord(item.id, item.data() as Record<string, unknown>))
        .filter((item): item is MembershipFeeRecord => Boolean(item))
        .sort(sortMembershipFeeRecords);
      callback(next);
    },
    (error) => onError?.(error instanceof Error ? error : new Error("membershipFeeRecords subscription failed")),
  );
};

export const createMembershipFeeRequest = async (input: {
  memberId: string;
  memberNameSnapshot: string;
  fiscalYear: number;
  monthKeys: string[];
  createdByUid: string;
  monthlyAmount?: number;
}): Promise<void> => {
  ensureDb();
  const monthKeys = sortMonthKeys(input.monthKeys);
  if (monthKeys.length === 0) {
    throw new Error("月謝袋を渡す月を選択してください。");
  }

  const existingSnapshot = await getDocs(
    query(
      membershipFeeRecordsCollection!,
      where("memberId", "==", input.memberId),
      where("fiscalYear", "==", input.fiscalYear),
    ),
  );

  const existingRecords = existingSnapshot.docs
    .map((item) => toMembershipFeeRecord(item.id, item.data() as Record<string, unknown>))
    .filter((item): item is MembershipFeeRecord => Boolean(item));

  const duplicatedMonth = monthKeys.find((monthKey) =>
    existingRecords.some((record) => record.monthKeys.includes(monthKey)),
  );
  if (duplicatedMonth) {
    throw new Error("選択した月の会費レコードがすでに存在します。画面を更新して確認してください。");
  }

  const monthlyAmount = input.monthlyAmount ?? MONTHLY_FEE_DEFAULT;
  const title = buildMembershipFeeTitle(input.memberNameSnapshot, monthKeys);
  const recordRef = doc(membershipFeeRecordsCollection!);

  await setDoc(recordRef, {
    memberId: input.memberId,
    memberNameSnapshot: input.memberNameSnapshot,
    fiscalYear: input.fiscalYear,
    monthKeys,
    title,
    monthlyAmount,
    amount: monthlyAmount * monthKeys.length,
    status: "requested",
    requestedOn: todayDateKey(),
    receivedOn: null,
    createdByUid: input.createdByUid,
    receivedByUid: null,
    accountingRequested: false,
    accountingLinked: false,
    accountingEntryId: null,
    accountingSourceType: "membershipFee",
    accountingSourceId: recordRef.id,
    accountingAccountId: null,
    accountingCategoryId: null,
    accountingMemo: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const receiveMembershipFeeRecord = async (input: {
  membershipFeeRecordId: string;
  accountId: string;
  receivedByUid: string;
}): Promise<void> => {
  ensureDb();
  if (!input.accountId) {
    throw new Error("入金先口座を選択してください。");
  }

  const recordRef = doc(membershipFeeRecordsCollection!, input.membershipFeeRecordId);
  const snapshot = await getDoc(recordRef);
  if (!snapshot.exists()) {
    throw new Error("対象の会費レコードが見つかりません。");
  }

  const record = toMembershipFeeRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
  if (!record) {
    throw new Error("対象の会費レコードの読み込みに失敗しました。");
  }
  if (record.status === "received" || record.accountingLinked) {
    throw new Error("この会費レコードはすでに領収済みです。");
  }

  const periodId = await getCurrentEditingAccountingPeriodId();
  const transactionId = `membershipFee_${record.id}`;
  const accountingMemo = record.title;
  const accountingEntryId = await createAccountingTransaction({
    transactionId,
    periodId,
    type: "income",
    accountId: input.accountId,
    categoryId: "INCOME_MEMBERSHIP_FEE",
    memo: accountingMemo,
    amount: record.amount,
    date: todayDateKey(),
    source: "membershipFee",
  });

  await setDoc(
    recordRef,
    {
      status: "received",
      receivedOn: todayDateKey(),
      receivedByUid: input.receivedByUid,
      accountingRequested: true,
      accountingLinked: true,
      accountingEntryId,
      accountingSourceType: "membershipFee",
      accountingSourceId: record.id,
      accountingAccountId: input.accountId,
      accountingCategoryId: "INCOME_MEMBERSHIP_FEE",
      accountingMemo,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const membershipFeeMonthlyAmount = (): number => MONTHLY_FEE_DEFAULT;
