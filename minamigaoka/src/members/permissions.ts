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
  { value: "child", label: "子ども" },
  { value: "teacher", label: "先生" },
  { value: "obog", label: "OBOG" },
];

export const adminRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: "none", label: "なし" },
  { value: "officer", label: "役員" },
  { value: "admin", label: "管理者" },
];

export const staffPermissionOptions: Array<{ value: StaffPermission; label: string }> = [
  { value: "accounting", label: "会計担当" },
  { value: "shift_management", label: "シフト作成担当" },
];

export const memberStatusOptions: Array<{ value: MemberStatus; label: string }> = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export const legacyRoleToPermissionModel = (role: MemberRole): {
  memberTypes: MemberType[];
  adminRole: AdminRole;
  staffPermissions: StaffPermission[];
} => {
  switch (role) {
    case "admin":
      return { memberTypes: ["parent"], adminRole: "admin", staffPermissions: [] };
    case "officer":
      return { memberTypes: ["parent"], adminRole: "officer", staffPermissions: [] };
    case "child":
      return { memberTypes: ["child"], adminRole: "none", staffPermissions: [] };
    case "teacher":
      return { memberTypes: ["teacher"], adminRole: "none", staffPermissions: [] };
    default:
      return { memberTypes: ["parent"], adminRole: "none", staffPermissions: [] };
  }
};

const allowedMemberTypes: MemberType[] = ["parent", "child", "teacher", "obog"];
const allowedAdminRoles: AdminRole[] = ["none", "officer", "admin"];
const allowedStaffPermissions: StaffPermission[] = ["accounting", "shift_management"];
const allowedMemberStatuses: MemberStatus[] = ["active", "inactive"];

export const normalizeMemberTypes = (value: unknown, legacyRole?: MemberRole): MemberType[] => {
  if (Array.isArray(value)) {
    const normalized = value.filter((item): item is MemberType =>
      allowedMemberTypes.includes(item as MemberType),
    );
    if (normalized.length > 0) return Array.from(new Set(normalized));
  }
  return legacyRoleToPermissionModel(legacyRole ?? "parent").memberTypes;
};

export const normalizeAdminRole = (value: unknown, legacyRole?: MemberRole): AdminRole => {
  if (allowedAdminRoles.includes(value as AdminRole)) return value as AdminRole;
  return legacyRoleToPermissionModel(legacyRole ?? "parent").adminRole;
};

export const normalizeStaffPermissions = (value: unknown, legacyRole?: MemberRole): StaffPermission[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value.filter((item): item is StaffPermission => allowedStaffPermissions.includes(item as StaffPermission)),
      ),
    );
  }
  return legacyRoleToPermissionModel(legacyRole ?? "parent").staffPermissions;
};

export const normalizeMemberStatus = (value: unknown, legacyStatus?: unknown): MemberStatus => {
  if (allowedMemberStatuses.includes(value as MemberStatus)) return value as MemberStatus;
  return legacyStatus === "inactive" ? "inactive" : "active";
};

export const deriveLegacyRole = (memberTypes: MemberType[], adminRole: AdminRole): MemberRole => {
  if (adminRole === "admin") return "admin";
  if (adminRole === "officer") return "officer";
  if (memberTypes.includes("child")) return "child";
  if (memberTypes.includes("teacher")) return "teacher";
  return "parent";
};

export const deriveLegacyPermissions = (staffPermissions: StaffPermission[]): string[] => staffPermissions;

export const canSelectMemberType = (selected: MemberType[], target: MemberType): boolean => {
  if (selected.includes(target)) return true;
  if (target === "child") return selected.length === 0;
  return !selected.includes("child");
};

export const validateMemberTypes = (memberTypes: MemberType[]): string | undefined => {
  if (memberTypes.length === 0) return "利用者区分を1つ以上選択してください。";
  if (memberTypes.includes("child") && memberTypes.length > 1) {
    return "子どもは他の利用者区分と同時に設定できません。";
  }
  return undefined;
};

export const memberTypeLabel: Record<MemberType, string> = {
  parent: "保護者",
  child: "子ども",
  teacher: "先生",
  obog: "OBOG",
};

export const adminRoleLabel: Record<AdminRole, string> = {
  none: "なし",
  officer: "役員",
  admin: "管理者",
};

export const staffPermissionLabel: Record<StaffPermission, string> = {
  accounting: "会計担当",
  shift_management: "シフト作成担当",
};

export const memberStatusLabel: Record<MemberStatus, string> = {
  active: "有効",
  inactive: "無効",
};

export const buildMemberSummaryBadges = (member: MemberRecord): string[] => {
  const badges = member.memberTypes.map((type) => memberTypeLabel[type]);
  if (member.adminRole !== "none") badges.push(adminRoleLabel[member.adminRole]);
  badges.push(...member.staffPermissions.map((permission) => staffPermissionLabel[permission]));
  if (member.memberStatus === "inactive") badges.push(memberStatusLabel.inactive);
  return badges;
};

export const isChildMember = (member: Pick<MemberRecord, "memberTypes" | "role">): boolean =>
  member.memberTypes.includes("child") || member.role === "child";
