import { Link, useSearchParams } from "react-router-dom";
import { getActivityPlanTargetMonthKey } from "../utils/activityPlan";

export function ShiftSurveyPage() {
  const [searchParams] = useSearchParams();
  const monthParam = searchParams.get("month") ?? "";
  const monthKey = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : getActivityPlanTargetMonthKey();

  return (
    <section className="card">
      <h1>当番可否アンケート</h1>
      <p>対象月: {monthKey}</p>
      <p>このモジュールは準備中です</p>
      <p className="muted">このURLをLINE等で共有して回答を促す想定です。</p>
      <Link to="/activity-plan" className="button">
        活動予定へ戻る
      </Link>
    </section>
  );
}
