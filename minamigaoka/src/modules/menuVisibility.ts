import type { AdminRole, MemberRecord, MemberType, StaffPermission } from "../members/types";

export type DemoMenuRole = "child" | "parent" | "admin";

export type ModuleMenuId =
  | "today"
  | "calendar"
  | "attendance"
  | "duty-log"
  | "practice-log"
  | "homework"
  | "todo"
  | "event"
  | "shift-create"
  | "purchase-request"
  | "reimbursement"
  | "lunch"
  | "dues"
  | "accounting"
  | "instruments"
  | "scores"
  | "docs"
  | "members"
  | "links"
  | "settings"
  | "members-management"
  | "module-management";

export type ModuleSectionId = "activity" | "accounting" | "assets" | "settings";

export type ModuleVisibilityRule = {
  isPublic: boolean;
  memberTypes: MemberType[];
  adminRoles: AdminRole[];
  staffPermissions: StaffPermission[];
};

export type ModuleVisibilitySettings = Record<ModuleMenuId, ModuleVisibilityRule>;

export type MenuModuleDefinition = {
  id: ModuleMenuId;
  label: string;
  icon: string;
  sectionId: ModuleSectionId;
  defaultAudienceRoles: DemoMenuRole[];
  lockedToAdmin?: boolean;
};

export const menuModuleDefinitions: MenuModuleDefinition[] = [
  { id: "today", label: "Today", icon: "🏠", sectionId: "activity", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "calendar", label: "カレンダー", icon: "🗓️", sectionId: "activity", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "attendance", label: "出欠", icon: "☑️", sectionId: "activity", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "duty-log", label: "当番日誌", icon: "📝", sectionId: "activity", defaultAudienceRoles: ["parent", "admin"] },
  { id: "practice-log", label: "練習日誌", icon: "🎺", sectionId: "activity", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "homework", label: "宿題", icon: "📚", sectionId: "activity", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "todo", label: "TODO", icon: "✅", sectionId: "activity", defaultAudienceRoles: ["parent", "admin"] },
  { id: "event", label: "イベント", icon: "🎪", sectionId: "activity", defaultAudienceRoles: ["child", "parent", "admin"] },
  {
    id: "shift-create",
    label: "シフト作成",
    icon: "🧭",
    sectionId: "activity",
    defaultAudienceRoles: ["admin"],
    lockedToAdmin: true,
  },
  { id: "purchase-request", label: "購入依頼", icon: "🛒", sectionId: "accounting", defaultAudienceRoles: ["parent", "admin"] },
  { id: "reimbursement", label: "立替", icon: "💴", sectionId: "accounting", defaultAudienceRoles: ["parent", "admin"] },
  { id: "lunch", label: "お弁当", icon: "🍱", sectionId: "accounting", defaultAudienceRoles: ["parent", "admin"] },
  { id: "dues", label: "会費管理", icon: "◉", sectionId: "accounting", defaultAudienceRoles: ["parent", "admin"] },
  {
    id: "accounting",
    label: "会計",
    icon: "💰",
    sectionId: "accounting",
    defaultAudienceRoles: ["parent", "admin"],
  },
  { id: "instruments", label: "楽器", icon: "🎷", sectionId: "assets", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "scores", label: "楽譜", icon: "🎼", sectionId: "assets", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "docs", label: "資料", icon: "📄", sectionId: "assets", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "members", label: "メンバー", icon: "👥", sectionId: "assets", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "links", label: "リンク集", icon: "🔗", sectionId: "assets", defaultAudienceRoles: ["child", "parent", "admin"] },
  { id: "settings", label: "設定", icon: "⚙️", sectionId: "settings", defaultAudienceRoles: ["child", "parent", "admin"] },
  {
    id: "members-management",
    label: "メンバー管理",
    icon: "🛠️",
    sectionId: "settings",
    defaultAudienceRoles: ["admin"],
    lockedToAdmin: true,
  },
  {
    id: "module-management",
    label: "モジュール管理",
    icon: "🧩",
    sectionId: "settings",
    defaultAudienceRoles: ["admin"],
    lockedToAdmin: true,
  },
];

const parentScopedMemberTypes: MemberType[] = ["parent", "obog", "teacher"];

const buildDefaultRule = (definition: MenuModuleDefinition): ModuleVisibilityRule => {
  const memberTypes: MemberType[] = [];
  const adminRoles: AdminRole[] = [];

  if (definition.defaultAudienceRoles.includes("child")) {
    memberTypes.push("child");
  }
  if (definition.defaultAudienceRoles.includes("parent")) {
    memberTypes.push(...parentScopedMemberTypes);
  }
  if (definition.defaultAudienceRoles.includes("admin")) {
    adminRoles.push("admin");
  }

  return {
    isPublic: true,
    memberTypes: Array.from(new Set(memberTypes)),
    adminRoles: Array.from(new Set(adminRoles)),
    staffPermissions: [],
  };
};

export const defaultModuleVisibilitySettings = menuModuleDefinitions.reduce<ModuleVisibilitySettings>((result, definition) => {
  result[definition.id] = buildDefaultRule(definition);
  return result;
}, {} as ModuleVisibilitySettings);

const normalizeMemberTypes = (value: unknown): MemberType[] =>
  Array.isArray(value)
    ? value.filter((item): item is MemberType => item === "parent" || item === "child" || item === "teacher" || item === "obog")
    : [];

const normalizeAdminRoles = (value: unknown): AdminRole[] =>
  Array.isArray(value)
    ? value.filter((item): item is AdminRole => item === "none" || item === "officer" || item === "admin")
    : [];

const normalizeStaffPermissions = (value: unknown): StaffPermission[] =>
  Array.isArray(value)
    ? value.filter((item): item is StaffPermission => item === "accounting" || item === "shift_management")
    : [];

export const sanitizeModuleVisibilitySettings = (value: unknown): ModuleVisibilitySettings => {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return menuModuleDefinitions.reduce<ModuleVisibilitySettings>((result, definition) => {
    const rawRule = source[definition.id];
    if (rawRule && typeof rawRule === "object") {
      const rule = rawRule as Record<string, unknown>;
      const normalizedRule = {
        isPublic: typeof rule.isPublic === "boolean" ? rule.isPublic : true,
        memberTypes: normalizeMemberTypes(rule.memberTypes),
        adminRoles: normalizeAdminRoles(rule.adminRoles),
        staffPermissions: normalizeStaffPermissions(rule.staffPermissions),
      };
      const isLegacyAccountingAdminOnly =
        definition.id === "accounting" &&
        normalizedRule.isPublic &&
        normalizedRule.memberTypes.length === 0 &&
        normalizedRule.adminRoles.length === 1 &&
        normalizedRule.adminRoles[0] === "admin" &&
        normalizedRule.staffPermissions.length === 0;
      result[definition.id] = isLegacyAccountingAdminOnly
        ? defaultModuleVisibilitySettings[definition.id]
        : normalizedRule;
    } else {
      result[definition.id] = defaultModuleVisibilitySettings[definition.id];
    }
    return result;
  }, {} as ModuleVisibilitySettings);
};

export const canAccessModuleBySettings = (
  moduleId: ModuleMenuId,
  member: MemberRecord | null | undefined,
  settings: ModuleVisibilitySettings,
): boolean => {
  const definition = menuModuleDefinitions.find((item) => item.id === moduleId);
  if (!definition) return false;

  const isAdminUser = member?.role === "admin" || member?.adminRole === "admin";
  if (definition.lockedToAdmin) {
    return isAdminUser;
  }

  const rule = settings[moduleId] ?? defaultModuleVisibilitySettings[moduleId];
  if (!rule.isPublic) {
    return isAdminUser;
  }

  if (isAdminUser) {
    return true;
  }

  if (!member) {
    return true;
  }

  if (member.memberTypes.some((type) => rule.memberTypes.includes(type))) {
    return true;
  }
  if (rule.adminRoles.includes(member.adminRole)) {
    return true;
  }
  if (member.staffPermissions.some((permission) => rule.staffPermissions.includes(permission))) {
    return true;
  }
  return false;
};
