import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { todayDateKey } from "../utils/date";

type DemoMenuRole = "child" | "parent" | "admin";
type EventKind = "コンクール" | "演奏会" | "合同練習" | "その他";
type EventState = "active" | "done";
type SessionType = "normal" | "self" | "event";

type DemoEvent = {
  id: string;
  title: string;
  kind: EventKind;
  state: EventState;
  eventSortDate: string;
  memo?: string;
  sessionIds?: string[];
};

type DemoEventTodo = {
  id: string;
  title: string;
  done: boolean;
  due?: string;
  assignee?: string;
};

type LinkedSession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: SessionType;
  eventName?: string;
  location?: string;
  dutyName?: string;
};

type EventFormDraft = {
  title: string;
  kind: EventKind;
  eventSortDate: string;
  memo: string;
  state: EventState;
};

type EventFormErrors = {
  title?: string;
  eventSortDate?: string;
};

const DEMO_MENU_ROLE_KEY = "windoms_demo_role";
const readDemoMenuRole = (): DemoMenuRole => {
  const raw = window.localStorage.getItem(DEMO_MENU_ROLE_KEY);
  return raw === "child" || raw === "parent" || raw === "admin" ? raw : "admin";
};
const canManageEvents = (): boolean => readDemoMenuRole() === "admin";

const demoEvents: DemoEvent[] = [
  {
    id: "teiki-2026",
    title: "定期演奏会",
    kind: "演奏会",
    state: "active",
    eventSortDate: "2026-03-20",
    memo: "会場入り 8:30。打楽器搬入あり。",
    sessionIds: ["s-2026-03-20-am", "s-2026-03-20-pm"],
  },
  {
    id: "touki-2026",
    title: "陶器まつり屋外演奏",
    kind: "演奏会",
    state: "active",
    eventSortDate: "2026-02-23",
    memo: "雨天時は体育館演奏へ切替予定。",
    sessionIds: ["s-2026-02-23-pm"],
  },
  {
    id: "camp-2025",
    title: "夏合宿",
    kind: "合同練習",
    state: "done",
    eventSortDate: "2025-08-10",
    memo: "持ち物リストを再利用予定。",
    sessionIds: ["s-2025-08-10-am", "s-2025-08-11-am"],
  },
  {
    id: "parent-meeting-2025",
    title: "保護者会",
    kind: "その他",
    state: "done",
    eventSortDate: "2025-12-14",
    memo: "次年度予算案説明。",
    sessionIds: [],
  },
];

const eventTodos: Record<string, DemoEventTodo[]> = {
  "teiki-2026": [
    { id: "t1", title: "会場予約の最終確認", done: false, due: "03/01", assignee: "役員" },
    { id: "t2", title: "演出用照明の発注", done: false, due: "03/08", assignee: "高橋" },
    { id: "t3", title: "プログラム校正", done: true, due: "03/05", assignee: "佐藤" },
  ],
  "touki-2026": [
    { id: "t1", title: "屋外ステージの電源確認", done: false, due: "02/20", assignee: "伊藤" },
    { id: "t2", title: "譜面台の本数確認", done: true, due: "02/18", assignee: "鈴木" },
    { id: "t3", title: "集合連絡の再送", done: false, assignee: "役員" },
  ],
};

const linkedSessionsMap: Record<string, LinkedSession> = {
  "s-2026-03-20-am": {
    id: "s-2026-03-20-am",
    date: "2026-03-20",
    startTime: "09:00",
    endTime: "12:00",
    type: "event",
    eventName: "定期演奏会（午前リハ）",
    location: "文化会館",
    dutyName: "伊藤",
  },
  "s-2026-03-20-pm": {
    id: "s-2026-03-20-pm",
    date: "2026-03-20",
    startTime: "13:00",
    endTime: "16:00",
    type: "event",
    eventName: "定期演奏会（本番）",
    location: "文化会館",
    dutyName: "佐藤",
  },
  "s-2026-02-23-pm": {
    id: "s-2026-02-23-pm",
    date: "2026-02-23",
    startTime: "13:00",
    endTime: "16:00",
    type: "event",
    eventName: "陶器まつり屋外演奏",
    location: "本町オリベストリート",
    dutyName: "-",
  },
  "s-2025-08-10-am": {
    id: "s-2025-08-10-am",
    date: "2025-08-10",
    startTime: "09:00",
    endTime: "12:00",
    type: "normal",
    location: "合宿所ホール",
    dutyName: "鈴木",
  },
  "s-2025-08-11-am": {
    id: "s-2025-08-11-am",
    date: "2025-08-11",
    startTime: "09:00",
    endTime: "12:00",
    type: "self",
    location: "合宿所ホール",
    dutyName: "高橋",
  },
};

const toDateLabel = (dateKey: string): string => dateKey.replace(/-/g, "/");
const typeLabel: Record<SessionType, string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};
const assigneeRoleLabel = (type: SessionType): string => (type === "self" ? "見守り" : "当番");
const clubYearFromDateKey = (dateKey: string): number => {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return month >= 9 ? year : year - 1;
};
const clubYearLabel = (year: number): string => `${year}年度`;

const createInitialDraft = (): EventFormDraft => ({
  title: "",
  kind: "その他",
  eventSortDate: "",
  memo: "",
  state: "active",
});

export function EventsPage() {
  const [events, setEvents] = useState<DemoEvent[]>(demoEvents);
  const [activeTab, setActiveTab] = useState<"active" | "done">("active");
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isLinkedSessionsModalOpen, setIsLinkedSessionsModalOpen] = useState(false);
  const [isSessionBindModalOpen, setIsSessionBindModalOpen] = useState(false);
  const [unlinkTargetSessionId, setUnlinkTargetSessionId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | "__new__" | null>(null);
  const [formDraft, setFormDraft] = useState<EventFormDraft>(createInitialDraft());
  const [formErrors, setFormErrors] = useState<EventFormErrors>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const today = todayDateKey();
  const defaultClubYear = clubYearFromDateKey(today);
  const [selectedDoneYear, setSelectedDoneYear] = useState<number>(defaultClubYear);

  const isManager = canManageEvents();
  const selectedEvent = eventId ? events.find((item) => item.id === eventId) ?? null : null;
  const editingEvent = editingEventId && editingEventId !== "__new__" ? events.find((item) => item.id === editingEventId) ?? null : null;
  const deleteTargetEvent = deleteTargetId ? events.find((item) => item.id === deleteTargetId) ?? null : null;
  const isCreateMode = editingEventId === "__new__";
  const linkedSessions = useMemo(
    () =>
      (selectedEvent?.sessionIds ?? [])
        .map((id) => linkedSessionsMap[id])
        .filter((item): item is LinkedSession => Boolean(item)),
    [selectedEvent],
  );
  const unlinkTargetSession = unlinkTargetSessionId
    ? linkedSessions.find((item) => item.id === unlinkTargetSessionId) ?? null
    : null;
  const bindableEventSessions = useMemo(
    () =>
      Object.values(linkedSessionsMap)
        .filter((session) => session.type === "event")
        .sort((a, b) =>
          `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`),
        ),
    [],
  );

  const activeEvents = useMemo(
    () =>
      events
        .filter((item) => item.state === "active")
        .sort((a, b) => a.eventSortDate.localeCompare(b.eventSortDate)),
    [events],
  );

  const doneEvents = useMemo(
    () =>
      events
        .filter((item) => item.state === "done")
        .sort((a, b) => b.eventSortDate.localeCompare(a.eventSortDate)),
    [events],
  );

  const doneYears = useMemo(
    () =>
      Array.from(new Set(doneEvents.map((item) => clubYearFromDateKey(item.eventSortDate)))).sort((a, b) => b - a),
    [doneEvents],
  );

  const filteredDoneEvents = useMemo(
    () => doneEvents.filter((item) => clubYearFromDateKey(item.eventSortDate) === selectedDoneYear),
    [doneEvents, selectedDoneYear],
  );

  const visibleEvents = activeTab === "active" ? activeEvents : filteredDoneEvents;
  const todos = selectedEvent ? eventTodos[selectedEvent.id] ?? [] : [];

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => {
      setFeedback((current) => (current === message ? null : current));
    }, 1800);
  };

  const closeDetail = () => {
    setIsTodoModalOpen(false);
    setIsLinkedSessionsModalOpen(false);
    setIsSessionBindModalOpen(false);
    navigate("/events");
  };

  const openCreateModal = () => {
    setEditingEventId("__new__");
    setFormDraft(createInitialDraft());
    setFormErrors({});
  };

  const openEditModal = (event: DemoEvent) => {
    setEditingEventId(event.id);
    setFormDraft({
      title: event.title,
      kind: event.kind,
      eventSortDate: event.eventSortDate,
      memo: event.memo ?? "",
      state: event.state,
    });
    setFormErrors({});
  };

  const closeEditModal = () => {
    setEditingEventId(null);
    setFormErrors({});
  };

  const validateForm = (): EventFormErrors => {
    const errors: EventFormErrors = {};
    if (!formDraft.title.trim()) errors.title = "タイトルは必須です";
    if (!formDraft.eventSortDate.trim()) errors.eventSortDate = "代表日は必須です";
    return errors;
  };

  const saveEvent = () => {
    const errors = validateForm();
    setFormErrors(errors);
    if (errors.title || errors.eventSortDate) return;

    if (isCreateMode) {
      const next: DemoEvent = {
        id: `event-${Date.now()}`,
        title: formDraft.title.trim(),
        kind: formDraft.kind,
        state: formDraft.state,
        eventSortDate: formDraft.eventSortDate,
        memo: formDraft.memo.trim(),
        sessionIds: [],
      };
      setEvents((current) => [next, ...current]);
      closeEditModal();
      showFeedback("保存しました");
      return;
    }

    if (!editingEvent) return;
    setEvents((current) =>
      current.map((item) =>
        item.id === editingEvent.id
          ? {
              ...item,
              title: formDraft.title.trim(),
              kind: formDraft.kind,
              state: formDraft.state,
              eventSortDate: formDraft.eventSortDate,
              memo: formDraft.memo.trim(),
            }
          : item,
      ),
    );
    closeEditModal();
    showFeedback("保存しました");
  };

  const toggleEventState = () => {
    if (!selectedEvent) return;
    setEvents((current) =>
      current.map((item) =>
        item.id === selectedEvent.id
          ? { ...item, state: item.state === "active" ? "done" : "active" }
          : item,
      ),
    );
  };

  const confirmDelete = () => {
    if (!deleteTargetEvent) return;
    setEvents((current) => current.filter((item) => item.id !== deleteTargetEvent.id));
    if (selectedEvent?.id === deleteTargetEvent.id) {
      closeDetail();
    }
    setDeleteTargetId(null);
    showFeedback("削除しました");
  };

  const confirmUnlinkSession = () => {
    if (!unlinkTargetSession) return;
    setUnlinkTargetSessionId(null);
    showFeedback("DEMO: 解除は未実装です");
  };

  return (
    <section className="card events-page">
      <header className="events-header">
        <h1>イベント</h1>
        {isManager && (
          <button type="button" className="links-add-button" aria-label="イベント追加" onClick={openCreateModal}>
            ＋
          </button>
        )}
      </header>

      {feedback && <p className="links-feedback">{feedback}</p>}

      <div className="events-tabs" role="tablist" aria-label="イベント種別">
        <button type="button" className={`members-tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>
          進行中
        </button>
        <button type="button" className={`members-tab ${activeTab === "done" ? "active" : ""}`} onClick={() => setActiveTab("done")}>
          完了
        </button>
      </div>

      {activeTab === "done" && (
        <label className="events-year-filter">
          <span>年度</span>
          <select value={selectedDoneYear} onChange={(event) => setSelectedDoneYear(Number(event.target.value))}>
            {doneYears.map((year) => (
              <option key={year} value={year}>
                {clubYearLabel(year)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="events-list">
        {visibleEvents.map((item) => (
          <article key={item.id} className="event-card">
            <button type="button" className="event-card-main-button" onClick={() => navigate(`/events/${item.id}`)}>
              <div className="event-card-top">
                <span className="event-date">{toDateLabel(item.eventSortDate)}</span>
                <span className="event-card-badges">
                  <span className={`event-status ${item.state}`}>{item.state === "done" ? "完了" : "進行中"}</span>
                  <span className="event-kind">{item.kind}</span>
                </span>
              </div>
              <div className="event-card-main">
                <strong>{item.title}</strong>
              </div>
            </button>
            {isManager && (
              <div className="event-card-actions">
                <button
                  type="button"
                  className="link-icon-button"
                  aria-label="編集"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditModal(item);
                  }}
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="link-icon-button"
                  aria-label="削除"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeleteTargetId(item.id);
                  }}
                >
                  🗑️
                </button>
              </div>
            )}
          </article>
        ))}
        {visibleEvents.length === 0 && <p className="muted">該当するイベントはありません。</p>}
      </div>

      {selectedEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeDetail}>
          <section className="modal-panel events-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={closeDetail}>
              ×
            </button>
            <p className="modal-context">{toDateLabel(selectedEvent.eventSortDate)}</p>
            <h3>{selectedEvent.title}</h3>
            <p className="modal-summary">
              種別: {selectedEvent.kind}
              <span className={`event-status ${selectedEvent.state}`}>{selectedEvent.state === "done" ? "完了" : "進行中"}</span>
            </p>
            {selectedEvent.memo && <p className="muted">{selectedEvent.memo}</p>}
            <button type="button" className="events-linked-summary" onClick={() => setIsLinkedSessionsModalOpen(true)}>
              紐づきセッション: {selectedEvent.sessionIds?.length ?? 0}件
            </button>
            <div className="events-detail-actions">
              <button type="button" className="button button-small button-secondary" onClick={() => setIsTodoModalOpen(true)}>
                ✅ TODO
              </button>
              <button
                type="button"
                className={`button button-small ${selectedEvent.state === "done" ? "events-reopen-button" : "events-complete-button"}`}
                onClick={toggleEventState}
              >
                {selectedEvent.state === "done" ? "進行中に戻す" : "完了にする"}
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && isLinkedSessionsModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsLinkedSessionsModalOpen(false)}>
          <section className="modal-panel events-linked-sessions-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsLinkedSessionsModalOpen(false)}>
              ×
            </button>
            <div className="events-linked-header">
              <h3>紐づきセッション</h3>
              {isManager && (
                <button
                  type="button"
                  className="links-add-button"
                  aria-label="紐づけ"
                  onClick={() => setIsSessionBindModalOpen(true)}
                >
                  ＋
                </button>
              )}
            </div>
            <p className="modal-context">{selectedEvent.title}</p>
            <div className="calendar-day-sheet-list">
              {linkedSessions.map((session) => (
                <article key={session.id} className={`session-card ${session.type}`}>
                  <span className={`session-type-badge ${session.type}`}>{session.type === "event" ? "イベント" : typeLabel[session.type]}</span>
                  <div className="calendar-day-sheet-main session-card-body">
                    <p className="calendar-day-sheet-time session-time">
                      {toDateLabel(session.date)} {session.startTime}-{session.endTime}
                    </p>
                    {session.type === "event" && session.eventName && <p className="calendar-day-sheet-meta">{session.eventName}</p>}
                    <p className="calendar-day-sheet-label kv-row">
                      <span className="kv-key">{assigneeRoleLabel(session.type)}：</span>
                      <span className="kv-val shift-role">{session.dutyName ?? "-"}</span>
                    </p>
                    {session.location && (
                      <p className="calendar-day-sheet-meta kv-row">
                        <span className="kv-key">場所：</span>
                        <span className="kv-val">{session.location}</span>
                      </p>
                    )}
                    {isManager && (
                      <div className="events-linked-session-actions">
                        <button
                          type="button"
                          className="events-unlink-button"
                          onClick={() => setUnlinkTargetSessionId(session.id)}
                        >
                          解除
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {linkedSessions.length === 0 && <p className="muted">紐づきセッションはありません。</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsLinkedSessionsModalOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && isSessionBindModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsSessionBindModalOpen(false)}>
          <section className="modal-panel events-bind-sessions-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsSessionBindModalOpen(false)}>
              ×
            </button>
            <h3>イベントセッションを選択</h3>
            <p className="modal-context">{selectedEvent.title}</p>
            <div className="calendar-day-sheet-list">
              {bindableEventSessions.map((session) => (
                <article key={`bind-${session.id}`} className="session-card event">
                  <span className="session-type-badge event">イベント</span>
                  <div className="calendar-day-sheet-main session-card-body">
                    <p className="calendar-day-sheet-time session-time">
                      {toDateLabel(session.date)} {session.startTime}-{session.endTime}
                    </p>
                    {session.eventName && <p className="calendar-day-sheet-meta">{session.eventName}</p>}
                    {session.location && (
                      <p className="calendar-day-sheet-meta kv-row">
                        <span className="kv-key">場所：</span>
                        <span className="kv-val">{session.location}</span>
                      </p>
                    )}
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => showFeedback("DEMO: 紐づけは未実装です")}
                      >
                        紐づける
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {bindableEventSessions.length === 0 && <p className="muted">紐づけ可能なイベントセッションはありません。</p>}
            </div>
            <p className="muted">DEMO: 保存は行いません</p>
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsSessionBindModalOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && isTodoModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsTodoModalOpen(false)}>
          <section className="modal-panel events-todo-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setIsTodoModalOpen(false)}>
              ×
            </button>
            <h3>TODO（イベント）</h3>
            <p className="modal-context">{selectedEvent.title}</p>
            <ul className="events-todo-list">
              {todos.map((todo) => (
                <li key={todo.id} className="events-todo-item">
                  <span className={`events-todo-mark ${todo.done ? "done" : "open"}`}>{todo.done ? "✓" : "・"}</span>
                  <span className="events-todo-title">{todo.title}</span>
                  {(todo.due || todo.assignee) && (
                    <span className="events-todo-meta">
                      {todo.due ? `期限 ${todo.due}` : ""}
                      {todo.due && todo.assignee ? " / " : ""}
                      {todo.assignee ? `担当 ${todo.assignee}` : ""}
                    </span>
                  )}
                </li>
              ))}
              {todos.length === 0 && <li className="muted">DEMO: TODOは未登録です</li>}
            </ul>
            <p className="muted">DEMO: 保存は行いません</p>
            <div className="modal-actions">
              <button type="button" className="button button-small" onClick={() => setIsTodoModalOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {unlinkTargetSession && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setUnlinkTargetSessionId(null)}>
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setUnlinkTargetSessionId(null)}>
              ×
            </button>
            <h3>イベントから解除しますか？</h3>
            <p className="modal-summary">
              {toDateLabel(unlinkTargetSession.date)} {unlinkTargetSession.startTime}-{unlinkTargetSession.endTime}
            </p>
            <p className="muted">DEMOのため保存は未実装です</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setUnlinkTargetSessionId(null)}>
                キャンセル
              </button>
              <button type="button" className="button events-danger-button" onClick={confirmUnlinkSession}>
                解除
              </button>
            </div>
          </section>
        </div>
      )}

      {editingEventId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeEditModal}>
          <section className="modal-panel events-editor-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={closeEditModal}>
              ×
            </button>
            <h3>{isCreateMode ? "イベント追加" : "イベント編集"}</h3>
            <label>
              タイトル
              <input value={formDraft.title} onChange={(event) => setFormDraft((current) => ({ ...current, title: event.target.value }))} />
              {formErrors.title && <span className="field-error">{formErrors.title}</span>}
            </label>
            <label>
              種別
              <select value={formDraft.kind} onChange={(event) => setFormDraft((current) => ({ ...current, kind: event.target.value as EventKind }))}>
                <option value="コンクール">コンクール</option>
                <option value="演奏会">演奏会</option>
                <option value="合同練習">合同練習</option>
                <option value="その他">その他</option>
              </select>
            </label>
            <label>
              代表日
              <input
                type="date"
                value={formDraft.eventSortDate}
                onChange={(event) => setFormDraft((current) => ({ ...current, eventSortDate: event.target.value }))}
              />
              {formErrors.eventSortDate && <span className="field-error">{formErrors.eventSortDate}</span>}
            </label>
            <label>
              メモ
              <textarea value={formDraft.memo} onChange={(event) => setFormDraft((current) => ({ ...current, memo: event.target.value }))} />
            </label>
            <label>
              状態
              <select value={formDraft.state} onChange={(event) => setFormDraft((current) => ({ ...current, state: event.target.value as EventState }))}>
                <option value="active">進行中</option>
                <option value="done">完了</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeEditModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={saveEvent}>
                保存
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTargetEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDeleteTargetId(null)}>
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" onClick={() => setDeleteTargetId(null)}>
              ×
            </button>
            <h3>イベントを削除しますか？</h3>
            <p className="modal-summary">{deleteTargetEvent.title}</p>
            <p className="muted">削除したイベントは元に戻せません。</p>
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
