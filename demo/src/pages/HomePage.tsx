import { Link } from "react-router-dom";

export function HomePage() {
  return (
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
  );
}
