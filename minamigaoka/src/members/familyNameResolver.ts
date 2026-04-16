import type { FamilyRecord, MemberRecord } from "./types";

export type MemberIndexes = {
  byId: Map<string, MemberRecord>;
  byAuthUid: Map<string, MemberRecord>;
  byLoginId: Map<string, MemberRecord>;
};

export const trimFamilySuffix = (value?: string): string => {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return normalized.endsWith("家") ? normalized.slice(0, -1) : normalized;
};

export const buildFamilyMap = (families: FamilyRecord[]): Map<string, FamilyRecord> =>
  new Map(families.map((family) => [family.id, family]));

export const buildMemberIndexes = (members: MemberRecord[]): MemberIndexes => {
  const byId = new Map<string, MemberRecord>();
  const byAuthUid = new Map<string, MemberRecord>();
  const byLoginId = new Map<string, MemberRecord>();

  members.forEach((member) => {
    byId.set(member.id, member);
    if (member.authUid) byAuthUid.set(member.authUid, member);
    if (member.loginId) byLoginId.set(member.loginId, member);
  });

  return { byId, byAuthUid, byLoginId };
};

export const resolveMemberByIdentifier = (
  identifier: string | undefined,
  indexes: MemberIndexes,
): MemberRecord | undefined => {
  if (!identifier) return undefined;
  return indexes.byId.get(identifier) ?? indexes.byAuthUid.get(identifier) ?? indexes.byLoginId.get(identifier);
};

const resolveNaturalFallback = (value: string | undefined): string => {
  const normalized = trimFamilySuffix(value);
  if (!normalized) return "";
  return /^[a-z0-9_-]+$/i.test(normalized) ? "" : normalized;
};

export const resolveFamilyNameFromIdentifier = ({
  identifier,
  memberIndexes,
  familiesById,
  fallback = "未設定",
}: {
  identifier?: string;
  memberIndexes: MemberIndexes;
  familiesById: Map<string, FamilyRecord>;
  fallback?: string;
}): string => {
  if (!identifier) return fallback;

  const family = familiesById.get(identifier);
  if (family?.name) return trimFamilySuffix(family.name) || fallback;

  const member = resolveMemberByIdentifier(identifier, memberIndexes);
  if (member) {
    const memberFamily = member.familyId ? familiesById.get(member.familyId) : undefined;
    if (memberFamily?.name) return trimFamilySuffix(memberFamily.name) || fallback;
    if (member.familyName) return trimFamilySuffix(member.familyName) || fallback;
  }

  return resolveNaturalFallback(identifier) || fallback;
};

const isLikelyLoginId = (value: string): boolean => /^[a-z0-9_-]{4,20}$/i.test(value);

export const resolveMemberDisplayNameFromIdentifier = ({
  identifier,
  memberIndexes,
  familiesById,
  fallback = "未設定",
}: {
  identifier?: string;
  memberIndexes: MemberIndexes;
  familiesById: Map<string, FamilyRecord>;
  fallback?: string;
}): string => {
  if (!identifier) return fallback;

  const member = resolveMemberByIdentifier(identifier, memberIndexes);
  if (member) {
    const displayName = (member.displayName || member.name || "").trim();
    if (displayName) return displayName;
    const loginId = (member.loginId || "").trim();
    if (loginId) return loginId;
  }

  const family = familiesById.get(identifier);
  if (family?.name?.trim()) return trimFamilySuffix(family.name) || fallback;

  const normalizedIdentifier = identifier.trim();
  if (isLikelyLoginId(normalizedIdentifier)) return normalizedIdentifier;

  return resolveNaturalFallback(normalizedIdentifier) || normalizedIdentifier || fallback;
};
