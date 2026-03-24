import { toInternalAuthEmail } from "../auth/loginId";
import type { AuthUserSummary, MemberRecord, MemberRelationRecord } from "./types";

type DuplicateRelation = {
  key: string;
  relations: MemberRelationRecord[];
};

export const findMembersWithoutAuth = (members: MemberRecord[]): MemberRecord[] =>
  members.filter((member) => !member.authUid.trim());

export const findAuthUsersWithoutMember = (
  authUsers: AuthUserSummary[],
  members: MemberRecord[],
): AuthUserSummary[] => {
  const linkedAuthUids = new Set(members.map((member) => member.authUid).filter(Boolean));
  return authUsers.filter((authUser) => !linkedAuthUids.has(authUser.uid));
};

export const findMembersWithMissingAuth = (
  members: MemberRecord[],
  authUsers: AuthUserSummary[],
): MemberRecord[] => {
  const authUidSet = new Set(authUsers.map((authUser) => authUser.uid));
  return members.filter((member) => member.authUid.trim() && !authUidSet.has(member.authUid));
};

export const findRelationOrphans = (
  relations: MemberRelationRecord[],
  members: MemberRecord[],
): MemberRelationRecord[] => {
  const memberIds = new Set(members.map((member) => member.id));
  return relations.filter(
    (relation) =>
      relation.status === "active" &&
      (!memberIds.has(relation.childMemberId) || !memberIds.has(relation.guardianMemberId)),
  );
};

export const findDuplicateRelations = (relations: MemberRelationRecord[]): DuplicateRelation[] => {
  const activeRelations = relations.filter((relation) => relation.status === "active");
  const map = activeRelations.reduce<Map<string, MemberRelationRecord[]>>((result, relation) => {
    const key = `${relation.childMemberId}:${relation.guardianMemberId}`;
    const bucket = result.get(key) ?? [];
    bucket.push(relation);
    result.set(key, bucket);
    return result;
  }, new Map());

  return Array.from(map.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, relations: bucket }));
};

export const findAuthCandidate = (
  member: MemberRecord,
  authUsers: AuthUserSummary[],
): AuthUserSummary | null => {
  if (!member.loginId.trim()) return null;
  const expectedEmail = toInternalAuthEmail(member.loginId);
  return authUsers.find((authUser) => authUser.email.toLowerCase() === expectedEmail) ?? null;
};
