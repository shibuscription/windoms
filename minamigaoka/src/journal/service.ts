import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { DayLog, DemoRsvp } from "../types";

const emptyDayLog = (): DayLog => ({
  notes: "",
  weather: "",
  activities: [],
  actualInstructors: [],
  actualSeniors: [],
  mainInstructorAttendance: {},
  dutyStamps: {},
});

const dayLogsCollection = db ? collection(db, "dayLogs") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig) {
    throw new Error("Firebase 設定が不足しているため当番日誌を保存できません。");
  }
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const toDayLog = (value: Record<string, unknown> | undefined): DayLog => {
  if (!value) return emptyDayLog();

  return {
    notes: typeof value.notes === "string" ? value.notes : "",
    weather: typeof value.weather === "string" ? value.weather : "",
    activities: Array.isArray(value.activities)
      ? value.activities.reduce<DayLog["activities"]>((result, item) => {
          if (!item || typeof item !== "object") return result;
          const source = item as Record<string, unknown>;
          const startTime = typeof source.startTime === "string" ? source.startTime : "";
          const type = typeof source.type === "string" ? source.type : "";
          if (!startTime || !type) return result;
          result.push({
            startTime,
            type,
            title: typeof source.title === "string" ? source.title : "",
            songIds: toStringArray(source.songIds),
          });
          return result;
        }, [])
      : [],
    actualInstructors: toStringArray(value.actualInstructors),
    actualSeniors: toStringArray(value.actualSeniors),
    mainInstructorAttendance:
      value.mainInstructorAttendance && typeof value.mainInstructorAttendance === "object"
        ? Object.entries(value.mainInstructorAttendance as Record<string, unknown>).reduce<Record<string, boolean>>(
            (result, [key, current]) => {
              if (typeof current === "boolean") result[key] = current;
              return result;
            },
            {},
          )
        : {},
    dutyStamps:
      value.dutyStamps && typeof value.dutyStamps === "object"
        ? Object.entries(value.dutyStamps as Record<string, unknown>).reduce<NonNullable<DayLog["dutyStamps"]>>(
            (result, [key, current]) => {
              if (!current || typeof current !== "object") return result;
              const source = current as Record<string, unknown>;
              const stampedByUid =
                typeof source.stampedByUid === "string" ? source.stampedByUid : "";
              const stampedByName =
                typeof source.stampedByName === "string" ? source.stampedByName : "";
              const stampedAt = typeof source.stampedAt === "string" ? source.stampedAt : "";
              if (!stampedByUid || !stampedByName || !stampedAt) return result;
              result[key] = { stampedByUid, stampedByName, stampedAt };
              return result;
            },
            {},
          )
        : {},
  };
};

const toDayLogPayload = (dayLog: DayLog) => ({
  notes: dayLog.notes ?? "",
  weather: dayLog.weather ?? "",
  activities: (dayLog.activities ?? []).map((activity) => ({
    startTime: activity.startTime,
    type: activity.type,
    title: activity.title ?? "",
    songIds: activity.songIds ?? [],
  })),
  actualInstructors: dayLog.actualInstructors ?? [],
  actualSeniors: dayLog.actualSeniors ?? [],
  mainInstructorAttendance: dayLog.mainInstructorAttendance ?? {},
  dutyStamps: dayLog.dutyStamps ?? {},
  updatedAt: serverTimestamp(),
});

export const subscribeDayLogs = (
  callback: (dayLogs: Record<string, DayLog>) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    dayLogsCollection!,
    (snapshot) => {
      const nextDayLogs = snapshot.docs.reduce<Record<string, DayLog>>((result, dayLogDoc) => {
        result[dayLogDoc.id] = toDayLog(dayLogDoc.data() as Record<string, unknown>);
        return result;
      }, {});
      callback(nextDayLogs);
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("当番日誌の読込に失敗しました。"));
    },
  );
};

export const saveDayLog = async (date: string, dayLog: DayLog): Promise<void> => {
  ensureDb();
  await setDoc(doc(dayLogsCollection!, date), toDayLogPayload(dayLog), { merge: true });
};

export const ensureDayLog = async (date: string): Promise<void> => {
  ensureDb();
  const dayLogRef = doc(dayLogsCollection!, date);
  const snapshot = await getDoc(dayLogRef);
  if (snapshot.exists()) return;
  await setDoc(dayLogRef, toDayLogPayload(emptyDayLog()), { merge: true });
};

export const saveSessionRsvps = async (
  date: string,
  sessionId: string,
  rsvps: DemoRsvp[],
): Promise<void> => {
  ensureDb();

  const rsvpsCollection = collection(db!, "scheduleDays", date, "sessions", sessionId, "rsvps");
  const existingSnapshot = await getDocs(rsvpsCollection);
  const nextIds = new Set(rsvps.map((rsvp) => rsvp.uid));
  const batch = writeBatch(db!);

  existingSnapshot.docs.forEach((currentDoc) => {
    if (!nextIds.has(currentDoc.id)) {
      batch.delete(currentDoc.ref);
    }
  });

  rsvps.forEach((rsvp) => {
    batch.set(
      doc(rsvpsCollection, rsvp.uid),
      {
        status: rsvp.status,
        comment: "",
        displayNameSnapshot: rsvp.displayName,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};
