import { useEffect, useMemo, useState } from "react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import {
  instrumentCategoryLabel,
  instrumentCategoryOptions,
  instrumentStatusOptions,
  normalizeInstrumentCategory,
  type InstrumentCategoryKey,
} from "../instruments/catalog";
import type { SaveInstrumentInput } from "../instruments/service";
import { subscribeMembers } from "../members/service";
import { sortMembersForDisplay } from "../members/permissions";
import type { MemberRecord } from "../members/types";
import type { DemoData, Instrument, InstrumentStatus } from "../types";

type InstrumentsPageProps = {
  data: DemoData;
  isAdmin: boolean;
  isLoading: boolean;
  loadError: string;
  createInstrument: (input: SaveInstrumentInput) => Promise<void>;
  saveInstrument: (instrumentId: string, input: SaveInstrumentInput) => Promise<void>;
  deleteInstrument: (instrumentId: string) => Promise<void>;
};

type FormMode = "new" | "edit";

type InstrumentDraft = {
  managementCode: string;
  name: string;
  category: InstrumentCategoryKey;
  status: InstrumentStatus;
  storageLocation: string;
  assigneeMemberId: string;
  notes: string;
};

type InstrumentFormErrors = {
  managementCode?: string;
  name?: string;
  category?: string;
  status?: string;
  storageLocation?: string;
};

const emptyDraft = (): InstrumentDraft => ({
  managementCode: "",
  name: "",
  category: "woodwind",
  status: "良好",
  storageLocation: "",
  assigneeMemberId: "",
  notes: "",
});

const instrumentManagementCode = (instrument: Instrument): string =>
  instrument.managementCode?.trim() || instrument.code?.trim() || "";

const instrumentStorageLocation = (instrument: Instrument): string =>
  instrument.storageLocation?.trim() || instrument.location?.trim() || "";

const instrumentAssigneeName = (instrument: Instrument): string =>
  instrument.assigneeName?.trim() ||
  instrument.assignees?.find((item) => item.trim().length > 0)?.trim() ||
  "—";

const instrumentNotes = (instrument: Instrument): string =>
  instrument.notes?.trim() || instrument.note?.trim() || "";

const draftFromInstrument = (instrument: Instrument): InstrumentDraft => ({
  managementCode: instrumentManagementCode(instrument),
  name: instrument.name,
  category: normalizeInstrumentCategory(instrument.category),
  status: instrument.status,
  storageLocation: instrumentStorageLocation(instrument),
  assigneeMemberId: instrument.assigneeMemberId?.trim() || "",
  notes: instrumentNotes(instrument),
});

export function InstrumentsPage({
  data,
  isAdmin,
  isLoading,
  loadError,
  createInstrument,
  saveInstrument,
  deleteInstrument,
}: InstrumentsPageProps) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstrumentDraft>(emptyDraft());
  const [errors, setErrors] = useState<InstrumentFormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 759px)").matches);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [membersError, setMembersError] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 759px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    try {
      return subscribeMembers((rows) => {
        setMembers(rows);
        setMembersError("");
      });
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : "部員一覧の読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  const assigneeOptions = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter(
          (member) =>
            member.memberStatus === "active" &&
            (member.memberTypes.includes("child") || member.role === "child"),
        ),
        "child",
      ).map((member) => ({
        id: member.id,
        label: member.displayName,
      })),
    [members],
  );

  const groupedInstruments = useMemo(() => {
    const sorted = [...(data.instruments ?? [])].sort((left, right) => {
      const categoryCompare = (left.categorySortOrder ?? 999) - (right.categorySortOrder ?? 999);
      if (categoryCompare !== 0) return categoryCompare;
      const sortCompare = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortCompare !== 0) return sortCompare;
      return instrumentManagementCode(left).localeCompare(instrumentManagementCode(right), "ja");
    });
    return instrumentCategoryOptions.map((group) => ({
      ...group,
      rows: sorted.filter((item) => normalizeInstrumentCategory(item.category) === group.value),
    }));
  }, [data.instruments]);

  const detail = detailId ? data.instruments.find((item) => item.id === detailId) ?? null : null;
  const deleteTarget = deleteTargetId
    ? data.instruments.find((item) => item.id === deleteTargetId) ?? null
    : null;

  const totalCount = groupedInstruments.reduce((sum, group) => sum + group.rows.length, 0);

  const closeForm = () => {
    if (isSaving) return;
    setFormMode(null);
    setEditingId(null);
    setErrors({});
    setSubmitError("");
  };

  const openNewForm = () => {
    if (!isAdmin) return;
    setDraft(emptyDraft());
    setErrors({});
    setSubmitError("");
    setEditingId(null);
    setFormMode("new");
  };

  const openEditForm = (instrument: Instrument) => {
    if (!isAdmin) return;
    setDraft(draftFromInstrument(instrument));
    setErrors({});
    setSubmitError("");
    setEditingId(instrument.id);
    setFormMode("edit");
  };

  const validate = (): InstrumentFormErrors => {
    const nextErrors: InstrumentFormErrors = {};
    if (!draft.managementCode.trim()) nextErrors.managementCode = "管理番号を入力してください。";
    if (!draft.name.trim()) nextErrors.name = "楽器名を入力してください。";
    if (!draft.category.trim()) nextErrors.category = "カテゴリを選択してください。";
    if (!draft.status.trim()) nextErrors.status = "状態を選択してください。";
    if (!draft.storageLocation.trim()) nextErrors.storageLocation = "保管場所を入力してください。";

    const normalizedCode = draft.managementCode.trim().toUpperCase();
    const duplicatedCode = data.instruments.some(
      (item) =>
        instrumentManagementCode(item).trim().toUpperCase() === normalizedCode &&
        item.id !== editingId,
    );
    if (!nextErrors.managementCode && duplicatedCode) {
      nextErrors.managementCode = "同じ管理番号の楽器がすでにあります。";
    }

    return nextErrors;
  };

  const submit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    const assignee = assigneeOptions.find((item) => item.id === draft.assigneeMemberId);
    const payload: SaveInstrumentInput = {
      managementCode: draft.managementCode.trim(),
      name: draft.name.trim(),
      category: draft.category,
      status: draft.status,
      storageLocation: draft.storageLocation.trim(),
      assigneeMemberId: draft.assigneeMemberId || undefined,
      assigneeName: assignee?.label || undefined,
      notes: draft.notes.trim(),
      sortOrder: 0,
    };

    setIsSaving(true);
    try {
      if (formMode === "edit" && editingId) {
        await saveInstrument(editingId, payload);
        setDetailId(editingId);
      } else {
        await createInstrument(payload);
      }
      closeForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "楽器の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteInstrument(deleteTarget.id);
      if (detailId === deleteTarget.id) setDetailId(null);
      setDeleteTargetId(null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "楽器の削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="card instruments-page">
      <div className="instruments-header">
        <h1>楽器</h1>
        {isAdmin && (
          <button type="button" className="button button-small" onClick={openNewForm}>
            ＋追加
          </button>
        )}
      </div>

      {loadError && <p className="field-error">{loadError}</p>}
      {membersError && isAdmin && <p className="field-error">{membersError}</p>}

      {!isMobile && (
        <div className="instruments-table-wrap">
          <table className="instruments-table">
            <thead>
              <tr>
                <th>管理番号</th>
                <th>楽器名</th>
                <th>状態</th>
                <th>保管場所</th>
                <th>担当</th>
              </tr>
            </thead>
            {groupedInstruments.map((group) => (
              <tbody key={group.value}>
                <tr className="instruments-group-row">
                  <th colSpan={5}>{group.label}</th>
                </tr>
                {group.rows.map((instrument) => (
                  <tr
                    key={instrument.id}
                    className="instruments-row"
                    onClick={() => setDetailId(instrument.id)}
                  >
                    <td>{instrumentManagementCode(instrument)}</td>
                    <td>{instrument.name}</td>
                    <td>{instrument.status}</td>
                    <td>{instrumentStorageLocation(instrument)}</td>
                    <td>{instrumentAssigneeName(instrument)}</td>
                  </tr>
                ))}
                {group.rows.length === 0 && (
                  <tr className="instruments-empty-row">
                    <td colSpan={5}>—</td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {isMobile && (
        <div className="instruments-mobile-list">
          {groupedInstruments.map((group) => (
            <section key={group.value} className="instruments-mobile-group">
              <h2 className="instruments-mobile-group-title">{group.label}</h2>
              <div className="instruments-mobile-cards">
                {group.rows.map((instrument) => (
                  <button
                    key={instrument.id}
                    type="button"
                    className="instrument-mobile-card"
                    onClick={() => setDetailId(instrument.id)}
                  >
                    <strong className="instrument-mobile-title">{instrument.name}</strong>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">管理番号</span>
                      <span>{instrumentManagementCode(instrument)}</span>
                    </div>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">状態</span>
                      <span>{instrument.status}</span>
                    </div>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">保管場所</span>
                      <span className="instrument-mobile-location">{instrumentStorageLocation(instrument)}</span>
                    </div>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">担当</span>
                      <span>{instrumentAssigneeName(instrument)}</span>
                    </div>
                  </button>
                ))}
                {group.rows.length === 0 && <p className="muted">—</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      {isLoading && <p className="muted">楽器データを読み込み中...</p>}
      {!isLoading && totalCount === 0 && <p className="muted">楽器データはありません。</p>}

      {detail && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailId(null)}>
          <section className="modal-panel instruments-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDetailId(null)}>
              ×
            </button>
            <h3>楽器詳細</h3>
            <dl className="instruments-detail-list">
              <div><dt>管理番号</dt><dd>{instrumentManagementCode(detail)}</dd></div>
              <div><dt>楽器名</dt><dd>{detail.name}</dd></div>
              <div><dt>カテゴリ</dt><dd>{instrumentCategoryLabel(detail.category)}</dd></div>
              <div><dt>状態</dt><dd>{detail.status}</dd></div>
              <div><dt>保管場所</dt><dd>{instrumentStorageLocation(detail)}</dd></div>
              <div><dt>担当</dt><dd>{instrumentAssigneeName(detail)}</dd></div>
              <div><dt>備考</dt><dd>{instrumentNotes(detail) || "—"}</dd></div>
            </dl>
            <div className="modal-actions">
              {isAdmin && (
                <>
                  <button type="button" className="button button-secondary" onClick={() => openEditForm(detail)}>
                    編集
                  </button>
                  <button type="button" className="button events-danger-button" onClick={() => setDeleteTargetId(detail.id)}>
                    削除
                  </button>
                </>
              )}
              <button type="button" className="button button-secondary" onClick={() => setDetailId(null)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {formMode && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel instruments-form-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeForm}>
              ×
            </button>
            <h3>{formMode === "new" ? "楽器を新規追加" : "楽器を編集"}</h3>
            {submitError && <p className="field-error">{submitError}</p>}

            <label>
              管理番号
              <input
                value={draft.managementCode}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, managementCode: event.target.value }));
                  setErrors((prev) => ({ ...prev, managementCode: undefined }));
                }}
                placeholder="例: FL-01"
              />
              {errors.managementCode && <span className="field-error">{errors.managementCode}</span>}
            </label>

            <label>
              楽器名
              <input
                value={draft.name}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, name: event.target.value }));
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>

            <div className="field-grid">
              <label>
                カテゴリ
                <select
                  value={draft.category}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, category: event.target.value as InstrumentCategoryKey }));
                    setErrors((prev) => ({ ...prev, category: undefined }));
                  }}
                >
                  {instrumentCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.category && <span className="field-error">{errors.category}</span>}
              </label>

              <label>
                状態
                <select
                  value={draft.status}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, status: event.target.value as InstrumentStatus }));
                    setErrors((prev) => ({ ...prev, status: undefined }));
                  }}
                >
                  {instrumentStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.status && <span className="field-error">{errors.status}</span>}
              </label>
            </div>

            <label>
              保管場所
              <input
                value={draft.storageLocation}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, storageLocation: event.target.value }));
                  setErrors((prev) => ({ ...prev, storageLocation: undefined }));
                }}
              />
              {errors.storageLocation && <span className="field-error">{errors.storageLocation}</span>}
            </label>

            <label>
              担当
              <select
                value={draft.assigneeMemberId}
                onChange={(event) => setDraft((prev) => ({ ...prev, assigneeMemberId: event.target.value }))}
              >
                <option value="">未設定</option>
                {assigneeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              備考
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeForm} disabled={isSaving}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void submit()} disabled={isSaving}>
                {isSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <ConfirmationDialog
          title="楽器を削除しますか？"
          summary={`${instrumentManagementCode(deleteTarget)} / ${deleteTarget.name}`}
          confirmLabel={isDeleting ? "削除中..." : "削除"}
          danger
          busy={isDeleting}
          onClose={() => setDeleteTargetId(null)}
          onConfirm={handleDelete}
        />
      )}
    </section>
  );
}
