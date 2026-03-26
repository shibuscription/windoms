import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { Score } from "../types";

const scoresCollection = db ? collection(db, "scores") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !scoresCollection) {
    throw new Error("Firebase 設定が未完了のため、楽譜データを Firestore で扱えません。");
  }
};

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
};

const toScore = (id: string, value: Record<string, unknown>): Score => ({
  id,
  no:
    typeof value.no === "number" && Number.isFinite(value.no)
      ? value.no
      : typeof value.no === "string" && value.no.trim() && /^\d+$/u.test(value.no.trim())
        ? Number(value.no.trim())
        : Number(id),
  title: typeof value.title === "string" ? value.title : "",
  publisher: toOptionalString(value.publisher),
  productCode: toOptionalString(value.productCode),
  duration: toOptionalString(value.duration),
  note: toOptionalString(value.note),
});

const toPayload = (score: Score) => ({
  no: score.no,
  title: score.title.trim(),
  publisher: score.publisher?.trim() || "",
  productCode: score.productCode?.trim() || "",
  duration: score.duration?.trim() || "",
  note: score.note?.trim() || "",
  updatedAt: serverTimestamp(),
});

export const subscribeScores = (
  callback: (scores: Score[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    query(scoresCollection!, orderBy("no", "asc")),
    (snapshot) => {
      callback(
        snapshot.docs.map((item) => toScore(item.id, item.data() as Record<string, unknown>)),
      );
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("scores subscription failed"));
    },
  );
};

export const saveScore = async (score: Score, previousId?: string | null): Promise<void> => {
  ensureDb();

  const nextId = String(score.no);
  const currentId = previousId ?? nextId;

  if (currentId === nextId) {
    await setDoc(
      doc(scoresCollection!, nextId),
      toPayload(score),
      { merge: true },
    );
    return;
  }

  const batch = writeBatch(db!);
  batch.set(
    doc(scoresCollection!, nextId),
    toPayload(score),
    { merge: true },
  );
  batch.delete(doc(scoresCollection!, currentId));
  await batch.commit();
};

export const deleteScore = async (scoreId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(scoresCollection!, scoreId));
};
