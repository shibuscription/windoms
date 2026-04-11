import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resolveEditableAttendanceMemberIds } from "../attendance/utils";
import { BirthdayCelebrationModal } from "../components/BirthdayCelebrationModal";
import { saveDayAttendanceTransport, saveSessionRsvps } from "../journal/service";
import { getBirthdayCelebrants } from "../members/birthday";
import { isChildMember, sortMembersForDisplay } from "../members/permissions";
import { subscribeMemberRelations, subscribeMembers } from "../members/service";
import type { MemberRecord, MemberRelationRecord } from "../members/types";
import type {
  AttendanceTransportMethod,
  DemoData,
  DutyRequirement,
  RsvpStatus,
  SessionDoc,
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

type AttendanceMemberModalState = {
  member: MemberRecord;
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

const transportSymbol: Record<AttendanceTransportMethod, string> = {
  car: "🚗",
  walk: "🚶",
};

const transportLabel: Record<AttendanceTransportMethod, string> = {
  car: "🚗",
  walk: "🚶",
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
  void currentUid;
  void saveTodo;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [selectedAttendanceMember, setSelectedAttendanceMember] = useState<AttendanceMemberModalState | null>(null);
  const [birthdayModalDate, setBirthdayModalDate] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(todayDateKey().slice(0, 7));
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [noticeCanToggle, setNoticeCanToggle] = useState(false);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [relations, setRelations] = useState<MemberRelationRecord[]>([]);
  const [pageError, setPageError] = useState("");
  const [relationsError, setRelationsError] = useState("");
  const [attendanceSaveError, setAttendanceSaveError] = useState("");
  const [attendanceToast, setAttendanceToast] = useState("");
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [attendanceDraftBySessionOrder, setAttendanceDraftBySessionOrder] = useState<Record<number, RsvpStatus>>({});
  const [transportDraft, setTransportDraft] = useState<{
    to: AttendanceTransportMethod;
    from: AttendanceTransportMethod;
  }>({ to: "car", from: "car" });
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
    if (!attendanceToast) return;
    const timer = window.setTimeout(() => setAttendanceToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [attendanceToast]);

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

  const editableMemberIds = useMemo(
    () => resolveEditableAttendanceMemberIds(linkedMember, authRole, visibleChildMembers, relations),
    [authRole, linkedMember, relations, visibleChildMembers],
  );

  const memberById = useMemo(
    () =>
      visibleChildMembers.reduce<Record<string, MemberRecord>>((result, member) => {
        result[member.id] = member;
        return result;
      }, {}),
    [visibleChildMembers],
  );

  const dayTransport = day?.attendanceTransport ?? {};

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

  const openAttendanceModal = () => {
    setAttendanceSaveError("");
    setAttendanceToast("");
    setIsAttendanceModalOpen(true);
  };

  const closeAttendanceModal = () => {
    if (isSavingAttendance) return;
    setIsAttendanceModalOpen(false);
  };

  const openAttendanceMemberModal = (member: MemberRecord) => {
    if (!editableMemberIds.has(member.id)) return;
    setAttendanceDraftBySessionOrder(
      sessions.reduce<Record<number, RsvpStatus>>((result, session) => {
        const matched =
          session.demoRsvps?.find(
            (item) =>
              item.uid === member.authUid ||
              item.uid === member.id ||
              item.uid === member.loginId,
          ) ?? null;
        result[session.order] = matched?.status ?? "unknown";
        return result;
      }, {}),
    );
    const currentTransport = dayTransport[member.id];
    setTransportDraft({
      to: currentTransport?.to ?? "car",
      from: currentTransport?.from ?? "car",
    });
    setAttendanceSaveError("");
    setSelectedAttendanceMember({ member });
  };

  const closeAttendanceMemberModal = () => {
    if (isSavingAttendance) return;
    setSelectedAttendanceMember(null);
    setAttendanceSaveError("");
  };

  const saveAttendanceMember = async () => {
    if (!selectedAttendanceMember) return;
    const member = selectedAttendanceMember.member;
    setIsSavingAttendance(true);
    setAttendanceSaveError("");
    try {
      const matchedMember = memberById[member.id];
      if (!matchedMember) {
        throw new Error("対象メンバーが見つかりません。");
      }

      await Promise.all(
        sessions.map(async (session) => {
          if (!session.id) {
            throw new Error("予定IDが見つからないため、出欠を保存できません。");
          }
          const nextStatus = attendanceDraftBySessionOrder[session.order] ?? "unknown";
          const remaining = (session.demoRsvps ?? []).filter(
            (item) =>
              item.uid !== matchedMember.id &&
              item.uid !== matchedMember.authUid &&
              item.uid !== matchedMember.loginId,
          );
          const nextRsvps =
            nextStatus === "unknown"
              ? remaining
              : [
                  ...remaining,
                  {
                    uid: matchedMember.id,
                    displayName: matchedMember.name,
                    status: nextStatus,
                  },
                ];
          await saveSessionRsvps(date, session.id, nextRsvps);
        }),
      );

      await saveDayAttendanceTransport(date, member.id, transportDraft);
      setAttendanceToast(`${member.name} の出欠を保存しました。`);
      setSelectedAttendanceMember(null);
    } catch (error) {
      setAttendanceSaveError(error instanceof Error ? error.message : "出欠の保存に失敗しました。");
    } finally {
      setIsSavingAttendance(false);
    }
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
        <div className="today-actions">
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
            {hasSessions && (
              <button type="button" className="button button-small" onClick={() => void openDayLog()}>
                日誌へ
              </button>
            )}
          </div>
          <button type="button" className="date-nav-button today-next-day-button" onClick={() => moveDate(1)}>
            翌日 →
          </button>
        </div>
      </div>

      {attendanceToast && <div className="inline-toast">{attendanceToast}</div>}
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
                  <span className={`session-type-badge ${session.type}`}>{typeLabel[session.type]}</span>
                  <div className="session-time">
                    {formatTimeNoLeadingZero(session.startTime)} - {formatTimeNoLeadingZero(session.endTime)}
                  </div>
                  {session.type === "event" && session.eventName?.trim() && (
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
                <div className="kv-row">
                  <span className="kv-key">{dutyLabel[session.dutyRequirement]}:</span>
                  <span className="kv-val shift-role">{toFamilyName(session.assigneeNameSnapshot)}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">出欠:</span>
                  <span className="kv-val">
                    <button type="button" className="attendance-trigger" onClick={openAttendanceModal}>
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

      {isAttendanceModalOpen && (
        <div className="modal-backdrop" onClick={closeAttendanceModal}>
          <div className="modal-panel today-attendance-day-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeAttendanceModal}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <h3 className="today-attendance-day-title">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）
            </h3>
            <div className="today-attendance-day-table-wrap">
              <table className="today-attendance-day-table">
                <thead>
                  <tr>
                    <th className="today-attendance-member-head">メンバー</th>
                    {sessions.map((session) => {
                      const counts = countAttendanceRows(attendanceRowsByOrder[session.order] ?? []);
                      return (
                        <th key={session.id ?? `${session.order}-${session.startTime}`} className="today-attendance-session-head">
                          <div className="today-attendance-session-time">
                            <span>{formatTimeNoLeadingZero(session.startTime)}</span>
                            <span>{formatTimeNoLeadingZero(session.endTime)}</span>
                          </div>
                          <div className="today-attendance-session-type">{typeLabel[session.type]}</div>
                          <div className="today-attendance-session-counts">
                            <span className="count-yes">○{counts.yes}</span>
                            <span className="count-maybe">△{counts.maybe}</span>
                            <span className="count-no">×{counts.no}</span>
                            <span className="count-unknown">ー{counts.unknown}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="today-attendance-transport-head">行き</th>
                    <th className="today-attendance-transport-head">帰り</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleChildMembers.map((member) => {
                    const canEdit = editableMemberIds.has(member.id);
                    const memberTransport = dayTransport[member.id];
                    return (
                      <tr key={member.id}>
                        <th className="today-attendance-member-cell">
                          {canEdit ? (
                            <button
                              type="button"
                              className="today-attendance-member-button"
                              onClick={() => openAttendanceMemberModal(member)}
                            >
                              {member.name}
                            </button>
                          ) : (
                            <span className="today-attendance-member-label">{member.name}</span>
                          )}
                        </th>
                        {sessions.map((session) => {
                          const matched =
                            session.demoRsvps?.find(
                              (item) =>
                                item.uid === member.authUid ||
                                item.uid === member.id ||
                                item.uid === member.loginId,
                            ) ?? null;
                          const status = matched?.status ?? "unknown";
                          return (
                            <td key={`${member.id}-${session.id ?? session.order}`} className={`today-attendance-status-cell ${status}`}>
                              {statusSymbol[status]}
                            </td>
                          );
                        })}
                        <td className="today-attendance-transport-cell">
                          {transportSymbol[memberTransport?.to ?? "car"]}
                        </td>
                        <td className="today-attendance-transport-cell">
                          {transportSymbol[memberTransport?.from ?? "car"]}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleChildMembers.length === 0 && (
                    <tr>
                      <td className="today-attendance-empty-row" colSpan={sessions.length + 3}>
                        対象の部員はまだいません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedAttendanceMember && (
        <div className="modal-backdrop">
          <div className="modal-panel today-attendance-edit-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeAttendanceMemberModal}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(date)}（{formatWeekdayJa(date)}）
            </p>
            <h3>{selectedAttendanceMember.member.name}</h3>
            <div className="today-attendance-edit-list">
              {sessions.map((session) => {
                const currentStatus = attendanceDraftBySessionOrder[session.order] ?? "unknown";
                return (
                  <section key={session.id ?? `${session.order}-${session.startTime}`} className="today-attendance-edit-section">
                    <div className="today-attendance-edit-header">
                      <strong>{typeLabel[session.type]}</strong>
                      <span>
                        {formatTimeNoLeadingZero(session.startTime)} - {formatTimeNoLeadingZero(session.endTime)}
                      </span>
                    </div>
                    <div className="today-attendance-status-options">
                      {(["yes", "maybe", "no", "unknown"] as RsvpStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`attendance-cell-status-option ${status} ${currentStatus === status ? "active" : ""}`}
                          onClick={() =>
                            setAttendanceDraftBySessionOrder((current) => ({
                              ...current,
                              [session.order]: status,
                            }))
                          }
                        >
                          <span>{statusSymbol[status]}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
              <section className="today-attendance-edit-section">
                <div className="today-attendance-edit-header">
                  <strong>移動手段</strong>
                </div>
                <div className="today-attendance-transport-editor">
                  <div className="today-attendance-transport-group">
                    <span className="today-attendance-transport-label">行き</span>
                    <div className="today-attendance-transport-options">
                      {(["car", "walk"] as AttendanceTransportMethod[]).map((mode) => (
                        <button
                          key={`to-${mode}`}
                          type="button"
                          className={`attendance-cell-status-option transport-option ${transportDraft.to === mode ? "active" : ""}`}
                          onClick={() => setTransportDraft((current) => ({ ...current, to: mode }))}
                        >
                          <span>{transportLabel[mode]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="today-attendance-transport-group">
                    <span className="today-attendance-transport-label">帰り</span>
                    <div className="today-attendance-transport-options">
                      {(["car", "walk"] as AttendanceTransportMethod[]).map((mode) => (
                        <button
                          key={`from-${mode}`}
                          type="button"
                          className={`attendance-cell-status-option transport-option ${transportDraft.from === mode ? "active" : ""}`}
                          onClick={() => setTransportDraft((current) => ({ ...current, from: mode }))}
                        >
                          <span>{transportLabel[mode]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
            {attendanceSaveError && <p className="field-error">{attendanceSaveError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeAttendanceMemberModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void saveAttendanceMember()} disabled={isSavingAttendance}>
                {isSavingAttendance ? "保存中..." : "保存"}
              </button>
            </div>
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
