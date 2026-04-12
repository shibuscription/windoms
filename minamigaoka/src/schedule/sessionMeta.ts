import type { SessionDoc, SessionType } from "../types";

export const sessionTypeLabel: Record<SessionType, string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
  other: "その他",
};

export const isDisplayOnlySessionType = (type: SessionType): boolean => type === "other";

export const isAttendanceTargetSessionType = (type: SessionType): boolean => type !== "other";

export const isAttendanceTargetSession = (session: Pick<SessionDoc, "type">): boolean =>
  isAttendanceTargetSessionType(session.type);

export const isJournalTargetSession = (session: Pick<SessionDoc, "type">): boolean =>
  session.type !== "other";

export const showSessionAssignee = (session: Pick<SessionDoc, "type">): boolean =>
  session.type !== "other";

export const getSessionAssigneeRoleLabel = (session: Pick<SessionDoc, "type">): string | null => {
  if (session.type === "other") return null;
  return session.type === "self" ? "見守り" : "当番";
};

export const getSessionDisplayTitle = (session: Pick<SessionDoc, "type" | "eventName">): string =>
  (session.type === "event" || session.type === "other") && session.eventName?.trim()
    ? session.eventName.trim()
    : sessionTypeLabel[session.type];
