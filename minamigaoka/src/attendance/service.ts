import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { RsvpStatus } from "../types";

export type SaveAttendanceEntry = {
  date: string;
  sessionId: string;
  memberId: string;
  displayName: string;
  status: RsvpStatus;
  comment: string;
  updatedBy: string;
};

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig) {
    throw new Error("Firebase 設定が未設定のため、出欠を保存できません。");
  }
};

export const saveAttendanceEntries = async (entries: SaveAttendanceEntry[]): Promise<void> => {
  ensureDb();

  const batch = writeBatch(db!);

  entries.forEach((entry) => {
    const ref = doc(collection(db!, "scheduleDays", entry.date, "sessions", entry.sessionId, "rsvps"), entry.memberId);
    const comment = entry.comment.trim();

    if (entry.status === "unknown") {
      batch.delete(ref);
      return;
    }

    batch.set(
      ref,
      {
        status: entry.status,
        comment,
        displayNameSnapshot: entry.displayName,
        updatedAt: serverTimestamp(),
        updatedBy: entry.updatedBy,
      },
      { merge: true },
    );
  });

  await batch.commit();
};
