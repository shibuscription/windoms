import { isChildMember } from "../members/permissions";
import type { MemberRecord, MemberRelationRecord } from "../members/types";
import type { DemoRsvp, RsvpStatus, SessionDoc } from "../types";

export type AttendanceViewMode = "session" | "member";

export type AttendanceSessionItem = {
  key: string;
  date: string;
  session: SessionDoc;
};

export const attendanceViewModeStorageKey = "windoms-attendance-view-mode";

export const findRsvpForMember = (
  session: Pick<SessionDoc, "demoRsvps">,
  member: Pick<MemberRecord, "id" | "authUid" | "loginId">,
): DemoRsvp | null =>
  session.demoRsvps?.find(
    (item) =>
      item.uid === member.id ||
      (member.authUid && item.uid === member.authUid) ||
      (member.loginId && item.uid === member.loginId),
  ) ?? null;

export const getMemberAttendanceStatus = (
  session: Pick<SessionDoc, "demoRsvps">,
  member: Pick<MemberRecord, "id" | "authUid" | "loginId">,
): RsvpStatus => findRsvpForMember(session, member)?.status ?? "unknown";

export const countAttendanceStatuses = (
  session: Pick<SessionDoc, "demoRsvps">,
  members: Array<Pick<MemberRecord, "id" | "authUid" | "loginId">>,
) => {
  const counts = { yes: 0, maybe: 0, no: 0, unknown: 0 };
  members.forEach((member) => {
    const status = getMemberAttendanceStatus(session, member);
    counts[status] += 1;
  });
  return counts;
};

export const sortAttendanceSessions = (items: AttendanceSessionItem[]): AttendanceSessionItem[] =>
  [...items].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.session.order !== right.session.order) return left.session.order - right.session.order;
    const startCompare = left.session.startTime.localeCompare(right.session.startTime);
    if (startCompare !== 0) return startCompare;
    return (left.session.id ?? "").localeCompare(right.session.id ?? "");
  });

export const resolveEditableAttendanceMemberIds = (
  linkedMember: MemberRecord | null,
  authRole: "parent" | "admin" | null | undefined,
  members: MemberRecord[],
  relations: MemberRelationRecord[],
): Set<string> => {
  const result = new Set<string>();
  const isAdmin =
    authRole === "admin" || linkedMember?.role === "admin" || linkedMember?.adminRole === "admin";

  if (isAdmin) {
    members
      .filter((member) => member.memberStatus === "active" && isChildMember(member))
      .forEach((member) => result.add(member.id));
    return result;
  }

  if (!linkedMember) {
    return result;
  }

  if (isChildMember(linkedMember)) {
    result.add(linkedMember.id);
    return result;
  }

  relations
    .filter(
      (relation) =>
        relation.status === "active" && relation.guardianMemberId === linkedMember.id,
    )
    .forEach((relation) => result.add(relation.childMemberId));

  return result;
};
