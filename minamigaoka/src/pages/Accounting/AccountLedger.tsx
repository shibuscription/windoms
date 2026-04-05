import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ledgerRowsForAccount, transactionMemoSuggestions } from "../../accounting/calc";
import { formatAccountingDate, formatMoney } from "../../accounting/format";
import { buildAccountingFiscalYearRange } from "../../accounting/fiscalYear";
import type { AccountingTransactionInput, TransactionType } from "../../accounting/model";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { useAccountingStore } from "../../accounting/useAccountingStore";
import { LinkifiedText } from "../../components/LinkifiedText";
import { TransactionForm } from "./TransactionForm";

type AccountLedgerProps = {
  isAdmin: boolean;
  canManageAccounting: boolean;
};

type SortDirection = "asc" | "desc";

const ledgerMobileKindLabel = (kindLabel: string): string => {
  if (kindLabel === "収入") return "収入";
  if (kindLabel === "支出") return "支出";
  if (kindLabel.includes("入金")) return "振替（入金）";
  if (kindLabel.includes("出金")) return "振替（出金）";
  return kindLabel;
};

export function AccountLedger({ isAdmin, canManageAccounting }: AccountLedgerProps) {
  const { store, addTransaction, updateTransaction, deleteTransaction, loading, error } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<TransactionType | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
  const deleteTargetRow =
    deleteTargetId ? rows.find((row) => row.transactionId === deleteTargetId) ?? null : null;
  const transactionLocked = period?.state === "closed";
  const memoSuggestions =
    mode === "income" || mode === "expense" ? transactionMemoSuggestions(store.periods, mode) : [];
  const fiscalRange = period ? buildAccountingFiscalYearRange(period.fiscalYear) : null;

  const closeModal = () => {
    setMode(null);
    setEditingTransactionId(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteTargetId(null);
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
        date: formatAccountingDate(editingRow.transaction.date),
        amount: editingRow.transaction.amount,
        categoryId: editingRow.transaction.categoryId,
      memo: editingRow.transaction.memo,
      accountId: editingRow.transaction.accountId,
      fromAccountId: editingRow.transaction.fromAccountId,
      toAccountId: editingRow.transaction.toAccountId,
      source: editingRow.transaction.source,
    };
  };

  const handleDelete = async () => {
    if (!deleteTargetRow) return;
    try {
      setIsDeleting(true);
      setSubmitError(null);
      await deleteTransaction(deleteTargetRow.transactionId);
      setDeleteTargetId(null);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "削除に失敗しました。";
      setSubmitError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderActionButtons = (transactionId: string, transactionType: TransactionType) => {
    if (!(canManageAccounting && !transactionLocked)) {
      return null;
    }

    return (
      <div className="accounting-ledger-actions">
        <button
          type="button"
          className="button button-small button-secondary"
          onClick={() => openEditModal(transactionId, transactionType)}
        >
          編集
        </button>
        <button
          type="button"
          className="button button-small button-danger"
          onClick={() => setDeleteTargetId(transactionId)}
        >
          削除
        </button>
      </div>
    );
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
    <section className="card accounting-page accounting-ledger-page">
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
      <div className="accounting-ledger-toolbar">
        <button type="button" className="button button-small button-secondary" onClick={toggleSortDirection}>
          日付順: {sortDirection === "asc" ? "昇順" : "降順"}
        </button>
      </div>
      <div className="accounting-ledger-table-wrap">
        <table className="accounting-ledger-table">
          <thead>
            <tr>
              <th className="accounting-ledger-col-date">日付</th>
              <th className="accounting-ledger-col-kind">種別</th>
              <th className="accounting-ledger-col-subject">科目</th>
              <th className="accounting-ledger-col-memo">摘要 / 備考</th>
              <th className="accounting-ledger-money accounting-ledger-col-income">収入金額</th>
              <th className="accounting-ledger-money accounting-ledger-col-expense">支出金額</th>
              <th className="accounting-ledger-money accounting-ledger-col-balance">残高</th>
              <th className="accounting-ledger-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortDirection === "asc" && (
              <tr>
                <td className="accounting-ledger-col-date">{period.startDate}</td>
                <td className="accounting-ledger-col-kind">繰越</td>
                <td className="accounting-ledger-col-subject">-</td>
                <td className="accounting-ledger-col-memo">-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">{formatMoney(account.openingBalance)}</td>
                <td className="accounting-ledger-col-actions">-</td>
              </tr>
            )}
            {sortedRows.map((row) => (
              <tr key={row.transactionId}>
                <td className="accounting-ledger-col-date">{row.date}</td>
                <td className="accounting-ledger-col-kind">{row.kindLabel}</td>
                <td className="accounting-ledger-col-subject">{row.subjectLabel}</td>
                <td className="accounting-ledger-col-memo">
                  {row.memo ? <LinkifiedText text={row.memo} className="todo-linkified-text" /> : "-"}
                </td>
                <td className="accounting-ledger-money">
                  {row.incomeAmount > 0 ? formatMoney(row.incomeAmount) : "-"}
                </td>
                <td className="accounting-ledger-money">
                  {row.expenseAmount > 0 ? formatMoney(row.expenseAmount) : "-"}
                </td>
                <td className="accounting-ledger-money">{formatMoney(row.balance)}</td>
                <td className="accounting-ledger-col-actions">
                  {renderActionButtons(row.transactionId, row.transaction.type) ?? "-"}
                </td>
              </tr>
            ))}
            {sortDirection === "desc" && (
              <tr>
                <td className="accounting-ledger-col-date">{period.startDate}</td>
                <td className="accounting-ledger-col-kind">繰越</td>
                <td className="accounting-ledger-col-subject">-</td>
                <td className="accounting-ledger-col-memo">-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">-</td>
                <td className="accounting-ledger-money">{formatMoney(account.openingBalance)}</td>
                <td className="accounting-ledger-col-actions">-</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="accounting-ledger-cards">
        {sortDirection === "asc" && (
          <article className="accounting-ledger-card accounting-ledger-card-opening">
            <div className="accounting-ledger-card-top">
              <div className="accounting-ledger-card-heading">
                <span className="accounting-ledger-badge is-opening">期首</span>
                <span className="accounting-ledger-card-date">{period.startDate}</span>
              </div>
              <div className="accounting-ledger-card-amount">
                <span className="accounting-ledger-card-amount-label">残高</span>
                <strong>{formatMoney(account.openingBalance)}</strong>
              </div>
            </div>
            <div className="accounting-ledger-card-meta">
              <span>科目: -</span>
              <span>摘要 / 備考: -</span>
            </div>
          </article>
        )}
        {sortedRows.map((row) => (
          <article key={row.transactionId} className="accounting-ledger-card">
            <div className="accounting-ledger-card-top">
              <div className="accounting-ledger-card-heading">
                <span
                  className={`accounting-ledger-badge ${
                    row.kindLabel === "収入"
                      ? "is-income"
                      : row.kindLabel === "支出"
                        ? "is-expense"
                        : row.incomeAmount > 0
                          ? "is-transfer-in"
                          : "is-transfer-out"
                  }`}
                >
                  {ledgerMobileKindLabel(row.kindLabel)}
                </span>
                <span className="accounting-ledger-card-date">{row.date}</span>
              </div>
              <div className="accounting-ledger-card-amount">
                <span className="accounting-ledger-card-amount-label">
                  {row.incomeAmount > 0 ? "収入金額" : "支出金額"}
                </span>
                <strong>{formatMoney(row.incomeAmount > 0 ? row.incomeAmount : row.expenseAmount)}</strong>
              </div>
            </div>
            <div className="accounting-ledger-card-body">
              <p className="accounting-ledger-card-memo">
                {row.memo ? <LinkifiedText text={row.memo} className="todo-linkified-text" /> : "-"}
              </p>
              <div className="accounting-ledger-card-meta">
                <span>科目: {row.subjectLabel}</span>
                <span>残高: {formatMoney(row.balance)}</span>
              </div>
            </div>
            <div className="accounting-ledger-card-footer">
              {renderActionButtons(row.transactionId, row.transaction.type) ?? <span className="muted">閲覧のみ</span>}
            </div>
          </article>
        ))}
        {sortDirection === "desc" && (
          <article className="accounting-ledger-card accounting-ledger-card-opening">
            <div className="accounting-ledger-card-top">
              <div className="accounting-ledger-card-heading">
                <span className="accounting-ledger-badge is-opening">期首</span>
                <span className="accounting-ledger-card-date">{period.startDate}</span>
              </div>
              <div className="accounting-ledger-card-amount">
                <span className="accounting-ledger-card-amount-label">残高</span>
                <strong>{formatMoney(account.openingBalance)}</strong>
              </div>
            </div>
            <div className="accounting-ledger-card-meta">
              <span>科目: -</span>
              <span>摘要 / 備考: -</span>
            </div>
          </article>
        )}
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
      {deleteTargetRow && (
        <ConfirmationDialog
          title="会計明細を削除しますか？"
          message="この操作は取り消せません。対象の会計明細を削除します。"
          summary={`${deleteTargetRow.date} / ${deleteTargetRow.kindLabel} / ${deleteTargetRow.subjectLabel}`}
          confirmLabel="削除"
          danger
          busy={isDeleting}
          onClose={closeDeleteDialog}
          onConfirm={handleDelete}
        />
      )}
    </section>
  );
}
