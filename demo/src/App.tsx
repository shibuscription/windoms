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
  allowedRoles: DemoMenuRole[];
  badgeText?: string;
  isActive: (location: { pathname: string; search: string }) => boolean;
};

type MenuSection = {
  id: string;
  heading: string;
  items: MenuItem[];
};

type DemoMenuRole = "child" | "parent" | "admin";

type DemoNotification = {
  id: string;
  title: string;
  type: "actionable" | "info";
  read: boolean;
  resolved: boolean;
};

type DemoTodo = {
  id: string;
  title: string;
  scope: "shared" | "private";
  done: boolean;
};

const viewIsActive = (location: { pathname: string; search: string }, view: string) =>
  location.pathname === "/today" && new URLSearchParams(location.search).get("view") === view;

const DEMO_MENU_ROLE_KEY = "windoms_demo_role";

const menuSections = (
  today: string,
  activityPlanBadgeText: string | undefined,
  role: DemoMenuRole,
): MenuSection[] => {
  const sections: MenuSection[] = [
    {
      id: "activity",
      heading: "活動",
      items: [
        {
          id: "today",
          label: "Today",
          icon: "📅",
          to: "/today",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => location.pathname === "/today" && !location.search,
        },
        {
          id: "calendar",
          label: "カレンダー",
          icon: "🗓️",
          to: "/today?view=calendar",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "calendar"),
        },
        {
          id: "duty-log",
          label: "当番日誌",
          icon: "📝",
          to: `/logs/${today}`,
          allowedRoles: ["parent", "admin"],
          isActive: (location) => location.pathname.startsWith("/logs/"),
        },
        {
          id: "practice-log",
          label: "練習日誌",
          icon: "✍️",
          to: "/today?view=practice-log",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "practice-log"),
        },
        {
          id: "homework",
          label: "宿題",
          icon: "📘",
          to: "/today?view=homework",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "homework"),
        },
        {
          id: "todo",
          label: "TODO",
          icon: "✅",
          to: "/today?view=todo",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => viewIsActive(location, "todo"),
        },
        {
          id: "event",
          label: "イベント",
          icon: "🎪",
          to: "/today?view=event",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "event"),
        },
        {
          id: "shift-create",
          label: "シフト作成",
          icon: "🧭",
          to: "/activity-plan",
          allowedRoles: ["admin"],
          badgeText: activityPlanBadgeText,
          isActive: (location) => location.pathname === "/activity-plan",
        },
      ],
    },
    {
      id: "accounting",
      heading: "会計",
      items: [
        {
          id: "purchase-request",
          label: "購入依頼",
          icon: "🛍️",
          to: "/today?view=purchase-request",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => viewIsActive(location, "purchase-request"),
        },
        {
          id: "reimbursement",
          label: "立替",
          icon: "🧾",
          to: "/today?view=reimbursement",
          allowedRoles: ["parent", "admin"],
          isActive: (location) => viewIsActive(location, "reimbursement"),
        },
        {
          id: "accounting",
          label: "会計",
          icon: "💰",
          to: "/today?view=accounting",
          allowedRoles: ["admin"],
          isActive: (location) => viewIsActive(location, "accounting"),
        },
      ],
    },
    {
      id: "assets",
      heading: "資産",
      items: [
        {
          id: "instruments",
          label: "楽器",
          icon: "🎷",
          to: "/today?view=instruments",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "instruments"),
        },
        {
          id: "scores",
          label: "楽譜",
          icon: "🎼",
          to: "/today?view=scores",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "scores"),
        },
        {
          id: "docs",
          label: "資料",
          icon: "📁",
          to: "/today?view=docs",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "docs"),
        },
        {
          id: "members",
          label: "メンバー",
          icon: "👥",
          to: "/today?view=members",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "members"),
        },
        {
          id: "links",
          label: "リンク集",
          icon: "🔗",
          to: "/today?view=links",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "links"),
        },
      ],
    },
    {
      id: "settings",
      heading: "設定",
      items: [
        {
          id: "settings",
          label: "設定",
          icon: "⚙️",
          to: "/today?view=settings",
          allowedRoles: ["child", "parent", "admin"],
          isActive: (location) => viewIsActive(location, "settings"),
        },
      ],
    },
  ];

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.allowedRoles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
};

export function App() {
  const [data, setData] = useState<DemoData>(mockData);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeStatusPanel, setActiveStatusPanel] = useState<"notice" | "todo" | null>(
    null,
  );
  const [noticeTab, setNoticeTab] = useState<"pending" | "history">("pending");
  const [notifications, setNotifications] = useState<DemoNotification[]>([
    { id: "n1", title: "当番可否アンケートの回答期限が近づいています", type: "actionable", read: false, resolved: false },
    { id: "n2", title: "3月の活動予定が通知されました", type: "info", read: false, resolved: true },
    { id: "n3", title: "見守り当番の調整が未完了です", type: "actionable", read: true, resolved: false },
  ]);
  const [todos, setTodos] = useState<DemoTodo[]>([
    { id: "t1", title: "活動予定の備考を最終確認", scope: "shared", done: false },
    { id: "t2", title: "本番配布資料の部数確認", scope: "shared", done: false },
    { id: "t3", title: "印刷物を職員室へ提出", scope: "private", done: false },
  ]);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [demoMenuRole, setDemoMenuRole] = useState<DemoMenuRole>(() => {
    const saved = window.localStorage.getItem(DEMO_MENU_ROLE_KEY);
    return saved === "child" || saved === "parent" || saved === "admin" ? saved : "admin";
  });
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
  const visibleMenuSections = useMemo(
    () => menuSections(today, activityPlanBadgeText, demoMenuRole),
    [today, activityPlanBadgeText, demoMenuRole],
  );

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

  const unreadNotificationCount = notifications.filter((item) => !item.read).length;
  const incompleteTodoCount = todos.filter((item) => !item.done).length;
  const statusButtons: Array<{ id: "notice" | "todo"; icon: string; label: string; badge: number }> = [
    { id: "notice", icon: "🔔", label: "Notices", badge: unreadNotificationCount },
    { id: "todo", icon: "✅", label: "My TODO", badge: incompleteTodoCount + (hasShiftSurveyTodo ? 1 : 0) },
  ];
  const pendingNotifications = notifications.filter(
    (item) => item.type === "actionable" && !item.resolved,
  );
  const historyNotifications = notifications.filter(
    (item) => item.read || item.type === "info",
  );
  const sharedTodos = todos.filter((item) => !item.done && item.scope === "shared");
  const privateTodos = todos.filter((item) => !item.done && item.scope === "private");
  const nextDutyText = "次の当番：2/21(土) 9:00-12:00";

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
    window.localStorage.setItem(DEMO_MENU_ROLE_KEY, "admin");
    window.location.reload();
  };

  const updateDemoMenuRole = (nextRole: DemoMenuRole) => {
    setDemoMenuRole(nextRole);
    window.localStorage.setItem(DEMO_MENU_ROLE_KEY, nextRole);
  };

  const confirmTodoCompletion = (todoId: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === todoId ? { ...todo, done: true } : todo,
      ),
    );
    setPendingTodoId(null);
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
                onClick={() => {
                  if (item.id === "notice") setNoticeTab("pending");
                  setActiveStatusPanel((prev) => (prev === item.id ? null : item.id));
                }}
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
          {nextDutyText && <span className="next-duty-text">{nextDutyText}</span>}
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
              {visibleMenuSections.map((section) => (
                <section key={section.id} className="menu-section">
                  <h2 className="menu-section-title">{section.heading}</h2>
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
            {activeStatusPanel === "notice" && (
              <>
                <p className="status-panel-subtitle">システム通知（DEMO）</p>
                <h2 className="status-panel-title">通知センター</h2>
                <div className="status-panel-tabs">
                  <button
                    type="button"
                    className={`status-panel-tab ${noticeTab === "pending" ? "active" : ""}`}
                    onClick={() => setNoticeTab("pending")}
                  >
                    未処理
                  </button>
                  <button
                    type="button"
                    className={`status-panel-tab ${noticeTab === "history" ? "active" : ""}`}
                    onClick={() => setNoticeTab("history")}
                  >
                    履歴
                  </button>
                </div>
                <ul className="status-panel-list">
                  {(noticeTab === "pending" ? pendingNotifications : historyNotifications).map((item) => (
                    <li
                      key={item.id}
                      className="status-notice-row"
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((notice) =>
                            notice.id === item.id ? { ...notice, read: true } : notice,
                          ),
                        )
                      }
                    >
                      <span className={item.read ? "" : "status-unread"}>
                        {item.title}
                        {!item.read && <span className="status-new-tag">NEW</span>}
                      </span>
                      {item.type === "actionable" && !item.resolved && (
                        <button
                          type="button"
                          className="button button-small"
                          onClick={(event) => {
                            event.stopPropagation();
                            setNotifications((prev) =>
                              prev.map((notice) =>
                                notice.id === item.id ? { ...notice, resolved: true, read: true } : notice,
                              ),
                            );
                          }}
                        >
                          解消
                        </button>
                      )}
                    </li>
                  ))}
                  {noticeTab === "pending" && pendingNotifications.length === 0 && <li>未処理通知はありません</li>}
                  {noticeTab === "history" && historyNotifications.length === 0 && <li>履歴はありません</li>}
                </ul>
              </>
            )}
            {activeStatusPanel === "todo" && (
              <>
                <p className="status-panel-subtitle">担当TODO（DEMO）</p>
                <h2 className="status-panel-title">TODO</h2>
                <div className="status-todo-section">
                  <h3>共有TODO</h3>
                  <ul className="status-panel-list">
                    {sharedTodos.map((item) => (
                      <li key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => setPendingTodoId(item.id)}
                          />
                          <span>{item.title}</span>
                        </label>
                      </li>
                    ))}
                    {sharedTodos.length === 0 && <li>共有TODOはありません</li>}
                  </ul>
                </div>
                <div className="status-todo-section">
                  <h3>個人TODO</h3>
                  <ul className="status-panel-list">
                    {privateTodos.map((item) => (
                      <li key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => setPendingTodoId(item.id)}
                          />
                          <span>{item.title}</span>
                        </label>
                      </li>
                    ))}
                    {privateTodos.length === 0 && <li>個人TODOはありません</li>}
                  </ul>
                </div>
                {hasShiftSurveyTodo && (
                  <div className="status-todo-section">
                    <h3>アンケート</h3>
                    <ul className="status-panel-list">
                      <li>
                        <span>当番可否アンケートに回答してください（未回答 {unansweredCount} 件）</span>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => {
                            setActiveStatusPanel(null);
                            navigate(shiftSurveyPath);
                          }}
                        >
                          回答する
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {pendingTodoId && (
        <div className="modal-backdrop" onClick={() => setPendingTodoId(null)}>
          <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="モーダルを閉じる"
              onClick={() => setPendingTodoId(null)}
            >
              ×
            </button>
            <p className="modal-context">完了にしますか？</p>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPendingTodoId(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={() => confirmTodoCompletion(pendingTodoId)}
              >
                完了する
              </button>
            </div>
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
              <label className="dev-panel-field">
                <span>表示ロール（MENU）</span>
                <select
                  value={demoMenuRole}
                  onChange={(event) => updateDemoMenuRole(event.target.value as DemoMenuRole)}
                >
                  <option value="child">child</option>
                  <option value="parent">parent</option>
                  <option value="admin">admin</option>
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
