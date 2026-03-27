import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BirthdayCelebrationModal } from "../components/BirthdayCelebrationModal";
import { getBirthdayCelebrants } from "../members/birthday";
import {
  createCalendarSession,
  deleteCalendarSession,
  updateCalendarSession,
  type SaveCalendarSessionInput,
} from "../schedule/service";
import { isChildMember, sortMembersForDisplay } from "../members/permissions";
import { subscribeFamilies, subscribeMembers } from "../members/service";
import type { FamilyRecord, MemberRecord } from "../members/types";
import type { DemoData, RsvpStatus, SessionDoc, Todo } from "../types";
import {
  formatDateYmd,
  formatTimeNoLeadingZero,
  formatWeekdayJa,
  isValidDateKey,
  todayDateKey,
} from "../utils/date";
import { makeSessionRelatedId, sortTodosOpenFirst } from "../utils/todoUtils";

type CalendarPageProps = {
  data: DemoData;
  canManageSessions: boolean;
  ensureDayLog: (date: string) => Promise<void>;
};

type EditableSessionType = "normal" | "self" | "event";

type DaySelection = {
  date: string;
  sessions: SessionDoc[];
};

type CalendarDialog = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

type SessionFormState = {
  date: string;
  sessionId: string | null;
  startTime: string;
  endTime: string;
  type: EditableSessionType;
  eventName: string;
  location: string;
  assigneeFamilyId: string;
  note: string;
  mainInstructorPlanned: "" | "true" | "false";
};

type FieldErrors = Partial<Record<keyof SessionFormState, string>>;

type AttendanceRow = {
  uid: string;
  displayName: string;
  status: RsvpStatus;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

const typeLabel: Record<SessionDoc["type"], string> = {
  normal: "通常練習",
  self: "自主練",
  event: "イベント",
};

const editableTypeOptions: Array<{ value: EditableSessionType; label: string }> = [
  { value: "normal", label: "通常練習" },
  { value: "self", label: "自主練" },
  { value: "event", label: "イベント" },
];

const BASE_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

const assigneeRoleLabel = (session: SessionDoc): string =>
  session.type === "self" ? "見守り" : "当番";

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

const resolveFamilyIdFromSnapshot = (families: FamilyRecord[], snapshot?: string): string => {
  const familyName = toFamilyName(snapshot);
  if (!familyName || familyName === "-") return "";
  return families.find((family) => toFamilyName(family.name) === familyName)?.id ?? "";
};

const resolveLegacyMainInstructorPlanned = (session: SessionDoc): boolean | null => {
  if (typeof session.mainInstructorPlanned === "boolean") {
    return session.mainInstructorPlanned;
  }
  const plannedInstructors = session.plannedInstructors ?? [];
  if (plannedInstructors.includes("井野") || plannedInstructors.includes("井野先生")) {
    return true;
  }
  return null;
};

const toMainInstructorPlanField = (value: boolean | null): "" | "true" | "false" => {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
};

const fromMainInstructorPlanField = (value: "" | "true" | "false"): boolean | null => {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
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

const sortSessions = (sessions: SessionDoc[]): SessionDoc[] =>
  [...sessions].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;
    const startCompare = left.startTime.localeCompare(right.startTime);
    if (startCompare !== 0) return startCompare;
    const endCompare = left.endTime.localeCompare(right.endTime);
    if (endCompare !== 0) return endCompare;
    return (left.id ?? "").localeCompare(right.id ?? "");
  });

const countAttendanceRows = (rows: AttendanceRow[]) => ({
  yes: rows.filter((item) => item.status === "yes").length,
  maybe: rows.filter((item) => item.status === "maybe").length,
  no: rows.filter((item) => item.status === "no").length,
  unknown: rows.filter((item) => item.status === "unknown").length,
});

const isValidClockTime = (value: string): boolean =>
  /^(?:[01]\d|2[0-3]):(?:00|[0-5]\d)$/.test(value);

const toTimeMinutes = (value: string): number => {
  if (!isValidClockTime(value)) return -1;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatTimeOption = (minutes: number): string => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const buildTimeOptions = (...extras: Array<string | undefined>): string[] => {
  const values = new Set(BASE_TIME_OPTIONS);
  extras.forEach((value) => {
    if (value && isValidClockTime(value)) {
      values.add(value);
    }
  });
  return [...values].sort((left, right) => toTimeMinutes(left) - toTimeMinutes(right));
};

const getNextEndTime = (startTime: string, preferredMinutes = 180): string => {
  const startMinutes = toTimeMinutes(startTime);
  if (startMinutes < 0) return "12:00";
  const preferred = startMinutes + preferredMinutes;
  if (preferred < 1440) {
    return formatTimeOption(preferred);
  }
  const fallback = BASE_TIME_OPTIONS.find((option) => toTimeMinutes(option) > startMinutes);
  return fallback ?? "";
};

const emptySessionForm = (date: string): SessionFormState => ({
  date,
  sessionId: null,
  startTime: "09:00",
  endTime: "12:00",
  type: "normal",
  eventName: "",
  location: "",
  assigneeFamilyId: "",
  note: "",
  mainInstructorPlanned: "",
});

const buildCreateSessionForm = (date: string, sessions: SessionDoc[]): SessionFormState => {
  const sortedSessions = [...sortSessions(sessions)].sort(
    (left, right) => toTimeMinutes(right.endTime) - toTimeMinutes(left.endTime),
  );
  const lastSession = sortedSessions[0];
  if (!lastSession || !isValidClockTime(lastSession.endTime)) {
    return emptySessionForm(date);
  }
  const startTime = lastSession.endTime;
  const endTime = getNextEndTime(startTime);
  if (!endTime) {
    return emptySessionForm(date);
  }
  return {
    ...emptySessionForm(date),
    startTime,
    endTime,
  };
};

const isEditableSession = (session: SessionDoc): session is SessionDoc & { type: EditableSessionType } =>
  session.type === "normal" || session.type === "self" || session.type === "event";

const toSessionForm = (date: string, session: SessionDoc, families: FamilyRecord[]): SessionFormState => ({
  date,
  sessionId: session.id ?? null,
  startTime: session.startTime,
  endTime: session.endTime,
  type: isEditableSession(session) ? session.type : "normal",
  eventName: session.eventName ?? "",
  location: session.location ?? "",
  assigneeFamilyId:
    session.assigneeFamilyId ?? resolveFamilyIdFromSnapshot(families, session.assigneeNameSnapshot),
  note: session.note ?? "",
  mainInstructorPlanned: toMainInstructorPlanField(resolveLegacyMainInstructorPlanned(session)),
});

const validateSessionForm = (form: SessionFormState): FieldErrors => {
  const errors: FieldErrors = {};

  if (!isValidDateKey(form.date)) {
    errors.date = "日付を正しく入力してください。";
  }
  if (!/^\d{2}:\d{2}$/.test(form.startTime)) {
    errors.startTime = "開始時刻を選択してください。";
  }
  if (!/^\d{2}:\d{2}$/.test(form.endTime)) {
    errors.endTime = "終了時刻を選択してください。";
  }
  if (!errors.startTime && !errors.endTime && form.startTime >= form.endTime) {
    errors.endTime = "終了時刻は開始時刻より後にしてください。";
  }
  if (form.type === "event" && !form.eventName.trim()) {
    errors.eventName = "イベント名を入力してください。";
  }

  return errors;
};

const getNextValidEndTime = (startTime: string, currentEndTime?: string): string => {
  const startMinutes = toTimeMinutes(startTime);
  const currentMinutes = currentEndTime ? toTimeMinutes(currentEndTime) : -1;
  if (currentMinutes > startMinutes) {
    return currentEndTime!;
  }
  return getNextEndTime(startTime);
};

const getSessionDisplayTitle = (session: SessionDoc): string =>
  session.type === "event" && session.eventName?.trim() ? session.eventName.trim() : typeLabel[session.type];

export function CalendarPage({ data, canManageSessions, ensureDayLog }: CalendarPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useState<DaySelection | null>(null);
  const [dialog, setDialog] = useState<CalendarDialog | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<SessionDoc | null>(null);
  const [birthdayModalDate, setBirthdayModalDate] = useState<string | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState<SessionFormState>(emptySessionForm(todayDateKey()));
  const [sessionErrors, setSessionErrors] = useState<FieldErrors>({});
  const [sessionSubmitError, setSessionSubmitError] = useState("");
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const monthPickerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const today = todayDateKey();
  const queryDate = searchParams.get("date") ?? "";
  const queryYm = searchParams.get("ym") ?? "";

  const validDate = queryDate && isValidDateKey(queryDate) ? queryDate : "";
  const derivedYm = validDate ? toMonthKey(validDate) : "";
  const monthKey = derivedYm || (isValidMonthKey(queryYm) ? queryYm : toMonthKey(today));
  const selectedDate = validDate && toMonthKey(validDate) === monthKey ? validDate : "";
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState<number>(() => Number(monthKey.slice(0, 4)));
  const calendarCells = useMemo(() => buildMonthCells(monthKey), [monthKey]);

  const familyOptions = useMemo(
    () =>
      families
        .filter((family) => family.status === "active")
        .map((family) => ({
          id: family.id,
          label: toFamilyName(family.name),
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "ja")),
    [families],
  );

  const locationOptions = useMemo(() => {
    const values = new Set<string>();
    Object.values(data.scheduleDays).forEach((day) => {
      if (day.defaultLocation?.trim()) {
        values.add(day.defaultLocation.trim());
      }
      (day.sessions ?? []).forEach((session) => {
        if (session.location?.trim()) {
          values.add(session.location.trim());
        }
      });
    });
    return [...values].sort((left, right) => left.localeCompare(right, "ja"));
  }, [data.scheduleDays]);

  const visibleChildMembers = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter((member) => member.memberStatus === "active" && isChildMember(member)),
        "child",
      ),
    [members],
  );

  useEffect(() => subscribeFamilies(setFamilies), []);
  useEffect(() => subscribeMembers(setMembers), []);
  useEffect(() => {
    setMonthPickerYear(Number(monthKey.slice(0, 4)));
  }, [monthKey]);

  useEffect(() => {
    if (!isMonthPickerOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!monthPickerRef.current?.contains(event.target as Node)) {
        setIsMonthPickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMonthPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMonthPickerOpen]);

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

  useEffect(() => {
    if (!selectedDay) return;
    const latestSessions = sortSessions(data.scheduleDays[selectedDay.date]?.sessions ?? []);
    setSelectedDay((current) =>
      current
        ? {
            ...current,
            sessions: latestSessions,
          }
        : current,
    );
  }, [data.scheduleDays, selectedDay]);

  const attendanceRowsByOrder = useMemo(() => {
    return selectedDay?.sessions.reduce<Record<number, AttendanceRow[]>>((result, session) => {
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
    }, {}) ?? {};
  }, [selectedDay?.sessions, visibleChildMembers]);

  const selectedAttendanceRows = attendanceSession
    ? attendanceRowsByOrder[attendanceSession.order] ?? []
    : [];
  const selectedAttendanceCounts = useMemo(
    () => countAttendanceRows(selectedAttendanceRows),
    [selectedAttendanceRows],
  );
  const selectedSessionTodos = useMemo(() => {
    if (!selectedDay || !attendanceSession) return [] as Todo[];
    const relatedId = makeSessionRelatedId(selectedDay.date, attendanceSession.order);
    return sortTodosOpenFirst(
      data.todos.filter(
        (todo) => todo.kind === "shared" && todo.related?.type === "session" && todo.related.id === relatedId,
      ),
    );
  }, [attendanceSession, data.todos, selectedDay]);
  const birthdayCelebrants = useMemo(
    () => (birthdayModalDate ? getBirthdayCelebrants(members, birthdayModalDate) : []),
    [birthdayModalDate, members],
  );

  const timeOptions = useMemo(
    () => buildTimeOptions(sessionForm.startTime, sessionForm.endTime),
    [sessionForm.endTime, sessionForm.startTime],
  );
  const endTimeOptions = useMemo(() => {
    const startMinutes = toTimeMinutes(sessionForm.startTime);
    return timeOptions.filter((option) => toTimeMinutes(option) > startMinutes);
  }, [sessionForm.startTime, timeOptions]);
  const endTimeValue = endTimeOptions.includes(sessionForm.endTime) ? sessionForm.endTime : "";

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

  const toggleMonthPicker = () => {
    setMonthPickerYear(Number(monthKey.slice(0, 4)));
    setIsMonthPickerOpen((current) => !current);
  };

  const selectMonth = (month: number) => {
    syncSearchParams(`${monthPickerYear}-${String(month).padStart(2, "0")}`);
    setIsMonthPickerOpen(false);
  };

  const openDay = (date: string, sessions: SessionDoc[]) => {
    syncSearchParams(monthKey, date);
    setSelectedDay({ date, sessions: sortSessions(sessions) });
  };

  const goToTodayFromSheet = () => {
    if (!selectedDay) return;
    if (selectedDay.date === today) {
      navigate("/today");
      return;
    }
    navigate(`/today?date=${selectedDay.date}`);
  };

  const openDayLogFromSheet = async () => {
    if (!selectedDay || selectedDay.sessions.length === 0) return;
    await ensureDayLog(selectedDay.date);
    navigate(`/logs/${selectedDay.date}`);
  };

  const closeSheet = () => {
    setSelectedDay(null);
  };

  const closeDialog = () => {
    setDialog(null);
  };

  const closeAttendanceModal = () => {
    setAttendanceSession(null);
  };

  const openCreateSession = () => {
    if (!selectedDay) return;
    setSessionForm(buildCreateSessionForm(selectedDay.date, selectedDay.sessions));
    setSessionErrors({});
    setSessionSubmitError("");
    setIsSessionModalOpen(true);
  };

  const openEditSession = (session: SessionDoc) => {
    if (!selectedDay || !isEditableSession(session)) return;
    setSessionForm(toSessionForm(selectedDay.date, session, families));
    setSessionErrors({});
    setSessionSubmitError("");
    setIsSessionModalOpen(true);
  };

  const closeSessionModal = () => {
    if (isSubmittingSession) return;
    setIsSessionModalOpen(false);
  };

  const handleSessionFieldChange = <K extends keyof SessionFormState>(
    key: K,
    value: SessionFormState[K],
  ) => {
    setSessionForm((current) => {
      const next = {
        ...current,
        [key]: value,
        ...(key === "type" && value !== "event" ? { eventName: "" } : {}),
      };

      if (key === "startTime" && typeof value === "string") {
        next.endTime = getNextValidEndTime(value, current.endTime);
      }

      return next;
    });
    setSessionErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === "type" && value !== "event" ? { eventName: undefined } : {}),
      ...(key === "startTime" ? { endTime: undefined } : {}),
    }));
  };

  const submitSession = async () => {
    const errors = validateSessionForm(sessionForm);
    setSessionErrors(errors);
    setSessionSubmitError("");
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setIsSubmittingSession(true);
    try {
      const payload: SaveCalendarSessionInput = {
        originalDate: selectedDay?.date,
        date: sessionForm.date,
        sessionId: sessionForm.sessionId ?? undefined,
        startTime: sessionForm.startTime,
        endTime: sessionForm.endTime,
        type: sessionForm.type,
        eventName: sessionForm.eventName,
        location: sessionForm.location,
        assigneeFamilyId: sessionForm.assigneeFamilyId,
        note: sessionForm.note,
        mainInstructorPlanned: fromMainInstructorPlanField(sessionForm.mainInstructorPlanned),
      };

      if (sessionForm.sessionId) {
        await updateCalendarSession(payload);
      } else {
        await createCalendarSession(payload);
      }

      setIsSessionModalOpen(false);
    } catch (error) {
      setSessionSubmitError(
        error instanceof Error ? error.message : "予定の保存に失敗しました。",
      );
    } finally {
      setIsSubmittingSession(false);
    }
  };

  const openDeleteConfirm = (session: SessionDoc) => {
    if (!selectedDay || !session.id) return;
    setDialog({
      title: "予定削除",
      message: `${formatTimeNoLeadingZero(session.startTime)}-${formatTimeNoLeadingZero(
        session.endTime,
      )} の予定を削除しますか。`,
      confirmLabel: "削除",
      onConfirm: async () => {
        await deleteCalendarSession(selectedDay.date, session.id!);
      },
    });
  };

  return (
    <section className="card">
      <div className="month-calendar-header">
        <div className="month-calendar-header-left">
          <button type="button" className="button button-small" onClick={() => navigate("/today")}>
            Todayへ
          </button>
        </div>
        <div className="month-calendar-header-center" ref={monthPickerRef}>
          <div className="month-calendar-nav">
            <button type="button" className="button button-small button-secondary" onClick={goPrevMonth}>
              ← 前月
            </button>
            <button
              type="button"
              className="month-calendar-month-button"
              onClick={toggleMonthPicker}
              aria-haspopup="dialog"
              aria-expanded={isMonthPickerOpen}
              aria-label={`${monthLabel(monthKey)} を選択`}
            >
              <strong>{monthLabel(monthKey)}</strong>
            </button>
            <button type="button" className="button button-small button-secondary" onClick={goNextMonth}>
              翌月 →
            </button>
          </div>
          {isMonthPickerOpen && (
            <div className="month-picker-popover" role="dialog" aria-label="年月選択">
              <div className="month-picker-header">
                <button
                  type="button"
                  className="month-picker-year-button"
                  onClick={() => setMonthPickerYear((current) => current - 1)}
                  aria-label="前年"
                >
                  ←
                </button>
                <strong>{monthPickerYear}年</strong>
                <button
                  type="button"
                  className="month-picker-year-button"
                  onClick={() => setMonthPickerYear((current) => current + 1)}
                  aria-label="翌年"
                >
                  →
                </button>
              </div>
              <div className="month-picker-grid">
                {Array.from({ length: 12 }, (_, index) => {
                  const month = index + 1;
                  const pickerMonthKey = `${monthPickerYear}-${String(month).padStart(2, "0")}`;
                  return (
                    <button
                      key={pickerMonthKey}
                      type="button"
                      className={`month-picker-month-button ${pickerMonthKey === monthKey ? "current" : ""}`}
                      onClick={() => selectMonth(month)}
                    >
                      {month}月
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="month-calendar-header-right">
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
            const daySessions = sortSessions(data.scheduleDays[cell]?.sessions ?? []);
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
                aria-label={`${formatDateYmd(cell)} の予定を開く`}
              >
                <span className="month-calendar-day-link">{Number(cell.slice(-2))}</span>
                {getBirthdayCelebrants(members, cell).length > 0 && (
                  <button
                    type="button"
                    className="calendar-birthday-trigger"
                    aria-label="お誕生日を開く"
                    title="お誕生日"
                    onClick={(event) => {
                      event.stopPropagation();
                      setBirthdayModalDate(cell);
                    }}
                  >
                    🎂
                  </button>
                )}
                <div className="month-calendar-events">
                  {daySessions.map((session) => (
                    <div key={`${cell}-${session.id ?? session.order}`} className={`calendar-event ${session.type}`}>
                      <span className="calendar-event-main">
                        <span className="calendar-event-time">{formatTimeNoLeadingZero(session.startTime)}</span>
                        <span
                          className={`calendar-event-label ${
                            session.type === "event" ? "event-name" : "session-type"
                          }`}
                        >
                          {getSessionDisplayTitle(session)}
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
            <button
              type="button"
              className="calendar-session-sheet-close"
              onClick={closeSheet}
              aria-label="閉じる"
              title="閉じる"
            >
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
                {selectedDay.sessions.length > 0 && (
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => void openDayLogFromSheet()}
                  >
                    日誌へ
                  </button>
                )}
                {canManageSessions && (
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={openCreateSession}
                  >
                    ＋
                  </button>
                )}
              </div>
            </header>
            <div className="calendar-day-sheet-list">
              {selectedDay.sessions.length === 0 && (
                <p className="muted">この日の予定はまだありません。</p>
              )}
              {selectedDay.sessions.map((session) => {
                const attendanceRows = attendanceRowsByOrder[session.order] ?? [];
                const counts = countAttendanceRows(attendanceRows);
                const editable = canManageSessions && isEditableSession(session) && Boolean(session.id);
                return (
                  <article
                    key={`sheet-${selectedDay.date}-${session.id ?? session.order}`}
                    className={`session-card ${session.type}`}
                  >
                    <span className={`session-type-badge ${session.type}`}>
                      {typeLabel[session.type]}
                    </span>
                    {editable && (
                      <div className="session-card-actions-top">
                        <button
                          type="button"
                          className="calendar-day-sheet-icon"
                          aria-label="予定編集"
                          title="予定編集"
                          onClick={() => openEditSession(session)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="calendar-day-sheet-icon"
                          aria-label="予定削除"
                          title="予定削除"
                          onClick={() => openDeleteConfirm(session)}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                    <div className="calendar-day-sheet-main session-card-body">
                      <p className="calendar-day-sheet-time session-time">
                        {formatTimeNoLeadingZero(session.startTime)}-{formatTimeNoLeadingZero(session.endTime)}
                      </p>
                      {session.type === "event" && session.eventName?.trim() && (
                        <p className="calendar-day-sheet-meta">{session.eventName}</p>
                      )}
                      <p className="calendar-day-sheet-label kv-row">
                        <span className="kv-key">{assigneeRoleLabel(session)}:</span>
                        <span className="kv-val shift-role">{toFamilyName(session.assigneeNameSnapshot)}</span>
                      </p>
                      {session.location && (
                        <p className="calendar-day-sheet-meta kv-row">
                          <span className="kv-key">場所:</span>
                          <span className="kv-val">{session.location}</span>
                        </p>
                      )}
                      {session.note && (
                        <p className="calendar-day-sheet-meta kv-row">
                          <span className="kv-key">メモ:</span>
                          <span className="kv-val">{session.note}</span>
                        </p>
                      )}
                      <p className="calendar-day-sheet-meta kv-row">
                        <span className="kv-key">出欠:</span>
                        <span className="kv-val">
                          <button
                            type="button"
                            className="attendance-trigger"
                            onClick={() => setAttendanceSession(session)}
                          >
                            <span className="count-yes">○{counts.yes}</span>
                            <span className="count-maybe">△{counts.maybe}</span>
                            <span className="count-no">×{counts.no}</span>
                            <span className="count-unknown">ー{counts.unknown}</span>
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
                        onClick={async () => {
                          await dialog.onConfirm?.();
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

      {isSessionModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel calendar-session-editor-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeSessionModal}
            >
              ×
            </button>
            <h3>{sessionForm.sessionId ? "予定編集" : "予定追加"}</h3>
            <p className="muted">カレンダーでは単発追加と個別調整のみを行えます。</p>

            <label>
              日付
              <input
                type="date"
                value={sessionForm.date}
                onChange={(event) => handleSessionFieldChange("date", event.target.value)}
              />
              {sessionErrors.date && <span className="field-error">{sessionErrors.date}</span>}
            </label>

            <div className="calendar-session-editor-times">
              <label>
                開始時刻
                <select
                  value={sessionForm.startTime}
                  onChange={(event) => handleSessionFieldChange("startTime", event.target.value)}
                >
                  {timeOptions.map((option) => (
                    <option key={`start-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sessionErrors.startTime && <span className="field-error">{sessionErrors.startTime}</span>}
              </label>
              <label>
                終了時刻
                <select
                  value={endTimeValue}
                  onChange={(event) => handleSessionFieldChange("endTime", event.target.value)}
                >
                  {endTimeOptions.length === 0 && (
                    <option value="" disabled>
                      終了時刻を選択してください
                    </option>
                  )}
                  {endTimeOptions.map((option) => (
                    <option key={`end-${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sessionErrors.endTime && <span className="field-error">{sessionErrors.endTime}</span>}
              </label>
            </div>

            <label>
              種別
              <select
                value={sessionForm.type}
                onChange={(event) =>
                  handleSessionFieldChange("type", event.target.value as EditableSessionType)
                }
              >
                {editableTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {sessionForm.type === "event" && (
              <label>
                イベント名
                <input
                  value={sessionForm.eventName}
                  onChange={(event) => handleSessionFieldChange("eventName", event.target.value)}
                />
                {sessionErrors.eventName && <span className="field-error">{sessionErrors.eventName}</span>}
              </label>
            )}

            <label>
              場所
              <input
                list="calendar-location-suggestions"
                value={sessionForm.location}
                onChange={(event) => handleSessionFieldChange("location", event.target.value)}
              />
              {locationOptions.length > 0 && (
                <datalist id="calendar-location-suggestions">
                  {locationOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              )}
            </label>

            <label>
              講師予定
              <select
                value={sessionForm.mainInstructorPlanned}
                onChange={(event) =>
                  handleSessionFieldChange(
                    "mainInstructorPlanned",
                    event.target.value as SessionFormState["mainInstructorPlanned"],
                  )
                }
              >
                <option value="">未設定</option>
                <option value="true">来る</option>
                <option value="false">来ない</option>
              </select>
            </label>

            <label>
              {sessionForm.type === "self" ? "見守り担当" : "当番担当"}
              <select
                value={sessionForm.assigneeFamilyId}
                onChange={(event) =>
                  handleSessionFieldChange("assigneeFamilyId", event.target.value)
                }
              >
                <option value="">未割当</option>
                {familyOptions.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              メモ
              <textarea
                value={sessionForm.note}
                onChange={(event) => handleSessionFieldChange("note", event.target.value)}
              />
            </label>

            {sessionSubmitError && <p className="field-error">{sessionSubmitError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={closeSessionModal}
                disabled={isSubmittingSession}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void submitSession()}
                disabled={isSubmittingSession}
              >
                {isSubmittingSession ? "保存中..." : "保存"}
              </button>
            </div>
          </section>
        </div>
      )}

      {attendanceSession && selectedDay && (
        <div className="modal-backdrop calendar-attendance-backdrop" onClick={closeAttendanceModal}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={closeAttendanceModal}
              aria-label="閉じる"
              title="閉じる"
            >
              ×
            </button>
            <p className="modal-context">
              {formatDateYmd(selectedDay.date)}（{formatWeekdayJa(selectedDay.date)}） /{" "}
              {formatTimeNoLeadingZero(attendanceSession.startTime)}-
              {formatTimeNoLeadingZero(attendanceSession.endTime)}
            </p>
            <h3>{getSessionDisplayTitle(attendanceSession)}</h3>
            {attendanceSession.location && (
              <p className="modal-summary muted">場所: {attendanceSession.location}</p>
            )}
            <p className="modal-summary">
              出欠: <span className="count-yes">○{selectedAttendanceCounts.yes}</span>{" "}
              <span className="count-maybe">△{selectedAttendanceCounts.maybe}</span>{" "}
              <span className="count-no">×{selectedAttendanceCounts.no}</span>{" "}
              <span className="count-unknown">ー{selectedAttendanceCounts.unknown}</span>
            </p>
            <div className="rsvp-table">
              {selectedAttendanceRows.length === 0 ? (
                <div className="rsvp-row">
                  <span>対象の部員はまだいません。</span>
                  <span className="rsvp-mark unknown">ー</span>
                </div>
              ) : (
                selectedAttendanceRows.map((row) => (
                  <div key={row.uid} className="rsvp-row">
                    <span>{row.displayName}</span>
                    <span className={`rsvp-mark ${row.status}`}>{statusSymbol[row.status]}</span>
                  </div>
                ))
              )}
            </div>
            {selectedSessionTodos.length > 0 && (
              <div className="related-todos-block">
                <p className="related-todos-title">関連TODO</p>
                <div className="related-todos-list">
                  {selectedSessionTodos.map((todo) => (
                    <label key={todo.id} className={`todo-check ${todo.completed ? "done" : ""}`}>
                      <input type="checkbox" checked={todo.completed} readOnly />
                      <span>{todo.title}</span>
                    </label>
                  ))}
                </div>
              </div>
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
