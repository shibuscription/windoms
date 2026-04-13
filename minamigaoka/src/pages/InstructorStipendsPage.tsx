import { useEffect, useMemo, useState } from "react";
import {
  accountingFiscalMonthLabels,
  resolveAccountingFiscalYear,
} from "../accounting/fiscalYear";
import { comparePeriodAccounts } from "../accounting/sort";
import { useAccountingStore } from "../accounting/useAccountingStore";
import {
  buildInstructorStipendMemo,
  createInstructorStipendPayment,
  subscribeInstructorStipends,
  updateInstructorStipendPayment,
} from "../instructorStipends/service";
import { subscribeMembers } from "../members/service";
import { sortMembersForDisplay } from "../members/permissions";
import type { MemberRecord } from "../members/types";
import type { InstructorStipendRecord } from "../types";

type InstructorStipendsPageProps = {
  currentUid: string;
  isAdmin: boolean;
  canManageAccounting: boolean;
};

type StipendCellState = "unpaid" | "paid";

const fiscalMonthEntries = (fiscalYear: number): Array<{ monthKey: string; label: string }> =>
  accountingFiscalMonthLabels().map((item, index) => ({
    monthKey: `${index < 4 ? fiscalYear : fiscalYear + 1}-${item.monthKey}`,
    label: item.label,
  }));

const todayDateKey = (): string => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const stateIcon = (state: StipendCellState): string => (state === "paid" ? "済" : "未");
const stateLabel = (state: StipendCellState): string =>
  state === "paid" ? "支払済" : "未払い";

const monthLabelForDisplay = (monthKey: string): string => {
  const [year, month] = monthKey.split("-");
  return `${Number(year)}年${Number(month)}月`;
};

export function InstructorStipendsPage({
  currentUid,
  isAdmin,
  canManageAccounting,
}: InstructorStipendsPageProps) {
  const { currentPeriod } = useAccountingStore();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [records, setRecords] = useState<InstructorStipendRecord[]>([]);
  const [fiscalYear, setFiscalYear] = useState<number>(() =>
    resolveAccountingFiscalYear(new Date()),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [modalTeacherId, setModalTeacherId] = useState<string | null>(null);
  const [modalMonthKey, setModalMonthKey] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("5000");
  const [paidOn, setPaidOn] = useState(todayDateKey());
  const [memo, setMemo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    accountId?: string;
    amount?: string;
    paidOn?: string;
  }>({});
  const [modalError, setModalError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 2) setIsLoading(false);
    };

    try {
      const unsubscribeMembers = subscribeMembers((rows) => {
        setMembers(rows);
        markLoaded();
      });
      const unsubscribeRecords = subscribeInstructorStipends(
        (items) => {
          setRecords(items);
          markLoaded();
        },
        (error) => {
          setPageError(error.message);
          markLoaded();
        },
      );

      return () => {
        unsubscribeMembers();
        unsubscribeRecords();
      };
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "講師謝礼データの読み込みに失敗しました。",
      );
      setIsLoading(false);
    }

    return undefined;
  }, []);

  const teachers = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter(
          (member) =>
            member.memberStatus === "active" && member.memberTypes.includes("teacher"),
        ),
        "teacher",
      ),
    [members],
  );

  const monthEntries = useMemo(() => fiscalMonthEntries(fiscalYear), [fiscalYear]);
  const availableAccounts = useMemo(
    () => [...(currentPeriod?.accounts ?? [])].sort(comparePeriodAccounts),
    [currentPeriod],
  );
  const accountLabelById = useMemo(
    () =>
      new Map(availableAccounts.map((account) => [account.accountId, account.label] as const)),
    [availableAccounts],
  );
  const defaultAccountId = useMemo(
    () =>
      availableAccounts.find((account) =>
        isAdmin
          ? account.label === "現金（会長手元金）"
          : account.label === "現金（会計手元金）",
      )?.accountId ?? "",
    [availableAccounts, isAdmin],
  );

  const recordMap = useMemo(() => {
    const next = new Map<string, InstructorStipendRecord>();
    records
      .filter((record) => record.fiscalYear === fiscalYear)
      .forEach((record) => {
        next.set(`${record.teacherMemberId}_${record.monthKey}`, record);
      });
    return next;
  }, [fiscalYear, records]);

  const modalTeacher = modalTeacherId
    ? teachers.find((teacher) => teacher.id === modalTeacherId) ?? null
    : null;
  const modalRecord =
    modalTeacherId && modalMonthKey
      ? recordMap.get(`${modalTeacherId}_${modalMonthKey}`) ?? null
      : null;
  const modalAccountLabel =
    (modalRecord?.accountingAccountId
      ? accountLabelById.get(modalRecord.accountingAccountId)
      : undefined) ??
    modalRecord?.accountingAccountId ??
    "-";

  useEffect(() => {
    if (!modalTeacher || !modalMonthKey) return;
    setAccountId(modalRecord?.accountingAccountId ?? defaultAccountId);
    setAmount(modalRecord ? String(modalRecord.amount) : "5000");
    setPaidOn(modalRecord?.paidOn ?? todayDateKey());
    setMemo(modalRecord?.accountingMemo ?? buildInstructorStipendMemo(modalMonthKey));
    setFieldErrors({});
    setModalError("");
  }, [defaultAccountId, modalMonthKey, modalRecord, modalTeacher]);

  const openCellModal = (teacherId: string, monthKey: string) => {
    setModalTeacherId(teacherId);
    setModalMonthKey(monthKey);
  };

  const closeModal = () => {
    setModalTeacherId(null);
    setModalMonthKey(null);
    setFieldErrors({});
    setModalError("");
  };

  const handleSubmit = async () => {
    if (!modalTeacher || !modalMonthKey) return;

    const nextErrors: { accountId?: string; amount?: string; paidOn?: string } = {};
    const normalizedAmount = Number(amount);

    if (!accountId) nextErrors.accountId = "出金元口座を選択してください";
    if (!(Number.isFinite(normalizedAmount) && normalizedAmount > 0)) {
      nextErrors.amount = "金額は1円以上で入力してください";
    }
    if (!paidOn) nextErrors.paidOn = "支払日を入力してください";

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setModalError("");
    try {
      if (modalRecord) {
        await updateInstructorStipendPayment({
          teacherMemberId: modalTeacher.id,
          teacherNameSnapshot: modalTeacher.name,
          fiscalYear,
          monthKey: modalMonthKey,
          amount: normalizedAmount,
          paidOn,
          accountId,
          memo,
        });
      } else {
        await createInstructorStipendPayment({
          teacherMemberId: modalTeacher.id,
          teacherNameSnapshot: modalTeacher.name,
          fiscalYear,
          monthKey: modalMonthKey,
          amount: normalizedAmount,
          paidOn,
          paidByUid: currentUid,
          accountId,
          memo,
        });
      }
      closeModal();
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : "講師謝礼の保存に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageAccounting) {
    return (
      <section className="card fees-page">
        <h1>講師謝礼</h1>
        <p className="field-error">この画面を利用する権限がありません。</p>
      </section>
    );
  }

  return (
    <section className="card fees-page stipends-page">
      <div className="fees-page-header">
        <div>
          <h1>講師謝礼</h1>
          <p className="muted">
            先生ごとの月次謝礼について、年度内の支払状況を一覧し、支払い記録を登録します。
          </p>
        </div>
        <div className="fees-year-switcher">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setFiscalYear((current) => current - 1)}
          >
            前年度
          </button>
          <strong>{fiscalYear}年度</strong>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setFiscalYear((current) => current + 1)}
          >
            翌年度
          </button>
        </div>
      </div>

      {pageError && <p className="field-error">{pageError}</p>}
      {isLoading && <p className="muted">読み込み中...</p>}

      <div className="fees-table-wrap">
        <table className="fees-table">
          <thead>
            <tr>
              <th scope="col">先生</th>
              {monthEntries.map((entry) => (
                <th key={entry.monthKey} scope="col">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.id}>
                <th scope="row">{teacher.name}</th>
                {monthEntries.map((entry) => {
                  const record = recordMap.get(`${teacher.id}_${entry.monthKey}`) ?? null;
                  const state: StipendCellState = record ? "paid" : "unpaid";
                  return (
                    <td key={entry.monthKey}>
                      <button
                        type="button"
                        className={`stipend-cell-button fees-status-icon fees-status-${state === "paid" ? "received" : "unrequested"}`}
                        aria-label={`${entry.label} ${stateLabel(state)}`}
                        title={`${entry.label} ${stateLabel(state)}`}
                        onClick={() => openCellModal(teacher.id, entry.monthKey)}
                      >
                        {stateIcon(state)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!isLoading && teachers.length === 0 && (
              <tr>
                <td colSpan={monthEntries.length + 1} className="muted">
                  先生区分のメンバーが登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalTeacher && modalMonthKey && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel fees-modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeModal}
            >
              ×
            </button>
            <div className="fees-modal-header">
              <h2>
                {modalTeacher.name} / {monthLabelForDisplay(modalMonthKey)}分講師謝礼
              </h2>
              <p className="muted">
                {modalRecord ? "支払記録を編集します" : "年度内の支払い記録を登録します"}
              </p>
            </div>

            <div className="fees-modal-body">
              {modalRecord && (
                <div className="fees-action-card">
                  <strong>支払済み</strong>
                  <p className="muted">出金元口座: {modalAccountLabel}</p>
                  <p className="muted">
                    編集しても会計へは再起票せず、既存の会計レコードも自動更新しません。
                  </p>
                </div>
              )}

              <label className="field-label" htmlFor="stipend-account-select">
                出金元口座
              </label>
              <select
                id="stipend-account-select"
                className="field-input"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, accountId: undefined }));
                }}
                disabled={isSubmitting}
              >
                <option value="">選択してください</option>
                {availableAccounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.label}
                  </option>
                ))}
              </select>
              {fieldErrors.accountId && <p className="field-error">{fieldErrors.accountId}</p>}

              <label className="field-label" htmlFor="stipend-amount-input">
                金額
              </label>
              <input
                id="stipend-amount-input"
                className="field-input"
                inputMode="numeric"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                disabled={isSubmitting}
              />
              {fieldErrors.amount && <p className="field-error">{fieldErrors.amount}</p>}

              <label className="field-label" htmlFor="stipend-paid-on-input">
                支払日
              </label>
              <input
                id="stipend-paid-on-input"
                className="field-input"
                type="date"
                value={paidOn}
                onChange={(event) => {
                  setPaidOn(event.target.value);
                  setFieldErrors((prev) => ({ ...prev, paidOn: undefined }));
                }}
                disabled={isSubmitting}
              />
              {fieldErrors.paidOn && <p className="field-error">{fieldErrors.paidOn}</p>}

              <label className="field-label" htmlFor="stipend-memo-input">
                摘要
              </label>
              <input
                id="stipend-memo-input"
                className="field-input"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                disabled={isSubmitting}
              />

              {!currentPeriod && !modalRecord && (
                <p className="field-error">
                  現在の会計期がありません。講師謝礼を会計へ連携するには、先に会計期を開始してください。
                </p>
              )}
            </div>

            <div className="fees-modal-footer">
              {modalError && <p className="field-error">{modalError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || (!currentPeriod && !modalRecord)}
                >
                  {isSubmitting
                    ? "保存中..."
                    : modalRecord
                      ? "変更を保存"
                      : "支払いを記録する"}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  閉じる
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
