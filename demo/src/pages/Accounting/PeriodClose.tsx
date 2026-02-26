import { useMemo, useState } from "react";
import { formatMoney } from "../../accounting/format";
import type { AccountingPeriod } from "../../accounting/model";

type Props = {
  period: AccountingPeriod;
  canManage: boolean;
  closePeriod: () => void;
  reopenPeriod: (periodId: string) => { ok: boolean; reason?: string };
  updateAccount: (accountKey: string, patch: { label?: string; openingBalance?: number }) => void;
};

export function PeriodClose({ period, canManage, closePeriod, reopenPeriod, updateAccount }: Props) {
  const [message, setMessage] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, { label: string; openingBalance: string }>>({});

  const mergedDrafts = useMemo(
    () =>
      period.accounts.map((account) => {
        const draft = drafts[account.accountKey];
        return {
          ...account,
          draftLabel: draft?.label ?? account.label,
          draftOpeningBalance: draft?.openingBalance ?? String(account.openingBalance),
        };
      }),
    [period.accounts, drafts]
  );

  const saveAccount = (accountKey: string) => {
    const target = mergedDrafts.find((item) => item.accountKey === accountKey);
    if (!target) return;
    const parsed = Number(target.draftOpeningBalance);
    if (!Number.isFinite(parsed)) {
      setMessage("期首残高は数値で入力してください");
      return;
    }
    updateAccount(accountKey, { label: target.draftLabel.trim() || target.label, openingBalance: parsed });
    setMessage("口座設定を更新しました");
  };

  return (
    <section className="card accounting-subcard">
      <h3>期管理</h3>
      <p className="muted">現在の期: {period.label}（{period.status === "open" ? "編集中" : "締め済み"}）</p>
      {!canManage && <p className="muted">年度締め・締め解除は権限者のみ実行できます。</p>}
      {canManage && period.status === "open" && (
        <button type="button" className="button" onClick={closePeriod}>
          年度を締めて繰越
        </button>
      )}
      {canManage && period.status === "closed" && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            const result = reopenPeriod(period.periodId);
            if (!result.ok) {
              setMessage(result.reason ?? "締め解除できませんでした");
              return;
            }
            setMessage("締め解除しました");
          }}
        >
          締め解除
        </button>
      )}

      <div className="accounting-account-edit-list">
        {mergedDrafts.map((account) => (
          <div key={account.accountKey} className="accounting-account-edit-row">
            <label>
              表示名
              <input
                value={account.draftLabel}
                disabled={period.status === "closed"}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [account.accountKey]: {
                      label: event.target.value,
                      openingBalance: current[account.accountKey]?.openingBalance ?? account.draftOpeningBalance,
                    },
                  }))
                }
              />
            </label>
            <label>
              期首残高
              <input
                type="number"
                value={account.draftOpeningBalance}
                disabled={period.status === "closed"}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [account.accountKey]: {
                      label: current[account.accountKey]?.label ?? account.draftLabel,
                      openingBalance: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <div className="accounting-account-edit-actions">
              <span className="muted">{formatMoney(account.openingBalance)}</span>
              <button
                type="button"
                className="button button-small"
                disabled={period.status === "closed"}
                onClick={() => saveAccount(account.accountKey)}
              >
                保存
              </button>
            </div>
          </div>
        ))}
      </div>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
