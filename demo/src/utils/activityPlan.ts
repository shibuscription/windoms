import { todayDateKey } from "./date";

export type ActivityPlanStatus =
  | "NOT_STARTED"
  | "SESSIONS_SET"
  | "SURVEY_OPEN"
  | "SURVEY_CLOSED"
  | "AI_DRAFTED"
  | "SHIFT_CONFIRMED"
  | "NOTIFIED";

export const getActivityPlanTargetMonthKey = (baseDateKey: string = todayDateKey()): string => {
  const [year, month] = baseDateKey.slice(0, 7).split("-").map(Number);
  const targetMonthDate = new Date(year, month, 1);
  return `${targetMonthDate.getFullYear()}-${String(targetMonthDate.getMonth() + 1).padStart(2, "0")}`;
};

export const activityPlanStatusStorageKey = (monthKey: string): string =>
  `windoms:activity-plan-status:${monthKey}`;

export const activityPlanUnansweredStorageKey = (monthKey: string): string =>
  `windoms:demo-unanswered:${monthKey}`;

export const readDemoRole = (): "admin" | "member" => {
  if (typeof window === "undefined") return "admin";
  const role = window.localStorage.getItem("windoms:demo-role");
  return role === "member" ? "member" : "admin";
};

export const readActivityPlanStatus = (monthKey: string): ActivityPlanStatus => {
  if (typeof window === "undefined") return "NOT_STARTED";
  const status = window.localStorage.getItem(activityPlanStatusStorageKey(monthKey)) as ActivityPlanStatus | null;
  return status ?? "NOT_STARTED";
};

export const readDemoUnansweredCount = (monthKey: string): number => {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(activityPlanUnansweredStorageKey(monthKey));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};
