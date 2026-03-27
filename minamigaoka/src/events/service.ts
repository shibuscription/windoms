import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { EventKind, EventRecord, EventState } from "../types";

const eventsCollection = db ? collection(db, "events") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig || !eventsCollection) {
    throw new Error("Firebase 設定が未設定のため、イベントを Firestore で扱えません。");
  }
};

const toEventKind = (value: unknown): EventKind => {
  if (
    value === "コンクール" ||
    value === "演奏会" ||
    value === "合同練習" ||
    value === "その他"
  ) {
    return value;
  }
  return "その他";
};

const toEventState = (value: unknown): EventState => (value === "done" ? "done" : "active");

const toOptionalString = (value: unknown): string | undefined => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized : undefined;
};

const toEventRecord = (id: string, value: Record<string, unknown>): EventRecord => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  kind: toEventKind(value.kind),
  state: toEventState(value.state),
  eventSortDate: typeof value.eventSortDate === "string" ? value.eventSortDate : "",
  memo: toOptionalString(value.memo),
  sessionIds: Array.isArray(value.sessionIds)
    ? value.sessionIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [],
});

const toPayload = (event: Omit<EventRecord, "id">) => ({
  title: event.title.trim(),
  kind: event.kind,
  state: event.state,
  eventSortDate: event.eventSortDate,
  memo: event.memo?.trim() || "",
  sessionIds: Array.isArray(event.sessionIds) ? event.sessionIds : [],
  updatedAt: serverTimestamp(),
});

export const subscribeEvents = (
  callback: (events: EventRecord[]) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    eventsCollection!,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((item) => toEventRecord(item.id, item.data() as Record<string, unknown>))
          .sort((left, right) =>
            `${left.eventSortDate}-${left.title}`.localeCompare(`${right.eventSortDate}-${right.title}`, "ja"),
          ),
      );
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("events subscription failed"));
    },
  );
};

export const createEvent = async (event: Omit<EventRecord, "id">): Promise<void> => {
  ensureDb();
  await addDoc(eventsCollection!, {
    ...toPayload(event),
    createdAt: serverTimestamp(),
  });
};

export const saveEvent = async (event: EventRecord): Promise<void> => {
  ensureDb();
  await setDoc(doc(eventsCollection!, event.id), toPayload(event), { merge: true });
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  ensureDb();
  await deleteDoc(doc(eventsCollection!, eventId));
};
