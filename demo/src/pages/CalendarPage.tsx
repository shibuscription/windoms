import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DemoData, DemoRsvp, RsvpStatus, SessionDoc } from "../types";
import { formatDateYmd, formatTimeNoLeadingZero, formatWeekdayJa, isValidDateKey, todayDateKey } from "../utils/date";

type CalendarPageProps = {
  data: DemoData;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

const typeLabel: Record<SessionDoc["type"], string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
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

const isValidMonthKey = (value: string): boolean => {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
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

type DaySelection = {
  date: string;
  sessions: SessionDoc[];
};

type CalendarDialog = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void;
};

const assigneeRoleLabel = (session: SessionDoc): string => (session.type === "self" ? "見守り" : "当番");
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

const sortRsvps = (items: DemoRsvp[]): DemoRsvp[] => [...items].sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));

export function CalendarPage({ data }: CalendarPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useState<DaySelection | null>(null);
  const [dialog, setDialog] = useState<CalendarDialog | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<SessionDoc | null>(null);
  const navigate = useNavigate();
  const today = todayDateKey();
  const queryDate = searchParams.get("date") ?? "";
  const queryYm = searchParams.get("ym") ?? "";

  const validDate = queryDate && isValidDateKey(queryDate) ? queryDate : "";
  const derivedYm = validDate ? toMonthKey(validDate) : "";
  const monthKey = derivedYm || (isValidMonthKey(queryYm) ? queryYm : toMonthKey(today));
  const selectedDate = validDate && toMonthKey(validDate) === monthKey ? validDate : "";
  const calendarCells = useMemo(() => buildMonthCells(monthKey), [monthKey]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("ym", monthKey);
    if (selectedDate) next.set("date", selectedDate);
    const current = searchParams.toString();
    const normalized = next.toString();
    if (current !== normalized) {
      setSearchParams(next, { replace: true });
    }
  }, [monthKey, searchParams, selectedDate, setSearchParams]);

  useEffect(() => {
    if (!selectedDay) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selectedDay]);

  const syncSearchParams = (nextYm: string, nextDate?: string) => {
    const next = new URLSearchParams();
    next.set("ym", nextYm);
    if (nextDate) next.set("date", nextDate);
    setSearchParams(next, { replace: false });
  };

  const goPrevMonth = () => {
    syncSearchParams(shiftMonthKey(monthKey, -1));
  };

  const goNextMonth = () => {
    syncSearchParams(shiftMonthKey(monthKey, 1));
  };

  const goToday = () => {
    syncSearchParams(toMonthKey(today), today);
  };

  const openDay = (date: string, sessions: SessionDoc[]) => {
    syncSearchParams(monthKey, date);
    setSelectedDay({ date, sessions });
  };

  const goToTodayFromSheet = () => {
    if (!selectedDay) return;
    if (selectedDay.date === today) {
      navigate("/today");
      return;
    }
    navigate(`/today?date=${selectedDay.date}`);
  };

  const closeSheet = () => {
    setSelectedDay(null);
  };

  const openInfoDialog = (title: string, message: string) => {
    setDialog({ title, message });
  };

  const openDeleteConfirm = (session: SessionDoc) => {
    setDialog({
      title: "削除確認",
      message: `${formatTimeNoLeadingZero(session.startTime)}-${formatTimeNoLeadingZero(
        session.endTime,
      )} を削除しますか？`,
      confirmLabel: "削除する",
      onConfirm: () => {
        // DEMO: 実データ更新は行わない
      },
    });
  };

  const closeDialog = () => {
    setDialog(null);
  };

  const closeAttendanceModal = () => {
    setAttendanceSession(null);
  };

  const selectedAttendanceCounts = attendanceSession ? countRsvps(attendanceSession) : null;
  const selectedAttendanceRsvps = useMemo(
    () => (attendanceSession ? sortRsvps(attendanceSession.demoRsvps ?? []) : []),
    [attendanceSession],
  );

  return (
    <section className="card">
      <div className="month-calendar-header">
        <div className="month-calendar-header-left">
          <button type="button" className="button button-small" onClick={() => navigate("/today")}>
            Todayへ
          </button>
        </div>
        <div className="month-calendar-header-center">
          <h1>カレンダー</h1>
        </div>
        <div className="month-calendar-header-right month-calendar-nav">
          <button type="button" className="button button-small button-secondary" onClick={goPrevMonth}>
            ← 前月
          </button>
          <strong>{monthLabel(monthKey)}</strong>
          <button type="button" className="button button-small button-secondary" onClick={goNextMonth}>
            翌月 →
          </button>
          <button type="button" className="button button-small button-secondary" onClick={goToday}>
            今日
          </button>
        </div>
      </div>
      <div className="calendar-mobile-bleed">
        <div className="month-calendar-weekdays">
          {weekdayLabels.map((label) => (
            <span key={`calendar-weekday-${label}`}>{label}</span>
          ))}
        </div>
        <div className="month-calendar-grid">
          {calendarCells.map((cell, index) => {
            if (!cell) return <div key={`calendar-empty-${index}`} className="month-calendar-day empty" />;
            const daySessions = [...(data.scheduleDays[cell]?.sessions ?? [])].sort((a, b) => a.order - b.order);
            const isToday = cell === today;
            const isSelected = Boolean(selectedDate && selectedDate === cell);
            return (
              <article
                key={cell}
                className={`month-calendar-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => openDay(cell, daySessions)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDay(cell, daySessions);
                  }
                }}
                aria-label={`${formatDateYmd(cell)} の詳細を開く`}
              >
                <span className="month-calendar-day-link">{Number(cell.slice(-2))}</span>
                <div className="month-calendar-events">
                  {daySessions.map((session) => (
                    <div key={`${cell}-${session.order}`} className={`calendar-event ${session.type}`}>
                      <span className="calendar-event-main">
                        <span className="calendar-event-time">{formatTimeNoLeadingZero(session.startTime)}</span>
                        <span className={`calendar-event-label ${session.type === "event" ? "event-name" : "session-type"}`}>
                          {session.type === "event" ? session.eventName?.trim() || "イベント" : typeLabel[session.type]}
                        </span>
                      </span>
                      <span className="calendar-event-duty">
                        <span className="calendar-event-duty-label">{assigneeRoleLabel(session)}:</span>{" "}
                        <span className="calendar-event-duty-name">{toFamilyName(session.assigneeNameSnapshot)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {selectedDay && (
        <div className="calendar-sheet-backdrop" onClick={closeSheet}>
          <section className="calendar-day-sheet" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="calendar-session-sheet-close" onClick={closeSheet} aria-label="閉じる">
              ×
            </button>
            <header className="calendar-day-sheet-header">
              <p className="modal-context">
                {formatDateYmd(selectedDay.date)}（{formatWeekdayJa(selectedDay.date)}）
              </p>
              <div className="calendar-day-sheet-actions">
                <button type="button" className="button button-small" onClick={goToTodayFromSheet}>
                  Todayへ
                </button>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => navigate(`/logs/${selectedDay.date}`)}
                >
                  日誌へ
                </button>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => openInfoDialog("セッション追加", "セッション追加は準備中です。")}
                >
                  ＋
                </button>
              </div>
            </header>
            <div className="calendar-day-sheet-list">
              {selectedDay.sessions.length === 0 && <p className="muted">セッションはありません。</p>}
              {selectedDay.sessions.map((session) => {
                const counts = countRsvps(session);
                return (
                  <article key={`sheet-${selectedDay.date}-${session.order}`} className={`session-card ${session.type}`}>
                    <span className={`session-type-badge ${session.type}`}>
                      {session.type === "event" ? "イベント" : typeLabel[session.type]}
                    </span>
                    <div className="session-card-actions-top">
                      <button
                        type="button"
                        className="calendar-day-sheet-icon"
                        aria-label="編集"
                        onClick={() => openInfoDialog("セッション編集", "編集機能は準備中です。")}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="calendar-day-sheet-icon"
                        aria-label="削除"
                        onClick={() => openDeleteConfirm(session)}
                      >
                        🗑
                      </button>
                    </div>
                    <div className="calendar-day-sheet-main session-card-body">
                      <p className="calendar-day-sheet-time session-time">
                        {formatTimeNoLeadingZero(session.startTime)}-{formatTimeNoLeadingZero(session.endTime)}
                      </p>
                      {session.type === "event" && session.eventName?.trim() && (
                        <p className="calendar-day-sheet-meta">{session.eventName}</p>
                      )}
                      <p className="calendar-day-sheet-label kv-row">
                        <span className="kv-key">{assigneeRoleLabel(session)}：</span>
                        <span className="kv-val shift-role">{toFamilyName(session.assigneeNameSnapshot)}</span>
                      </p>
                      {session.location && (
                        <p className="calendar-day-sheet-meta kv-row">
                          <span className="kv-key">場所：</span>
                          <span className="kv-val">{session.location}</span>
                        </p>
                      )}
                      <p className="calendar-day-sheet-meta kv-row">
                        <span className="kv-key">出欠：</span>
                        <span className="kv-val">
                          <button type="button" className="attendance-trigger" onClick={() => setAttendanceSession(session)}>
                            <span className="count-yes">◯{counts.yes}</span>
                            <span className="count-maybe">△{counts.maybe}</span>
                            <span className="count-no">×{counts.no}</span>
                          </button>
                        </span>
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          {dialog && (
            <div className="calendar-mini-dialog-backdrop" onClick={closeDialog}>
              <div className="calendar-mini-dialog" onClick={(event) => event.stopPropagation()}>
                <p className="calendar-mini-dialog-title">{dialog.title}</p>
                <p className="calendar-mini-dialog-message">{dialog.message}</p>
                <div className="calendar-mini-dialog-actions">
                  {dialog.confirmLabel ? (
                    <>
                      <button type="button" className="button button-small button-secondary" onClick={closeDialog}>
                        キャンセル
                      </button>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => {
                          dialog.onConfirm?.();
                          closeDialog();
                        }}
                      >
                        {dialog.confirmLabel}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="button button-small" onClick={closeDialog}>
                      閉じる
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {attendanceSession && (
        <div className="modal-backdrop calendar-attendance-backdrop" onClick={closeAttendanceModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeAttendanceModal} aria-label="閉じる">
              ×
            </button>
            <p className="modal-context">
              {selectedDay ? `${formatDateYmd(selectedDay.date)}（${formatWeekdayJa(selectedDay.date)}） ` : ""}
              {formatTimeNoLeadingZero(attendanceSession.startTime)}–{formatTimeNoLeadingZero(attendanceSession.endTime)}{" "}
              / {attendanceSession.type === "event" ? attendanceSession.eventName?.trim() || "イベント" : typeLabel[attendanceSession.type]}
            </p>
            {selectedAttendanceCounts && (
              <p className="modal-summary">
                出欠：<span className="count-yes">◯{selectedAttendanceCounts.yes}</span>{" "}
                <span className="count-maybe">△{selectedAttendanceCounts.maybe}</span>{" "}
                <span className="count-no">×{selectedAttendanceCounts.no}</span>
              </p>
            )}
            <div className="rsvp-table">
              {selectedAttendanceRsvps.length === 0 ? (
                <div className="rsvp-row">
                  <span>サンプル表示（未回答）</span>
                  <span className="rsvp-mark unknown">-</span>
                </div>
              ) : (
                selectedAttendanceRsvps.map((rsvp) => (
                  <div key={rsvp.uid} className="rsvp-row">
                    <span>{rsvp.displayName}</span>
                    <span className={`rsvp-mark ${rsvp.status}`}>{statusSymbol[rsvp.status]}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
