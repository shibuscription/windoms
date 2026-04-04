import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ledgerRowsForAccount, transactionMemoSuggestions } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { buildAccountingFiscalYearRange } from "../../accounting/fiscalYear";
import type { AccountingTransactionInput, TransactionType } from "../../accounting/model";
import { useAccountingStore } from "../../accounting/useAccountingStore";
import { LinkifiedText } from "../../components/LinkifiedText";
import { TransactionForm } from "./TransactionForm";

type AccountLedgerProps = {
  isAdmin: boolean;
  canManageAccounting: boolean;
};

type SortDirection = "asc" | "desc";

export function AccountLedger({ isAdmin, canManageAccounting }: AccountLedgerProps) {
  const { store, addTransaction, updateTransaction, deleteTransaction, loading, error } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<TransactionType | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const periodId = searchParams.get("period") ?? store.currentPeriodId ?? "";
  const accountId = searchParams.get("account") ?? "";
  const period = store.periods.find((item) => item.periodId === periodId);
  const account = period?.accounts.find((item) => item.accountId === accountId);

  const rows = useMemo(() => {
    if (!period || !account) return [];
    return ledgerRowsForAccount(period, account.accountId);
  }, [account, period]);
  const sortedRows = useMemo(
    () => (sortDirection === "asc" ? rows : [...rows].reverse()),
    [rows, sortDirection],
  );
  const editingRow =
    editingTransactionId ? rows.find((row) => row.transactionId === editingTransactionId) ?? null : null;
  const transactionLocked = period?.state === "closed";
  const memoSuggestions =
    mode === "income" || mode === "expense" ? transactionMemoSuggestions(store.periods, mode) : [];
  const fiscalRange = period ? buildAccountingFiscalYearRange(period.fiscalYear) : null;

  const closeModal = () => {
    setMode(null);
    setEditingTransactionId(null);
  };

  const openCreateModal = (nextMode: TransactionType) => {
    setSubmitError(null);
    setEditingTransactionId(null);
    setMode(nextMode);
  };

  const openEditModal = (transactionId: string, nextMode: TransactionType) => {
    setSubmitError(null);
    setEditingTransactionId(transactionId);
    setMode(nextMode);
  };

  const toggleSortDirection = () => {
    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  };

  const buildInitialValues = (): Partial<AccountingTransactionInput> | undefined => {
    if (!editingRow) {
      if (!mode) return undefined;
      if (mode === "income" || mode === "expense") {
        return {
          accountId: account?.accountId ?? "",
        };
      }
      return {
        fromAccountId: account?.accountId ?? "",
        toAccountId: "",
      };
    }

    return {
      date: editingRow.transaction.date,
      amount: editingRow.transaction.amount,
      categoryId: editingRow.transaction.categoryId,
      memo: editingRow.transaction.memo,
      accountId: editingRow.transaction.accountId,
      fromAccountId: editingRow.transaction.fromAccountId,
      toAccountId: editingRow.transaction.toAccountId,
      source: editingRow.transaction.source,
    };
  };

  const handleDelete = async (transactionId: string) => {
    const baseMessage = "この明細を削除しますか？";
    const confirmed = window.confirm(baseMessage);
    if (!confirmed) return;

    try {
      setSubmitError(null);
      await deleteTransaction(transactionId);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "削除に失敗しました。";
      setSubmitError(message);
    }
  };

  if (loading) {
    return (
      <section className="card accounting-page">
        <h1>口座通帳</h1>
        <p className="muted">会計データを読み込んでいます...</p>
      </section>
    );
  }

  if (!period || !account || !fiscalRange) {
    return (
      <section className="card accounting-page">
        <h1>口座通帳</h1>
        {error && <p className="field-error">{error}</p>}
        <p>対象データが見つかりません。</p>
        <Link to="/accounting" className="button">
          会計トップへ戻る
        </Link>
      </section>
    );
  }

  return (
    <section className="card accounting-page">
      <div className="accounting-ledger-heading">
        <h1>口座通帳：{account.label}</h1>
        <p className="muted">
          {period.label} / {fiscalRange.startDate} - {fiscalRange.endDate}
        </p>
      </div>
      {error && <p className="field-error">{error}</p>}
      {submitError && <p className="field-error">{submitError}</p>}
      {canManageAccounting && (
        <>
          <div className="accounting-action-row accounting-action-row-fixed">
            <button
              type="button"
              className="button accounting-action-button accounting-action-income"
              disabled={transactionLocked}
              onClick={() => openCreateModal("income")}
            >
              <span className="accounting-action-icon">+</span>
              <span>収入</span>
            </button>
            <button
              type="button"
              className="button accounting-action-button accounting-action-expense"
              disabled={transactionLocked}
              onClick={() => openCreateModal("expense")}
            >
              <span className="accounting-action-icon">-</span>
              <span>支出</span>
            </button>
            <button
              type="button"
              className="button accounting-action-button accounting-action-transfer"
              disabled={transactionLocked}
              onClick={() => openCreateModal("transfer")}
            >
              <span className="accounting-action-icon">⇄</span>
              <span>振替</span>
            </button>
          </div>
          {transactionLocked && <p className="muted">締め済みの期は編集・削除できません。</p>}
        </>
      )}
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
              <th>
                <button type="button" className="accounting-ledger-sort" onClick={toggleSortDirection}>
                  日付 {sortDirection === "asc" ? "▲" : "▼"}
                </button>
              </th>
              <th>種別</th>
              <th>科目</th>
              <th>摘要 / 備考</th>
              <th className="accounting-ledger-money">収入金額</th>
              <th className="accounting-ledger-money">支出金額</th>
              <th className="accounting-ledger-money">残高</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortDirection === "asc" && (
              <tr>
                <td>{period.startDate}</td>
                <td>繰越</td>
                <td>-</td>
                <td>-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">{formatMoney(account.openingBalance)}</td>
                <td>-</td>
              </tr>
            )}
            {sortedRows.map((row) => (
              <tr key={row.transactionId}>
                <td>{row.date}</td>
                <td>{row.kindLabel}</td>
                <td>{row.subjectLabel}</td>
                <td>
                  {row.memo ? <LinkifiedText text={row.memo} className="todo-linkified-text" /> : "-"}
                </td>
                <td className="accounting-ledger-money">
                  {row.incomeAmount > 0 ? formatMoney(row.incomeAmount) : "-"}
                </td>
                <td className="accounting-ledger-money">
                  {row.expenseAmount > 0 ? formatMoney(row.expenseAmount) : "-"}
                </td>
                <td className="accounting-ledger-money">{formatMoney(row.balance)}</td>
                <td>
                  {canManageAccounting && !transactionLocked ? (
                    <div className="accounting-ledger-actions">
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => openEditModal(row.transactionId, row.transaction.type)}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className="button button-small button-danger"
                        onClick={() => void handleDelete(row.transactionId)}
                      >
                        削除
                      </button>
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {sortDirection === "desc" && (
              <tr>
                <td>{period.startDate}</td>
                <td>繰越</td>
                <td>-</td>
                <td>-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">{formatMoney(account.openingBalance)}</td>
                <td>-</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canManageAccounting && mode && (
        <TransactionForm
          mode={mode}
          period={period}
          defaultAccountId={mode === "transfer" ? "" : account.accountId}
          defaultFromAccountId={mode === "transfer" ? account.accountId : ""}
          defaultToAccountId=""
          initialValues={buildInitialValues()}
          memoSuggestions={memoSuggestions}
          title={editingRow ? `${mode === "income" ? "収入" : mode === "expense" ? "支出" : "振替"}を編集` : undefined}
          submitLabel={editingRow ? "保存する" : "登録する"}
          onClose={closeModal}
          onSubmit={async (payload) => {
            setSubmitError(null);
            try {
              if (editingRow) {
                await updateTransaction(editingRow.transactionId, {
                  periodId: period.periodId,
                  type: mode,
                  ...payload,
                });
              } else {
                await addTransaction({
                  periodId: period.periodId,
                  type: mode,
                  ...payload,
                });
              }
              closeModal();
            } catch (nextError) {
              const message = nextError instanceof Error ? nextError.message : "保存に失敗しました。";
              setSubmitError(message);
              throw nextError;
            }
          }}
        />
      )}
      {!isAdmin && canManageAccounting && (
        <p className="muted">
          会計取引の作成者情報はまだ保存していないため、他ユーザー作成分の追加確認は今回入れていません。
        </p>
      )}
    </section>
  );
}
