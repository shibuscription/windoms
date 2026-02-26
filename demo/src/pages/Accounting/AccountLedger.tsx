import { Link, useSearchParams } from "react-router-dom";
import { ledgerRowsForAccount } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { useAccountingStore } from "../../accounting/useAccountingStore";

export function AccountLedger() {
  const { store } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const periodId = searchParams.get("period") ?? store.currentPeriodId;
  const accountKey = searchParams.get("account") ?? "";
  const period = store.periods.find((item) => item.periodId === periodId);
  const account = period?.accounts.find((item) => item.accountKey === accountKey);

  if (!period || !account) {
    return (
      <section className="card accounting-page">
        <h1>口座通帳</h1>
        <p>対象データが見つかりません。</p>
        <Link to="/accounting" className="button">
          会計トップへ戻る
        </Link>
      </section>
    );
  }

  const rows = ledgerRowsForAccount(period, accountKey);

  return (
    <section className="card accounting-page">
      <h1>口座通帳</h1>
      <p className="muted">
        {period.label} / {account.label}
      </p>
      <div className="accounting-small-links">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
        <Link to={`/accounting/report?period=${period.periodId}`} className="button button-small button-secondary">
          収支計算書
        </Link>
      </div>
      <div className="accounting-ledger-table-wrap">
        <table className="accounting-ledger-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>種別</th>
              <th>科目</th>
              <th>メモ</th>
              <th>金額</th>
              <th>残高</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{period.startDate}</td>
              <td>期首</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>{formatMoney(account.openingBalance)}</td>
            </tr>
            {rows.map((row) => (
              <tr key={row.transactionId}>
                <td>{row.date}</td>
                <td>{row.kindLabel}</td>
                <td>{row.subjectLabel}</td>
                <td>{row.memo || "-"}</td>
                <td>{formatMoney(row.signedAmount)}</td>
                <td>{formatMoney(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
