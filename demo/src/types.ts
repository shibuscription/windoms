export type SessionType = "normal" | "self" | "event";
export type RsvpStatus = "yes" | "maybe" | "no" | "unknown";
export type DutyRequirement = "duty" | "watch";

export type DemoRsvp = {
  uid: string;
  displayName: string;
  status: RsvpStatus;
};

export type DemoMember = {
  uid: string;
  grade: number;
  instrumentOrder: number;
  kana: string;
};

export type SessionDoc = {
  order: number;
  startTime: string;
  endTime: string;
  type: SessionType;
  dutyRequirement: DutyRequirement;
  // compatibility: dutyRequirement === "duty" の旧フラグ
  requiresShift?: boolean;
  location?: string;
  assignees: string[];
  assigneeNameSnapshot?: string;
  plannedInstructors?: string[];
  plannedSeniors?: string[];
  // demo-only: 本番想定の subcollection(rsvps/{uid}) の代替として画面表示に使う
  demoRsvps?: DemoRsvp[];
};

export type ScheduleDayDoc = {
  defaultLocation?: string;
  notice?: string;
  plannedInstructors?: string[];
  plannedSeniors?: string[];
  sessions: SessionDoc[];
};

export type Activity = {
  startTime: string;
  type: string;
  title?: string;
  songIds?: string[];
};

export type DayLog = {
  notes: string;
  weather?: string;
  activities: Activity[];
  actualInstructors: string[];
  actualSeniors: string[];
};

export type DemoData = {
  scheduleDays: Record<string, ScheduleDayDoc>;
  dayLogs: Record<string, DayLog>;
  members: Record<string, DemoMember>;
  demoDictionaries: {
    instructors: string[];
    seniors: string[];
  };
};
