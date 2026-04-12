import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BirthdayCelebrationModal } from "../components/BirthdayCelebrationModal";
import { DayAttendanceModal } from "../components/DayAttendanceModal";
import { getBirthdayCelebrants } from "../members/birthday";
import { isChildMember, sortMembersForDisplay } from "../members/permissions";
import { subscribeMemberRelations, subscribeMembers } from "../members/service";
import type { MemberRecord, MemberRelationRecord } from "../members/types";
import {
  getSessionAssigneeRoleLabel,
  isAttendanceTargetSession,
  isJournalTargetSession,
  sessionTypeLabel,
  showSessionAssignee,
} from "../schedule/sessionMeta";
import type {
  DemoData,
  DutyRequirement,
  RsvpStatus,
  Todo,
} from "../types";
import {
  formatDateYmd,
  formatTimeNoLeadingZero,
  formatWeekdayJa,
  isValidDateKey,
  shiftDateKey,
  todayDateKey,
  weekdayTone,
} from "../utils/date";

type TodayPageProps = {
  data: DemoData;
  ensureDayLog: (date: string) => Promise<void>;
  currentUid: string;
  linkedMember: MemberRecord | null;
  authRole?: "parent" | "admin" | null;
  saveTodo: (todo: Todo) => Promise<void>;
};

type AttendanceRow = {
  uid: string;
  displayName: string;
  status: RsvpStatus;
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

export function TodayPage({ data, ensureDayLog, currentUid, linkedMember, authRole, saveTodo }: TodayPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [birthdayModalDate, setBirthdayModalDate] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(todayDateKey().slice(0, 7));
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [noticeCanToggle, setNoticeCanToggle] = useState(false);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [pageError, setPageError] = useState("");
  const [relationsError, setRelationsError] = useState("");
  const calendarWrapRef = useRef<HTMLDivElement>(null);
  const noticeContentRef = useRef<HTMLDivElement>(null);
  const today = todayDateKey();
  const view = searchParams.get("view") ?? "";
  const queryDate = searchParams.get("date") ?? "";
  const date = queryDate && isValidDateKey(queryDate) ? queryDate : today;
  const day = data.scheduleDays[date];
  const dayDefaultLocation = day?.defaultLocation;
  const noticeText = day?.notice?.trim() ?? "";
  const eventIdBySessionId = useMemo(() => {
    const map = new Map<string, string>();
    data.events.forEach((event) => {
      (event.sessionIds ?? []).forEach((sessionId) => {
        if (sessionId.trim()) {
          map.set(sessionId, event.id);
        }
      });
    });
    return map;
  }, [data.events]);

  useEffect(() => {
    try {
      return subscribeMembers(setMembers);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "メンバーの読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  useEffect(() => {
    try {
      return subscribeMemberRelations((rows) => {
        setRelations(rows);
        setRelationsError("");
      });
    } catch (error) {
      setRelationsError(error instanceof Error ? error.message : "紐づき関係の読み込みに失敗しました。");
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

  const birthdayCelebrants = useMemo(() => getBirthdayCelebrants(members, date), [date, members]);

  const dayTransport = day?.attendanceTransport ?? {};

  const attendanceSessions = useMemo(() => sessions.filter(isAttendanceTargetSession), [sessions]);
  const journalSessions = useMemo(() => sessions.filter(isJournalTargetSession), [sessions]);
  const hasJournalSessions = journalSessions.length > 0;
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
    if (!hasJournalSessions) return;
    await ensureDayLog(date);
    navigate(`/logs/${date}`);
  };

  const openAttendanceModal = () => {
    setIsAttendanceModalOpen(true);
  };

  const closeAttendanceModal = () => {
    setIsAttendanceModalOpen(false);
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
        <div className="today-top-row">
          <button type="button" className="date-nav-button today-prev-day-button" onClick={() => moveDate(-1)}>
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
          <button type="button" className="date-nav-button today-next-day-button" onClick={() => moveDate(1)}>
            翌日 →
          </button>
        </div>
        <div className="today-secondary-actions">
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
          {hasJournalSessions && (
            <button type="button" className="button button-small" onClick={() => void openDayLog()}>
              日誌へ
            </button>
          )}
        </div>
      </div>

      {pageError && <p className="field-error">{pageError}</p>}
      {relationsError && <p className="field-error">{relationsError}</p>}

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
                  <span className={`session-type-badge ${session.type}`}>{sessionTypeLabel[session.type]}</span>
                  <div className="session-time">
                    {formatTimeNoLeadingZero(session.startTime)} - {formatTimeNoLeadingZero(session.endTime)}
                  </div>
                  {(session.type === "event" || session.type === "other") && session.eventName?.trim() && (
                    <div className="session-subtitle-row">
                      <div className="session-subtitle">{session.eventName}</div>
                      {session.id && eventIdBySessionId.get(session.id) && (
                        <Link
                          to={`/events/${eventIdBySessionId.get(session.id)}`}
                          className="session-event-detail-link"
                          onClick={(event) => event.stopPropagation()}
                        >
                          イベント詳細
                        </Link>
                      )}
                    </div>
                  )}
                {!(
                  (session.type === "event" || session.type === "other") &&
                  session.eventName?.trim()
                ) &&
                  session.id &&
                  eventIdBySessionId.get(session.id) && (
                    <div className="calendar-day-sheet-event-link-row">
                      <Link
                        to={`/events/${eventIdBySessionId.get(session.id)}`}
                        className="session-event-detail-link"
                        onClick={(event) => event.stopPropagation()}
                      >
                        イベント詳細
                      </Link>
                    </div>
                  )}
                {showSessionAssignee(session) && (
                  <div className="kv-row">
                    <span className="kv-key">{getSessionAssigneeRoleLabel(session) ?? dutyLabel[session.dutyRequirement]}:</span>
                    <span className="kv-val shift-role">{toFamilyName(session.assigneeNameSnapshot)}</span>
                  </div>
                )}
                {isAttendanceTargetSession(session) && (
                  <div className="kv-row">
                    <span className="kv-key">出欠:</span>
                    <span className="kv-val">
                      <button type="button" className="attendance-trigger" onClick={openAttendanceModal}>
                        <span className="count-yes">◯{counts.yes}</span>
                        <span className="count-maybe">△{counts.maybe}</span>
                        <span className="count-no">×{counts.no}</span>
                        <span className="count-unknown">ー{counts.unknown}</span>
                      </button>
                    </span>
                  </div>
                )}
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

      {isAttendanceModalOpen && (
        <DayAttendanceModal
          date={date}
          sessions={attendanceSessions}
          dayTransport={dayTransport}
          members={members}
          relations={relations}
          linkedMember={linkedMember}
          authRole={authRole}
          currentUid={currentUid}
          todos={data.todos}
          saveTodo={saveTodo}
          onClose={closeAttendanceModal}
        />
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
