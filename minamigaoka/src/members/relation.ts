import type { MemberRecord, MemberRelationRecord, RelationshipType } from "./types";

export const relationHelpText = "続柄は子どもから見た保護者との関係です。";

export const relationTypeLabel: Record<RelationshipType, string> = {
  father: "父",
  mother: "母",
  grandfather: "祖父",
  grandmother: "祖母",
  uncle: "叔父",
  aunt: "叔母",
  guardian_other: "その他保護者",
};

export const relationTypeOptions = Object.entries(relationTypeLabel) as Array<
  [RelationshipType, string]
>;

export const hasDuplicateRelationPair = (
  relations: MemberRelationRecord[],
  childMemberId: string,
  guardianMemberId: string,
  currentRelationId?: string | null,
): boolean =>
  relations.some(
    (relation) =>
      relation.id !== currentRelationId &&
      relation.status === "active" &&
      relation.childMemberId === childMemberId &&
      relation.guardianMemberId === guardianMemberId,
  );

export const isSameFamilyRelation = (
  members: MemberRecord[],
  childMemberId: string,
  guardianMemberId: string,
): boolean => {
  const child = members.find((member) => member.id === childMemberId);
  const guardian = members.find((member) => member.id === guardianMemberId);
  if (!child || !guardian) return true;
  return Boolean(child.familyId && guardian.familyId && child.familyId === guardian.familyId);
};
