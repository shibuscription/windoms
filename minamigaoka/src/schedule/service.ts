import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, firebaseFunctionsRegion, firebaseProjectId, functions, hasFirebaseAppConfig } from "../config/firebase";
import type { ScheduleDayDoc, SessionDoc } from "../types";

type EditableSessionType = "normal" | "self" | "event";

export type SaveCalendarSessionInput = {
  originalDate?: string;
  date: string;
  sessionId?: string;
  startTime: string;
  endTime: string;
  type: EditableSessionType;
  eventName: string;
  location: string;
  assigneeFamilyId: string;
  note: string;
};

type SaveCalendarSessionResponse = {
  date: string;
  sessionId: string;
};

type DeleteCalendarSessionResponse = {
  date: string;
  sessionId: string;
};

const scheduleDaysCollection = db ? collection(db, "scheduleDays") : null;

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig) {
    throw new Error("Firebase 設定が不足しているため、スケジュールを読み込めません。");
  }
};

const ensureFunctions = () => {
  if (!functions) {
    throw new Error(
      `Cloud Functions 設定が不足しています。projectId=${firebaseProjectId || "(empty)"} region=${firebaseFunctionsRegion}`,
    );
  }
};

const normalizeSessionType = (value: unknown): EditableSessionType => {
  if (value === "self" || value === "event") return value;
  return "normal";
};

const toSessionDoc = (id: string, value: Record<string, unknown>): SessionDoc => {
  const type = value.type === "self" || value.type === "event" ? value.type : "normal";
  const dutyRequirement = value.dutyRequirement === "watch" ? "watch" : "duty";
  return {
    id,
    order: typeof value.order === "number" ? value.order : 0,
    startTime: typeof value.startTime === "string" ? value.startTime : "",
    endTime: typeof value.endTime === "string" ? value.endTime : "",
    type,
    eventName: typeof value.eventName === "string" ? value.eventName : "",
    dutyRequirement,
    requiresShift:
      typeof value.requiresShift === "boolean" ? value.requiresShift : dutyRequirement === "duty",
    location: typeof value.location === "string" ? value.location : "",
    assigneeFamilyId: typeof value.assigneeFamilyId === "string" ? value.assigneeFamilyId : "",
    assignees: Array.isArray(value.assignees)
      ? value.assignees.filter((item): item is string => typeof item === "string")
      : [],
    assigneeNameSnapshot:
      typeof value.assigneeNameSnapshot === "string" ? value.assigneeNameSnapshot : "",
    note: typeof value.note === "string" ? value.note : "",
    plannedInstructors: Array.isArray(value.plannedInstructors)
      ? value.plannedInstructors.filter((item): item is string => typeof item === "string")
      : [],
    plannedSeniors: Array.isArray(value.plannedSeniors)
      ? value.plannedSeniors.filter((item): item is string => typeof item === "string")
      : [],
  };
};

const compareSessions = (left: SessionDoc, right: SessionDoc): number => {
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  const startCompare = left.startTime.localeCompare(right.startTime);
  if (startCompare !== 0) {
    return startCompare;
  }
  const endCompare = left.endTime.localeCompare(right.endTime);
  if (endCompare !== 0) {
    return endCompare;
  }
  return (left.id ?? "").localeCompare(right.id ?? "");
};

export const subscribeScheduleDays = (
  callback: (days: Record<string, ScheduleDayDoc>) => void,
  onError?: (error: Error) => void,
): (() => void) => {
  ensureDb();

  return onSnapshot(
    scheduleDaysCollection!,
    async (snapshot) => {
      try {
        const dayEntries = await Promise.all(
          snapshot.docs.map(async (dayDoc) => {
            const sessionsSnapshot = await getDocs(collection(db!, "scheduleDays", dayDoc.id, "sessions"));
            const sessions = sessionsSnapshot.docs
              .map((sessionDoc) => toSessionDoc(sessionDoc.id, sessionDoc.data() as Record<string, unknown>))
              .sort(compareSessions);
            const dayValue = dayDoc.data() as Record<string, unknown>;
            const day: ScheduleDayDoc = {
              defaultLocation:
                typeof dayValue.defaultLocation === "string" ? dayValue.defaultLocation : "",
              notice: typeof dayValue.notice === "string" ? dayValue.notice : "",
              plannedInstructors: Array.isArray(dayValue.plannedInstructors)
                ? dayValue.plannedInstructors.filter((item): item is string => typeof item === "string")
                : [],
              plannedSeniors: Array.isArray(dayValue.plannedSeniors)
                ? dayValue.plannedSeniors.filter((item): item is string => typeof item === "string")
                : [],
              sessions,
            };
            return [dayDoc.id, day] as const;
          }),
        );

        callback(
          Object.fromEntries(dayEntries.sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))),
        );
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error("スケジュールの読み込みに失敗しました。"));
      }
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error("スケジュールの購読に失敗しました。"));
    },
  );
};

export const createCalendarSession = async (input: SaveCalendarSessionInput): Promise<SaveCalendarSessionResponse> => {
  ensureFunctions();
  const callable = httpsCallable<SaveCalendarSessionInput, SaveCalendarSessionResponse>(
    functions!,
    "createCalendarSession",
  );
  const result = await callable({
    ...input,
    type: normalizeSessionType(input.type),
  });
  return result.data;
};

export const updateCalendarSession = async (input: SaveCalendarSessionInput): Promise<SaveCalendarSessionResponse> => {
  ensureFunctions();
  const callable = httpsCallable<SaveCalendarSessionInput, SaveCalendarSessionResponse>(
    functions!,
    "updateCalendarSession",
  );
  const result = await callable({
    ...input,
    type: normalizeSessionType(input.type),
  });
  return result.data;
};

export const deleteCalendarSession = async (date: string, sessionId: string): Promise<DeleteCalendarSessionResponse> => {
  ensureFunctions();
  const callable = httpsCallable<{ date: string; sessionId: string }, DeleteCalendarSessionResponse>(
    functions!,
    "deleteCalendarSession",
  );
  const result = await callable({ date, sessionId });
  return result.data;
};
