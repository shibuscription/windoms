import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { LogPage } from "./pages/LogPage";
import { ActivityPlanPage } from "./pages/ActivityPlanPage";
import { mockData } from "./data/mockData";
import type { DayLog, DemoData, DemoRsvp } from "./types";
import { formatDateYmd, formatWeekdayJa, todayDateKey, weekdayTone } from "./utils/date";

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  to: string;
  isActive: (location: { pathname: string; search: string }) => boolean;
};

type MenuSection = {
  id: string;
  heading: string;
  items: MenuItem[];
};

const viewIsActive = (location: { pathname: string; search: string }, view: string) =>
  location.pathname === "/today" && new URLSearchParams(location.search).get("view") === view;

const menuSections = (today: string): MenuSection[] => [
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
        isActive: (location) => location.pathname === "/activity-plan",
      },
      {
        id: "watch",
        label: "見守り",
        icon: "👀",
        to: "/today?view=watch",
        isActive: (location) => viewIsActive(location, "watch"),
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
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayDateKey();

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
    { id: "todo", icon: "✅", label: "My TODO", badge: 3 },
    { id: "duty", icon: "📅", label: "次の当番", badge: 1 },
  ];
  const statusPanelMeta: Record<
    "notice" | "todo" | "duty",
    { title: string; subtitle: string; items: string[] }
  > = {
    notice: {
      title: "Notices",
      subtitle: "お知らせ（DEMO）",
      items: [
        "本日 16:30 片付け開始です。",
        "週末本番の集合は 8:40 正門前です。",
        "譜面台の不足分を職員室で受け取りください。",
      ],
    },
    todo: {
      title: "My TODO",
      subtitle: "担当TODO（DEMO）",
      items: [
        "打楽器チェックリストを更新する",
        "本番用チラシを配布する",
        "見守り当番の最終確認を行う",
      ],
    },
    duty: {
      title: "次の当番",
      subtitle: "当番予定（DEMO）",
      items: [
        "日時: 2026-02-21 09:00-12:00",
        "場所: 第1音楽室",
        "備考: 入室前に出欠確認をお願いします。",
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
              {menuSections(today).map((section) => (
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
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
