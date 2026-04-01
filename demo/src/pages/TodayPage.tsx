import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { DayLog, DemoData, DemoRsvp, DutyRequirement, RsvpStatus, SessionDoc, Todo } from "../types";
import {
  formatDateYmd,
  formatWeekdayJa,
  formatTimeNoLeadingZero,
  isValidDateKey,
  shiftDateKey,
  todayDateKey,
  weekdayTone,
} from "../utils/date";
import { makeSessionRelatedId, sortTodosOpenFirst } from "../utils/todoUtils";

type TodayPageProps = {
  data: DemoData;
  updateDayLog: (date: string, updater: (prev: DayLog) => DayLog) => void;
  currentUid: string;
  updateTodos: (updater: (prev: Todo[]) => Todo[]) => void;
};

const typeLabel: Record<SessionDoc["type"], string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};

const dutyLabel: Record<DutyRequirement, string> = {
  duty: "当番",
  watch: "見守り",
};

const toFamilyName = (name?: string): string => {
  const value = (name ?? "").trim();
  if (!value || value === "-") return "-";
  if (value.includes(" ")) return value.split(" ")[0] || "-";
  if (value.includes("　")) return value.split("　")[0] || "-";
  return value;
};

const statusSymbol: Record<RsvpStatus, string> = {
  yes: "◯",
  maybe: "△",
  no: "×",
  unknown: "-",
};

const countRsvps = (session: SessionDoc) => {
  const list = session.demoRsvps ?? [];
  return {
    yes: list.filter((item) => item.status === "yes").length,
    maybe: list.filter((item) => item.status === "maybe").length,
    no: list.filter((item) => item.status === "no").length,
  };
};

const sortRsvps = (items: DemoRsvp[], data: DemoData): DemoRsvp[] =>
  [...items].sort((a, b) => {
    const ma = data.members[a.uid];
    const mb = data.members[b.uid];
    if (ma && mb) {
      if (ma.grade !== mb.grade) return mb.grade - ma.grade;
      if (ma.instrumentOrder !== mb.instrumentOrder) return ma.instrumentOrder - mb.instrumentOrder;
      return ma.kana.localeCompare(mb.kana, "ja");
    }
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    return a.displayName.localeCompare(b.displayName, "ja");
  });

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;
const demoViewTitle: Record<string, string> = {
  calendar: "カレンダー",
  event: "イベント",
  homework: "宿題",
  "practice-log": "練習日誌",
  "duty-log": "当番日誌",
  watch: "見守り",
  todo: "TODO",
  "purchase-request": "購入依頼",
  reimbursement: "立替",
  accounting: "会計",
  instruments: "楽器",
  scores: "楽譜",
  docs: "資料",
  members: "メンバー",
  links: "リンク集",
  settings: "設定",
};

const toMonthKey = (dateKey: string): string => dateKey.slice(0, 7);

const monthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}/${String(month).padStart(2, "0")}`;
};

const shiftMonthKey = (monthKey: string, months: number): string => {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const buildMonthCells = (monthKey: string): Array<string | null> => {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export function TodayPage({ data, updateDayLog, currentUid, updateTodos }: TodayPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const today = todayDateKey();
  const view = searchParams.get("view") ?? "";
  const queryDate = searchParams.get("date") ?? "";
  const date = queryDate && isValidDateKey(queryDate) ? queryDate : today;
  const [selectedSession, setSelectedSession] = useState<SessionDoc | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(toMonthKey(date));
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [noticeCanToggle, setNoticeCanToggle] = useState(false);
  const [isFutureLogConfirmOpen, setIsFutureLogConfirmOpen] = useState(false);
  const calendarWrapRef = useRef<HTMLDivElement>(null);
  const noticeContentRef = useRef<HTMLDivElement>(null);
  const day = data.scheduleDays[date];
  const dayDefaultLocation = day?.defaultLocation;
  const noticeText = day?.notice?.trim() ?? "";

  useEffect(() => {
    if (!queryDate) return;
    if (!isValidDateKey(queryDate)) {
      setSearchParams({}, { replace: true });
    }
  }, [queryDate, setSearchParams]);

  useEffect(() => {
    setCalendarMonth(toMonthKey(date));
  }, [date]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!calendarWrapRef.current) return;
      if (calendarWrapRef.current.contains(event.target as Node)) return;
      setIsCalendarOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setNoticeExpanded(false);
    if (!noticeText) {
      setNoticeCanToggle(false);
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      const element = noticeContentRef.current;
      if (!element) return;
      setNoticeCanToggle(element.scrollHeight > element.clientHeight + 1);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [noticeText, date]);

  const sessions = useMemo(
    () => [...(day?.sessions ?? [])].sort((a, b) => a.order - b.order),
    [day],
  );

  const hasLog = Boolean(data.dayLogs[date]);
  const hasSessions = sessions.length > 0;
  const logStatus = hasLog ? "☑ 記録あり" : hasSessions ? "⚠ 記録なし" : "⚠ 未作成";
  const logStatusClass = hasLog ? "has-log" : "no-log";
  const selectedCounts = selectedSession ? countRsvps(selectedSession) : null;
  const sortedSelectedRsvps = useMemo(
    () => (selectedSession ? sortRsvps(selectedSession.demoRsvps ?? [], data) : []),
    [selectedSession, data],
  );
  const selectedSessionTodos = useMemo(() => {
    if (!selectedSession) return [] as Todo[];
    const relatedId = makeSessionRelatedId(date, selectedSession.order);
    return sortTodosOpenFirst(
      data.todos.filter(
        (todo) => todo.related?.type === "session" && todo.related.id === relatedId,
      ),
    );
  }, [data.todos, date, selectedSession]);
  const calendarCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);
  const calendarPath = `/calendar?ym=${toMonthKey(date)}&date=${date}`;

  const moveDate = (days: number) => {
    const next = shiftDateKey(date, days);
    if (next === today) {
      setSearchParams({});
      return;
    }
    setSearchParams({ date: next });
  };

  const selectDate = (nextDate: string) => {
    if (!isValidDateKey(nextDate)) return;
    setIsCalendarOpen(false);
    if (nextDate === today) {
      setSearchParams({});
      return;
    }
    setSearchParams({ date: nextDate });
  };

  const createDayLog = () => {
    if (date > today) {
      setIsFutureLogConfirmOpen(true);
      return;
    }
    updateDayLog(date, (prev) => ({ ...prev }));
  };

  const confirmCreateFutureDayLog = () => {
    updateDayLog(date, (prev) => ({ ...prev }));
    setIsFutureLogConfirmOpen(false);
  };

  const toggleNoticeExpanded = () => {
    setNoticeExpanded((prev) => !prev);
  };

  const toggleMiniCalendar = () => {
    setCalendarMonth(toMonthKey(date));
    setIsCalendarOpen((prev) => !prev);
  };

  const assigneeLabel = (uid: string | null): string => {
    if (!uid) return "未アサイン";
    return data.users[uid]?.displayName ?? uid;
  };

  const takeoverLabel = (todo: Todo): string | null => {
    if (todo.completed) return null;
    if (todo.assigneeUid === null) return "引き取る";
    if (todo.assigneeUid !== currentUid) return "引き継ぐ";
    return null;
  };

  if (view) {
    const title = demoViewTitle[view] ?? "未実装モジュール";
    return (
      <section className="card">
        <h1>{title}</h1>
        <p>この画面はDEMOの仮遷移です。実装はこれから行います。</p>
        <Link to="/today" className="button">
          Todayへ戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="today-header today-date-view">
        <div className="today-date-nav">
          <button type="button" className="date-nav-button" onClick={() => moveDate(-1)}>
            ← 前日
          </button>
          <div
            className="today-date-center"
            ref={calendarWrapRef}
          >
            <button
              type="button"
              className="today-date-picker-trigger"
              onClick={toggleMiniCalendar}
              aria-label="日付選択を開く"
            >
              <span className="date-main date-full">{formatDateYmd(date)}</span>
              <span className="date-main date-short">{formatDateYmd(date).slice(5)}</span>
              <span className={`date-weekday ${weekdayTone(date)}`}>（{formatWeekdayJa(date)}）</span>
            </button>
            <button
              type="button"
              className="today-calendar-link-trigger"
              onClick={() => navigate(calendarPath)}
              aria-label="カレンダーを開く"
            >
              🗓️
            </button>
            {isCalendarOpen && (
              <div className="today-calendar-popover" onClick={(event) => event.stopPropagation()}>
                <div className="mini-calendar-header">
                  <button
                    type="button"
                    className="mini-calendar-nav"
                    onClick={() => setCalendarMonth((prev) => shiftMonthKey(prev, -1))}
                  >
                    ←
                  </button>
                  <span className="mini-calendar-month">{monthLabel(calendarMonth)}</span>
                  <button
                    type="button"
                    className="mini-calendar-nav"
                    onClick={() => setCalendarMonth((prev) => shiftMonthKey(prev, 1))}
                  >
                    →
                  </button>
                </div>
                <div className="mini-calendar-grid mini-calendar-weekdays">
                  {weekdayLabels.map((label) => (
                    <span key={label} className="mini-calendar-weekday">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="mini-calendar-grid">
                  {calendarCells.map((cell, index) =>
                    cell ? (
                      <button
                        key={cell}
                        type="button"
                        className={`mini-calendar-day ${cell === date ? "selected" : ""} ${
                          cell === today ? "today" : ""
                        }`}
                        onClick={() => selectDate(cell)}
                      >
                        {Number(cell.slice(-2))}
                      </button>
                    ) : (
                      <span key={`empty-${index}`} className="mini-calendar-empty" />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
          <button type="button" className="date-nav-button" onClick={() => moveDate(1)}>
            翌日 →
          </button>
        </div>
        <div className="today-actions">
          {hasLog ? (
            <Link to={`/logs/${date}`} className="button button-small">
              日誌へ
            </Link>
          ) : (
            <button type="button" className="button button-small" onClick={createDayLog}>
              日誌を作成
            </button>
          )}
          <span className={`log-status ${logStatusClass}`}>{logStatus}</span>
        </div>
      </div>

      {noticeText && (
        <div className="notice-block notice-collapsible">
          <div
            ref={noticeContentRef}
            className={`notice-content ${noticeExpanded ? "expanded" : "collapsed"}`}
            onClick={noticeCanToggle ? toggleNoticeExpanded : undefined}
          >
            {noticeText}
          </div>
          {noticeCanToggle && (
            <button type="button" className="notice-toggle" onClick={toggleNoticeExpanded}>
              {noticeExpanded ? "▲ たたむ" : "▼ ひらく"}
            </button>
          )}
        </div>
      )}

      {!day || sessions.length === 0 ? (
        <p>この日の予定は未登録です。</p>
      ) : (
        <div className="session-list">
          {sessions.map((session, index) => {
            const counts = countRsvps(session);
            const label = typeLabel[session.type];
            return (
              <article key={`${session.order}-${index}`} className={`session-card ${session.type}`}>
                <span className={`session-type-badge ${session.type}`}>{label}</span>
                <div className="session-time">
                  {formatTimeNoLeadingZero(session.startTime)} -{" "}
                  {formatTimeNoLeadingZero(session.endTime)}
                </div>
                <div className="kv-row">
                  <span className="kv-key">{dutyLabel[session.dutyRequirement]}：</span>
                  <span className="kv-val shift-role">
                    {toFamilyName(session.assigneeNameSnapshot)}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">出欠：</span>
                  <span className="kv-val">
                    <button
                      type="button"
                      className="attendance-trigger"
                      onClick={() => setSelectedSession(session)}
                    >
                      <span className="count-yes">◯{counts.yes}</span>
                      <span className="count-maybe">△{counts.maybe}</span>
                      <span className="count-no">×{counts.no}</span>
                    </button>
                  </span>
                </div>
                {session.location && session.location !== dayDefaultLocation && (
                  <div className="kv-row">
                    <span className="kv-key">場所：</span>
                    <span className="kv-val">{session.location}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedSession && (
        <div className="modal-backdrop" onClick={() => setSelectedSession(null)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedSession(null)}
              aria-label="閉じる" title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）{" "}
              {formatTimeNoLeadingZero(selectedSession.startTime)}–
              {formatTimeNoLeadingZero(selectedSession.endTime)}
            </p>
            {selectedCounts && (
              <p className="modal-summary">
                出欠：<span className="count-yes">◯{selectedCounts.yes}</span>{" "}
                <span className="count-maybe">△{selectedCounts.maybe}</span>{" "}
                <span className="count-no">×{selectedCounts.no}</span>
              </p>
            )}
            <div className="rsvp-table">
              {sortedSelectedRsvps.map((rsvp) => (
                <div key={rsvp.uid} className="rsvp-row">
                  <span>{rsvp.displayName}</span>
                  <span className={`rsvp-mark ${rsvp.status}`}>{statusSymbol[rsvp.status]}</span>
                </div>
              ))}
            </div>
            <section className="related-todos-block">
              <h4>関連TODO</h4>
              <div className="related-todos-list">
                {selectedSessionTodos.map((todo) => {
                  const takeover = takeoverLabel(todo);
                  return (
                    <article key={todo.id} className={`todo-row compact ${todo.completed ? "completed" : ""}`}>
                      <label className="todo-check">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() =>
                            updateTodos((prev) =>
                              prev.map((item) =>
                                item.id === todo.id ? { ...item, completed: !item.completed } : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="todo-main">
                        <p className="todo-title">{todo.title}</p>
                        <p className="todo-meta">
                          <span>担当: {assigneeLabel(todo.assigneeUid)}</span>
                          <span>期限: {todo.dueDate ?? "—"}</span>
                        </p>
                      </div>
                      <div className="todo-actions">
                        {takeover && (
                          <button
                            type="button"
                            className="button button-small"
                            onClick={() =>
                              updateTodos((prev) =>
                                prev.map((item) =>
                                  item.id === todo.id ? { ...item, assigneeUid: currentUid } : item,
                                ),
                              )
                            }
                          >
                            {takeover}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {selectedSessionTodos.length === 0 && <p className="muted">関連TODOはありません。</p>}
              </div>
            </section>
          </div>
        </div>
      )}
      {isFutureLogConfirmOpen && (
        <div className="modal-backdrop" onClick={() => setIsFutureLogConfirmOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setIsFutureLogConfirmOpen(false)}
              aria-label="閉じる" title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">選択した日付は未来日です。日誌を作成してもよろしいですか？</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsFutureLogConfirmOpen(false)}>
                キャンセル
              </button>
              <button type="button" className="button button-small" onClick={confirmCreateFutureDayLog}>
                作成する
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
