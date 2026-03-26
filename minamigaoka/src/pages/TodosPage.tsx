import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DemoData, RelatedType, Todo } from "../types";
import {
  buildSessionChoices,
  parseSessionRelatedId,
  resolveTodoRelatedSummary,
  sortTodos,
} from "../utils/todoUtils";
import { toDemoFamilyName } from "../utils/demoName";

type TodosPageProps = {
  data: DemoData;
  currentUid: string;
  updateTodos: (updater: (prev: Todo[]) => Todo[]) => void;
};

type StatusFilter = "open" | "done";
type AssigneeFilter = "all" | "unassigned" | "me";
type RelatedFilter = "all" | "session" | "event" | "none";
type RelatedInputType = "none" | RelatedType;
type TodoFormErrors = { title?: string; relatedId?: string };

type TodoDraft = {
  title: string;
  completed: boolean;
  dueDate: string;
  assigneeUid: string;
  relatedType: RelatedInputType;
  relatedId: string;
};

const createDraft = (): TodoDraft => ({
  title: "",
  completed: false,
  dueDate: "",
  assigneeUid: "",
  relatedType: "none",
  relatedId: "",
});

const draftFromTodo = (todo: Todo): TodoDraft => ({
  title: todo.title,
  completed: todo.completed,
  dueDate: todo.dueDate ?? "",
  assigneeUid: todo.assigneeUid ?? "",
  relatedType: todo.related?.type ?? "none",
  relatedId: todo.related?.id ?? "",
});

const applyDraft = (source: Todo, draft: TodoDraft): Todo => ({
  ...source,
  title: draft.title.trim(),
  completed: draft.completed,
  assigneeUid: draft.assigneeUid || null,
  dueDate: draft.dueDate || undefined,
  related:
    draft.relatedType === "none"
      ? null
      : {
          type: draft.relatedType,
          id: draft.relatedId,
        },
});

export function TodosPage({ data, currentUid, updateTodos }: TodosPageProps) {
  const navigate = useNavigate();
  const [isMobileFilterMode, setIsMobileFilterMode] = useState<boolean>(() =>
    window.matchMedia("(max-width: 760px)").matches,
  );
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [relatedFilter, setRelatedFilter] = useState<RelatedFilter>("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [createDraftState, setCreateDraftState] = useState<TodoDraft>(createDraft());
  const [createErrors, setCreateErrors] = useState<TodoFormErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TodoDraft>(createDraft());
  const [editErrors, setEditErrors] = useState<TodoFormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [relatedDetailTodoId, setRelatedDetailTodoId] = useState<string | null>(null);

  const userOptions = useMemo(
    () =>
      Object.values(data.users)
        .map((user) => ({ uid: user.uid, name: toDemoFamilyName(user.displayName, user.uid) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [data.users],
  );
  const eventOptions = useMemo(
    () =>
      [...data.events]
        .map((event) => ({ id: event.id, label: event.title }))
        .sort((a, b) => a.label.localeCompare(b.label, "ja")),
    [data.events],
  );
  const sessionOptions = useMemo(() => buildSessionChoices(data), [data]);
  const filterActiveCount =
    (statusFilter !== "open" ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (relatedFilter !== "all" ? 1 : 0);
  const shouldShowFilterBody = !isMobileFilterMode || isMobileFilterOpen;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileFilterMode(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const validateDraft = (draft: TodoDraft): TodoFormErrors => {
    const errors: TodoFormErrors = {};
    if (!draft.title.trim()) errors.title = "タイトルは必須です";
    if (draft.relatedType !== "none" && !draft.relatedId) errors.relatedId = "紐づきを選択してください";
    return errors;
  };

  const passFilters = (todo: Todo): boolean => {
    if (statusFilter === "open" && todo.completed) return false;
    if (statusFilter === "done" && !todo.completed) return false;
    if (assigneeFilter === "unassigned" && todo.assigneeUid !== null) return false;
    if (assigneeFilter === "me" && todo.assigneeUid !== currentUid) return false;
    if (relatedFilter === "none" && todo.related) return false;
    if (relatedFilter === "event" && todo.related?.type !== "event") return false;
    if (relatedFilter === "session" && todo.related?.type !== "session") return false;
    return true;
  };

  const filteredTodos = useMemo(() => sortTodos(data.todos.filter(passFilters)), [data.todos, statusFilter, assigneeFilter, relatedFilter]);
  const unassignedTodos = useMemo(
    () => filteredTodos.filter((item) => item.assigneeUid === null),
    [filteredTodos],
  );
  const assignedTodos = useMemo(
    () => filteredTodos.filter((item) => item.assigneeUid !== null),
    [filteredTodos],
  );

  const userNameByUid = (uid: string | null): string => {
    if (!uid) return "未アサイン";
    return toDemoFamilyName(data.users[uid]?.displayName ?? uid, uid);
  };

  const updateDraftRelationType = (
    setDraft: (updater: (prev: TodoDraft) => TodoDraft) => void,
    nextType: RelatedInputType,
  ) => {
    setDraft((prev) => ({
      ...prev,
      relatedType: nextType,
      relatedId: nextType === "none" ? "" : prev.relatedType === nextType ? prev.relatedId : "",
    }));
  };

  const createTodo = () => {
    const errors = validateDraft(createDraftState);
    setCreateErrors(errors);
    if (errors.title || errors.relatedId) return;
    const now = new Date().toISOString();
    const next: Todo = {
      id: `todo-${Date.now()}`,
      title: createDraftState.title.trim(),
      completed: createDraftState.completed,
      createdAt: now,
      assigneeUid: createDraftState.assigneeUid || null,
      dueDate: createDraftState.dueDate || undefined,
      related:
        createDraftState.relatedType === "none"
          ? null
          : {
              type: createDraftState.relatedType,
              id: createDraftState.relatedId,
            },
    };
    updateTodos((prev) => [...prev, next]);
    setCreateDraftState(createDraft());
    setCreateErrors({});
    setIsAddModalOpen(false);
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditDraft(draftFromTodo(todo));
    setEditErrors({});
  };

  const saveEdit = () => {
    if (!editingId) return;
    const base = data.todos.find((item) => item.id === editingId);
    if (!base) return;
    const errors = validateDraft(editDraft);
    setEditErrors(errors);
    if (errors.title || errors.relatedId) return;
    const nextTodo = applyDraft(base, editDraft);
    updateTodos((prev) => prev.map((item) => (item.id === editingId ? nextTodo : item)));
    setEditingId(null);
  };

  const assigneeActionLabel = (todo: Todo): string | null => {
    if (todo.assigneeUid === null) return "引き取る";
    if (todo.assigneeUid !== currentUid) return "引き継ぐ";
    return null;
  };

  const runAssigneeAction = (todo: Todo) => {
    updateTodos((prev) =>
      prev.map((item) => (item.id === todo.id ? { ...item, assigneeUid: currentUid } : item)),
    );
  };

  const renderTodoRow = (todo: Todo) => {
    const related = resolveTodoRelatedSummary(data, todo);
    const relatedPath = related.to;
    const actionLabel = assigneeActionLabel(todo);
    return (
      <article key={todo.id} className={`todo-row ${todo.completed ? "completed" : ""}`}>
        <label className="todo-check">
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() =>
              updateTodos((prev) =>
                prev.map((item) => (item.id === todo.id ? { ...item, completed: !item.completed } : item)),
              )
            }
          />
        </label>
        <div className="todo-main">
          <p className="todo-title">{todo.title}</p>
          <p className="todo-meta">
            <span>担当: {userNameByUid(todo.assigneeUid)}</span>
            <span>期限: {todo.dueDate ?? "—"}</span>
          </p>
          {relatedPath ? (
            <button
              type="button"
              className="todo-related-link"
              onClick={() => setRelatedDetailTodoId(todo.id)}
            >
              {related.label}
            </button>
          ) : (
            <p className="todo-related-text">{related.label}</p>
          )}
        </div>
        <div className="todo-actions">
          {actionLabel && (
            <button type="button" className="button button-small" onClick={() => runAssigneeAction(todo)}>
              {actionLabel}
            </button>
          )}
          {!actionLabel && <span className="todo-action-placeholder" aria-hidden="true" />}
          <button type="button" className="link-icon-button todo-edit-icon-button" aria-label="編集" title="編集" onClick={() => startEdit(todo)}>
            編集
          </button>
          <button type="button" className="link-icon-button todo-delete-icon-button" aria-label="削除" title="削除" onClick={() => setDeleteTargetId(todo.id)}>
            削除
          </button>
        </div>
      </article>
    );
  };

  const deleteTarget = deleteTargetId
    ? data.todos.find((item) => item.id === deleteTargetId) ?? null
    : null;
  const relatedDetailTodo = relatedDetailTodoId
    ? data.todos.find((item) => item.id === relatedDetailTodoId) ?? null
    : null;
  const relatedDetail = relatedDetailTodo?.related ?? null;
  const relatedSessionInfo =
    relatedDetail?.type === "session" ? parseSessionRelatedId(relatedDetail.id) : null;
  const relatedSessionDoc = relatedSessionInfo
    ? data.scheduleDays[relatedSessionInfo.dateKey]?.sessions.find(
        (item) => item.order === relatedSessionInfo.order,
      ) ?? null
    : null;

  return (
    <section className="card todos-page">
      <div className="todos-header">
        <h1>TODO</h1>
        <button
          type="button"
          className="button button-small"
          aria-label="追加"
          title="追加"
          onClick={() => {
            setCreateDraftState(createDraft());
            setCreateErrors({});
            setIsAddModalOpen(true);
          }}
        >
          ＋ 追加
        </button>
      </div>

      <section className="todos-filters">
        <div className="todos-filter-header">
          <h2>フィルタ</h2>
          <button
            type="button"
            className={`todos-filter-toggle ${filterActiveCount > 0 ? "active-filter" : ""}`}
            onClick={() => setIsMobileFilterOpen((prev) => !prev)}
          >
            フィルタ {shouldShowFilterBody ? "▲" : "▼"}
            {filterActiveCount > 0 && <span className="todos-filter-badge">{filterActiveCount}</span>}
          </button>
        </div>
        {shouldShowFilterBody && (
          <div className="todos-filter-row">
            <label>
              状態
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="open">未完了</option>
                <option value="done">完了</option>
              </select>
            </label>
            <label>
              担当
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value as AssigneeFilter)}>
                <option value="all">すべて</option>
                <option value="unassigned">未アサイン</option>
                <option value="me">自分</option>
              </select>
            </label>
            <label>
              紐づき
              <select value={relatedFilter} onChange={(event) => setRelatedFilter(event.target.value as RelatedFilter)}>
                <option value="all">すべて</option>
                <option value="session">予定</option>
                <option value="event">イベント</option>
                <option value="none">なし</option>
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="todos-section">
        <h2>未アサイン</h2>
        <div className="todos-list">
          {unassignedTodos.map(renderTodoRow)}
          {unassignedTodos.length === 0 && <p className="muted">該当TODOはありません。</p>}
        </div>
      </section>

      <section className="todos-section">
        <h2>アサイン済み</h2>
        <div className="todos-list">
          {assignedTodos.map(renderTodoRow)}
          {assignedTodos.length === 0 && <p className="muted">該当TODOはありません。</p>}
        </div>
      </section>

      {editingId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEditingId(null)}>
          <section className="modal-panel todos-edit-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setEditingId(null)}>
              ×
            </button>
            <h3>TODO編集</h3>
            <label>
              タイトル
              <input value={editDraft.title} onChange={(event) => setEditDraft((prev) => ({ ...prev, title: event.target.value }))} />
              {editErrors.title && <span className="field-error">{editErrors.title}</span>}
            </label>
            <div className="field-grid">
              <label>
                完了
                <select
                  value={editDraft.completed ? "done" : "open"}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, completed: event.target.value === "done" }))}
                >
                  <option value="open">未完了</option>
                  <option value="done">完了</option>
                </select>
              </label>
              <label>
                期限
                <input type="date" value={editDraft.dueDate} onChange={(event) => setEditDraft((prev) => ({ ...prev, dueDate: event.target.value }))} />
              </label>
            </div>
            <div className="field-grid">
              <label>
                担当
                <select
                  value={editDraft.assigneeUid}
                  onChange={(event) => setEditDraft((prev) => ({ ...prev, assigneeUid: event.target.value }))}
                >
                  <option value="">未アサイン</option>
                  <option value={currentUid}>自分</option>
                  {userOptions.map((user) => (
                    <option key={user.uid} value={user.uid}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                紐づき種別
                <select value={editDraft.relatedType} onChange={(event) => updateDraftRelationType(setEditDraft, event.target.value as RelatedInputType)}>
                  <option value="none">なし</option>
                  <option value="session">予定</option>
                  <option value="event">イベント</option>
                </select>
              </label>
            </div>
            {editDraft.relatedType !== "none" && (
              <label>
                紐づき先
                <select value={editDraft.relatedId} onChange={(event) => setEditDraft((prev) => ({ ...prev, relatedId: event.target.value }))}>
                  <option value="">選択してください</option>
                  {(editDraft.relatedType === "session" ? sessionOptions : eventOptions).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {editErrors.relatedId && <span className="field-error">{editErrors.relatedId}</span>}
              </label>
            )}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setEditingId(null)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={saveEdit}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {isAddModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsAddModalOpen(false)}>
          <section className="modal-panel todos-edit-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setIsAddModalOpen(false)}>
              ×
            </button>
            <h3>TODO追加</h3>
            <label>
              タイトル
              <input
                value={createDraftState.title}
                onChange={(event) => setCreateDraftState((prev) => ({ ...prev, title: event.target.value }))}
              />
              {createErrors.title && <span className="field-error">{createErrors.title}</span>}
            </label>
            <div className="field-grid">
              <label>
                期限
                <input
                  type="date"
                  value={createDraftState.dueDate}
                  onChange={(event) => setCreateDraftState((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </label>
              <label>
                担当
                <select
                  value={createDraftState.assigneeUid}
                  onChange={(event) => setCreateDraftState((prev) => ({ ...prev, assigneeUid: event.target.value }))}
                >
                  <option value="">未アサイン</option>
                  <option value={currentUid}>自分</option>
                  {userOptions.map((user) => (
                    <option key={user.uid} value={user.uid}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-grid">
              <label>
                紐づき種別
                <select
                  value={createDraftState.relatedType}
                  onChange={(event) =>
                    updateDraftRelationType(setCreateDraftState, event.target.value as RelatedInputType)
                  }
                >
                  <option value="none">なし</option>
                  <option value="session">予定</option>
                  <option value="event">イベント</option>
                </select>
              </label>
              {createDraftState.relatedType !== "none" && (
                <label>
                  紐づき先
                  <select
                    value={createDraftState.relatedId}
                    onChange={(event) =>
                      setCreateDraftState((prev) => ({ ...prev, relatedId: event.target.value }))
                    }
                  >
                    <option value="">選択してください</option>
                    {(createDraftState.relatedType === "session" ? sessionOptions : eventOptions).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {createErrors.relatedId && <span className="field-error">{createErrors.relatedId}</span>}
                </label>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsAddModalOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={createTodo}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}

      {relatedDetailTodo && relatedDetail && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setRelatedDetailTodoId(null)}>
          <section className="modal-panel todos-related-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setRelatedDetailTodoId(null)}>
              ×
            </button>
            <h3>紐づき先詳細</h3>
            <p className="modal-context">{relatedDetailTodo.title}</p>
            {relatedDetail.type === "event" && (
              <>
                <p className="modal-summary">種別: イベント</p>
                <p>名称: {data.events.find((event) => event.id === relatedDetail.id)?.title ?? relatedDetail.id}</p>
                <p className="muted">ID: {relatedDetail.id}</p>
              </>
            )}
            {relatedDetail.type === "session" && (
              <>
                <p className="modal-summary">種別: 予定</p>
                {relatedSessionInfo && (
                  <p>
                    日付: {relatedSessionInfo.dateKey.replace(/-/g, "/")} / 枠: {relatedSessionInfo.order}
                  </p>
                )}
                {relatedSessionDoc && (
                  <>
                    <p>
                      時間: {relatedSessionDoc.startTime} - {relatedSessionDoc.endTime}
                    </p>
                    <p>種類: {relatedSessionDoc.type === "event" ? "イベント" : relatedSessionDoc.type === "self" ? "自主練" : "通常練習"}</p>
                  </>
                )}
                {!relatedSessionDoc && <p className="muted">予定情報を取得できませんでした。</p>}
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setRelatedDetailTodoId(null)}>
                閉じる
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  const summary = resolveTodoRelatedSummary(data, relatedDetailTodo);
                  if (!summary.to) return;
                  setRelatedDetailTodoId(null);
                  navigate(summary.to);
                }}
              >
                ページで開く
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDeleteTargetId(null)}>
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDeleteTargetId(null)}>
              ×
            </button>
            <h3>TODOを削除しますか？</h3>
            <p className="modal-summary">{deleteTarget.title}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDeleteTargetId(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className="button events-danger-button"
                onClick={() => {
                  updateTodos((prev) => prev.filter((item) => item.id !== deleteTarget.id));
                  setDeleteTargetId(null);
                }}
              >
                削除
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
