import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import {
  instrumentCategorySortOrder,
  normalizeInstrumentCategory,
  type InstrumentCategoryKey,
} from "./catalog";
import type { Instrument, InstrumentStatus } from "../types";

const instrumentsCollection = db ? collection(db, "instruments") : null;

export type SaveInstrumentInput = {
  managementCode: string;
  name: string;
  category: InstrumentCategoryKey;
  status: InstrumentStatus;
  storageLocation: string;
  assigneeMemberId?: string;
  assigneeName?: string;
  notes?: string;
  sortOrder?: number | null;
};

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !instrumentsCollection) {
    throw new Error("Firebase 設定が未完了のため、楽器データを Firestore で扱えません。");
  }
};

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
};

const toInstrument = (id: string, value: Record<string, unknown>): Instrument => {
  const category = normalizeInstrumentCategory(value.category);
  const managementCode =
    toOptionalString(value.managementCode) ?? toOptionalString(value.code) ?? id;
  const storageLocation =
    toOptionalString(value.storageLocation) ?? toOptionalString(value.location) ?? "";
  const assigneeName =
    toOptionalString(value.assigneeName) ??
    (Array.isArray(value.assignees)
      ? value.assignees.find((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined);
  const notes = toOptionalString(value.notes) ?? toOptionalString(value.note) ?? "";

  return {
    id,
    managementCode,
    code: managementCode,
    name: typeof value.name === "string" ? value.name : "",
    category,
    categorySortOrder:
      typeof value.categorySortOrder === "number" && Number.isFinite(value.categorySortOrder)
        ? value.categorySortOrder
        : instrumentCategorySortOrder(category),
    status:
      value.status === "要調整" || value.status === "修理中" || value.status === "貸出中"
        ? value.status
        : "良好",
    storageLocation,
    location: storageLocation,
    assigneeMemberId: toOptionalString(value.assigneeMemberId),
    assigneeName,
    assignees: assigneeName ? [assigneeName] : [],
    notes,
    note: notes,
    sortOrder:
      typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder) ? value.sortOrder : 0,
    isActive: value.isActive !== false,
    createdAt: value.createdAt ?? null,
    updatedAt: value.updatedAt ?? null,
  };
};

const toPayload = (input: SaveInstrumentInput) => {
  const category = normalizeInstrumentCategory(input.category);
  const managementCode = input.managementCode.trim();
  const storageLocation = input.storageLocation.trim();
  const assigneeMemberId = input.assigneeMemberId?.trim() || "";
  const assigneeName = input.assigneeName?.trim() || "";
  const notes = input.notes?.trim() || "";

  return {
    managementCode,
    name: input.name.trim(),
    category,
    categorySortOrder: instrumentCategorySortOrder(category),
    status: input.status,
    storageLocation,
    assigneeMemberId,
    assigneeName,
    notes,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
    isActive: true,
    updatedAt: serverTimestamp(),
  };
};

export const subscribeInstruments = (
  callback: (rows: Instrument[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    query(instrumentsCollection!),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((item) => toInstrument(item.id, item.data() as Record<string, unknown>))
          .filter((item) => item.isActive !== false)
          .sort((left, right) => {
            const categoryCompare = (left.categorySortOrder ?? 999) - (right.categorySortOrder ?? 999);
            if (categoryCompare !== 0) return categoryCompare;
            const sortCompare = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
            if (sortCompare !== 0) return sortCompare;
            return (left.managementCode ?? left.code ?? "").localeCompare(
              right.managementCode ?? right.code ?? "",
              "ja",
            );
          }),
      );
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("instruments subscription failed"));
    },
  );
};

export const createInstrument = async (input: SaveInstrumentInput): Promise<void> => {
  ensureDb();
  await addDoc(instrumentsCollection!, {
    ...toPayload(input),
    createdAt: serverTimestamp(),
  });
};

export const saveInstrument = async (instrumentId: string, input: SaveInstrumentInput): Promise<void> => {
  ensureDb();
  await setDoc(doc(instrumentsCollection!, instrumentId), toPayload(input), { merge: true });
};

export const deleteInstrument = async (instrumentId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(instrumentsCollection!, instrumentId));
};
