import type {
  AdminRole,
  MemberRecord,
  MemberRole,
  MemberStatus,
  MemberType,
  StaffPermission,
} from "./types";

export const memberTypeOptions: Array<{ value: MemberType; label: string }> = [
  { value: "parent", label: "保護者" },
  { value: "child", label: "部員" },
  { value: "supporter", label: "サポーター" },
  { value: "teacher", label: "先生" },
  { value: "obog", label: "先輩" },
];

export type MemberTypeFilter = "all" | "child" | "parent" | "supporter" | "obog" | "teacher";

export const memberTypeFilterOptions: Array<{ value: MemberTypeFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "child", label: "部員" },
  { value: "parent", label: "保護者" },
  { value: "supporter", label: "サポーター" },
  { value: "obog", label: "先輩" },
  { value: "teacher", label: "先生" },
];

export const memberTypeLabel: Record<MemberType, string> = {
  parent: "保護者",
  child: "部員",
  supporter: "サポーター",
  teacher: "先生",
  obog: "先輩",
};

export const memberTypeDisplayOrder: MemberType[] = ["child", "parent", "supporter", "obog", "teacher"];

export const adminRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: "none", label: "なし" },
  { value: "officer", label: "役員" },
  { value: "admin", label: "管理者" },
];

export const adminRoleLabel: Record<AdminRole, string> = {
  none: "なし",
  officer: "役員",
  admin: "管理者",
};

export const staffPermissionOptions: Array<{ value: StaffPermission; label: string }> = [
  { value: "accounting", label: "会計担当" },
  { value: "shift_management", label: "シフト作成担当" },
];

export const staffPermissionLabel: Record<StaffPermission, string> = {
  accounting: "会計担当",
  shift_management: "シフト作成担当",
};

export const memberStatusOptions: Array<{ value: MemberStatus; label: string }> = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: "有効",
  inactive: "無効",
};

const allowedMemberTypes: MemberType[] = ["parent", "child", "supporter", "teacher", "obog"];
const allowedAdminRoles: AdminRole[] = ["none", "officer", "admin"];
const allowedStaffPermissions: StaffPermission[] = ["accounting", "shift_management"];
const allowedMemberStatuses: MemberStatus[] = ["active", "inactive"];

export const legacyRoleToPermissionModel = (role: MemberRole) => {
  switch (role) {
    case "admin":
      return {
        memberTypes: ["parent"] as MemberType[],
        adminRole: "admin" as AdminRole,
        staffPermissions: [] as StaffPermission[],
      };
    case "officer":
      return {
        memberTypes: ["parent"] as MemberType[],
        adminRole: "officer" as AdminRole,
        staffPermissions: [] as StaffPermission[],
      };
    case "child":
      return {
        memberTypes: ["child"] as MemberType[],
        adminRole: "none" as AdminRole,
        staffPermissions: [] as StaffPermission[],
      };
    case "teacher":
      return {
        memberTypes: ["teacher"] as MemberType[],
        adminRole: "none" as AdminRole,
        staffPermissions: [] as StaffPermission[],
      };
    case "parent":
    default:
      return {
        memberTypes: ["parent"] as MemberType[],
        adminRole: "none" as AdminRole,
        staffPermissions: [] as StaffPermission[],
      };
  }
};

export const normalizeMemberTypes = (value: unknown, legacyRole?: MemberRole): MemberType[] => {
  if (Array.isArray(value)) {
    const normalized = value.filter((item): item is MemberType =>
      allowedMemberTypes.includes(item as MemberType),
    );
    if (normalized.length > 0) {
      return Array.from(new Set(normalized));
    }
  }
  return legacyRoleToPermissionModel(legacyRole ?? "parent").memberTypes;
};

export const normalizeAdminRole = (value: unknown, legacyRole?: MemberRole): AdminRole => {
  if (allowedAdminRoles.includes(value as AdminRole)) {
    return value as AdminRole;
  }
  return legacyRoleToPermissionModel(legacyRole ?? "parent").adminRole;
};

export const normalizeStaffPermissions = (
  value: unknown,
  legacyRole?: MemberRole,
): StaffPermission[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value.filter((item): item is StaffPermission =>
          allowedStaffPermissions.includes(item as StaffPermission),
        ),
      ),
    );
  }
  return legacyRoleToPermissionModel(legacyRole ?? "parent").staffPermissions;
};

export const normalizeMemberStatus = (value: unknown, legacyStatus?: unknown): MemberStatus => {
  if (allowedMemberStatuses.includes(value as MemberStatus)) {
    return value as MemberStatus;
  }
  return legacyStatus === "inactive" ? "inactive" : "active";
};

export const deriveLegacyRole = (memberTypes: MemberType[], adminRole: AdminRole): MemberRole => {
  if (adminRole === "admin") {
    return "admin";
  }
  if (adminRole === "officer") {
    return "officer";
  }
  if (memberTypes.includes("child")) {
    return "child";
  }
  if (memberTypes.includes("teacher")) {
    return "teacher";
  }
  return "parent";
};

export const deriveLegacyPermissions = (staffPermissions: StaffPermission[]): string[] => staffPermissions;

export const canSelectMemberType = (selected: MemberType[], target: MemberType): boolean => {
  if (selected.includes(target)) {
    return true;
  }
  if (target === "child") {
    return selected.length === 0;
  }
  return !selected.includes("child");
};

export const validateMemberTypes = (memberTypes: MemberType[]): string | undefined => {
  if (memberTypes.length === 0) {
    return "利用者区分を1つ以上選択してください。";
  }
  if (memberTypes.includes("child") && memberTypes.length > 1) {
    return "部員は他の利用者区分と同時に設定できません。";
  }
  return undefined;
};

export const buildMemberSummaryBadges = (member: MemberRecord): string[] => {
  const badges = member.memberTypes.map((type) => memberTypeLabel[type]);

  if (member.adminRole !== "none") {
    badges.push(adminRoleLabel[member.adminRole]);
  }

  member.staffPermissions.forEach((permission) => {
    badges.push(staffPermissionLabel[permission]);
  });

  if (member.memberStatus === "inactive") {
    badges.push(memberStatusLabel.inactive);
  }

  return badges;
};

export const isChildMember = (member: Pick<MemberRecord, "memberTypes" | "role">): boolean =>
  member.memberTypes.includes("child") || member.role === "child";

export const memberMatchesTypeFilter = (
  member: Pick<MemberRecord, "memberTypes" | "role">,
  filter: MemberTypeFilter,
): boolean => {
  if (filter === "all") {
    return true;
  }
  return member.memberTypes.includes(filter) || member.role === filter;
};

export const getPrimaryMemberTypeLabel = (
  member: Pick<MemberRecord, "memberTypes" | "role">,
): string => {
  if (member.memberTypes.includes("child") || member.role === "child") {
    return memberTypeLabel.child;
  }
  if (member.memberTypes.includes("parent")) {
    return memberTypeLabel.parent;
  }
  if (member.memberTypes.includes("supporter")) {
    return memberTypeLabel.supporter;
  }
  if (member.memberTypes.includes("obog")) {
    return memberTypeLabel.obog;
  }
  if (member.memberTypes.includes("teacher") || member.role === "teacher") {
    return memberTypeLabel.teacher;
  }
  return memberTypeLabel.parent;
};

export const canManageCalendarSessions = (
  member: Pick<MemberRecord, "role" | "adminRole" | "staffPermissions"> | null | undefined,
): boolean =>
  member?.role === "admin" ||
  member?.adminRole === "admin" ||
  member?.staffPermissions.includes("shift_management") === true;

const getMemberDisplayType = (member: Pick<MemberRecord, "memberTypes" | "role">): MemberType => {
  if (member.memberTypes.includes("child") || member.role === "child") {
    return "child";
  }
  if (member.memberTypes.includes("parent")) {
    return "parent";
  }
  if (member.memberTypes.includes("supporter")) {
    return "supporter";
  }
  if (member.memberTypes.includes("obog")) {
    return "obog";
  }
  if (member.memberTypes.includes("teacher") || member.role === "teacher") {
    return "teacher";
  }
  return "parent";
};

const getMemberSortValue = (
  member: Pick<MemberRecord, "sortOrders">,
  memberType: MemberType,
): number => {
  const sortValue = member.sortOrders?.[memberType];
  return typeof sortValue === "number" && Number.isFinite(sortValue)
    ? sortValue
    : Number.MAX_SAFE_INTEGER;
};

const compareMemberName = (
  left: Pick<MemberRecord, "nameKana" | "name" | "id">,
  right: Pick<MemberRecord, "nameKana" | "name" | "id">,
): number => {
  const kanaCompare = (left.nameKana || "").localeCompare(right.nameKana || "", "ja");
  if (kanaCompare !== 0) return kanaCompare;
  const nameCompare = (left.name || "").localeCompare(right.name || "", "ja");
  if (nameCompare !== 0) return nameCompare;
  return left.id.localeCompare(right.id, "ja");
};

export const sortMembersForDisplay = <T extends MemberRecord>(
  members: T[],
  filter: MemberTypeFilter,
): T[] =>
  [...members].sort((left, right) => {
    if (filter === "all") {
      const leftType = getMemberDisplayType(left);
      const rightType = getMemberDisplayType(right);
      const leftTypeIndex = memberTypeDisplayOrder.indexOf(leftType);
      const rightTypeIndex = memberTypeDisplayOrder.indexOf(rightType);
      if (leftTypeIndex !== rightTypeIndex) {
        return leftTypeIndex - rightTypeIndex;
      }
      const orderCompare = getMemberSortValue(left, leftType) - getMemberSortValue(right, rightType);
      if (orderCompare !== 0) {
        return orderCompare;
      }
      return compareMemberName(left, right);
    }

    const memberType = filter as MemberType;
    const orderCompare = getMemberSortValue(left, memberType) - getMemberSortValue(right, memberType);
    if (orderCompare !== 0) {
      return orderCompare;
    }
    return compareMemberName(left, right);
  });
