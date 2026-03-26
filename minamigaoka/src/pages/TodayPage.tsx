import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BirthdayCelebrationModal } from "../components/BirthdayCelebrationModal";
import { getBirthdayCelebrants } from "../members/birthday";
import { isChildMember, sortMembersForDisplay } from "../members/permissions";
import { subscribeMembers } from "../members/service";
import type { MemberRecord } from "../members/types";
import type { DemoData, DutyRequirement, RsvpStatus, SessionDoc, Todo } from "../types";
import {
  formatDateYmd,
  formatTimeNoLeadingZero,
  formatWeekdayJa,
  isValidDateKey,
  shiftDateKey,
  todayDateKey,
  weekdayTone,
} from "../utils/date";
import { makeSessionRelatedId, sortTodosOpenFirst } from "../utils/todoUtils";

type TodayPageProps = {
  data: DemoData;
  ensureDayLog: (date: string) => Promise<void>;
  currentUid: string;
  updateTodos: (updater: (prev: Todo[]) => Todo[]) => void;
};

type AttendanceRow = {
  uid: string;
  displayName: string;
  status: RsvpStatus;
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

const statusSymbol: Record<RsvpStatus, string> = {
  yes: "○",
  maybe: "△",
  no: "×",
  unknown: "ー",
};

const toFamilyName = (name?: string): string => {
  const value = (name ?? "").trim();
  if (!value || value === "-") return "-";
  if (value.includes(" ")) return value.split(" ")[0] || "-";
  if (value.includes("　")) return value.split("　")[0] || "-";
  return value;
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

const countAttendanceRows = (rows: AttendanceRow[]) => ({
  yes: rows.filter((item) => item.status === "yes").length,
  maybe: rows.filter((item) => item.status === "maybe").length,
  no: rows.filter((item) => item.status === "no").length,
  unknown: rows.filter((item) => item.status === "unknown").length,
});

const getSessionDisplayTitle = (session: SessionDoc): string =>
  session.type === "event" && session.eventName?.trim() ? session.eventName.trim() : typeLabel[session.type];

export function TodayPage({ data, ensureDayLog, currentUid, updateTodos }: TodayPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedSession, setSelectedSession] = useState<SessionDoc | null>(null);
  const [birthdayModalDate, setBirthdayModalDate] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(todayDateKey().slice(0, 7));
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [noticeCanToggle, setNoticeCanToggle] = useState(false);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [pageError, setPageError] = useState("");
  const calendarWrapRef = useRef<HTMLDivElement>(null);
  const noticeContentRef = useRef<HTMLDivElement>(null);
  const today = todayDateKey();
  const view = searchParams.get("view") ?? "";
  const queryDate = searchParams.get("date") ?? "";
  const date = queryDate && isValidDateKey(queryDate) ? queryDate : today;
  const day = data.scheduleDays[date];
  const dayDefaultLocation = day?.defaultLocation;
  const noticeText = day?.notice?.trim() ?? "";

  useEffect(() => {
    try {
      return subscribeMembers(setMembers);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "メンバーの読み込みに失敗しました。");
      return undefined;
    }
  }, []);

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

  const visibleChildMembers = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter((member) => member.memberStatus === "active" && isChildMember(member)),
        "child",
      ),
    [members],
  );

  const attendanceRowsByOrder = useMemo(() => {
    return sessions.reduce<Record<number, AttendanceRow[]>>((result, session) => {
      const rows = visibleChildMembers.map((member) => {
        const matched =
          session.demoRsvps?.find(
            (item) =>
              item.uid === member.authUid ||
              item.uid === member.id ||
              item.uid === member.loginId,
          ) ?? null;

        return {
          uid: member.id,
          displayName: member.name,
          status: matched?.status ?? "unknown",
        };
      });
      result[session.order] = rows;
      return result;
    }, {});
  }, [sessions, visibleChildMembers]);

  const selectedRows = selectedSession ? attendanceRowsByOrder[selectedSession.order] ?? [] : [];
  const selectedCounts = useMemo(() => countAttendanceRows(selectedRows), [selectedRows]);
  const selectedSessionTodos = useMemo(() => {
    if (!selectedSession) return [] as Todo[];
    const relatedId = makeSessionRelatedId(date, selectedSession.order);
    return sortTodosOpenFirst(
      data.todos.filter((todo) => todo.related?.type === "session" && todo.related.id === relatedId),
    );
  }, [data.todos, date, selectedSession]);
  const birthdayCelebrants = useMemo(() => getBirthdayCelebrants(members, date), [date, members]);

  const hasSessions = sessions.length > 0;
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

  const openDayLog = async () => {
    if (!hasSessions) return;
    await ensureDayLog(date);
    navigate(`/logs/${date}`);
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
        <p>この画面は準備中です。必要な導線だけ先に置いています。</p>
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
          <div className="today-date-center" ref={calendarWrapRef}>
            <button
              type="button"
              className="today-date-picker-trigger"
              onClick={() => setIsCalendarOpen((prev) => !prev)}
              aria-label="日付を選ぶ"
            >
              <span className="date-main date-full">{formatDateYmd(date)}</span>
              <span className="date-main date-short">{formatDateYmd(date).slice(5)}</span>
              <span className={`date-weekday ${weekdayTone(date)}`}>（{formatWeekdayJa(date)}）</span>
            </button>
            {birthdayCelebrants.length > 0 && (
              <button
                type="button"
                className="today-birthday-trigger"
                onClick={() => setBirthdayModalDate(date)}
                aria-label="誕生日のお祝いを見る"
                title="誕生日のお祝いを見る"
              >
                🎂
              </button>
            )}
            <Link
              to={calendarPath}
              className="today-calendar-link-trigger"
              aria-label="カレンダーを開く"
              title="カレンダーを開く"
            >
              🗓️
            </Link>
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
                        className={`mini-calendar-day ${cell === date ? "selected" : ""} ${cell === today ? "today" : ""}`}
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
          {hasSessions && (
            <button type="button" className="button button-small" onClick={() => void openDayLog()}>
              日誌へ
            </button>
          )}
        </div>
      </div>

      {pageError && <p className="field-error">{pageError}</p>}

      {noticeText && (
        <div className="notice-block notice-collapsible">
          <div
            ref={noticeContentRef}
            className={`notice-content ${noticeExpanded ? "expanded" : "collapsed"}`}
            onClick={noticeCanToggle ? () => setNoticeExpanded((prev) => !prev) : undefined}
          >
            {noticeText}
          </div>
          {noticeCanToggle && (
            <button type="button" className="notice-toggle" onClick={() => setNoticeExpanded((prev) => !prev)}>
              {noticeExpanded ? "▲ たたむ" : "▼ ひらく"}
            </button>
          )}
        </div>
      )}

      {!day || sessions.length === 0 ? (
        <p>この日の予定はまだありません。</p>
      ) : (
        <div className="session-list">
          {sessions.map((session, index) => {
            const counts = countAttendanceRows(attendanceRowsByOrder[session.order] ?? []);
            return (
              <article key={`${session.order}-${index}`} className={`session-card ${session.type}`}>
                <span className={`session-type-badge ${session.type}`}>{typeLabel[session.type]}</span>
                <div className="session-time">
                  {formatTimeNoLeadingZero(session.startTime)} - {formatTimeNoLeadingZero(session.endTime)}
                </div>
                {session.type === "event" && session.eventName?.trim() && (
                  <div className="session-subtitle">{session.eventName}</div>
                )}
                <div className="kv-row">
                  <span className="kv-key">{dutyLabel[session.dutyRequirement]}:</span>
                  <span className="kv-val shift-role">{toFamilyName(session.assigneeNameSnapshot)}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">出欠:</span>
                  <span className="kv-val">
                    <button type="button" className="attendance-trigger" onClick={() => setSelectedSession(session)}>
                      <span className="count-yes">○{counts.yes}</span>
                      <span className="count-maybe">△{counts.maybe}</span>
                      <span className="count-no">×{counts.no}</span>
                      <span className="count-unknown">ー{counts.unknown}</span>
                    </button>
                  </span>
                </div>
                {session.location && session.location !== dayDefaultLocation && (
                  <div className="kv-row">
                    <span className="kv-key">場所:</span>
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
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}） /{" "}
              {formatTimeNoLeadingZero(selectedSession.startTime)}-{formatTimeNoLeadingZero(selectedSession.endTime)}
            </p>
            <h3>{getSessionDisplayTitle(selectedSession)}</h3>
            {selectedSession.location && <p className="modal-summary muted">場所: {selectedSession.location}</p>}
            <p className="modal-summary">
              出欠: <span className="count-yes">○{selectedCounts.yes}</span>{" "}
              <span className="count-maybe">△{selectedCounts.maybe}</span>{" "}
              <span className="count-no">×{selectedCounts.no}</span>{" "}
              <span className="count-unknown">ー{selectedCounts.unknown}</span>
            </p>
            <div className="rsvp-table">
              {selectedRows.map((row) => (
                <div key={row.uid} className="rsvp-row">
                  <span>{row.displayName}</span>
                  <span className={`rsvp-mark ${row.status}`}>{statusSymbol[row.status]}</span>
                </div>
              ))}
              {selectedRows.length === 0 && (
                <div className="rsvp-row">
                  <span>対象の部員はまだいません。</span>
                  <span className="rsvp-mark unknown">ー</span>
                </div>
              )}
            </div>
            {selectedSessionTodos.length > 0 && (
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
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {birthdayModalDate && birthdayCelebrants.length > 0 && (
        <BirthdayCelebrationModal
          date={birthdayModalDate}
          celebrants={birthdayCelebrants}
          onClose={() => setBirthdayModalDate(null)}
        />
      )}

    </section>
  );
}
