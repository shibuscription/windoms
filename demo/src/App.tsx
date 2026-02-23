import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { LogPage } from "./pages/LogPage";
import { ActivityPlanPage } from "./pages/ActivityPlanPage";
import { AttendancePage } from "./pages/AttendancePage";
import { WatchPage } from "./pages/WatchPage";
import { ShiftSurveyPage } from "./pages/ShiftSurveyPage";
import { mockData } from "./data/mockData";
import type { DayLog, DemoData, DemoRsvp } from "./types";
import { formatDateYmd, formatWeekdayJa, todayDateKey, weekdayTone } from "./utils/date";
import {
  activityPlanStatusStorageKey,
  activityPlanUnansweredStorageKey,
  getActivityPlanTargetMonthKey,
  readActivityPlanStatus,
  readDemoRole,
  readDemoUnansweredCount,
} from "./utils/activityPlan";

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  to: string;
  badgeText?: string;
  isActive: (location: { pathname: string; search: string }) => boolean;
};

type MenuSection = {
  id: string;
  heading: string;
  items: MenuItem[];
};

const viewIsActive = (location: { pathname: string; search: string }, view: string) =>
  location.pathname === "/today" && new URLSearchParams(location.search).get("view") === view;

const menuSections = (today: string, activityPlanBadgeText?: string): MenuSection[] => [
  {
    id: "operation",
    heading: "運用",
    items: [
      {
        id: "today",
        label: "Today",
        icon: "📅",
        to: "/today",
        isActive: (location) => location.pathname === "/today" && !location.search,
      },
      {
        id: "log",
        label: "日誌",
        icon: "📝",
        to: `/logs/${today}`,
        isActive: (location) => location.pathname.startsWith("/logs/"),
      },
      {
        id: "calendar",
        label: "カレンダー",
        icon: "🗓️",
        to: "/today?view=calendar",
        isActive: (location) => viewIsActive(location, "calendar"),
      },
      {
        id: "todo",
        label: "TODO",
        icon: "✅",
        to: "/today?view=todo",
        isActive: (location) => viewIsActive(location, "todo"),
      },
    ],
  },
  {
    id: "activity-planning",
    heading: "活動予定",
    items: [
      {
        id: "activity-plan",
        label: "活動予定",
        icon: "🧭",
        to: "/activity-plan",
        badgeText: activityPlanBadgeText,
        isActive: (location) => location.pathname === "/activity-plan",
      },
      {
        id: "attendance",
        label: "出欠",
        icon: "🗒️",
        to: "/attendance",
        isActive: (location) => location.pathname === "/attendance",
      },
      {
        id: "watch",
        label: "見守り",
        icon: "👀",
        to: "/watch",
        isActive: (location) => location.pathname === "/watch",
      },
    ],
  },
  {
    id: "management",
    heading: "管理",
    items: [
      {
        id: "accounting",
        label: "会計",
        icon: "💰",
        to: "/today?view=accounting",
        isActive: (location) => viewIsActive(location, "accounting"),
      },
      {
        id: "instruments",
        label: "楽器",
        icon: "🎷",
        to: "/today?view=instruments",
        isActive: (location) => viewIsActive(location, "instruments"),
      },
      {
        id: "scores",
        label: "楽譜",
        icon: "🎼",
        to: "/today?view=scores",
        isActive: (location) => viewIsActive(location, "scores"),
      },
      {
        id: "docs",
        label: "資料",
        icon: "📁",
        to: "/today?view=docs",
        isActive: (location) => viewIsActive(location, "docs"),
      },
      {
        id: "members",
        label: "メンバー",
        icon: "👥",
        to: "/today?view=members",
        isActive: (location) => viewIsActive(location, "members"),
      },
      {
        id: "links",
        label: "リンク集",
        icon: "🔗",
        to: "/today?view=links",
        isActive: (location) => viewIsActive(location, "links"),
      },
      {
        id: "settings",
        label: "設定",
        icon: "⚙️",
        to: "/today?view=settings",
        isActive: (location) => viewIsActive(location, "settings"),
      },
    ],
  },
];

export function App() {
  const [data, setData] = useState<DemoData>(mockData);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeStatusPanel, setActiveStatusPanel] = useState<"notice" | "todo" | "duty" | null>(
    null,
  );
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayDateKey();
  const activityPlanMonthKey = getActivityPlanTargetMonthKey(today);
  const isAdmin = readDemoRole() === "admin";
  const activityPlanStatus = readActivityPlanStatus(activityPlanMonthKey);
  const unansweredCount = readDemoUnansweredCount(activityPlanMonthKey);
  const activityPlanBadgeText =
    isAdmin && activityPlanStatus === "SURVEY_OPEN" && unansweredCount > 0
      ? `未回答 ${unansweredCount}`
      : undefined;
  const hasShiftSurveyTodo = isAdmin && activityPlanStatus === "SURVEY_OPEN" && unansweredCount > 0;
  const shiftSurveyPath = `/shift-survey?month=${activityPlanMonthKey}`;
  const statusStorageKey = activityPlanStatusStorageKey(activityPlanMonthKey);
  const unansweredStorageKey = activityPlanUnansweredStorageKey(activityPlanMonthKey);
  const [demoStatus, setDemoStatus] = useState<string>(activityPlanStatus);
  const [demoUnanswered, setDemoUnanswered] = useState<string>(String(unansweredCount));
  const [demoRoleDraft, setDemoRoleDraft] = useState<"admin" | "member">(readDemoRole());

  useEffect(() => {
    if (!isMenuOpen && !activeStatusPanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
      if (event.key === "Escape") setActiveStatusPanel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    const originalOverflow = document.body.style.overflow;
    if (isMenuOpen || activeStatusPanel) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isMenuOpen, activeStatusPanel]);

  useEffect(() => {
    if (!activeStatusPanel) return;
    setActiveStatusPanel(null);
  }, [location.key]);

  const statusButtons: Array<{ id: "notice" | "todo" | "duty"; icon: string; label: string; badge: number }> = [
    { id: "notice", icon: "🔔", label: "Notices", badge: 2 },
    { id: "todo", icon: "✅", label: "My TODO", badge: 3 + (hasShiftSurveyTodo ? 1 : 0) },
    { id: "duty", icon: "📅", label: "次の当番", badge: 1 },
  ];
  type StatusPanelItem = {
    id: string;
    text: string;
    actionLabel?: string;
    to?: string;
  };
  const statusPanelMeta: Record<
    "notice" | "todo" | "duty",
    { title: string; subtitle: string; items: StatusPanelItem[] }
  > = {
    notice: {
      title: "Notices",
      subtitle: "お知らせ（DEMO）",
      items: [
        { id: "notice-1", text: "本日 16:30 片付け開始です。" },
        { id: "notice-2", text: "週末本番の集合は 8:40 正門前です。" },
        { id: "notice-3", text: "譜面台の不足分を職員室で受け取りください。" },
      ],
    },
    todo: {
      title: "My TODO",
      subtitle: "担当TODO（DEMO）",
      items: [
        { id: "todo-1", text: "打楽器チェックリストを更新する" },
        { id: "todo-2", text: "本番用チラシを配布する" },
        { id: "todo-3", text: "見守り当番の最終確認を行う" },
        ...(hasShiftSurveyTodo
          ? [{
              id: "todo-shift-survey",
              text: `当番可否アンケートに回答してください（未回答 ${unansweredCount} 件）`,
              actionLabel: "回答する",
              to: shiftSurveyPath,
            }]
          : []),
      ],
    },
    duty: {
      title: "次の当番",
      subtitle: "当番予定（DEMO）",
      items: [
        { id: "duty-1", text: "日時: 2026-02-21 09:00-12:00" },
        { id: "duty-2", text: "場所: 第1音楽室" },
        { id: "duty-3", text: "備考: 入室前に出欠確認をお願いします。" },
      ],
    },
  };

  const context = useMemo(
    () => ({
      data,
      updateDayLog: (date: string, updater: (prev: DayLog) => DayLog) => {
        setData((prev) => {
          const current = prev.dayLogs[date] ?? {
            notes: "",
            weather: "",
            activities: [],
            actualInstructors: [],
            actualSeniors: [],
            mainInstructorAttendance: {},
            dutyStamps: {},
          };
          return {
            ...prev,
            dayLogs: {
              ...prev.dayLogs,
              [date]: updater(current),
            },
          };
        });
      },
      updateSessionRsvps: (date: string, sessionOrder: number, rsvps: DemoRsvp[]) => {
        setData((prev) => {
          const day = prev.scheduleDays[date];
          if (!day) return prev;
          return {
            ...prev,
            scheduleDays: {
              ...prev.scheduleDays,
              [date]: {
                ...day,
                sessions: day.sessions.map((session) =>
                  session.order === sessionOrder ? { ...session, demoRsvps: rsvps } : session,
                ),
              },
            },
          };
        });
      },
      updateDemoDictionaries: (next: Partial<DemoData["demoDictionaries"]>) => {
        setData((prev) => ({
          ...prev,
          demoDictionaries: {
            instructors: Array.from(
              new Set([...(prev.demoDictionaries.instructors ?? []), ...(next.instructors ?? [])]),
            ),
            seniors: Array.from(
              new Set([...(prev.demoDictionaries.seniors ?? []), ...(next.seniors ?? [])]),
            ),
          },
        }));
      },
    }),
    [data],
  );

  const applyDemoControls = () => {
    const normalizedStatus = demoStatus === "SESSIONS_DECIDED" ? "SESSIONS_SET" : demoStatus;
    window.localStorage.setItem(statusStorageKey, normalizedStatus);
    const parsedUnanswered = Number(demoUnanswered);
    const nextUnanswered = Number.isFinite(parsedUnanswered) ? Math.max(0, Math.floor(parsedUnanswered)) : 0;
    window.localStorage.setItem(unansweredStorageKey, String(nextUnanswered));
    window.localStorage.setItem("windoms:demo-role", demoRoleDraft);
    window.location.reload();
  };

  const resetDemoControls = () => {
    window.localStorage.removeItem(statusStorageKey);
    window.localStorage.removeItem(unansweredStorageKey);
    window.localStorage.setItem("windoms:demo-role", "admin");
    window.location.reload();
  };

  return (
    <div className="app-shell">
      <div className="demo-badge">DEMO（データは仮）</div>
      <header className="app-header">
        <Link to="/" className="brand">
          Windoms demo
        </Link>
        <div className="header-actions">
          {statusButtons.map((item) => {
            const isActive = activeStatusPanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`status-icon-button ${isActive ? "active" : ""}`}
                aria-label={item.label}
                onClick={() => setActiveStatusPanel((prev) => (prev === item.id ? null : item.id))}
              >
                <span className="status-icon-emoji" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="status-icon-badge" aria-hidden="true">
                  {item.badge}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="menu-trigger"
            aria-label="メニューを開く"
            onClick={() => {
              setActiveStatusPanel(null);
              setIsMenuOpen(true);
            }}
          >
            ☰
          </button>
        </div>
      </header>
      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/today"
            element={<TodayPage data={context.data} updateDayLog={context.updateDayLog} />}
          />
          <Route
            path="/activity-plan"
            element={<ActivityPlanPage />}
          />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/shift-survey" element={<ShiftSurveyPage />} />
          <Route
            path="/logs/:date"
            element={
              <LogPage
                data={context.data}
                updateDayLog={context.updateDayLog}
                updateSessionRsvps={context.updateSessionRsvps}
                updateDemoDictionaries={context.updateDemoDictionaries}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {isMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
          <div className="menu-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="menu-close"
              aria-label="メニューを閉じる"
              onClick={() => setIsMenuOpen(false)}
            >
              ×
            </button>
            <button
              type="button"
              className="menu-today-header"
              onClick={() => {
                setIsMenuOpen(false);
                navigate("/today");
              }}
            >
              <span className="menu-today-date">{formatDateYmd(today)}</span>
              <span className={`menu-today-weekday ${weekdayTone(today)}`}>（{formatWeekdayJa(today)}）</span>
            </button>
            <div className="menu-sections">
              {menuSections(today, activityPlanBadgeText).map((section) => (
                <section key={section.id} className="menu-section">
                  <h2 className="menu-section-heading">{section.heading}</h2>
                  <div className="menu-grid">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`menu-item ${item.isActive(location) ? "active" : ""}`}
                        onClick={() => {
                          setIsMenuOpen(false);
                          navigate(item.to);
                        }}
                      >
                        <span className="menu-item-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="menu-item-label">{item.label}</span>
                        {item.badgeText && <span className="menu-item-badge">{item.badgeText}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
      {activeStatusPanel && (
        <div className="status-panel-overlay" onClick={() => setActiveStatusPanel(null)}>
          <section className="status-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="status-panel-close"
              aria-label="パネルを閉じる"
              onClick={() => setActiveStatusPanel(null)}
            >
              ×
            </button>
            <p className="status-panel-subtitle">{statusPanelMeta[activeStatusPanel].subtitle}</p>
            <h2 className="status-panel-title">{statusPanelMeta[activeStatusPanel].title}</h2>
            <ul className="status-panel-list">
              {statusPanelMeta[activeStatusPanel].items.map((item) => (
                <li key={item.id}>
                  <span>{item.text}</span>
                  {item.to && item.actionLabel && (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => {
                        const target = item.to;
                        if (!target) return;
                        setActiveStatusPanel(null);
                        navigate(target);
                      }}
                    >
                      {item.actionLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {(import.meta as { env?: { DEV?: boolean } }).env?.DEV && (
        <>
          {!isDevPanelOpen && (
            <button
              type="button"
              className="dev-panel-fab"
              aria-label="DEMOコントロールを開く"
              onClick={() => setIsDevPanelOpen(true)}
            >
              🧪
            </button>
          )}
          {isDevPanelOpen && (
            <aside className="dev-panel">
              <div className="dev-panel-header">
                <strong className="dev-panel-title">DEMOコントロール</strong>
                <button
                  type="button"
                  className="dev-panel-minimize"
                  aria-label="最小化"
                  onClick={() => setIsDevPanelOpen(false)}
                >
                  ＿
                </button>
              </div>
              <label className="dev-panel-field">
                <span>Status ({activityPlanMonthKey})</span>
                <select value={demoStatus} onChange={(event) => setDemoStatus(event.target.value)}>
                  <option value="NOT_STARTED">NOT_STARTED</option>
                  <option value="SESSIONS_SET">SESSIONS_SET</option>
                  <option value="SESSIONS_DECIDED">SESSIONS_DECIDED</option>
                  <option value="SURVEY_OPEN">SURVEY_OPEN</option>
                  <option value="SURVEY_CLOSED">SURVEY_CLOSED</option>
                  <option value="AI_DRAFTED">AI_DRAFTED</option>
                  <option value="SHIFT_CONFIRMED">SHIFT_CONFIRMED</option>
                  <option value="NOTIFIED">NOTIFIED</option>
                </select>
              </label>
              <label className="dev-panel-field">
                <span>未回答数</span>
                <input
                  type="number"
                  min={0}
                  value={demoUnanswered}
                  onChange={(event) => setDemoUnanswered(event.target.value)}
                />
              </label>
              <label className="dev-panel-field">
                <span>demo-role</span>
                <select
                  value={demoRoleDraft}
                  onChange={(event) => setDemoRoleDraft(event.target.value as "admin" | "member")}
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </label>
              <div className="dev-panel-actions">
                <button type="button" className="button button-small" onClick={applyDemoControls}>
                  Apply
                </button>
                <button type="button" className="button button-small" onClick={resetDemoControls}>
                  Reset DEMO
                </button>
              </div>
            </aside>
          )}
        </>
      )}
    </div>
  );
}
