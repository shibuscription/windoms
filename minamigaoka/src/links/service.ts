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
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { ExternalLinkItem } from "../types";

const linksCollection = db ? collection(db, "links") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !linksCollection) {
    throw new Error("Firebase 設定が未完了のため、リンク集データを Firestore で扱えません。");
  }
};

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
};

const toLinkItem = (id: string, value: Record<string, unknown>): ExternalLinkItem => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  url: typeof value.url === "string" ? value.url : "",
  type: value.type === "photo" || value.type === "admin" ? value.type : "sns",
  role: value.role === "officer" ? "officer" : "all",
  ogTitle: toOptionalString(value.ogTitle),
  ogImageUrl: toOptionalString(value.ogImageUrl),
  faviconUrl: toOptionalString(value.faviconUrl),
  host: toOptionalString(value.host),
});

const toPayload = (item: Omit<ExternalLinkItem, "id"> | ExternalLinkItem) => ({
  title: item.title.trim(),
  url: item.url.trim(),
  type: item.type,
  role: item.role,
  ogTitle: item.ogTitle?.trim() || "",
  ogImageUrl: item.ogImageUrl?.trim() || "",
  faviconUrl: item.faviconUrl?.trim() || "",
  host: item.host?.trim() || "",
  updatedAt: serverTimestamp(),
});

export const subscribeLinks = (
  callback: (items: ExternalLinkItem[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    query(linksCollection!, orderBy("title", "asc")),
    (snapshot) => {
      callback(snapshot.docs.map((item) => toLinkItem(item.id, item.data() as Record<string, unknown>)));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("links subscription failed"));
    },
  );
};

export const createLinkItem = async (item: Omit<ExternalLinkItem, "id">): Promise<string> => {
  ensureDb();
  const created = await addDoc(linksCollection!, toPayload(item));
  return created.id;
};

export const saveLinkItem = async (item: ExternalLinkItem): Promise<void> => {
  ensureDb();
  await setDoc(doc(linksCollection!, item.id), toPayload(item), { merge: true });
};

export const deleteLinkItem = async (linkId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(linksCollection!, linkId));
};
