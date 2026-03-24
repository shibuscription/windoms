import { useEffect, useMemo, useState } from "react";
import { isValidLoginId, normalizeLoginId, toInternalAuthEmail } from "../auth/loginId";
import {
  findAuthCandidate,
  findAuthUsersWithoutMember,
  findDuplicateRelations,
  findMembersWithMissingAuth,
  findMembersWithoutAuth,
  findRelationOrphans,
} from "../members/integrity";
import {
  deactivateMemberRelation,
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
  AuthUserSummary,
  FamilyRecord,
  MemberRecord,
  MemberRelationRecord,
  MemberRole,
  RelationshipType,
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
  role: MemberRole;
  permissionsText: string;
  status: "active" | "inactive";
  loginId: string;
};

type RelationFormState = {
  id: string | null;
  fromMemberId: string;
  toMemberId: string;
  relationship: RelationshipType;
  status: "active" | "inactive";
};

type FieldErrors = Record<string, string | undefined>;

const relationshipLabel: Record<RelationshipType, string> = {
  father: "父",
  mother: "母",
  aunt: "叔母/伯母",
  uncle: "叔父/伯父",
  grandfather: "祖父",
  grandmother: "祖母",
  guardian: "保護者",
  other: "その他",
};

const roleLabel: Record<MemberRole, string> = {
  admin: "admin",
  officer: "officer",
  parent: "parent",
  child: "child",
  teacher: "teacher",
};

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
  role: "parent",
  permissionsText: "",
  status: "active",
  loginId: "",
});

const emptyRelationForm = (): RelationFormState => ({
  id: null,
  fromMemberId: "",
  toMemberId: "",
  relationship: "guardian",
  status: "active",
});

const splitPermissions = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function MembersPage() {
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUserSummary[]>([]);
  const [isFirestoreLoading, setIsFirestoreLoading] = useState(true);
  const [isAuthUsersLoading, setIsAuthUsersLoading] = useState(false);
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

  const familyNameById = useMemo(
    () =>
      families.reduce<Record<string, string>>((result, family) => {
        result[family.id] = family.name;
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

  const membersWithoutAuth = useMemo(() => findMembersWithoutAuth(members), [members]);
  const authUsersWithoutMember = useMemo(
    () => findAuthUsersWithoutMember(authUsers, members),
    [authUsers, members],
  );
  const membersWithMissingAuth = useMemo(
    () => findMembersWithMissingAuth(members, authUsers),
    [authUsers, members],
  );
  const orphanRelations = useMemo(
    () => findRelationOrphans(relations, members),
    [relations, members],
  );
  const duplicateRelations = useMemo(() => findDuplicateRelations(relations), [relations]);

  const linkTargetMember = linkTargetMemberId
    ? members.find((member) => member.id === linkTargetMemberId) ?? null
    : null;

  const refreshAuthUsers = async () => {
    setIsAuthUsersLoading(true);
    setPageError("");
    try {
      setAuthUsers(await listAuthUsers());
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Auth 一覧の取得に失敗しました。");
    } finally {
      setIsAuthUsersLoading(false);
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

      void refreshAuthUsers();

      return () => {
        unsubscribeFamilies();
        unsubscribeMembers();
        unsubscribeRelations();
      };
    } catch (error) {
      setIsFirestoreLoading(false);
      setPageError(error instanceof Error ? error.message : "メンバー管理データの読込に失敗しました。");
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
      role: member.role,
      permissionsText: member.permissions.join(", "),
      status: member.status,
      loginId: member.loginId,
    });
    setMemberErrors({});
    setIsMemberModalOpen(true);
  };

  const openRelationCreate = () => {
    setRelationForm(emptyRelationForm());
    setRelationErrors({});
    setIsRelationModalOpen(true);
  };

  const openRelationEdit = (relation: MemberRelationRecord) => {
    setRelationForm({
      id: relation.id,
      fromMemberId: relation.fromMemberId,
      toMemberId: relation.toMemberId,
      relationship: relation.relationship,
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

    if (!memberForm.familyId) nextErrors.familyId = "family を選択してください。";
    if (!memberForm.name.trim()) nextErrors.name = "名前を入力してください。";
    if (normalizedLoginId && !isValidLoginId(normalizedLoginId)) {
      nextErrors.loginId = "loginId は英小文字・数字・.-_ のみ利用できます。";
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
        role: memberForm.role,
        permissions: splitPermissions(memberForm.permissionsText),
        status: memberForm.status,
        loginId: normalizedLoginId,
      });
      setIsMemberModalOpen(false);
      setToastMessage(memberForm.id ? "member を更新しました。" : "member を追加しました。");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "member の保存に失敗しました。");
    }
  };

  const submitRelation = async () => {
    const nextErrors: FieldErrors = {};
    if (!relationForm.fromMemberId) nextErrors.fromMemberId = "fromMember を選択してください。";
    if (!relationForm.toMemberId) nextErrors.toMemberId = "toMember を選択してください。";
    if (relationForm.fromMemberId && relationForm.fromMemberId === relationForm.toMemberId) {
      nextErrors.toMemberId = "同一 member 同士は設定できません。";
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
      setPageError("紐付ける Auth ユーザーを選択してください。");
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

  return (
    <section className="card members-page members-admin-page">
      <div className="members-admin-header">
        <div>
          <h1>メンバー管理</h1>
          <p className="muted">families / members / memberRelations / Auth 紐付けを管理します。</p>
        </div>
        <div className="members-admin-actions">
          <button type="button" className="button button-small" onClick={openFamilyCreate}>
            family 追加
          </button>
          <button type="button" className="button button-small" onClick={openMemberCreate}>
            member 追加
          </button>
          <button type="button" className="button button-small" onClick={openRelationCreate}>
            relation 追加
          </button>
          <button type="button" className="button button-small button-secondary" onClick={() => void refreshAuthUsers()}>
            Auth 再取得
          </button>
        </div>
      </div>

      {toastMessage && <div className="inline-toast">{toastMessage}</div>}
      {pageError && <p className="field-error">{pageError}</p>}
      {(isFirestoreLoading || isAuthUsersLoading) && <p className="muted">読み込み中...</p>}

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

      <section className="members-admin-section">
        <h2>未紐付け / 不整合</h2>
        <div className="members-admin-grid">
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
                <li key={authUser.uid}>
                  {authUser.email || authUser.uid}
                </li>
              ))}
              {authUsersWithoutMember.length === 0 && <li>未紐付け Auth はありません。</li>}
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
              {membersWithMissingAuth.length === 0 && <li>参照切れはありません。</li>}
            </ul>
          </article>
          <article className="members-admin-card">
            <h3>relation 不整合</h3>
            <ul className="members-admin-list">
              {orphanRelations.map((relation) => (
                <li key={relation.id}>
                  {relation.fromMemberId} → {relation.toMemberId} / {relationshipLabel[relation.relationship]}
                </li>
              ))}
              {orphanRelations.length === 0 && <li>参照切れ relation はありません。</li>}
            </ul>
            {duplicateRelations.length > 0 && (
              <>
                <h4>重複 relation</h4>
                <ul className="members-admin-list">
                  {duplicateRelations.map((item) => (
                    <li key={item.key}>
                      {item.key} / {item.relations.length}件
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        </div>
      </section>

      <section className="members-admin-section">
        <div className="members-section-heading">
          <h2>families</h2>
        </div>
        <div className="members-admin-grid">
          {families.map((family) => (
            <article key={family.id} className="members-admin-card">
              <div className="members-admin-card-header">
                <strong>{family.name}</strong>
                <button type="button" className="button button-small button-secondary" onClick={() => openFamilyEdit(family)}>
                  編集
                </button>
              </div>
              <p className="muted">status: {family.status}</p>
              <p className="muted">{family.notes || "notes なし"}</p>
              <p className="muted">
                所属 member: {members.filter((member) => member.familyId === family.id).length} 名
              </p>
            </article>
          ))}
          {families.length === 0 && <p className="muted">family はまだありません。</p>}
        </div>
      </section>

      <section className="members-admin-section">
        <div className="members-section-heading">
          <h2>members</h2>
        </div>
        <div className="members-admin-list-panel">
          {members.map((member) => {
            const candidate = findAuthCandidate(member, authUsers);
            return (
              <article key={member.id} className="members-admin-row">
                <div>
                  <strong>{member.name}</strong>
                  <p className="muted">
                    {familyNameById[member.familyId] || "family 未設定"} / {roleLabel[member.role]} / {member.status}
                  </p>
                  <p className="muted">
                    loginId: {member.loginId || "-"} / authEmail: {member.authEmail || "-"}
                  </p>
                  <p className="muted">
                    authUid: {member.authUid || "未紐付け"}
                    {candidate && !member.authUid && ` / 候補あり: ${candidate.email}`}
                  </p>
                </div>
                <div className="members-admin-row-actions">
                  <button type="button" className="button button-small button-secondary" onClick={() => openMemberEdit(member)}>
                    編集
                  </button>
                  <button type="button" className="button button-small" onClick={() => openLinkModal(member)}>
                    Auth 紐付け
                  </button>
                </div>
              </article>
            );
          })}
          {members.length === 0 && <p className="muted">member はまだありません。</p>}
        </div>
      </section>

      <section className="members-admin-section">
        <div className="members-section-heading">
          <h2>memberRelations</h2>
        </div>
        <div className="members-admin-list-panel">
          {relations.map((relation) => (
            <article key={relation.id} className="members-admin-row">
              <div>
                <strong>{memberNameById[relation.fromMemberId] || relation.fromMemberId}</strong>
                <p className="muted">
                  → {memberNameById[relation.toMemberId] || relation.toMemberId} / {relationshipLabel[relation.relationship]} / {relation.status}
                </p>
              </div>
              <div className="members-admin-row-actions">
                <button type="button" className="button button-small button-secondary" onClick={() => openRelationEdit(relation)}>
                  編集
                </button>
                {relation.status === "active" && (
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => {
                      void deactivateMemberRelation(relation.id)
                        .then(() => setToastMessage("relation を inactive にしました。"))
                        .catch((error) =>
                          setPageError(error instanceof Error ? error.message : "relation の無効化に失敗しました。"),
                        );
                    }}
                  >
                    無効化
                  </button>
                )}
              </div>
            </article>
          ))}
          {relations.length === 0 && <p className="muted">relation はまだありません。</p>}
        </div>
      </section>

      <section className="members-admin-section">
        <div className="members-section-heading">
          <h2>Auth 一覧</h2>
        </div>
        <div className="members-admin-list-panel">
          {authUsers.map((authUser) => (
            <article key={authUser.uid} className="members-admin-row">
              <div>
                <strong>{authUser.email || authUser.uid}</strong>
                <p className="muted">
                  uid: {authUser.uid} / disabled: {authUser.disabled ? "yes" : "no"}
                </p>
              </div>
            </article>
          ))}
          {authUsers.length === 0 && !isAuthUsersLoading && <p className="muted">Auth ユーザーは取得されていません。</p>}
        </div>
      </section>

      {isFamilyModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsFamilyModalOpen(false)}>
              ×
            </button>
            <h3>{familyForm.id ? "family を編集" : "family を追加"}</h3>
            <label>
              name
              <input value={familyForm.name} onChange={(event) => setFamilyForm((current) => ({ ...current, name: event.target.value }))} />
              {familyErrors.name && <span className="field-error">{familyErrors.name}</span>}
            </label>
            <label>
              status
              <select value={familyForm.status} onChange={(event) => setFamilyForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <label>
              notes
              <textarea value={familyForm.notes} onChange={(event) => setFamilyForm((current) => ({ ...current, notes: event.target.value }))} />
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
          <section className="modal-panel">
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsMemberModalOpen(false)}>
              ×
            </button>
            <h3>{memberForm.id ? "member を編集" : "member を追加"}</h3>
            <label>
              family
              <select value={memberForm.familyId} onChange={(event) => setMemberForm((current) => ({ ...current, familyId: event.target.value }))}>
                <option value="">選択してください</option>
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
              <input value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} />
              {memberErrors.name && <span className="field-error">{memberErrors.name}</span>}
            </label>
            <label>
              nameKana
              <input value={memberForm.nameKana} onChange={(event) => setMemberForm((current) => ({ ...current, nameKana: event.target.value }))} />
            </label>
            <label>
              role
              <select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value as MemberRole }))}>
                <option value="admin">admin</option>
                <option value="officer">officer</option>
                <option value="parent">parent</option>
                <option value="child">child</option>
                <option value="teacher">teacher</option>
              </select>
            </label>
            <label>
              permissions
              <input
                value={memberForm.permissionsText}
                onChange={(event) => setMemberForm((current) => ({ ...current, permissionsText: event.target.value }))}
                placeholder="member.read, member.write"
              />
            </label>
            <label>
              status
              <select value={memberForm.status} onChange={(event) => setMemberForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <label>
              loginId
              <input value={memberForm.loginId} onChange={(event) => setMemberForm((current) => ({ ...current, loginId: event.target.value }))} />
              {memberErrors.loginId && <span className="field-error">{memberErrors.loginId}</span>}
            </label>
            {memberForm.loginId.trim() && (
              <p className="muted">内部メール候補: {toInternalAuthEmail(memberForm.loginId)}</p>
            )}
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
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsRelationModalOpen(false)}>
              ×
            </button>
            <h3>{relationForm.id ? "relation を編集" : "relation を追加"}</h3>
            <label>
              fromMember
              <select value={relationForm.fromMemberId} onChange={(event) => setRelationForm((current) => ({ ...current, fromMemberId: event.target.value }))}>
                <option value="">選択してください</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              {relationErrors.fromMemberId && <span className="field-error">{relationErrors.fromMemberId}</span>}
            </label>
            <label>
              toMember
              <select value={relationForm.toMemberId} onChange={(event) => setRelationForm((current) => ({ ...current, toMemberId: event.target.value }))}>
                <option value="">選択してください</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              {relationErrors.toMemberId && <span className="field-error">{relationErrors.toMemberId}</span>}
            </label>
            <label>
              relationship
              <select value={relationForm.relationship} onChange={(event) => setRelationForm((current) => ({ ...current, relationship: event.target.value as RelationshipType }))}>
                {Object.entries(relationshipLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              status
              <select value={relationForm.status} onChange={(event) => setRelationForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
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
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setLinkTargetMemberId(null)}>
              ×
            </button>
            <h3>Auth 紐付け</h3>
            <p className="modal-summary">{linkTargetMember.name}</p>
            <p className="muted">
              loginId: {linkTargetMember.loginId || "-"}
              {linkTargetMember.loginId && ` / 候補メール: ${toInternalAuthEmail(linkTargetMember.loginId)}`}
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
    </section>
  );
}
