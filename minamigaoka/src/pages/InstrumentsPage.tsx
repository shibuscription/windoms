import { useEffect, useMemo, useState } from "react";
import type { DemoData, Instrument, InstrumentStatus } from "../types";

type InstrumentsPageProps = {
  data: DemoData;
  updateInstruments: (updater: (prev: Instrument[]) => Instrument[]) => void;
};

type FormMode = "new" | "edit";
type CategoryKey = "woodwind" | "brass" | "drums" | "percussion" | "keyboardPercussion";

type InstrumentDraft = {
  code: string;
  name: string;
  category: CategoryKey;
  status: InstrumentStatus;
  location: string;
  assignee: string;
  note: string;
};

type InstrumentFormErrors = {
  code?: string;
  name?: string;
  category?: string;
  status?: string;
  location?: string;
};

const assigneeOptions = ["-", "瀬古", "中村", "今井", "水野", "渋谷", "熊澤", "青木", "大滝", "加藤"] as const;

const categoryOptions: Array<{ value: CategoryKey; label: string }> = [
  { value: "woodwind", label: "木管楽器" },
  { value: "brass", label: "金管楽器" },
  { value: "drums", label: "ドラム" },
  { value: "percussion", label: "小物打楽器" },
  { value: "keyboardPercussion", label: "鍵盤打楽器" },
];

const groupOrder: Array<{ key: CategoryKey; label: string }> = [
  { key: "woodwind", label: "木管楽器" },
  { key: "brass", label: "金管楽器" },
  { key: "drums", label: "ドラム" },
  { key: "percussion", label: "小物打楽器" },
  { key: "keyboardPercussion", label: "鍵盤打楽器" },
];

const statusOptions: InstrumentStatus[] = ["良好", "要調整", "修理中", "貸出中"];

const emptyDraft = (): InstrumentDraft => ({
  code: "",
  name: "",
  category: "woodwind",
  status: "良好",
  location: "",
  assignee: "-",
  note: "",
});

const normalizeCategory = (category: string): CategoryKey => {
  const normalized = category.replace(/\s+/g, "").toLowerCase();
  if (normalized === "woodwind") return "woodwind";
  if (normalized === "brass") return "brass";
  if (normalized === "drums" || normalized === "drum") return "drums";
  if (normalized === "keyboardpercussion") return "keyboardPercussion";
  if (normalized === "percussion") return "percussion";
  return "percussion";
};

const categoryLabel = (category: string): string => {
  const key = normalizeCategory(category);
  return groupOrder.find((item) => item.key === key)?.label ?? "小物打楽器";
};

const toAssignees = (assignee: string): string[] => (assignee === "-" ? [] : [assignee]);

const assigneesLabel = (assignees: string[]): string =>
  assignees.length > 0 ? assignees[0] : "—";

const draftFromInstrument = (instrument: Instrument): InstrumentDraft => ({
  code: instrument.code,
  name: instrument.name,
  category: normalizeCategory(instrument.category),
  status: instrument.status,
  location: instrument.location,
  assignee: instrument.assignees[0] ?? "-",
  note: instrument.note,
});

export function InstrumentsPage({ data, updateInstruments }: InstrumentsPageProps) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstrumentDraft>(emptyDraft());
  const [errors, setErrors] = useState<InstrumentFormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 759px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 759px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const groupedInstruments = useMemo(() => {
    const base = [...(data.instruments ?? [])].sort((a, b) => a.code.localeCompare(b.code, "ja"));
    return groupOrder.map((group) => ({
      ...group,
      rows: base.filter((item) => normalizeCategory(item.category) === group.key),
    }));
  }, [data.instruments]);

  const detail = detailId ? data.instruments.find((item) => item.id === detailId) ?? null : null;
  const deleteTarget = deleteTargetId
    ? data.instruments.find((item) => item.id === deleteTargetId) ?? null
    : null;

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setErrors({});
  };

  const openNewForm = () => {
    setDraft(emptyDraft());
    setErrors({});
    setEditingId(null);
    setFormMode("new");
  };

  const openEditForm = (instrument: Instrument) => {
    setDraft(draftFromInstrument(instrument));
    setErrors({});
    setEditingId(instrument.id);
    setFormMode("edit");
  };

  const validate = (): InstrumentFormErrors => {
    const nextErrors: InstrumentFormErrors = {};
    if (!draft.code.trim()) nextErrors.code = "管理番号は必須です";
    if (!draft.name.trim()) nextErrors.name = "楽器名は必須です";
    if (!draft.category.trim()) nextErrors.category = "カテゴリは必須です";
    if (!draft.status.trim()) nextErrors.status = "状態は必須です";
    if (!draft.location.trim()) nextErrors.location = "保管場所は必須です";

    const normalizedCode = draft.code.trim().toUpperCase();
    const duplicatedCode = data.instruments.some(
      (item) => item.code.trim().toUpperCase() === normalizedCode && item.id !== editingId,
    );
    if (!nextErrors.code && duplicatedCode) nextErrors.code = "同じ管理番号が既にあります";

    return nextErrors;
  };

  const saveForm = () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: Omit<Instrument, "id"> = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      category: draft.category,
      status: draft.status,
      location: draft.location.trim(),
      assignees: toAssignees(draft.assignee),
      note: draft.note.trim(),
    };

    if (formMode === "edit" && editingId) {
      updateInstruments((prev) =>
        prev.map((item) => (item.id === editingId ? { ...item, ...payload } : item)),
      );
      setDetailId(editingId);
    } else {
      const id = `inst-${Date.now()}`;
      updateInstruments((prev) => [{ id, ...payload }, ...prev]);
      setDetailId(id);
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    updateInstruments((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    if (detailId === deleteTarget.id) setDetailId(null);
    setDeleteTargetId(null);
  };

  const totalCount = groupedInstruments.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <section className="card instruments-page">
      <div className="instruments-header">
        <h1>楽器</h1>
        <button type="button" className="button button-small" onClick={openNewForm}>
          ＋追加
        </button>
      </div>

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
              <tbody key={group.key}>
                <tr className="instruments-group-row">
                  <th colSpan={5}>{group.label}</th>
                </tr>
                {group.rows.map((instrument) => (
                  <tr
                    key={instrument.id}
                    className="instruments-row"
                    onClick={() => setDetailId(instrument.id)}
                  >
                    <td>{instrument.code}</td>
                    <td>{instrument.name}</td>
                    <td>{instrument.status}</td>
                    <td>{instrument.location}</td>
                    <td>{assigneesLabel(instrument.assignees)}</td>
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
            <section key={group.key} className="instruments-mobile-group">
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
                      <span>{instrument.code}</span>
                    </div>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">状態</span>
                      <span>{instrument.status}</span>
                    </div>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">保管場所</span>
                      <span className="instrument-mobile-location">{instrument.location}</span>
                    </div>
                    <div className="instrument-mobile-row">
                      <span className="instrument-mobile-label">担当</span>
                      <span>{assigneesLabel(instrument.assignees)}</span>
                    </div>
                  </button>
                ))}
                {group.rows.length === 0 && <p className="muted">—</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      {totalCount === 0 && <p className="muted">楽器データはありません。</p>}

      {detail && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailId(null)}>
          <section className="modal-panel instruments-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDetailId(null)}>
              ×
            </button>
            <h3>楽器詳細</h3>
            <dl className="instruments-detail-list">
              <div><dt>管理番号</dt><dd>{detail.code}</dd></div>
              <div><dt>楽器名</dt><dd>{detail.name}</dd></div>
              <div><dt>カテゴリ</dt><dd>{categoryLabel(detail.category)}</dd></div>
              <div><dt>状態</dt><dd>{detail.status}</dd></div>
              <div><dt>保管場所</dt><dd>{detail.location}</dd></div>
              <div><dt>担当</dt><dd>{assigneesLabel(detail.assignees)}</dd></div>
              <div><dt>備考</dt><dd>{detail.note || "—"}</dd></div>
            </dl>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => openEditForm(detail)}>
                編集
              </button>
              <button type="button" className="button events-danger-button" onClick={() => setDeleteTargetId(detail.id)}>
                削除
              </button>
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
            <h3>{formMode === "new" ? "楽器を新規作成" : "楽器を編集"}</h3>

            <label>
              管理番号
              <input
                value={draft.code}
                onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="例: FL-01"
              />
              {errors.code && <span className="field-error">{errors.code}</span>}
            </label>

            <label>
              楽器名
              <input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>

            <div className="field-grid">
              <label>
                カテゴリ
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, category: event.target.value as CategoryKey }))
                  }
                >
                  {categoryOptions.map((option) => (
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
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, status: event.target.value as InstrumentStatus }))
                  }
                >
                  {statusOptions.map((option) => (
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
                value={draft.location}
                onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
              />
              {errors.location && <span className="field-error">{errors.location}</span>}
            </label>

            <label>
              担当
              <select
                value={draft.assignee}
                onChange={(event) => setDraft((prev) => ({ ...prev, assignee: event.target.value }))}
              >
                {assigneeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              備考
              <textarea
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeForm}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={saveForm}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDeleteTargetId(null)}>
              ×
            </button>
            <h3>楽器を削除しますか？</h3>
            <p className="modal-summary">{deleteTarget.code} / {deleteTarget.name}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDeleteTargetId(null)}>
                キャンセル
              </button>
              <button type="button" className="button events-danger-button" onClick={confirmDelete}>
                削除
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
