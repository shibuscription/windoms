import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FIXED_ACCOUNTS } from "../../accounting/fixedAccounts";
import { totalClosingBalance, totalExpense, totalIncome } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { useAccountingStore } from "../../accounting/useAccountingStore";

type AccountingPeriodsProps = {
  canManageYear: boolean;
};

type AccountDraft = {
  accountId?: string;
  name: string;
  sortOrder: string;
  isActive: boolean;
};

const currentFiscalYear = (): number => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month <= 3 ? year - 1 : year;
};

const emptyAccountDraft = (): AccountDraft => ({
  accountId: undefined,
  name: "",
  sortOrder: "",
  isActive: true,
});

export function AccountingPeriods({ canManageYear }: AccountingPeriodsProps) {
  const {
    periodsSorted,
    currentPeriod,
    accountsSorted,
    closeCurrentPeriodAndCarryOver,
    saveAccountingAccount,
    createInitialAccountingAccounts,
    startAccountingPeriod,
    loading,
    error,
  } = useAccountingStore();
  const [closingError, setClosingError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [accountDraft, setAccountDraft] = useState<AccountDraft>(() => emptyAccountDraft());
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false);
  const [startFiscalYear, setStartFiscalYear] = useState<string>(() => String(currentFiscalYear()));
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const [isStartingPeriod, setIsStartingPeriod] = useState(false);

  const pastPeriods = periodsSorted.filter((period) => period.periodId !== currentPeriod?.periodId && period.state === "closed");
  const activeAccounts = useMemo(() => accountsSorted.filter((account) => account.isActive), [accountsSorted]);

  const submitClose = async () => {
    try {
      setClosingError(null);
      setIsClosing(true);
      await closeCurrentPeriodAndCarryOver();
    } catch (nextError) {
      setClosingError(nextError instanceof Error ? nextError.message : "年度締めに失敗しました。");
    } finally {
      setIsClosing(false);
    }
  };

  const startEditAccount = (account: (typeof accountsSorted)[number]) => {
    setAccountDraft({
      accountId: account.accountId,
      name: account.name,
      sortOrder: String(account.sortOrder),
      isActive: account.isActive,
    });
    setAccountError(null);
  };

  const resetAccountDraft = () => {
    setAccountDraft(emptyAccountDraft());
    setAccountError(null);
  };

  const submitAccount = async () => {
    const normalizedName = accountDraft.name.trim();
    const normalizedSortOrder =
      accountDraft.sortOrder.trim() === "" ? 0 : Number(accountDraft.sortOrder);
    if (!normalizedName) {
      setAccountError("口座名は必須です。");
      return;
    }
    if (!Number.isFinite(normalizedSortOrder)) {
      setAccountError("並び順は数値で入力してください。");
      return;
    }

    try {
      setIsSavingAccount(true);
      setAccountError(null);
      await saveAccountingAccount({
        accountId: accountDraft.accountId,
        name: normalizedName,
        sortOrder: normalizedSortOrder,
        isActive: accountDraft.isActive,
      });
      resetAccountDraft();
    } catch (nextError) {
      setAccountError(nextError instanceof Error ? nextError.message : "口座設定を保存できませんでした。");
    } finally {
      setIsSavingAccount(false);
    }
  };

  const submitInitialAccounts = async () => {
    try {
      setSetupError(null);
      setIsCreatingDefaults(true);
      await createInitialAccountingAccounts();
    } catch (nextError) {
      setSetupError(nextError instanceof Error ? nextError.message : "初期口座を追加できませんでした。");
    } finally {
      setIsCreatingDefaults(false);
    }
  };

  const submitStartPeriod = async () => {
    const fiscalYear = Number(startFiscalYear);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 3000) {
      setStartError("年度を正しく入力してください。");
      return;
    }
    if (activeAccounts.length === 0) {
      setStartError("有効な口座がありません。先に口座設定を行ってください。");
      return;
    }

    const nextOpeningBalances: Record<string, number> = {};
    for (const account of activeAccounts) {
      const raw = openingBalances[account.accountId] ?? "";
      if (raw.trim() === "") {
        nextOpeningBalances[account.accountId] = 0;
        continue;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        setStartError(`「${account.name}」の期首残高は 0 以上の数値で入力してください。`);
        return;
      }
      nextOpeningBalances[account.accountId] = value;
    }

    try {
      setStartError(null);
      setIsStartingPeriod(true);
      await startAccountingPeriod({ fiscalYear, openingBalances: nextOpeningBalances });
    } catch (nextError) {
      setStartError(nextError instanceof Error ? nextError.message : "会計期を開始できませんでした。");
    } finally {
      setIsStartingPeriod(false);
    }
  };

  if (loading) {
    return (
      <section className="card accounting-page">
        <h1>期管理</h1>
        <p className="muted">期データを読み込んでいます...</p>
      </section>
    );
  }

  return (
    <section className="card accounting-page">
      <h1>期管理</h1>
      {error && <p className="field-error">{error}</p>}
      {closingError && <p className="field-error">{closingError}</p>}
      <div className="accounting-small-links">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
      </div>

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">口座設定</h3>
        {setupError && <p className="field-error">{setupError}</p>}
        {accountsSorted.length === 0 ? (
          <>
            <p className="muted">まだ口座がありません。まず口座を用意すると、会計期を開始できます。</p>
            <div className="accounting-account-edit-list">
              {FIXED_ACCOUNTS.map((account) => (
                <article key={account.accountId} className="accounting-account-edit-row">
                  <strong>{account.name}</strong>
                  <span className="muted">並び順: {account.sortOrder}</span>
                  <span className="muted">初期状態: 有効</span>
                </article>
              ))}
            </div>
            <div className="accounting-small-links">
              <button type="button" className="button" onClick={() => void submitInitialAccounts()} disabled={isCreatingDefaults}>
                初期3口座を追加
              </button>
            </div>
          </>
        ) : (
          <div className="accounting-account-edit-list">
            {accountsSorted.map((account) => (
              <article key={account.accountId} className="accounting-account-edit-row">
                <strong>{account.name}</strong>
                <span className="muted">並び順: {account.sortOrder}</span>
                <span className="muted">状態: {account.isActive ? "有効" : "無効"}</span>
                <div className="accounting-account-edit-actions">
                  <span className="muted">ID: {account.accountId}</span>
                  <button
                    type="button"
                    className="button button-small button-secondary"
                    onClick={() => startEditAccount(account)}
                  >
                    編集
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="accounting-account-edit-row">
          <strong>{accountDraft.accountId ? "口座を編集" : "口座を追加"}</strong>
          <label>
            口座名
            <input
              value={accountDraft.name}
              onChange={(event) => setAccountDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例: 現金（会計手元金）"
            />
          </label>
          <label>
            並び順
            <input
              type="number"
              value={accountDraft.sortOrder}
              onChange={(event) => setAccountDraft((prev) => ({ ...prev, sortOrder: event.target.value }))}
              placeholder="未入力時は 0"
            />
          </label>
          <label className="purchase-option-check">
            <input
              type="checkbox"
              checked={accountDraft.isActive}
              onChange={(event) => setAccountDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            <span>有効にする</span>
          </label>
          {accountError && <p className="field-error">{accountError}</p>}
          <div className="accounting-small-links">
            <button type="button" className="button" onClick={() => void submitAccount()} disabled={isSavingAccount}>
              {accountDraft.accountId ? "更新" : "追加"}
            </button>
            {accountDraft.accountId && (
              <button type="button" className="button button-small button-secondary" onClick={resetAccountDraft}>
                新規入力に戻す
              </button>
            )}
          </div>
        </div>
      </section>

      {!currentPeriod && (
        <section className="card accounting-subcard">
          <h3 className="accounting-section-heading">会計期を開始</h3>
          {accountsSorted.length === 0 ? (
            <p className="muted">先に口座設定を行ってください。</p>
          ) : activeAccounts.length === 0 ? (
            <p className="muted">有効な口座がありません。口座設定で利用する口座を有効にしてください。</p>
          ) : (
            <>
              <p className="muted">最初の会計期を開始すると、各有効口座の期首残高を設定できます。未入力は 0 円として扱います。</p>
              <label>
                年度
                <input
                  type="number"
                  value={startFiscalYear}
                  onChange={(event) => setStartFiscalYear(event.target.value)}
                  placeholder="例: 2026"
                />
              </label>
              <div className="accounting-account-edit-list">
                {activeAccounts.map((account) => (
                  <label key={account.accountId} className="accounting-account-edit-row">
                    <strong>{account.name}</strong>
                    <span className="muted">並び順: {account.sortOrder}</span>
                    <input
                      type="number"
                      min={0}
                      value={openingBalances[account.accountId] ?? ""}
                      onChange={(event) =>
                        setOpeningBalances((prev) => ({ ...prev, [account.accountId]: event.target.value }))
                      }
                      placeholder="0"
                    />
                  </label>
                ))}
              </div>
              {startError && <p className="field-error">{startError}</p>}
              <div className="accounting-small-links">
                <button type="button" className="button" onClick={() => void submitStartPeriod()} disabled={isStartingPeriod}>
                  会計期を開始
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">現在の期</h3>
        {currentPeriod ? (
          <>
            <strong>{currentPeriod.label}</strong>
            <span className="muted">状態: {currentPeriod.state === "editing" ? "editing" : "closed"}</span>
            <span className="muted">
              収入 {formatMoney(totalIncome(currentPeriod))} / 支出 {formatMoney(totalExpense(currentPeriod))}
            </span>
            <span className="muted">期末残高 {formatMoney(totalClosingBalance(currentPeriod))}</span>
            {currentPeriod.state === "editing" ? (
              canManageYear ? (
                <button type="button" className="button" onClick={() => void submitClose()} disabled={isClosing}>
                  年度を締めて繰越
                </button>
              ) : (
                <p className="muted">年度締めは権限者（会長・会計）のみ実行できます。</p>
              )
            ) : (
              <p className="muted">現在の期は確定済みです（閲覧のみ）。</p>
            )}
          </>
        ) : (
          <p className="muted">現在の期はまだ設定されていません。</p>
        )}
      </section>

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">過去の期一覧（確定済み）</h3>
        <div className="accounting-period-list">
          {pastPeriods.length === 0 && <p className="muted">まだ過去期はありません。</p>}
          {pastPeriods.map((period) => (
            <article key={period.periodId} className="accounting-period-card">
              <strong>{period.label}</strong>
              <span className="muted">状態: {period.state === "editing" ? "editing" : "closed"}</span>
              <span className="muted">
                収入 {formatMoney(totalIncome(period))} / 支出 {formatMoney(totalExpense(period))}
              </span>
              <span className="muted">期末残高 {formatMoney(totalClosingBalance(period))}</span>
              <div className="accounting-small-links">
                <Link to={`/accounting/report?period=${period.periodId}`} className="button button-small button-secondary">
                  収支計算書
                </Link>
                {period.accounts[0] && (
                  <Link
                    to={`/accounting/ledger?period=${period.periodId}&account=${period.accounts[0].accountId}`}
                    className="button button-small button-secondary"
                  >
                    通帳
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
