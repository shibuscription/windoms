import type { MemberRecord } from "../members/types";
import type { DemoData, Todo, TodoKind, TodoSharedScope } from "../types";
import { formatDateYmd, isValidDateKey, todayDateKey } from "./date";

const SESSION_REF_PREFIX = "session:";

const typeLabel: Record<"normal" | "self" | "event", string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};

const toDateLabel = (dateKey: string): string => dateKey.replace(/-/g, "/");

const toEpoch = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

const normalizeDueDate = (dueDate?: string): string | null =>
  dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null;

const toDaySerial = (dateKey: string): number => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

export type TodoDueTone = "normal" | "soon" | "urgent";

export const formatTodoDueDisplay = (
  dueDate?: string,
  completed = false,
): { text: string; tone: TodoDueTone } => {
  const normalized = normalizeDueDate(dueDate);
  if (!normalized || !isValidDateKey(normalized)) {
    return { text: "—", tone: "normal" };
  }

  const base = formatDateYmd(normalized);
  if (completed) {
    return { text: base, tone: "normal" };
  }

  const diffDays = toDaySerial(normalized) - toDaySerial(todayDateKey());
  if (diffDays < 0) {
    return { text: `${base}（期限切れ${Math.abs(diffDays)}日）`, tone: "urgent" };
  }
  if (diffDays === 0) {
    return { text: `${base}（今日まで）`, tone: "urgent" };
  }
  if (diffDays <= 3) {
    return { text: `${base}（あと${diffDays}日）`, tone: "soon" };
  }
  return { text: `${base}（あと${diffDays}日）`, tone: "normal" };
};

export const makeSessionRelatedId = (dateKey: string, order: number): string =>
  `${SESSION_REF_PREFIX}${dateKey}:${order}`;

export const parseSessionRelatedId = (
  id: string,
): { dateKey: string; order: number } | null => {
  if (!id.startsWith(SESSION_REF_PREFIX)) return null;
  const raw = id.slice(SESSION_REF_PREFIX.length);
  const [dateKey, orderText] = raw.split(":");
  const order = Number(orderText);
  if (!dateKey || !Number.isFinite(order) || order < 1) return null;
  return { dateKey, order };
};

export const sortTodos = (items: Todo[]): Todo[] =>
  [...items].sort((a, b) => {
    const dueA = normalizeDueDate(a.dueDate);
    const dueB = normalizeDueDate(b.dueDate);
    if (dueA && dueB && dueA !== dueB) return dueA.localeCompare(dueB);
    if (dueA && !dueB) return -1;
    if (!dueA && dueB) return 1;
    return toEpoch(a.createdAt) - toEpoch(b.createdAt);
  });

export const sortTodosOpenFirst = (items: Todo[]): Todo[] => {
  const ordered = sortTodos(items);
  return [
    ...ordered.filter((item) => !item.completed),
    ...ordered.filter((item) => item.completed),
  ];
};

export const resolveTodoRelatedSummary = (
  data: DemoData,
  todo: Todo,
): { label: string; to: string | null } => {
  const related = todo.related ?? null;
  if (!related) return { label: "—", to: null };

  if (related.type === "event") {
    const event = data.events.find((item) => item.id === related.id);
    return {
      label: `🎪 ${event?.title ?? related.id}`,
      to: `/events/${related.id}`,
    };
  }

  const parsed = parseSessionRelatedId(related.id);
  if (!parsed) return { label: "📅 予定（不明）", to: null };
  const day = data.scheduleDays[parsed.dateKey];
  const session = day?.sessions.find((item) => item.order === parsed.order);
  const sessionName = session
    ? session.type === "event"
      ? session.eventName ?? typeLabel.event
      : typeLabel[session.type]
    : "予定";
  return {
    label: `📅 ${toDateLabel(parsed.dateKey)} ${sessionName}`,
    to: `/today?date=${parsed.dateKey}`,
  };
};

export const buildSessionChoices = (
  data: DemoData,
): Array<{ id: string; label: string }> => {
  const rows: Array<{ id: string; dateKey: string; order: number; label: string }> = [];
  Object.entries(data.scheduleDays).forEach(([dateKey, day]) => {
    day.sessions.forEach((session) => {
      const name =
        session.type === "event" ? session.eventName ?? typeLabel.event : typeLabel[session.type];
      rows.push({
        id: makeSessionRelatedId(dateKey, session.order),
        dateKey,
        order: session.order,
        label: `${toDateLabel(dateKey)} ${name} (${session.startTime}-${session.endTime})`,
      });
    });
  });
  rows.sort((a, b) => `${a.dateKey}:${a.order}`.localeCompare(`${b.dateKey}:${b.order}`));
  return rows.map((row) => ({ id: row.id, label: row.label }));
};

export type TodoAudienceRole = "child" | "parent" | "officer" | "admin" | "private-only";

const hasMemberType = (member: MemberRecord | null, type: "parent" | "child" | "teacher" | "obog"): boolean =>
  Boolean(member?.memberTypes?.includes(type));

export const resolveTodoAudienceRole = (
  linkedMember: MemberRecord | null,
  fallbackRole?: "parent" | "admin" | null,
): TodoAudienceRole => {
  if (linkedMember?.adminRole === "admin" || linkedMember?.role === "admin" || fallbackRole === "admin") {
    return "admin";
  }
  if (linkedMember?.adminRole === "officer" || linkedMember?.role === "officer") {
    return "officer";
  }
  if (linkedMember?.role === "child" || hasMemberType(linkedMember, "child")) {
    return "child";
  }
  if (linkedMember?.role === "parent" || hasMemberType(linkedMember, "parent") || fallbackRole === "parent") {
    return "parent";
  }
  if (linkedMember?.role === "teacher" || hasMemberType(linkedMember, "teacher") || hasMemberType(linkedMember, "obog")) {
    return "private-only";
  }
  return "parent";
};

export const getVisibleSharedScopesForRole = (role: TodoAudienceRole): TodoSharedScope[] => {
  switch (role) {
    case "admin":
      return ["parent", "officer", "child"];
    case "officer":
      return ["parent", "officer"];
    case "parent":
      return ["parent"];
    case "child":
      return ["child"];
    default:
      return [];
  }
};

export const getCreatableSharedScopesForRole = (role: TodoAudienceRole): TodoSharedScope[] => {
  switch (role) {
    case "admin":
      return ["parent", "officer", "child"];
    case "officer":
      return ["parent", "officer"];
    case "parent":
      return ["parent"];
    case "child":
      return ["child"];
    default:
      return [];
  }
};

export const getTodoKindOptionsForRole = (role: TodoAudienceRole): TodoKind[] =>
  getCreatableSharedScopesForRole(role).length > 0 ? ["shared", "private"] : ["private"];

export const canViewSharedTodo = (
  todo: Todo,
  linkedMember: MemberRecord | null,
  fallbackRole?: "parent" | "admin" | null,
): boolean => {
  if (todo.kind !== "shared" || !todo.sharedScope) return false;
  return getVisibleSharedScopesForRole(resolveTodoAudienceRole(linkedMember, fallbackRole)).includes(todo.sharedScope);
};

export const canMemberBeAssignedToSharedScope = (
  member: MemberRecord,
  scope: TodoSharedScope,
): boolean => {
  const isAdmin = member.adminRole === "admin" || member.role === "admin";
  const isOfficer = member.adminRole === "officer" || member.role === "officer";
  const isChild = member.role === "child" || hasMemberType(member, "child");
  const isParent = member.role === "parent" || hasMemberType(member, "parent");

  if (scope === "child") return isChild;
  if (scope === "parent") return isParent || isOfficer || isAdmin;
  return isOfficer || isAdmin;
};
