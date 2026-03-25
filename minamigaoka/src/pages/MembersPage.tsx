import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  isValidLoginId,
  loginIdValidationMessages,
  normalizeLoginId,
  toInternalAuthEmail,
} from "../auth/loginId";
import { auth, firebaseFunctionsRegion, firebaseProjectId } from "../config/firebase";
import { memberCsvTemplateHeader, parseMemberCsv } from "../members/csv";
import {
  findAuthCandidate,
  findAuthUsersWithoutMember,
  findDuplicateRelations,
  findMembersWithMissingAuth,
  findMembersWithoutAuth,
  findRelationOrphans,
} from "../members/integrity";
import {
  adminRoleOptions,
  buildMemberSummaryBadges,
  canSelectMemberType,
  isChildMember,
  memberMatchesTypeFilter,
  memberStatusOptions,
  memberTypeFilterOptions,
  memberTypeOptions,
  type MemberTypeFilter,
  staffPermissionOptions,
  validateMemberTypes,
} from "../members/permissions";
import { activeInstrumentMaster, formatInstrumentLabels } from "../members/instruments";
import {
  hasDuplicateRelationPair,
  isSameFamilyRelation,
  relationHelpText,
  relationTypeLabel,
  relationTypeOptions,
} from "../members/relation";
import {
  bulkRegisterMembers,
  deleteFamily,
  deleteMember,
  deleteMemberRelation,
  linkMemberToAuthUser,
  listAuthUsers,
  saveFamily,
  saveMember,
  saveMemberRelation,
  subscribeFamilies,
  subscribeMemberRelations,
  subscribeMembers,
} from "../members/service";
import type {
  AdminRole,
  AuthUserSummary,
  BulkRegisterMemberResult,
  FamilyRecord,
  InstrumentCode,
  MemberRecord,
  MemberRelationRecord,
  MemberStatus,
  MemberType,
  RelationshipType,
  StaffPermission,
} from "../members/types";

type FamilyFormState = {
  id: string | null;
  name: string;
  status: "active" | "inactive";
  notes: string;
};

type MemberFormState = {
  id: string | null;
  familyId: string;
  name: string;
  nameKana: string;
  enrollmentYear: string;
  instrumentCodes: InstrumentCode[];
  memberTypes: MemberType[];
  adminRole: AdminRole;
  staffPermissions: StaffPermission[];
  memberStatus: MemberStatus;
  loginId: string;
  notes: string;
};

type RelationFormState = {
  id: string | null;
  childMemberId: string;
  guardianMemberId: string;
  relationType: RelationshipType;
  status: "active" | "inactive";
};

type FieldErrors = Record<string, string | undefined>;
type AuthUsersState = "idle" | "loading" | "success" | "error";

type AuthUsersDebugState = {
  serverProjectId: string;
  serverFunctionsRegion: string;
  fetchedAt: string;
  errorCode: string;
  errorMessage: string;
};

type ClaimState = {
  admin: boolean;
  fetchedAt: string;
  message: string;
};

type CsvImportPreviewRow = {
  rowNumber: number;
  familyName: string;
  name: string;
  loginId: string;
};

type DeleteDialogState =
  | {
      kind: "family" | "member" | "relation";
      id: string;
      title: string;
      message: string;
    }
  | null;

type ManagementTab = "family" | "member" | "auth" | "integrity";

const emptyFamilyForm = (): FamilyFormState => ({
  id: null,
  name: "",
  status: "active",
  notes: "",
});

const emptyMemberForm = (): MemberFormState => ({
  id: null,
  familyId: "",
  name: "",
  nameKana: "",
  enrollmentYear: "",
  instrumentCodes: [],
  memberTypes: ["parent"],
  adminRole: "none",
  staffPermissions: [],
  memberStatus: "active",
  loginId: "",
  notes: "",
});

const emptyRelationForm = (): RelationFormState => ({
  id: null,
  childMemberId: "",
  guardianMemberId: "",
  relationType: "guardian_other",
  status: "active",
});

const formatMemberLabel = (member: MemberRecord) => member.name || member.loginId || member.id;

type PermissionSectionProps = {
  title: string;
  description?: string;
  error?: string;
  children: ReactNode;
};

const managementTabs: Array<{ id: ManagementTab; label: string }> = [
  { id: "family", label: "Family" },
  { id: "member", label: "Member" },
  { id: "auth", label: "Auth" },
  { id: "integrity", label: "未紐付け / 不整合" },
];

function PermissionSection({ title, description, error, children }: PermissionSectionProps) {
  return (
    <div className="permission-form-section">
      <div className="permission-form-section-head">
        <h4 className="permission-form-title">{title}</h4>
        {description ? <p className="permission-form-help">{description}</p> : null}
      </div>
      <div className="permission-form-options">{children}</div>
      {error ? <p className="permission-form-error field-error">{error}</p> : null}
    </div>
  );
}

type PermissionOptionRowProps = {
  type: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
};

function PermissionOptionRow({ type, name, checked, disabled = false, label, onChange }: PermissionOptionRowProps) {
  return (
    <label className={`permission-option-row ${checked ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}>
      <span className="permission-option-control">
        <input type={type} name={name} checked={checked} disabled={disabled} onChange={onChange} />
      </span>
      <span className="permission-option-label">{label}</span>
    </label>
  );
}

export function MembersManagementPage() {
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUserSummary[]>([]);
  const [isFirestoreLoading, setIsFirestoreLoading] = useState(true);
  const [authUsersState, setAuthUsersState] = useState<AuthUsersState>("idle");
  const [authUsersDebug, setAuthUsersDebug] = useState<AuthUsersDebugState>({
    serverProjectId: "",
    serverFunctionsRegion: "",
    fetchedAt: "",
    errorCode: "",
    errorMessage: "",
  });
  const [claimState, setClaimState] = useState<ClaimState>({
    admin: false,
    fetchedAt: "",
    message: "",
  });
  const [isRefreshingClaims, setIsRefreshingClaims] = useState(false);
  const [pageError, setPageError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [familyForm, setFamilyForm] = useState<FamilyFormState>(emptyFamilyForm);
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm);
  const [relationForm, setRelationForm] = useState<RelationFormState>(emptyRelationForm);
  const [familyErrors, setFamilyErrors] = useState<FieldErrors>({});
  const [memberErrors, setMemberErrors] = useState<FieldErrors>({});
  const [relationErrors, setRelationErrors] = useState<FieldErrors>({});
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isRelationModalOpen, setIsRelationModalOpen] = useState(false);
  const [linkTargetMemberId, setLinkTargetMemberId] = useState<string | null>(null);
  const [selectedAuthUid, setSelectedAuthUid] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<ManagementTab>("member");
  const [activeMemberTypeFilter, setActiveMemberTypeFilter] = useState<MemberTypeFilter>("all");
  const [csvImportErrors, setCsvImportErrors] = useState<string[]>([]);
  const [csvImportPreview, setCsvImportPreview] = useState<CsvImportPreviewRow[]>([]);
  const [csvImportCount, setCsvImportCount] = useState(0);
  const [csvImportResults, setCsvImportResults] = useState<BulkRegisterMemberResult[]>([]);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isCsvImporting, setIsCsvImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const familyNameById = useMemo(
    () =>
      families.reduce<Record<string, string>>((result, family) => {
        result[family.id] = family.name;
        return result;
      }, {}),
    [families],
  );
  const familyIdByName = useMemo(
    () =>
      families.reduce<Record<string, string>>((result, family) => {
        result[family.name.trim()] = family.id;
        return result;
      }, {}),
    [families],
  );

  const memberNameById = useMemo(
    () =>
      members.reduce<Record<string, string>>((result, member) => {
        result[member.id] = member.name;
        return result;
      }, {}),
    [members],
  );

  const familyMemberCountById = useMemo(
    () =>
      members.reduce<Record<string, number>>((result, member) => {
        result[member.familyId] = (result[member.familyId] ?? 0) + 1;
        return result;
      }, {}),
    [members],
  );

  const guardianCandidates = useMemo(
    () => members.filter((member) => !isChildMember(member) && member.memberStatus === "active"),
    [members],
  );
  const childRelationsByChildId = useMemo(
    () =>
      relations.reduce<Record<string, MemberRelationRecord[]>>((result, relation) => {
        const bucket = result[relation.childMemberId] ?? [];
        bucket.push(relation);
        result[relation.childMemberId] = bucket;
        return result;
      }, {}),
    [relations],
  );

  const membersWithoutAuth = useMemo(() => findMembersWithoutAuth(members), [members]);
  const authUsersWithoutMember = useMemo(
    () => findAuthUsersWithoutMember(authUsers, members),
    [authUsers, members],
  );
  const membersWithMissingAuth = useMemo(
    () => findMembersWithMissingAuth(members, authUsers),
    [authUsers, members],
  );
  const orphanRelations = useMemo(() => findRelationOrphans(relations, members), [relations, members]);
  const duplicateRelations = useMemo(() => findDuplicateRelations(relations), [relations]);
  const membersWithoutFamily = useMemo(
    () => members.filter((member) => !member.familyId || !familyNameById[member.familyId]),
    [familyNameById, members],
  );
  const filteredMembers = useMemo(
    () => members.filter((member) => memberMatchesTypeFilter(member, activeMemberTypeFilter)),
    [activeMemberTypeFilter, members],
  );

  const linkTargetMember = linkTargetMemberId
    ? members.find((member) => member.id === linkTargetMemberId) ?? null
    : null;

  const refreshClaims = async (forceRefresh = false) => {
    if (!auth?.currentUser) {
      setClaimState({
        admin: false,
        fetchedAt: "",
        message: "ログインユーザーが取得できません。",
      });
      return;
    }

    setIsRefreshingClaims(true);
    try {
      const tokenResult = await auth.currentUser.getIdTokenResult(forceRefresh);
      setClaimState({
        admin: tokenResult.claims.admin === true,
        fetchedAt: new Date().toISOString(),
        message:
          tokenResult.claims.admin === true
            ? "admin claim を確認できました。"
            : "admin claim はまだ反映されていません。権限付与後は再ログインまたは再取得を行ってください。",
      });
    } catch (error) {
      setClaimState({
        admin: false,
        fetchedAt: "",
        message: error instanceof Error ? error.message : "claims の取得に失敗しました。",
      });
    } finally {
      setIsRefreshingClaims(false);
    }
  };

  const refreshAuthUsers = async () => {
    setAuthUsersState("loading");
    setPageError("");
    setAuthUsersDebug({
      serverProjectId: "",
      serverFunctionsRegion: "",
      fetchedAt: "",
      errorCode: "",
      errorMessage: "",
    });

    try {
      await refreshClaims(true);
      const result = await listAuthUsers();
      setAuthUsers(result.users);
      setAuthUsersState("success");
      setAuthUsersDebug({
        serverProjectId: result.projectId,
        serverFunctionsRegion: result.functionsRegion || "",
        fetchedAt: result.fetchedAt,
        errorCode: "",
        errorMessage: "",
      });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "Auth 一覧の取得に失敗しました。";
      const nextCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "";
      const nextDetails =
        typeof error === "object" && error !== null && "details" in error && typeof error.details === "object"
          ? (error.details as Record<string, unknown>)
          : null;

      setAuthUsers([]);
      setAuthUsersState("error");
      setAuthUsersDebug({
        serverProjectId:
          nextDetails && typeof nextDetails.projectId === "string" ? nextDetails.projectId : "",
        serverFunctionsRegion:
          nextDetails && typeof nextDetails.functionsRegion === "string"
            ? nextDetails.functionsRegion
            : "",
        fetchedAt: "",
        errorCode: nextCode,
        errorMessage:
          nextDetails && typeof nextDetails.errorMessage === "string"
            ? nextDetails.errorMessage
            : nextMessage,
      });
      setPageError(
        nextCode === "functions/permission-denied"
          ? "Auth 一覧の取得権限がありません。admin claim 付与後は再ログイン、または権限再取得を行ってください。"
          : nextMessage,
      );
    }
  };

  useEffect(() => {
    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 3) {
        setIsFirestoreLoading(false);
      }
    };

    try {
      const unsubscribeFamilies = subscribeFamilies((rows) => {
        setFamilies(rows);
        markLoaded();
      });
      const unsubscribeMembers = subscribeMembers((rows) => {
        setMembers(rows);
        markLoaded();
      });
      const unsubscribeRelations = subscribeMemberRelations((rows) => {
        setRelations(rows);
        markLoaded();
      });

      void refreshClaims(false);
      void refreshAuthUsers();

      return () => {
        unsubscribeFamilies();
        unsubscribeMembers();
        unsubscribeRelations();
      };
    } catch (error) {
      setIsFirestoreLoading(false);
      setPageError(error instanceof Error ? error.message : "メンバー管理データの読み込みに失敗しました。");
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const openFamilyCreate = () => {
    setFamilyForm(emptyFamilyForm());
    setFamilyErrors({});
    setIsFamilyModalOpen(true);
  };

  const openFamilyEdit = (family: FamilyRecord) => {
    setFamilyForm({
      id: family.id,
      name: family.name,
      status: family.status,
      notes: family.notes,
    });
    setFamilyErrors({});
    setIsFamilyModalOpen(true);
  };

  const openMemberCreate = () => {
    setMemberForm({
      ...emptyMemberForm(),
      familyId: families[0]?.id ?? "",
    });
    setMemberErrors({});
    setIsMemberModalOpen(true);
  };

  const openMemberEdit = (member: MemberRecord) => {
    setMemberForm({
      id: member.id,
      familyId: member.familyId,
      name: member.name,
      nameKana: member.nameKana,
      enrollmentYear: member.enrollmentYear ? String(member.enrollmentYear) : "",
      instrumentCodes: member.instrumentCodes,
      memberTypes: member.memberTypes,
      adminRole: member.adminRole,
      staffPermissions: member.staffPermissions,
      memberStatus: member.memberStatus,
      loginId: member.loginId,
      notes: member.notes,
    });
    setMemberErrors({});
    setIsMemberModalOpen(true);
  };

  const openRelationCreate = (childMemberId: string) => {
    setRelationForm({
      ...emptyRelationForm(),
      childMemberId,
      guardianMemberId: guardianCandidates[0]?.id ?? "",
    });
    setRelationErrors({});
    setIsRelationModalOpen(true);
  };

  const openRelationEdit = (relation: MemberRelationRecord) => {
    setRelationForm({
      id: relation.id,
      childMemberId: relation.childMemberId,
      guardianMemberId: relation.guardianMemberId,
      relationType: relation.relationType,
      status: relation.status,
    });
    setRelationErrors({});
    setIsRelationModalOpen(true);
  };

  const openLinkModal = (member: MemberRecord) => {
    const candidate = findAuthCandidate(member, authUsers);
    setLinkTargetMemberId(member.id);
    setSelectedAuthUid(candidate?.uid ?? "");
  };

  const openDeleteDialog = (
    kind: "family" | "member" | "relation",
    id: string,
    title: string,
    message: string,
  ) => {
    setDeleteError("");
    setDeleteDialog({ kind, id, title, message });
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteError("");
    setDeleteDialog(null);
  };

  const toggleMemberType = (memberType: MemberType) => {
    setMemberForm((current) => ({
      ...current,
      memberTypes: current.memberTypes.includes(memberType)
        ? current.memberTypes.filter((item) => item !== memberType)
        : [...current.memberTypes, memberType],
    }));
    setMemberErrors((current) => ({ ...current, memberTypes: undefined }));
  };

  const toggleStaffPermission = (permission: StaffPermission) => {
    setMemberForm((current) => ({
      ...current,
      staffPermissions: current.staffPermissions.includes(permission)
        ? current.staffPermissions.filter((item) => item !== permission)
        : [...current.staffPermissions, permission],
    }));
  };

  const toggleInstrumentCode = (instrumentCode: InstrumentCode) => {
    setMemberForm((current) => ({
      ...current,
      instrumentCodes: current.instrumentCodes.includes(instrumentCode)
        ? current.instrumentCodes.filter((item) => item !== instrumentCode)
        : [...current.instrumentCodes, instrumentCode],
    }));
  };

  const submitFamily = async () => {
    const nextErrors: FieldErrors = {};
    if (!familyForm.name.trim()) {
      nextErrors.name = "family 名を入力してください。";
    }
    setFamilyErrors(nextErrors);
    if (nextErrors.name) return;

    try {
      await saveFamily(familyForm.id, {
        name: familyForm.name,
        status: familyForm.status,
        notes: familyForm.notes,
      });
      setIsFamilyModalOpen(false);
      setToastMessage(familyForm.id ? "family を更新しました。" : "family を追加しました。");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "family の保存に失敗しました。");
    }
  };

  const submitMember = async () => {
    const nextErrors: FieldErrors = {};
    const normalizedLoginId = memberForm.loginId ? normalizeLoginId(memberForm.loginId) : "";
    const memberTypesError = validateMemberTypes(memberForm.memberTypes);
    const normalizedEnrollmentYear = memberForm.enrollmentYear.trim();

    if (!memberForm.name.trim()) nextErrors.name = "member 名を入力してください。";
    if (memberTypesError) nextErrors.memberTypes = memberTypesError;
    if (!adminRoleOptions.some((option) => option.value === memberForm.adminRole)) {
      nextErrors.adminRole = "管理権限を選択してください。";
    }
    if (!memberStatusOptions.some((option) => option.value === memberForm.memberStatus)) {
      nextErrors.memberStatus = "利用状態を選択してください。";
    }
    if (normalizedLoginId && !isValidLoginId(normalizedLoginId)) {
      nextErrors.loginId =
        normalizedLoginId.length < 4 || normalizedLoginId.length > 20
          ? loginIdValidationMessages.length
          : loginIdValidationMessages.charset;
    }
    if (normalizedEnrollmentYear && !/^\d{4}$/.test(normalizedEnrollmentYear)) {
      nextErrors.enrollmentYear = "入学年度は西暦4桁で入力してください。";
    }

    const duplicateLoginId = members.find(
      (member) => member.id !== memberForm.id && member.loginId && member.loginId === normalizedLoginId,
    );
    if (duplicateLoginId) {
      nextErrors.loginId = "この loginId は既に使われています。";
    }

    setMemberErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    try {
      await saveMember(memberForm.id, {
        familyId: memberForm.familyId,
        name: memberForm.name,
        nameKana: memberForm.nameKana,
        enrollmentYear: normalizedEnrollmentYear ? Number(normalizedEnrollmentYear) : null,
        instrumentCodes: memberForm.instrumentCodes,
        memberTypes: memberForm.memberTypes,
        adminRole: memberForm.adminRole,
        staffPermissions: memberForm.staffPermissions,
        memberStatus: memberForm.memberStatus,
        loginId: normalizedLoginId,
        notes: memberForm.notes,
      });
      setIsMemberModalOpen(false);
      setToastMessage(memberForm.id ? "member を更新しました。" : "member を追加しました。");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "member の保存に失敗しました。");
    }
  };

  const submitRelation = async () => {
    const nextErrors: FieldErrors = {};
    if (!relationForm.childMemberId) nextErrors.childMemberId = "部員を選択してください。";
    if (!relationForm.guardianMemberId) nextErrors.guardianMemberId = "保護者を選択してください。";
    if (relationForm.childMemberId && relationForm.childMemberId === relationForm.guardianMemberId) {
      nextErrors.guardianMemberId = "同じ member 同士の relation は登録できません。";
    }
    if (
      relationForm.childMemberId &&
      relationForm.guardianMemberId &&
      hasDuplicateRelationPair(
        relations,
        relationForm.childMemberId,
        relationForm.guardianMemberId,
        relationForm.id,
      )
    ) {
      nextErrors.guardianMemberId = "同じ部員と保護者の relation は既に登録されています。";
    }
    if (
      relationForm.childMemberId &&
      relationForm.guardianMemberId &&
      !isSameFamilyRelation(members, relationForm.childMemberId, relationForm.guardianMemberId)
    ) {
      nextErrors.guardianMemberId = "当面は同一 family 内の relation のみ登録できます。";
    }
    setRelationErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    try {
      await saveMemberRelation(relationForm.id, relationForm);
      setIsRelationModalOpen(false);
      setToastMessage(relationForm.id ? "relation を更新しました。" : "relation を追加しました。");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "relation の保存に失敗しました。");
    }
  };

  const submitLink = async () => {
    if (!linkTargetMember || !selectedAuthUid) {
      setPageError("紐付ける Auth user を選択してください。");
      return;
    }

    try {
      await linkMemberToAuthUser(linkTargetMember.id, selectedAuthUid);
      setLinkTargetMemberId(null);
      setSelectedAuthUid("");
      setToastMessage("Auth 紐付けを更新しました。");
      await refreshAuthUsers();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Auth 紐付けに失敗しました。");
    }
  };

  const runDelete = async () => {
    if (!deleteDialog) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      if (deleteDialog.kind === "family") {
        await deleteFamily(deleteDialog.id);
        setToastMessage("family を削除しました。");
      } else if (deleteDialog.kind === "member") {
        await deleteMember(deleteDialog.id);
        setToastMessage("member と関連 relation を削除しました。");
      } else {
        await deleteMemberRelation(deleteDialog.id);
        setToastMessage("relation を削除しました。");
      }
      setDeleteDialog(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  const downloadMemberCsvTemplate = () => {
    const blob = new Blob([`${memberCsvTemplateHeader}\n`], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "windoms-member-template.csv";
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const resetCsvImportState = () => {
    setCsvImportErrors([]);
    setCsvImportPreview([]);
    setCsvImportCount(0);
    setCsvImportResults([]);
    setIsCsvImportModalOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCsvImportSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      const result = parseMemberCsv(csvText, members, familyIdByName);
      if (result.errors.length > 0) {
        setCsvImportErrors(result.errors.map((item) => `${item.rowNumber}行目: ${item.message}`));
        setCsvImportPreview([]);
        setCsvImportCount(0);
        setCsvImportResults([]);
        setIsCsvImportModalOpen(true);
        return;
      }

      setCsvImportErrors([]);
      setCsvImportPreview(
        result.rows.slice(0, 8).map((item) => ({
          rowNumber: item.rowNumber,
          familyName: item.familyName || "未所属",
          name: item.input.name,
          loginId: item.input.loginId,
        })),
      );
      setCsvImportCount(result.rows.length);
      setCsvImportResults([]);
      setIsCsvImportModalOpen(true);
    } catch (error) {
      setCsvImportErrors([error instanceof Error ? error.message : "CSV の読み込みに失敗しました。"]);
      setCsvImportPreview([]);
      setCsvImportCount(0);
      setCsvImportResults([]);
      setIsCsvImportModalOpen(true);
    }
  };

  const runCsvImport = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setCsvImportErrors(["CSV ファイルを選択してください。"]);
      return;
    }

    setIsCsvImporting(true);
    try {
      const csvText = await file.text();
      const result = parseMemberCsv(csvText, members, familyIdByName);
      if (result.errors.length > 0) {
        setCsvImportErrors(result.errors.map((item) => `${item.rowNumber}行目: ${item.message}`));
        return;
      }

      const response = await bulkRegisterMembers(
        result.rows.map((row) => ({
          rowNumber: row.rowNumber,
          input: row.input,
        })),
      );
      setCsvImportResults(response.results);
      setToastMessage(
        `一括登録が完了しました。成功 ${response.successCount} 件 / 失敗 ${response.failureCount} 件`,
      );
      if (response.successCount > 0) {
        try {
          await refreshAuthUsers();
        } catch {
          // 一括登録結果の表示を優先し、Auth 一覧再取得失敗では処理全体を失敗にしない。
        }
      }
    } catch (error) {
      setCsvImportErrors([error instanceof Error ? error.message : "CSV 一括登録に失敗しました。"]);
    } finally {
      setIsCsvImporting(false);
    }
  };

  const downloadCsvImportResults = () => {
    if (csvImportResults.length === 0) return;
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      ["rowNumber", "userId", "displayName", "generatedEmail", "temporaryPassword", "status", "errorMessage"].join(","),
      ...csvImportResults.map((item) =>
        [
          String(item.rowNumber),
          escapeCell(item.userId),
          escapeCell(item.displayName),
          escapeCell(item.generatedEmail),
          escapeCell(item.temporaryPassword),
          escapeCell(item.status),
          escapeCell(item.errorMessage),
        ].join(","),
      ),
    ];
    const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "windoms-bulk-register-results.csv";
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const authStatusText =
    authUsersState === "loading"
      ? "読み込み中"
      : authUsersState === "error"
        ? "取得失敗"
        : authUsers.length === 0
          ? "取得成功: 0件"
          : `取得成功: ${authUsers.length}件`;

  return (
    <section className="card members-page members-admin-page">
      <div className="members-admin-header">
        <div>
          <h1>メンバー管理</h1>
          <p className="muted">メンバー画面や他モジュールで使う人物情報を管理します。</p>
          <p className="muted">通常操作と点検・不整合確認を分けて扱える構成です。</p>
        </div>
      </div>

      {toastMessage && <div className="inline-toast">{toastMessage}</div>}
      {pageError && <p className="field-error">{pageError}</p>}
      {(isFirestoreLoading || authUsersState === "loading") && <p className="muted">読み込み中...</p>}

      <div className="members-admin-summary">
        <article className="member-admin-stat">
          <strong>{families.length}</strong>
          <span>families</span>
        </article>
        <article className="member-admin-stat">
          <strong>{members.length}</strong>
          <span>members</span>
        </article>
        <article className="member-admin-stat">
          <strong>{relations.length}</strong>
          <span>memberRelations</span>
        </article>
        <article className="member-admin-stat">
          <strong>{authUsers.length}</strong>
          <span>Auth users</span>
        </article>
      </div>

      <div className="members-admin-tabs" role="tablist" aria-label="メンバー管理タブ">
        {managementTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`members-admin-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "family" && (
        <section className="members-admin-section">
          <div className="members-section-heading">
            <div>
              <h2>Family</h2>
              <p className="muted">family の一覧、追加、編集、削除を扱います。</p>
            </div>
            <div className="members-admin-actions">
              <button type="button" className="button button-small" onClick={openFamilyCreate}>
                Family追加
              </button>
            </div>
          </div>
          <div className="members-admin-grid">
            {families.map((family) => {
              const memberCount = familyMemberCountById[family.id] ?? 0;

              return (
                <article key={family.id} className="members-admin-card">
                  <div className="members-admin-card-header">
                    <strong>{family.name}</strong>
                    <div className="members-admin-row-actions">
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => openFamilyEdit(family)}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className="button button-small button-danger"
                        onClick={() =>
                          openDeleteDialog(
                            "family",
                            family.id,
                            "family を削除",
                            memberCount > 0
                              ? "所属 member があるため削除できません。先に member を整理してください。"
                              : `${family.name} を削除しますか？`,
                          )
                        }
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <p className="muted">status: {family.status}</p>
                  <p className="muted">{family.notes || "notes なし"}</p>
                  <p className="muted">所属member: {memberCount}件</p>
                  {memberCount > 0 && <p className="field-error-inline">所属 member がある間は削除できません。</p>}
                </article>
              );
            })}
            {families.length === 0 && <p className="muted">family はまだありません。</p>}
          </div>
        </section>
      )}

      {activeTab === "member" && (
        <section className="members-admin-section">
          <div className="members-section-heading">
            <div>
              <h2>Member</h2>
              <p className="muted">member の一覧、追加、編集、削除、relation の通常操作を扱います。</p>
            </div>
            <div className="members-admin-actions">
              <button type="button" className="button button-small" onClick={openMemberCreate}>
                Member追加
              </button>
              <button type="button" className="button button-small button-secondary" onClick={() => fileInputRef.current?.click()}>
                CSV一括登録
              </button>
              <button type="button" className="button button-small button-secondary" onClick={downloadMemberCsvTemplate}>
                CSVテンプレートDL
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="members-file-input"
                onChange={(event) => void handleCsvImportSelect(event)}
              />
            </div>
          </div>
          <div className="members-tabs" role="tablist" aria-label="メンバー種別">
            {memberTypeFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`members-tab ${activeMemberTypeFilter === option.value ? "active" : ""}`}
                onClick={() => setActiveMemberTypeFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="members-admin-list-panel">
            {filteredMembers.map((member) => {
              const childMember = isChildMember(member);
              const childRelations = childMember ? childRelationsByChildId[member.id] ?? [] : [];
              const summaryBadges = buildMemberSummaryBadges(member);
              const profileDetails: string[] = [];
              if (member.enrollmentYear) {
                profileDetails.push(`${member.enrollmentYear}年度入学`);
              } else if (childMember || member.memberTypes.includes("obog")) {
                profileDetails.push("学年未設定");
              }
              if (member.instrumentCodes.length > 0) {
                profileDetails.push(formatInstrumentLabels(member.instrumentCodes));
              }
              return (
                <article key={member.id} className="members-admin-row members-member-card">
                  <div className="members-member-card-body">
                    <div className="members-admin-card-header members-member-card-header">
                      <strong>{member.name}</strong>
                      <div className="members-admin-row-actions">
                        <button
                          type="button"
                          className="button button-small button-secondary"
                          onClick={() => openMemberEdit(member)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="button button-small button-danger"
                          onClick={() =>
                            openDeleteDialog(
                              "member",
                              member.id,
                              "member を削除",
                              `${formatMemberLabel(member)} を削除しますか？ 関連する memberRelations もあわせて削除されます。Firebase Authentication のユーザーは削除されません。`,
                            )
                          }
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    <p className="muted">
                      {familyNameById[member.familyId] || "family 未設定"} / {summaryBadges.join(" / ") || "-"}
                    </p>
                    {profileDetails.length > 0 && <p className="muted">{profileDetails.join(" / ")}</p>}
                    {childMember && (
                      <div className="members-child-relations">
                        <div className="members-child-relations-header">
                          <p className="members-child-relations-title">保護者 relation</p>
                          <button type="button" className="button button-small" onClick={() => openRelationCreate(member.id)}>
                            追加
                          </button>
                        </div>
                        <p className="muted">{relationHelpText}</p>
                        {childRelations.length === 0 ? (
                          <p className="muted">保護者 relation は未設定です。</p>
                        ) : (
                          <ul className="members-admin-list members-child-relations-list">
                            {childRelations.map((relation) => (
                              <li key={relation.id} className="members-child-relations-item">
                                <span>
                                  {relationTypeLabel[relation.relationType]}: {memberNameById[relation.guardianMemberId] || relation.guardianMemberId}
                                </span>
                                <span className="members-admin-row-actions">
                                  <button
                                    type="button"
                                    className="button button-small button-secondary"
                                    onClick={() => openRelationEdit(relation)}
                                  >
                                    編集
                                  </button>
                                  <button
                                    type="button"
                                    className="button button-small button-danger"
                                    onClick={() =>
                                      openDeleteDialog(
                                        "relation",
                                        relation.id,
                                        "relation を削除",
                                        `${relationTypeLabel[relation.relationType]}: ${memberNameById[relation.guardianMemberId] || relation.guardianMemberId} を削除しますか？`,
                                      )
                                    }
                                  >
                                    削除
                                  </button>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            {filteredMembers.length === 0 && <p className="muted">該当する member はありません。</p>}
          </div>
        </section>
      )}

      {activeTab === "auth" && (
        <section className="members-admin-section">
          <div className="members-section-heading">
            <div>
              <h2>Auth</h2>
              <p className="muted">認証情報の確認、紐付け、再取得を扱います。</p>
            </div>
            <div className="members-admin-actions">
              <button
                type="button"
                className="button button-small button-secondary"
                onClick={() => void refreshAuthUsers()}
                disabled={authUsersState === "loading"}
              >
                {authUsersState === "loading" ? "Auth再取得中..." : "Auth再取得"}
              </button>
              <span className="members-auth-status">{authStatusText}</span>
            </div>
          </div>
          <div className="members-admin-list-panel">
            {members.map((member) => {
              const candidate = findAuthCandidate(member, authUsers);
              return (
                <article key={member.id} className="members-admin-row">
                  <div>
                    <strong>{member.name}</strong>
                    <p className="muted">loginId: {member.loginId || "-"}</p>
                    <p className="muted">authEmail: {member.authEmail || "-"}</p>
                    <p className="muted">
                      authUid: {member.authUid || "未設定"}
                      {candidate && !member.authUid && ` / 候補あり: ${candidate.email || candidate.uid}`}
                    </p>
                  </div>
                  <div className="members-admin-row-actions">
                    <button type="button" className="button button-small" onClick={() => openLinkModal(member)}>
                      Auth紐付け
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="members-admin-grid">
            <div className="members-admin-card members-auth-debug-card">
              <h3>現在の admin claim</h3>
              <p className="muted">admin: {claimState.admin ? "true" : "false"}</p>
              <p className="muted">checkedAt: {claimState.fetchedAt || "-"}</p>
              <p className="muted">{claimState.message || "権限状態を確認できます。"}</p>
              <div className="members-admin-row-actions">
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => void refreshClaims(true)}
                  disabled={isRefreshingClaims}
                >
                  {isRefreshingClaims ? "権限再取得中..." : "権限再取得"}
                </button>
              </div>
            </div>
            <div className="members-admin-card members-auth-debug-card">
              <h3>取得経路</h3>
              <p className="muted">client projectId: {firebaseProjectId || "(empty)"}</p>
              <p className="muted">functions region: {firebaseFunctionsRegion}</p>
              <p className="muted">server projectId: {authUsersDebug.serverProjectId || "(unknown)"}</p>
              <p className="muted">server functions region: {authUsersDebug.serverFunctionsRegion || "(unknown)"}</p>
              <p className="muted">fetchedAt: {authUsersDebug.fetchedAt || "-"}</p>
              {authUsersState === "error" && (
                <div className="members-auth-error">
                  <p className="field-error">
                    {authUsersDebug.errorCode === "functions/permission-denied"
                      ? "Auth 一覧の取得権限がありません。admin claim を確認してください。"
                      : "Auth 一覧の取得に失敗しました。"}
                  </p>
                  {authUsersDebug.errorCode && <p className="muted">errorCode: {authUsersDebug.errorCode}</p>}
                  {authUsersDebug.errorMessage && <p className="muted">message: {authUsersDebug.errorMessage}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="members-admin-list-panel">
            {authUsers.map((authUser) => (
              <article key={authUser.uid} className="members-admin-row">
                <div>
                  <strong>{authUser.email || authUser.uid}</strong>
                  <p className="muted">uid: {authUser.uid} / disabled: {authUser.disabled ? "yes" : "no"}</p>
                  <p className="muted">
                    created: {authUser.creationTime || "-"} / lastSignIn: {authUser.lastSignInTime || "-"}
                  </p>
                </div>
              </article>
            ))}
            {authUsersState === "success" && authUsers.length === 0 && <p className="muted">Auth ユーザーは 0 件です。</p>}
          </div>
        </section>
      )}

      {activeTab === "integrity" && (
        <section className="members-admin-section">
          <div className="members-section-heading">
            <div>
              <h2>未紐付け / 不整合</h2>
              <p className="muted">通常操作とは分けて、点検や修正対象の把握に使います。</p>
            </div>
          </div>
          <div className="members-admin-grid">
            <article className="members-admin-card">
              <h3>family 未所属</h3>
              <ul className="members-admin-list">
                {membersWithoutFamily.map((member) => (
                  <li key={member.id}>{member.name || member.id}</li>
                ))}
                {membersWithoutFamily.length === 0 && <li>未所属 member はありません。</li>}
              </ul>
            </article>
            <article className="members-admin-card">
              <h3>member 側の未紐付け</h3>
              <ul className="members-admin-list">
                {membersWithoutAuth.map((member) => (
                  <li key={member.id}>
                    {member.name}
                    <span className="muted"> / {member.loginId || "loginId 未設定"}</span>
                  </li>
                ))}
                {membersWithoutAuth.length === 0 && <li>未紐付け member はありません。</li>}
              </ul>
            </article>
            <article className="members-admin-card">
              <h3>Auth 側の未紐付け</h3>
              <ul className="members-admin-list">
                {authUsersWithoutMember.map((authUser) => (
                  <li key={authUser.uid}>{authUser.email || authUser.uid}</li>
                ))}
                {authUsersWithoutMember.length === 0 && authUsersState === "success" && <li>未紐付け Auth はありません。</li>}
                {authUsersState === "error" && <li>Auth 一覧の取得失敗中は点検できません。</li>}
              </ul>
            </article>
            <article className="members-admin-card">
              <h3>authUid 参照切れ</h3>
              <ul className="members-admin-list">
                {membersWithMissingAuth.map((member) => (
                  <li key={member.id}>
                    {member.name}
                    <span className="muted"> / {member.authUid}</span>
                  </li>
                ))}
                {membersWithMissingAuth.length === 0 && <li>参照切れ authUid はありません。</li>}
              </ul>
            </article>
            <article className="members-admin-card">
              <h3>relation 不整合</h3>
              <ul className="members-admin-list">
                {orphanRelations.map((relation) => (
                  <li key={relation.id}>
                    {relation.childMemberId} -&gt; {relation.guardianMemberId} / {relationTypeLabel[relation.relationType]}
                  </li>
                ))}
                {orphanRelations.length === 0 && <li>参照切れ relation はありません。</li>}
              </ul>
            </article>
            <article className="members-admin-card">
              <h3>重複 relation</h3>
              <ul className="members-admin-list">
                {duplicateRelations.map((item) => (
                  <li key={item.key}>
                    {item.key} / {item.relations.length}?
                  </li>
                ))}
                {duplicateRelations.length === 0 && <li>重複 relation はありません。</li>}
              </ul>
            </article>
          </div>
        </section>
      )}
      {isFamilyModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setIsFamilyModalOpen(false)}
            >
              ×
            </button>
            <h3>{familyForm.id ? "family を編集" : "family を追加"}</h3>
            <label>
              name
              <input
                value={familyForm.name}
                onChange={(event) => setFamilyForm((current) => ({ ...current, name: event.target.value }))}
              />
              {familyErrors.name && <span className="field-error">{familyErrors.name}</span>}
            </label>
            <label>
              status
              <select
                value={familyForm.status}
                onChange={(event) =>
                  setFamilyForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))
                }
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <label>
              notes
              <textarea
                value={familyForm.notes}
                onChange={(event) => setFamilyForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsFamilyModalOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void submitFamily()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {isMemberModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel member-modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setIsMemberModalOpen(false)}
            >
              ×
            </button>
            <h3>{memberForm.id ? "member を編集" : "member を追加"}</h3>
            <label>
              family
              <select
                value={memberForm.familyId}
                onChange={(event) => setMemberForm((current) => ({ ...current, familyId: event.target.value }))}
              >
                <option value="">未所属</option>
                {families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.name}
                  </option>
                ))}
              </select>
              {memberErrors.familyId && <span className="field-error">{memberErrors.familyId}</span>}
            </label>
            <label>
              name
              <input
                value={memberForm.name}
                onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
              />
              {memberErrors.name && <span className="field-error">{memberErrors.name}</span>}
            </label>
            <label>
              nameKana
              <input
                value={memberForm.nameKana}
                onChange={(event) => setMemberForm((current) => ({ ...current, nameKana: event.target.value }))}
              />
            </label>
            <label>
              入学年度
              <input
                inputMode="numeric"
                placeholder="例: 2024"
                value={memberForm.enrollmentYear}
                onChange={(event) =>
                  setMemberForm((current) => ({
                    ...current,
                    enrollmentYear: event.target.value.replace(/[^\d]/g, "").slice(0, 4),
                  }))
                }
              />
              {memberErrors.enrollmentYear && <span className="field-error">{memberErrors.enrollmentYear}</span>}
            </label>
            <div className="member-instruments-field">
              <div className="member-instruments-header">
                <span>担当楽器</span>
                <span className="member-instruments-help muted">複数選択可</span>
              </div>
              <div className="member-instruments-list" role="group" aria-label="担当楽器">
                <div className="member-instruments-grid">
                  {activeInstrumentMaster.map((instrument) => (
                    <label
                      key={instrument.code}
                      className={`permission-option-row member-instrument-option ${
                        memberForm.instrumentCodes.includes(instrument.code) ? "is-selected" : ""
                      }`}
                    >
                      <span className="permission-option-control">
                        <input
                          type="checkbox"
                          checked={memberForm.instrumentCodes.includes(instrument.code)}
                          onChange={() => toggleInstrumentCode(instrument.code)}
                        />
                      </span>
                      <span className="permission-option-label member-instrument-option-label">{instrument.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="member-instruments-summary muted">
                {memberForm.instrumentCodes.length > 0
                  ? `選択中: ${formatInstrumentLabels(memberForm.instrumentCodes)}`
                  : "担当楽器未設定"}
              </p>
            </div>
            <div className="permission-form-area">
              <div className="permission-form-grid">
                <PermissionSection
                  title="利用者区分"
                  description="部員は他の利用者区分と同時に設定できません。先輩は保護者・先生と併用できます。"
                  error={memberErrors.memberTypes}
                >
                  {memberTypeOptions.map((option) => {
                    const disabled = !canSelectMemberType(memberForm.memberTypes, option.value);
                    return (
                      <PermissionOptionRow
                        key={option.value}
                        type="checkbox"
                        checked={memberForm.memberTypes.includes(option.value)}
                        disabled={disabled}
                        label={option.label}
                        onChange={() => toggleMemberType(option.value)}
                      />
                    );
                  })}
                </PermissionSection>

                <PermissionSection title="管理権限" error={memberErrors.adminRole}>
                  {adminRoleOptions.map((option) => (
                    <PermissionOptionRow
                      key={option.value}
                      type="radio"
                      name="member-admin-role"
                      checked={memberForm.adminRole === option.value}
                      label={option.label}
                      onChange={() => setMemberForm((current) => ({ ...current, adminRole: option.value }))}
                    />
                  ))}
                </PermissionSection>

                <PermissionSection title="担当業務">
                  {staffPermissionOptions.map((option) => (
                    <PermissionOptionRow
                      key={option.value}
                      type="checkbox"
                      checked={memberForm.staffPermissions.includes(option.value)}
                      label={option.label}
                      onChange={() => toggleStaffPermission(option.value)}
                    />
                  ))}
                </PermissionSection>

                <PermissionSection title="利用状態" error={memberErrors.memberStatus}>
                  {memberStatusOptions.map((option) => (
                    <PermissionOptionRow
                      key={option.value}
                      type="radio"
                      name="member-status"
                      checked={memberForm.memberStatus === option.value}
                      label={option.label}
                      onChange={() => setMemberForm((current) => ({ ...current, memberStatus: option.value }))}
                    />
                  ))}
                </PermissionSection>
              </div>
            </div>
            <label>
              loginId
              <input
                value={memberForm.loginId}
                onChange={(event) => setMemberForm((current) => ({ ...current, loginId: event.target.value }))}
              />
              {memberErrors.loginId && <span className="field-error">{memberErrors.loginId}</span>}
            </label>
            {memberForm.loginId.trim() && (
              <p className="muted">内部メール候補: {toInternalAuthEmail(memberForm.loginId)}</p>
            )}
            <label>
              notes
              <textarea
                value={memberForm.notes}
                onChange={(event) => setMemberForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsMemberModalOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void submitMember()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {isRelationModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setIsRelationModalOpen(false)}
            >
              ×
            </button>
            <h3>{relationForm.id ? "relation を編集" : "relation を追加"}</h3>
            <p className="muted">{relationHelpText}</p>
            <p className="modal-summary">
              部員: {memberNameById[relationForm.childMemberId] || "未選択"}
            </p>
            {relationErrors.childMemberId && <p className="field-error">{relationErrors.childMemberId}</p>}
            <label>
              保護者
              <select
                value={relationForm.guardianMemberId}
                onChange={(event) =>
                  setRelationForm((current) => ({ ...current, guardianMemberId: event.target.value }))
                }
              >
                <option value="">選択してください</option>
                {guardianCandidates.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              {relationErrors.guardianMemberId && (
                <span className="field-error">{relationErrors.guardianMemberId}</span>
              )}
            </label>
            <label>
              続柄
              <select
                value={relationForm.relationType}
                onChange={(event) =>
                  setRelationForm((current) => ({
                    ...current,
                    relationType: event.target.value as RelationshipType,
                  }))
                }
              >
                {relationTypeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              status
              <select
                value={relationForm.status}
                onChange={(event) =>
                  setRelationForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))
                }
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsRelationModalOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void submitRelation()}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {linkTargetMember && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={() => setLinkTargetMemberId(null)}
            >
              ×
            </button>
            <h3>Auth 紐付け</h3>
            <p className="modal-summary">{linkTargetMember.name}</p>
            <p className="muted">
              loginId: {linkTargetMember.loginId || "-"}
              {linkTargetMember.loginId && ` / 内部メール候補: ${toInternalAuthEmail(linkTargetMember.loginId)}`}
            </p>
            <label>
              Auth user
              <select value={selectedAuthUid} onChange={(event) => setSelectedAuthUid(event.target.value)}>
                <option value="">選択してください</option>
                {authUsers.map((authUser) => (
                  <option key={authUser.uid} value={authUser.uid}>
                    {authUser.email || authUser.uid}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setLinkTargetMemberId(null)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void submitLink()}>
                紐付け
              </button>
            </div>
          </section>
        </div>
      )}

      {isCsvImportModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel member-csv-modal">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={resetCsvImportState}
              disabled={isCsvImporting}
            >
              ×
            </button>
            <h3>CSV一括登録</h3>
            <p className="muted">
              1行目はヘッダとしてスキップし、2行目以降を Windoms 専用の固定列順で一括登録します。
            </p>
            {csvImportErrors.length > 0 ? (
              <div className="member-csv-errors">
                <p className="field-error">一括登録前チェックでエラーが見つかりました。</p>
                <ul className="members-admin-list">
                  {csvImportErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : csvImportResults.length > 0 ? (
              <div className="member-csv-preview">
                <p className="modal-summary">
                  成功 {csvImportResults.filter((item) => item.status === "success").length} 件 / 失敗{" "}
                  {csvImportResults.filter((item) => item.status === "error").length} 件
                </p>
                <ul className="members-admin-list">
                  {csvImportResults.map((item) => (
                    <li key={`${item.rowNumber}-${item.userId || item.displayName}`}>
                      {item.rowNumber}行目: {item.displayName || "-"} / {item.userId || "-"} /{" "}
                      {item.status === "success"
                        ? `${item.generatedEmail} / 仮PW: ${item.temporaryPassword}`
                        : item.errorMessage}
                    </li>
                  ))}
                </ul>
                <div className="members-admin-actions">
                  <button type="button" className="button button-small button-secondary" onClick={downloadCsvImportResults}>
                    結果CSVダウンロード
                  </button>
                </div>
              </div>
            ) : (
              <div className="member-csv-preview">
                <p className="modal-summary">{csvImportCount}件を一括登録する予定です。</p>
                <ul className="members-admin-list">
                  {csvImportPreview.map((item) => (
                    <li key={`${item.rowNumber}-${item.loginId}`}>
                      {item.rowNumber}行目: {item.name} / {item.loginId} / {item.familyName}
                    </li>
                  ))}
                </ul>
                {csvImportCount > csvImportPreview.length && (
                  <p className="muted">ほか {csvImportCount - csvImportPreview.length} 件</p>
                )}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={resetCsvImportState}
                disabled={isCsvImporting}
              >
                キャンセル
              </button>
              {csvImportErrors.length === 0 && csvImportResults.length === 0 && (
                <button type="button" className="button" onClick={() => void runCsvImport()} disabled={isCsvImporting}>
                  {isCsvImporting ? "一括登録中..." : "この内容で一括登録する"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {deleteDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeDeleteDialog}
              disabled={isDeleting}
            >
              ×
            </button>
            <h3>{deleteDialog.title}</h3>
            <p className="modal-summary">{deleteDialog.message}</p>
            {deleteError && <p className="modal-error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeDeleteDialog} disabled={isDeleting}>
                キャンセル
              </button>
              <button type="button" className="button button-danger" onClick={() => void runDelete()} disabled={isDeleting}>
                {isDeleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
