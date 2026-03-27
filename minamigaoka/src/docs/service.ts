import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { DocCategory, DocMemo } from "../types";

const docsCollection = db ? collection(db, "docs") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !docsCollection) {
    throw new Error("Firebase 設定が未完了のため、資料データを Firestore で扱えません。");
  }
};

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
};

const toUpdatedAt = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date(0).toISOString();
};

const toTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const toDocMemo = (id: string, value: Record<string, unknown>): DocMemo => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  body: typeof value.body === "string" ? value.body : "",
  category: toOptionalString(value.category) as DocCategory | undefined,
  tags: toTags(value.tags),
  pinned: value.pinned === true,
  updatedAt: toUpdatedAt(value.updatedAt),
});

const toPayload = (docMemo: Omit<DocMemo, "id"> | DocMemo) => ({
  title: docMemo.title.trim(),
  body: docMemo.body,
  category: docMemo.category?.trim() || "",
  tags: (docMemo.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0),
  pinned: Boolean(docMemo.pinned),
  updatedAt: serverTimestamp(),
});

export const subscribeDocs = (
  callback: (docs: DocMemo[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    query(docsCollection!, orderBy("updatedAt", "desc")),
    (snapshot) => {
      callback(snapshot.docs.map((item) => toDocMemo(item.id, item.data() as Record<string, unknown>)));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("docs subscription failed"));
    },
  );
};

export const createDocMemo = async (docMemo: Omit<DocMemo, "id" | "updatedAt">): Promise<string> => {
  ensureDb();
  const created = await addDoc(docsCollection!, toPayload({ ...docMemo, updatedAt: "" }));
  return created.id;
};

export const saveDocMemo = async (docMemo: DocMemo): Promise<void> => {
  ensureDb();
  await setDoc(doc(docsCollection!, docMemo.id), toPayload(docMemo), { merge: true });
};

export const deleteDocMemo = async (docId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(docsCollection!, docId));
};
