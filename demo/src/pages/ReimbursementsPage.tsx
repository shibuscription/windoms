import { useMemo } from "react";
import type { DemoData, Reimbursement, ReimbursementStatus } from "../types";

type ReimbursementsPageProps = {
  data: DemoData;
  updateReimbursements: (updater: (prev: Reimbursement[]) => Reimbursement[]) => void;
};

const resolveReimbursementStatus = (
  paidByTreasurerAt?: string,
  receivedByBuyerAt?: string,
): ReimbursementStatus => {
  if (paidByTreasurerAt && receivedByBuyerAt) return "DONE";
  if (paidByTreasurerAt) return "PAID_BY_TREASURER";
  if (receivedByBuyerAt) return "RECEIVED_BY_BUYER";
  return "OPEN";
};

const toDateLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", { hour12: false });
};

const reimbursementStatusLabel: Record<ReimbursementStatus, string> = {
  OPEN: "精算待ち",
  PAID_BY_TREASURER: "会計支払済",
  RECEIVED_BY_BUYER: "受領確認済",
  DONE: "完了",
};

export function ReimbursementsPage({ data, updateReimbursements }: ReimbursementsPageProps) {
  const rows = useMemo(
    () =>
      [...data.reimbursements].sort((a, b) => {
        const aStatus = resolveReimbursementStatus(a.paidByTreasurerAt, a.receivedByBuyerAt);
        const bStatus = resolveReimbursementStatus(b.paidByTreasurerAt, b.receivedByBuyerAt);
        const aDone = aStatus === "DONE";
        const bDone = bStatus === "DONE";
        if (aDone !== bDone) return aDone ? 1 : -1;
        return b.purchasedAt.localeCompare(a.purchasedAt);
      }),
    [data.reimbursements],
  );

  return (
    <section className="card reimbursements-page">
      <header className="reimbursements-header">
        <h1>立替</h1>
      </header>
      <div className="reimbursements-list">
        {rows.map((item) => {
          const status = resolveReimbursementStatus(
            item.paidByTreasurerAt,
            item.receivedByBuyerAt,
          );
          return (
            <article key={item.id} className="reimbursement-card">
              <div className="reimbursement-card-top">
                <strong>{item.title}</strong>
                <span className={`reimbursement-status ${status === "DONE" ? "done" : "open"}`}>
                  {reimbursementStatusLabel[status]}
                </span>
              </div>
              <p className="reimbursement-meta">
                <span>金額: {item.amount.toLocaleString()}円</span>
                <span>購入日: {toDateLabel(item.purchasedAt)}</span>
                <span>購入者: {data.users[item.buyer]?.displayName ?? item.buyer}</span>
              </p>
              {item.receipt && <p className="muted">領収書: {item.receipt}</p>}
              {item.relatedPurchaseRequestId && (
                <p className="muted">関連購入依頼: {item.relatedPurchaseRequestId}</p>
              )}
              {item.memo && <p className="muted">{item.memo}</p>}
              <div className="reimbursement-actions">
                <button
                  type="button"
                  className="button button-small"
                  disabled={Boolean(item.paidByTreasurerAt)}
                  onClick={() => {
                    const now = new Date().toISOString();
                    updateReimbursements((prev) =>
                      prev.map((row) =>
                        row.id === item.id
                          ? { ...row, paidByTreasurerAt: row.paidByTreasurerAt ?? now }
                          : row,
                      ),
                    );
                  }}
                >
                  会計が支払った
                </button>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  disabled={Boolean(item.receivedByBuyerAt)}
                  onClick={() => {
                    const now = new Date().toISOString();
                    updateReimbursements((prev) =>
                      prev.map((row) =>
                        row.id === item.id
                          ? { ...row, receivedByBuyerAt: row.receivedByBuyerAt ?? now }
                          : row,
                      ),
                    );
                  }}
                >
                  購入者が受領した
                </button>
              </div>
              {(item.paidByTreasurerAt || item.receivedByBuyerAt) && (
                <p className="reimbursement-stamps muted">
                  会計支払: {toDateLabel(item.paidByTreasurerAt ?? "")} / 受領確認:{" "}
                  {toDateLabel(item.receivedByBuyerAt ?? "")}
                </p>
              )}
              {status === "DONE" && (
                <>
                  <button type="button" className="button button-small button-secondary" disabled>
                    会計に支出を記録（今後）
                  </button>
                  <p className="muted">会計側への反映は片方向で、逆同期は行いません。</p>
                </>
              )}
            </article>
          );
        })}
        {rows.length === 0 && <p className="muted">立替データはありません。</p>}
      </div>
    </section>
  );
}
