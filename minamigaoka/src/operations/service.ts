import {
  type CollectionReference,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig, storage } from "../config/firebase";
import type { LunchRecord, PurchaseRequest, ReceiptFileMeta, Reimbursement } from "../types";
import { uploadFilesToStorage } from "../uploads/storageUpload";
import {
  createAccountingTransaction,
  getCurrentEditingAccountingPeriodId,
} from "../accounting/service";

const purchaseRequestsCollection = db ? collection(db, "purchaseRequests") : null;
const reimbursementsCollection = db ? collection(db, "reimbursements") : null;
const lunchRecordsCollection = db ? collection(db, "lunchRecords") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !purchaseRequestsCollection || !reimbursementsCollection || !lunchRecordsCollection) {
    throw new Error("Firebase 設定が未設定のため、購入依頼・立替・お弁当データを Firestore で扱えません。");
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

const toBoolean = (value: unknown): boolean | undefined => {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
};

const toReceiptFilesMeta = (value: unknown): ReceiptFileMeta[] =>
  Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const raw = item as Record<string, unknown>;
          const name = toOptionalString(raw.name);
          if (!name) return null;
          const next: ReceiptFileMeta = {
            name,
            size: toNonNegativeNumber(raw.size),
            type: typeof raw.type === "string" ? raw.type : "",
            downloadUrl: toOptionalString(raw.downloadUrl),
            storagePath: toOptionalString(raw.storagePath),
          };
          return next;
        })
        .filter((item): item is ReceiptFileMeta => Boolean(item))
    : [];

const sortByDateDesc = (left: string, right: string): number => right.localeCompare(left);
const sortLunchRecordsDesc = (left: LunchRecord, right: LunchRecord): number => {
  const leftDate = left.date || left.purchasedAt.slice(0, 10);
  const rightDate = right.date || right.purchasedAt.slice(0, 10);
  if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
  const createdDiff = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
  if (createdDiff !== 0) return createdDiff;
  const purchasedDiff = right.purchasedAt.localeCompare(left.purchasedAt);
  if (purchasedDiff !== 0) return purchasedDiff;
  return right.id.localeCompare(left.id);
};

const toPurchaseRequest = (id: string, value: Record<string, unknown>): PurchaseRequest => {
  const rawResult =
    value.purchaseResult && typeof value.purchaseResult === "object"
      ? (value.purchaseResult as Record<string, unknown>)
      : null;

  return {
    id,
    title: typeof value.title === "string" ? value.title : "",
    createdAt: toIsoString(value.createdAt),
    category: toOptionalString(value.category),
    memo: toOptionalString(value.memo),
    quantity:
      typeof value.quantity === "string" || typeof value.quantity === "number" ? value.quantity : undefined,
    estimatedAmount: toNonNegativeNumber(value.estimatedAmount) || undefined,
    createdBy: typeof value.createdBy === "string" ? value.createdBy : "",
    purchaseAssignees: Array.isArray(value.purchaseAssignees)
      ? value.purchaseAssignees.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    status: value.status === "BOUGHT" ? "BOUGHT" : "OPEN",
    boughtBy: toOptionalString(value.boughtBy),
    boughtAt: toOptionalString(value.boughtAt),
    purchaseResult: rawResult
      ? {
          itemName: typeof rawResult.itemName === "string" ? rawResult.itemName : "",
          quantity:
            typeof rawResult.quantity === "string" || typeof rawResult.quantity === "number"
              ? rawResult.quantity
              : undefined,
          amount: toNonNegativeNumber(rawResult.amount) || undefined,
          purchasedAt: typeof rawResult.purchasedAt === "string" ? rawResult.purchasedAt : "",
          receiptFilesMeta: toReceiptFilesMeta(rawResult.receiptFilesMeta),
          accountingRecordRequested: rawResult.accountingRecordRequested === true,
          reimbursementRecordRequested: rawResult.reimbursementRecordRequested === true,
          reimbursementLinked: rawResult.reimbursementLinked === true,
          reimbursementId: toOptionalString(rawResult.reimbursementId),
        }
      : undefined,
    accountingRequested: toBoolean(value.accountingRequested),
    accountingLinked: toBoolean(value.accountingLinked),
    accountingEntryId: toOptionalString(value.accountingEntryId),
    accountingSourceType:
      value.accountingSourceType === "purchaseRequest" ||
      value.accountingSourceType === "reimbursement" ||
      value.accountingSourceType === "lunch"
        ? value.accountingSourceType
        : undefined,
    accountingSourceId: toOptionalString(value.accountingSourceId),
    accountingAccountId: toOptionalString(value.accountingAccountId),
    accountingCategoryId: toOptionalString(value.accountingCategoryId),
    accountingMemo: toOptionalString(value.accountingMemo),
  };
};

const toReimbursement = (id: string, value: Record<string, unknown>): Reimbursement => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  amount: toNonNegativeNumber(value.amount),
  purchasedAt: typeof value.purchasedAt === "string" ? value.purchasedAt : "",
  buyer: typeof value.buyer === "string" ? value.buyer : "",
  memo: toOptionalString(value.memo),
  receipt: toOptionalString(value.receipt),
  receiptFilesMeta: toReceiptFilesMeta(value.receiptFilesMeta),
  source: value.source === "purchase" || value.source === "lunch" ? value.source : undefined,
  relatedPurchaseRequestId: toOptionalString(value.relatedPurchaseRequestId),
  paidByTreasurerAt: toOptionalString(value.paidByTreasurerAt),
  receivedByBuyerAt: toOptionalString(value.receivedByBuyerAt),
  accountingRequested: toBoolean(value.accountingRequested),
  accountingLinked: toBoolean(value.accountingLinked),
  accountingEntryId: toOptionalString(value.accountingEntryId),
  accountingSourceType:
    value.accountingSourceType === "purchaseRequest" ||
    value.accountingSourceType === "reimbursement" ||
    value.accountingSourceType === "lunch"
      ? value.accountingSourceType
      : undefined,
  accountingSourceId: toOptionalString(value.accountingSourceId),
  accountingAccountId: toOptionalString(value.accountingAccountId),
  accountingCategoryId: toOptionalString(value.accountingCategoryId),
  accountingMemo: toOptionalString(value.accountingMemo),
});

const toLunchRecord = (id: string, value: Record<string, unknown>): LunchRecord => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  amount: toNonNegativeNumber(value.amount),
  purchasedAt: typeof value.purchasedAt === "string" ? value.purchasedAt : "",
  createdAt: toOptionalString(value.createdAt) ?? toIsoString(value.createdAt),
  updatedAt: toOptionalString(value.updatedAt) ?? toIsoString(value.updatedAt),
  date: typeof value.date === "string" ? value.date : "",
  buyer: typeof value.buyer === "string" ? value.buyer : "",
  dutyMemberId: toOptionalString(value.dutyMemberId),
  dutyHouseholdId: toOptionalString(value.dutyHouseholdId),
  memo: toOptionalString(value.memo),
  paymentMethod: value.paymentMethod === "direct_accounting" ? "direct_accounting" : "reimbursement",
  paymentSplits: Array.isArray(value.paymentSplits) ? (value.paymentSplits as LunchRecord["paymentSplits"]) : undefined,
  reimbursementLinked: value.reimbursementLinked === true,
  reimbursementId: toOptionalString(value.reimbursementId),
  imageUrls: Array.isArray(value.imageUrls)
    ? value.imageUrls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [],
  receiptFilesMeta: toReceiptFilesMeta(value.receiptFilesMeta),
  accountingRequested: toBoolean(value.accountingRequested),
  accountingLinked: toBoolean(value.accountingLinked),
  accountingEntryId: toOptionalString(value.accountingEntryId),
  accountingSourceType:
    value.accountingSourceType === "purchaseRequest" ||
    value.accountingSourceType === "reimbursement" ||
    value.accountingSourceType === "lunch"
      ? value.accountingSourceType
      : undefined,
  accountingSourceId: toOptionalString(value.accountingSourceId),
  accountingAccountId: toOptionalString(value.accountingAccountId),
  accountingCategoryId: toOptionalString(value.accountingCategoryId),
  accountingMemo: toOptionalString(value.accountingMemo),
});

const uploadReceiptFiles = async (folder: string, files: File[]): Promise<ReceiptFileMeta[]> => {
  if (files.length === 0) return [];
  ensureStorage();
  return uploadFilesToStorage(storage!, folder, files);
};

const createLinkedAccountingExpense = async (input: {
  transactionId: string;
  source: "purchase" | "reimbursement" | "lunch";
  accountId?: string;
  categoryId?: string;
  memo?: string;
  amount: number;
  date: string;
}): Promise<string> => {
  if (!input.accountId || !input.categoryId || !input.memo?.trim()) {
    throw new Error("会計起票に必要な情報が不足しています。");
  }
  const periodId = await getCurrentEditingAccountingPeriodId();
  return createAccountingTransaction({
    transactionId: input.transactionId,
    periodId,
    type: "expense",
    accountId: input.accountId,
    categoryId: input.categoryId,
    memo: input.memo.trim(),
    amount: input.amount,
    date: input.date,
    source: input.source,
  });
};

const toPurchasePayload = (purchase: Omit<PurchaseRequest, "id">, createdAt?: unknown) => ({
  title: purchase.title.trim(),
  createdAt: createdAt ?? purchase.createdAt ?? serverTimestamp(),
  category: purchase.category ?? null,
  memo: purchase.memo?.trim() || null,
  quantity: purchase.quantity ?? null,
  estimatedAmount: purchase.estimatedAmount ?? null,
  createdBy: purchase.createdBy,
  purchaseAssignees: purchase.purchaseAssignees ?? [],
  status: purchase.status,
  boughtBy: purchase.boughtBy ?? null,
  boughtAt: purchase.boughtAt ?? null,
  purchaseResult: purchase.purchaseResult
    ? {
        itemName: purchase.purchaseResult.itemName.trim(),
        quantity: purchase.purchaseResult.quantity ?? null,
        amount: purchase.purchaseResult.amount ?? null,
        purchasedAt: purchase.purchaseResult.purchasedAt,
        receiptFilesMeta: purchase.purchaseResult.receiptFilesMeta ?? [],
        accountingRecordRequested: purchase.purchaseResult.accountingRecordRequested === true,
        reimbursementRecordRequested: purchase.purchaseResult.reimbursementRecordRequested === true,
        reimbursementLinked: purchase.purchaseResult.reimbursementLinked === true,
        reimbursementId: purchase.purchaseResult.reimbursementId ?? null,
      }
    : null,
  accountingRequested: purchase.accountingRequested === true,
  accountingLinked: purchase.accountingLinked === true,
  accountingEntryId: purchase.accountingEntryId ?? null,
  accountingSourceType: purchase.accountingSourceType ?? null,
  accountingSourceId: purchase.accountingSourceId ?? null,
  accountingAccountId: purchase.accountingAccountId ?? null,
  accountingCategoryId: purchase.accountingCategoryId ?? null,
  accountingMemo: purchase.accountingMemo ?? null,
  updatedAt: serverTimestamp(),
});

const toReimbursementPayload = (reimbursement: Omit<Reimbursement, "id">, createdAt?: unknown) => ({
  title: reimbursement.title.trim(),
  amount: reimbursement.amount,
  purchasedAt: reimbursement.purchasedAt,
  buyer: reimbursement.buyer,
  memo: reimbursement.memo?.trim() || null,
  receipt: reimbursement.receipt ?? null,
  receiptFilesMeta: reimbursement.receiptFilesMeta ?? [],
  source: reimbursement.source ?? null,
  relatedPurchaseRequestId: reimbursement.relatedPurchaseRequestId ?? null,
  paidByTreasurerAt: reimbursement.paidByTreasurerAt ?? null,
  receivedByBuyerAt: reimbursement.receivedByBuyerAt ?? null,
  accountingRequested: reimbursement.accountingRequested === true,
  accountingLinked: reimbursement.accountingLinked === true,
  accountingEntryId: reimbursement.accountingEntryId ?? null,
  accountingSourceType: reimbursement.accountingSourceType ?? null,
  accountingSourceId: reimbursement.accountingSourceId ?? null,
  accountingAccountId: reimbursement.accountingAccountId ?? null,
  accountingCategoryId: reimbursement.accountingCategoryId ?? null,
  accountingMemo: reimbursement.accountingMemo ?? null,
  createdAt: createdAt ?? serverTimestamp(),
  updatedAt: serverTimestamp(),
});

const toLunchPayload = (lunchRecord: Omit<LunchRecord, "id">, createdAt?: unknown) => ({
  title: lunchRecord.title.trim(),
  amount: lunchRecord.amount,
  purchasedAt: lunchRecord.purchasedAt,
  date: lunchRecord.date,
  buyer: lunchRecord.buyer,
  dutyMemberId: lunchRecord.dutyMemberId ?? null,
  dutyHouseholdId: lunchRecord.dutyHouseholdId ?? null,
  memo: lunchRecord.memo?.trim() || null,
  paymentMethod: lunchRecord.paymentMethod ?? "reimbursement",
  paymentSplits: lunchRecord.paymentSplits ?? [],
  reimbursementLinked: lunchRecord.reimbursementLinked === true,
  reimbursementId: lunchRecord.reimbursementId ?? null,
  imageUrls: lunchRecord.imageUrls ?? [],
  receiptFilesMeta: lunchRecord.receiptFilesMeta ?? [],
  accountingRequested: lunchRecord.accountingRequested === true,
  accountingLinked: lunchRecord.accountingLinked === true,
  accountingEntryId: lunchRecord.accountingEntryId ?? null,
  accountingSourceType: lunchRecord.accountingSourceType ?? null,
  accountingSourceId: lunchRecord.accountingSourceId ?? null,
  accountingAccountId: lunchRecord.accountingAccountId ?? null,
  accountingCategoryId: lunchRecord.accountingCategoryId ?? null,
  accountingMemo: lunchRecord.accountingMemo ?? null,
  createdAt: createdAt ?? serverTimestamp(),
  updatedAt: serverTimestamp(),
});

const subscribeCollection = <T>(
  collectionRef: CollectionReference | null,
  mapper: (id: string, value: Record<string, unknown>) => T,
  callback: (items: T[]) => void,
  sorter?: (left: T, right: T) => number,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(
    collectionRef!,
    (snapshot) => {
      const next = snapshot.docs.map((item) => mapper(item.id, item.data() as Record<string, unknown>));
      callback(sorter ? next.sort(sorter) : next);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("subscription failed"));
    },
  );
};

export const subscribePurchaseRequests = (
  callback: (items: PurchaseRequest[]) => void,
  onError?: (error: Error) => void,
): (() => void) =>
  subscribeCollection(
    purchaseRequestsCollection,
    toPurchaseRequest,
    callback,
    (left, right) => sortByDateDesc(left.createdAt ?? "", right.createdAt ?? ""),
    onError,
  );

export const subscribeReimbursements = (
  callback: (items: Reimbursement[]) => void,
  onError?: (error: Error) => void,
): (() => void) =>
  subscribeCollection(
    reimbursementsCollection,
    toReimbursement,
    callback,
    (left, right) => sortByDateDesc(left.purchasedAt, right.purchasedAt),
    onError,
  );

export const subscribeLunchRecords = (
  callback: (items: LunchRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) =>
  subscribeCollection(
    lunchRecordsCollection,
    toLunchRecord,
    callback,
    sortLunchRecordsDesc,
    onError,
  );

export const createPurchaseRequest = async (purchase: Omit<PurchaseRequest, "id">): Promise<void> => {
  ensureDb();
  const purchaseRef = doc(purchaseRequestsCollection!);
  await setDoc(purchaseRef, toPurchasePayload(purchase));
};

export const savePurchaseRequest = async (purchase: PurchaseRequest): Promise<void> => {
  ensureDb();
  await setDoc(doc(purchaseRequestsCollection!, purchase.id), toPurchasePayload(purchase), { merge: true });
};

export const deletePurchaseRequest = async (purchaseId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(purchaseRequestsCollection!, purchaseId));
};

type CompletePurchaseRequestInput = {
  purchase: PurchaseRequest;
  completedBy: string;
  itemName: string;
  quantity?: string;
  amount?: number;
  purchasedAt: string;
  files?: File[];
  createReimbursement?: boolean;
};

export const completePurchaseRequest = async ({
  purchase,
  completedBy,
  itemName,
  quantity,
  amount,
  purchasedAt,
  files = [],
  createReimbursement = false,
}: CompletePurchaseRequestInput): Promise<void> => {
  ensureDb();
  const purchaseRef = doc(purchaseRequestsCollection!, purchase.id);
  const uploadedFiles = await uploadReceiptFiles(`purchaseRequests/${purchase.id}/receipts`, files);
  const nextReceiptFilesMeta =
    uploadedFiles.length > 0 ? uploadedFiles : (purchase.purchaseResult?.receiptFilesMeta ?? []);
  const reimbursementRef = createReimbursement ? doc(reimbursementsCollection!) : null;
  const alreadyLinked = purchase.accountingLinked === true && Boolean(purchase.accountingEntryId);
  const shouldCreateAccountingEntry =
    !alreadyLinked &&
    purchase.accountingRequested === true &&
    Boolean(purchase.accountingAccountId && purchase.accountingCategoryId && purchase.accountingMemo?.trim());
  const accountingEntryId = shouldCreateAccountingEntry
    ? await createLinkedAccountingExpense({
        transactionId: `purchase_${purchase.id}`,
        source: "purchase",
        accountId: purchase.accountingAccountId,
        categoryId: purchase.accountingCategoryId,
        memo: purchase.accountingMemo,
        amount: amount ?? 0,
        date: purchasedAt,
      })
    : undefined;
  const batch = writeBatch(db!);

  if (reimbursementRef) {
    batch.set(
      reimbursementRef,
      toReimbursementPayload(
        {
          title: itemName.trim(),
          amount: amount ?? 0,
          purchasedAt,
          buyer: completedBy,
          memo: purchase.memo,
          receipt: nextReceiptFilesMeta.length > 0 ? `画像${nextReceiptFilesMeta.length}件` : undefined,
          receiptFilesMeta: nextReceiptFilesMeta,
          source: "purchase",
          relatedPurchaseRequestId: purchase.id,
          accountingRequested: false,
          accountingLinked: false,
          accountingSourceType: "purchaseRequest",
          accountingSourceId: purchase.id,
        },
        serverTimestamp(),
      ),
    );
  }

  batch.set(
    purchaseRef,
    toPurchasePayload(
      {
        ...purchase,
        status: "BOUGHT",
        boughtBy: completedBy,
        boughtAt: purchasedAt,
        purchaseResult: {
          itemName: itemName.trim(),
          quantity: quantity?.trim() || undefined,
          amount,
          purchasedAt,
          receiptFilesMeta: nextReceiptFilesMeta,
        accountingRecordRequested: purchase.purchaseResult?.accountingRecordRequested === true,
        reimbursementRecordRequested: createReimbursement,
        reimbursementLinked: Boolean(reimbursementRef),
        reimbursementId: reimbursementRef?.id,
      },
      accountingRequested: alreadyLinked || shouldCreateAccountingEntry,
      accountingLinked: alreadyLinked || Boolean(accountingEntryId),
      accountingEntryId: purchase.accountingEntryId ?? accountingEntryId,
      accountingSourceType: "purchaseRequest",
      accountingSourceId: purchase.id,
    },
      purchase.createdAt ?? serverTimestamp(),
    ),
  );

  await batch.commit();
};

export const createReimbursement = async (
  reimbursement: Omit<Reimbursement, "id">,
  files: File[] = [],
): Promise<void> => {
  ensureDb();
  const reimbursementRef = doc(reimbursementsCollection!);
  const uploadedFiles = await uploadReceiptFiles(`reimbursements/${reimbursementRef.id}/receipts`, files);
  await setDoc(
    reimbursementRef,
    toReimbursementPayload({
      ...reimbursement,
      receipt: uploadedFiles.length > 0 ? `画像${uploadedFiles.length}件` : reimbursement.receipt,
      receiptFilesMeta: uploadedFiles.length > 0 ? uploadedFiles : reimbursement.receiptFilesMeta,
      accountingSourceType: reimbursement.accountingSourceType ?? "reimbursement",
      accountingSourceId: reimbursement.accountingSourceId ?? reimbursementRef.id,
    }),
  );
};

export const markReimbursementPaid = async (reimbursement: Reimbursement): Promise<void> => {
  ensureDb();
  if (reimbursement.accountingLinked && reimbursement.accountingEntryId) {
    throw new Error("この立替はすでに会計連携済みです。");
  }
  const shouldCreateAccountingEntry =
    reimbursement.accountingRequested === true &&
    Boolean(reimbursement.accountingAccountId && reimbursement.accountingCategoryId && reimbursement.accountingMemo?.trim());
  const accountingEntryId = shouldCreateAccountingEntry
    ? await createLinkedAccountingExpense({
        transactionId: `reimbursement_${reimbursement.id}`,
        source: "reimbursement",
        accountId: reimbursement.accountingAccountId,
        categoryId: reimbursement.accountingCategoryId,
        memo: reimbursement.accountingMemo,
        amount: reimbursement.amount,
        date: reimbursement.purchasedAt,
      })
    : undefined;
  await setDoc(
    doc(reimbursementsCollection!, reimbursement.id),
    toReimbursementPayload({
      ...reimbursement,
      accountingRequested: shouldCreateAccountingEntry,
      accountingLinked: Boolean(accountingEntryId),
      accountingEntryId,
      accountingSourceType: "reimbursement",
      accountingSourceId: reimbursement.id,
    }),
    { merge: true },
  );
};

export const saveReimbursement = async (reimbursement: Reimbursement): Promise<void> => {
  ensureDb();
  await setDoc(
    doc(reimbursementsCollection!, reimbursement.id),
    toReimbursementPayload(reimbursement),
    { merge: true },
  );
};

export const deleteReimbursement = async (reimbursementId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(reimbursementsCollection!, reimbursementId));
};

type CreateLunchRecordInput = {
  lunchRecord: Omit<LunchRecord, "id">;
  files?: File[];
  createReimbursement?: boolean;
};

export const createLunchRecord = async ({
  lunchRecord,
  files = [],
  createReimbursement = false,
}: CreateLunchRecordInput): Promise<void> => {
  ensureDb();
  const lunchRef = doc(lunchRecordsCollection!);
  const uploadedFiles = await uploadReceiptFiles(`lunchRecords/${lunchRef.id}/receipts`, files);
  const reimbursementRef = createReimbursement ? doc(reimbursementsCollection!) : null;
  const shouldCreateAccountingEntry =
    lunchRecord.paymentMethod === "direct_accounting" &&
    lunchRecord.accountingRequested === true &&
    Boolean(lunchRecord.accountingAccountId && lunchRecord.accountingCategoryId && lunchRecord.accountingMemo?.trim());
  const accountingEntryId = shouldCreateAccountingEntry
    ? await createLinkedAccountingExpense({
        transactionId: `lunch_${lunchRef.id}`,
        source: "lunch",
        accountId: lunchRecord.accountingAccountId,
        categoryId: lunchRecord.accountingCategoryId,
        memo: lunchRecord.accountingMemo,
        amount: lunchRecord.amount,
        date: lunchRecord.purchasedAt,
      })
    : undefined;
  const batch = writeBatch(db!);

  if (reimbursementRef) {
    batch.set(
      reimbursementRef,
      toReimbursementPayload(
        {
          title: `お弁当代 ${lunchRecord.date}`,
          amount: lunchRecord.amount,
          purchasedAt: lunchRecord.purchasedAt,
          buyer: lunchRecord.buyer,
          memo: lunchRecord.memo?.trim() || `お弁当代 ${lunchRecord.date}`,
          receipt: uploadedFiles.length > 0 ? `画像${uploadedFiles.length}件` : undefined,
          receiptFilesMeta: uploadedFiles,
          source: "lunch",
          accountingRequested: false,
          accountingLinked: false,
          accountingSourceType: "lunch",
          accountingSourceId: lunchRef.id,
        },
        serverTimestamp(),
      ),
    );
  }

  batch.set(
    lunchRef,
    toLunchPayload(
      {
        ...lunchRecord,
        paymentMethod: lunchRecord.paymentMethod ?? "reimbursement",
        reimbursementLinked: Boolean(reimbursementRef),
        reimbursementId: reimbursementRef?.id,
        imageUrls: uploadedFiles.map((item) => item.downloadUrl).filter((item): item is string => Boolean(item)),
        receiptFilesMeta: uploadedFiles,
        accountingRequested: shouldCreateAccountingEntry,
        accountingLinked: Boolean(accountingEntryId),
        accountingEntryId,
        accountingSourceType: "lunch",
        accountingSourceId: lunchRef.id,
      },
      serverTimestamp(),
    ),
  );

  await batch.commit();
};

export const saveLunchRecord = async (lunchRecord: LunchRecord): Promise<void> => {
  ensureDb();
  await setDoc(doc(lunchRecordsCollection!, lunchRecord.id), toLunchPayload(lunchRecord), { merge: true });
};

export const deleteLunchRecord = async (lunchRecordId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(lunchRecordsCollection!, lunchRecordId));
};
