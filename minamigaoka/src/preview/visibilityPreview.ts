import { legacyRoleToPermissionModel, memberTypeLabel, staffPermissionLabel } from "../members/permissions";
import type { MemberRecord, MemberRole, MemberType, StaffPermission } from "../members/types";

export type VisibilityPreviewTarget =
  | "actual"
  | "admin"
  | "accounting"
  | "officer"
  | "parent"
  | "child"
  | "teacher"
  | "supporter";

export const visibilityPreviewStorageKey = "windoms:visibility-preview";

export const visibilityPreviewOptions: Array<{ value: VisibilityPreviewTarget; label: string }> = [
  { value: "actual", label: "実際の表示" },
  { value: "admin", label: "管理者" },
  { value: "accounting", label: "会計担当者" },
  { value: "officer", label: "役員" },
  { value: "parent", label: "保護者" },
  { value: "child", label: "部員" },
  { value: "teacher", label: "先生" },
  { value: "supporter", label: "サポーター" },
];

const visibilityPreviewTargets = new Set<VisibilityPreviewTarget>(visibilityPreviewOptions.map((option) => option.value));

const createPreviewMember = (
  sourceMember: MemberRecord | null,
  role: MemberRole,
  staffPermissions: StaffPermission[],
  memberTypesOverride?: MemberType[],
): MemberRecord => {
  const permissionModel = legacyRoleToPermissionModel(role);
  const baseName = sourceMember?.name?.trim() || sourceMember?.displayName?.trim() || "表示プレビュー";
  return {
    id: sourceMember?.id ?? "__preview__",
    familyId: sourceMember?.familyId ?? "",
    displayName: sourceMember?.displayName ?? baseName,
    familyName: sourceMember?.familyName ?? "",
    givenName: sourceMember?.givenName ?? "",
    familyNameKana: sourceMember?.familyNameKana ?? "",
    givenNameKana: sourceMember?.givenNameKana ?? "",
    name: sourceMember?.name ?? baseName,
    nameKana: sourceMember?.nameKana ?? "",
    birthDate: sourceMember?.birthDate ?? "",
    phoneNumber: sourceMember?.phoneNumber ?? "",
    enrollmentYear: sourceMember?.enrollmentYear ?? null,
    instrumentCodes: sourceMember?.instrumentCodes ?? [],
    memberTypes: memberTypesOverride ?? permissionModel.memberTypes,
    adminRole: permissionModel.adminRole,
    staffPermissions,
    memberStatus: sourceMember?.memberStatus ?? "active",
    role,
    permissions: sourceMember?.permissions ?? [],
    status: sourceMember?.status ?? "active",
    loginId: sourceMember?.loginId ?? "",
    authUid: sourceMember?.authUid ?? "",
    authEmail: sourceMember?.authEmail ?? "",
    sortOrders: sourceMember?.sortOrders,
    notes: sourceMember?.notes ?? "",
    createdAt: sourceMember?.createdAt ?? null,
    updatedAt: sourceMember?.updatedAt ?? null,
  };
};

export const readVisibilityPreviewTarget = (): VisibilityPreviewTarget => {
  if (typeof window === "undefined") return "actual";
  const raw = window.localStorage.getItem(visibilityPreviewStorageKey);
  return raw && visibilityPreviewTargets.has(raw as VisibilityPreviewTarget)
    ? (raw as VisibilityPreviewTarget)
    : "actual";
};

export const saveVisibilityPreviewTarget = (target: VisibilityPreviewTarget): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(visibilityPreviewStorageKey, target);
};

export const buildVisibilityPreviewMember = (
  target: VisibilityPreviewTarget,
  sourceMember: MemberRecord | null,
  fallbackRole: MemberRole,
): MemberRecord | null => {
  if (target === "actual") {
    if (sourceMember) return sourceMember;
    return createPreviewMember(null, fallbackRole, []);
  }
  if (target === "admin") return createPreviewMember(sourceMember, "admin", []);
  if (target === "accounting") return createPreviewMember(sourceMember, "parent", ["accounting"]);
  if (target === "officer") return createPreviewMember(sourceMember, "officer", []);
  if (target === "parent") return createPreviewMember(sourceMember, "parent", []);
  if (target === "child") return createPreviewMember(sourceMember, "child", []);
  if (target === "teacher") return createPreviewMember(sourceMember, "teacher", []);
  return createPreviewMember(sourceMember, "parent", [], ["supporter"]);
};

export const isVisibilityPreviewActive = (target: VisibilityPreviewTarget): boolean => target !== "actual";

export const getVisibilityPreviewLabel = (target: VisibilityPreviewTarget): string =>
  visibilityPreviewOptions.find((option) => option.value === target)?.label ?? "実際の表示";

export const getVisibilityPreviewSubtitle = (member: MemberRecord | null): string => {
  if (!member) return "";
  if (member.adminRole === "admin") return "管理者";
  if (member.staffPermissions.includes("accounting")) return staffPermissionLabel.accounting;
  const firstType = member.memberTypes[0];
  return firstType ? memberTypeLabel[firstType] : "実際の表示";
};
