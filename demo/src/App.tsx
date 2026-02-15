import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { LogPage } from "./pages/LogPage";
import { mockData } from "./data/mockData";
import type { DayLog, DemoData, DemoRsvp } from "./types";
import { formatDateYmd, formatWeekdayJa, todayDateKey, weekdayTone } from "./utils/date";

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  to: string;
  isActive: (pathname: string) => boolean;
};

const menuItems = (today: string): MenuItem[] => [
  { id: "today", label: "Today", icon: "📅", to: "/today", isActive: (p) => p === "/today" },
  { id: "log", label: "日誌", icon: "📝", to: `/logs/${today}`, isActive: (p) => p.startsWith("/logs/") },
  { id: "schedule", label: "スケジュール", icon: "🗓️", to: "/today?view=schedule", isActive: () => false },
  { id: "todo", label: "TODO", icon: "✅", to: "/today?view=todo", isActive: () => false },
  { id: "accounting", label: "会計", icon: "💰", to: "/today?view=accounting", isActive: () => false },
  { id: "instruments", label: "楽器", icon: "🎷", to: "/today?view=instruments", isActive: () => false },
  { id: "scores", label: "楽譜", icon: "🎼", to: "/today?view=scores", isActive: () => false },
  { id: "docs", label: "資料", icon: "📁", to: "/today?view=docs", isActive: () => false },
  { id: "members", label: "メンバー", icon: "👥", to: "/today?view=members", isActive: () => false },
  { id: "links", label: "リンク集", icon: "🔗", to: "/today?view=links", isActive: () => false },
  { id: "settings", label: "設定", icon: "⚙️", to: "/today?view=settings", isActive: () => false },
];

export function App() {
  const [data, setData] = useState<DemoData>(mockData);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayDateKey();

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isMenuOpen]);

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
        <button
          type="button"
          className="menu-trigger"
          aria-label="メニューを開く"
          onClick={() => setIsMenuOpen(true)}
        >
          ☰
        </button>
      </header>
      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/today"
            element={<TodayPage data={context.data} updateDayLog={context.updateDayLog} />}
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
            <div className="menu-grid">
              {menuItems(today).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`menu-item ${item.isActive(location.pathname) ? "active" : ""}`}
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
          </div>
        </div>
      )}
    </div>
  );
}
