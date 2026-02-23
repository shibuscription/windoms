import { Link } from "react-router-dom";
import { getActivityPlanTargetMonthKey, readActivityPlanStatus, readDemoRole, readDemoUnansweredCount } from "../utils/activityPlan";

export function HomePage() {
  const isAdmin = readDemoRole() === "admin";
  const monthKey = getActivityPlanTargetMonthKey();
  const status = readActivityPlanStatus(monthKey);
  const unansweredCount = readDemoUnansweredCount(monthKey);

  const todoCard =
    isAdmin && status === "SURVEY_OPEN" && unansweredCount > 0
      ? {
          title: "📝 当番可否アンケートが開いています",
          body: `未回答 ${unansweredCount} 件があります`,
        }
      : isAdmin && status === "SHIFT_CONFIRMED"
        ? {
            title: "🔔 シフト確定済（通知待ち）",
            body: "通知前の最終確認を行ってください。",
          }
        : isAdmin && status === "AI_DRAFTED"
          ? {
              title: "🤖 AI仮割当が可能です",
              body: "必要に応じて手修正して確定へ進んでください。",
            }
          : null;

  return (
    <div className="home-cards">
      {todoCard && (
        <section className="card">
          <h2>{todoCard.title}</h2>
          <p>{todoCard.body}</p>
          <Link to="/activity-plan" className="button">
            活動予定を開く
          </Link>
        </section>
      )}
      <section className="card">
        <h1>Windoms 役員向けデモ</h1>
        <p>
          このデモはバックエンドなしで、画面遷移・文言・基本操作を確認するための静的SPAです。
        </p>
        <p>保存は画面内のみ反映され、リロードすると初期状態に戻ります。</p>
        <Link to="/today" className="button">
          今日を見る
        </Link>
      </section>
    </div>
  );
}
