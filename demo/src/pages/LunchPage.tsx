import { Link, useSearchParams } from "react-router-dom";
import { isValidDateKey, todayDateKey } from "../utils/date";

export function LunchPage() {
  const [searchParams] = useSearchParams();
  const today = todayDateKey();
  const queryDate = searchParams.get("date") ?? "";
  const date = queryDate && isValidDateKey(queryDate) ? queryDate : today;

  return (
    <section className="card">
      <h1>お弁当</h1>
      <p>対象日: {date}</p>
      <p>このモジュールはDEMO未実装です。</p>
      <Link to={`/today?date=${date}`} className="button">
        Todayへ戻る
      </Link>
    </section>
  );
}
