import { useEffect, useMemo, useState } from "react";
import { accountingFiscalMonthLabels, resolveAccountingFiscalYear } from "../accounting/fiscalYear";
import { useAccountingStore } from "../accounting/useAccountingStore";
import { comparePeriodAccounts } from "../accounting/sort";
import { subscribeMembers } from "../members/service";
import { sortMembersForDisplay } from "../members/permissions";
import type { MemberRecord } from "../members/types";
import {
  createMembershipFeeRequest,
  membershipFeeMonthlyAmount,
  receiveMembershipFeeRecord,
  subscribeMembershipFeeRecords,
} from "../fees/service";
import type { MembershipFeeRecord } from "../types";

type FeesPageProps = {
  currentUid: string;
  isAdmin: boolean;
};

type MemberMonthState = "unrequested" | "requested" | "received";

const formatMoney = (value: number): string => `${value.toLocaleString("ja-JP")}円`;

const fiscalMonthEntries = (fiscalYear: number): Array<{ monthKey: string; label: string }> =>
  accountingFiscalMonthLabels().map((item, index) => ({
    monthKey: `${index < 4 ? fiscalYear : fiscalYear + 1}-${item.monthKey}`,
    label: item.label,
  }));

const stateIcon = (state: MemberMonthState): string => {
  if (state === "requested") return "◐";
  if (state === "received") return "●";
  return "○";
};

const stateLabel = (state: MemberMonthState): string => {
  if (state === "requested") return "請求中";
  if (state === "received") return "領収済";
  return "未請求";
};

const toDateLabel = (value?: string): string => value || "-";

export function FeesPage({ currentUid, isAdmin }: FeesPageProps) {
  const { currentPeriod } = useAccountingStore();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [records, setRecords] = useState<MembershipFeeRecord[]>([]);
  const [fiscalYear, setFiscalYear] = useState<number>(() => resolveAccountingFiscalYear(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [modalMemberId, setModalMemberId] = useState<string | null>(null);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [receiptAccountId, setReceiptAccountId] = useState("");
  const [modalError, setModalError] = useState("");
  const [receiptAccountError, setReceiptAccountError] = useState("");
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
      const unsubscribeRecords = subscribeMembershipFeeRecords(
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
      setPageError(error instanceof Error ? error.message : "会費管理データの読み込みに失敗しました。");
      setIsLoading(false);
    }

    return undefined;
  }, []);

  const visibleMembers = useMemo(
    () =>
      sortMembersForDisplay(
        members.filter((member) => member.memberStatus === "active" && member.memberTypes.includes("child")),
        "child",
      ),
    [members],
  );

  const monthEntries = useMemo(() => fiscalMonthEntries(fiscalYear), [fiscalYear]);
  const availableAccounts = useMemo(
    () => [...(currentPeriod?.accounts ?? [])].sort(comparePeriodAccounts),
    [currentPeriod],
  );
  const defaultAccountId = useMemo(
    () =>
      availableAccounts.find((account) =>
        isAdmin ? account.label === "現金（会長手元金）" : account.label === "現金（会計手元金）",
      )?.accountId ?? "",
    [availableAccounts, isAdmin],
  );

  const modalMember = modalMemberId ? visibleMembers.find((member) => member.id === modalMemberId) ?? null : null;
  const modalRecords = useMemo(
    () =>
      modalMember
        ? records.filter((record) => record.memberId === modalMember.id && record.fiscalYear === fiscalYear)
        : [],
    [fiscalYear, modalMember, records],
  );
  const requestedRecord = modalRecords.find((record) => record.status === "requested") ?? null;

  useEffect(() => {
    if (!modalMember) return;
    setSelectedMonthKeys([]);
    setReceiptAccountId(requestedRecord?.accountingAccountId ?? defaultAccountId);
    setModalError("");
    setReceiptAccountError("");
  }, [defaultAccountId, modalMember, requestedRecord?.accountingAccountId]);

  const recordByMonthKey = useMemo(() => {
    const next = new Map<string, MembershipFeeRecord>();
    modalRecords.forEach((record) => {
      record.monthKeys.forEach((monthKey) => {
        next.set(monthKey, record);
      });
    });
    return next;
  }, [modalRecords]);

  const topStatusByMember = useMemo(() => {
    const next = new Map<string, Map<string, MemberMonthState>>();
    records
      .filter((record) => record.fiscalYear === fiscalYear)
      .forEach((record) => {
        const memberMap = next.get(record.memberId) ?? new Map<string, MemberMonthState>();
        record.monthKeys.forEach((monthKey) => {
          memberMap.set(monthKey, record.status === "received" ? "received" : "requested");
        });
        next.set(record.memberId, memberMap);
      });
    return next;
  }, [fiscalYear, records]);

  const monthRows = useMemo(
    () =>
      monthEntries.map((entry) => {
        const record = recordByMonthKey.get(entry.monthKey);
        const state: MemberMonthState = record
          ? record.status === "received"
            ? "received"
            : "requested"
          : "unrequested";
        return {
          ...entry,
          state,
          record,
          selectable: state === "unrequested",
        };
      }),
    [monthEntries, recordByMonthKey],
  );

  const toggleMonthSelection = (monthKey: string) => {
    setSelectedMonthKeys((current) =>
      current.includes(monthKey) ? current.filter((item) => item !== monthKey) : [...current, monthKey].sort(),
    );
  };

  const openMemberModal = (memberId: string) => {
    setModalMemberId(memberId);
  };

  const closeMemberModal = () => {
    if (isSubmitting) return;
    setModalMemberId(null);
    setSelectedMonthKeys([]);
    setModalError("");
    setReceiptAccountError("");
  };

  const handleRequest = async () => {
    if (!modalMember) return;
    if (selectedMonthKeys.length === 0) {
      setModalError("月謝袋を渡す月を選択してください。");
      return;
    }

    setIsSubmitting(true);
    setModalError("");
    try {
      await createMembershipFeeRequest({
        memberId: modalMember.id,
        memberNameSnapshot: modalMember.name,
        fiscalYear,
        monthKeys: selectedMonthKeys,
        createdByUid: currentUid,
        monthlyAmount: membershipFeeMonthlyAmount(),
      });
      setSelectedMonthKeys([]);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "月謝袋の配布に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReceive = async () => {
    if (!requestedRecord) return;
    if (!receiptAccountId) {
      setReceiptAccountError("入金先口座を選択してください。");
      return;
    }

    setIsSubmitting(true);
    setModalError("");
    setReceiptAccountError("");
    try {
      await receiveMembershipFeeRecord({
        membershipFeeRecordId: requestedRecord.id,
        accountId: receiptAccountId,
        receivedByUid: currentUid,
      });
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "領収処理に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card fees-page">
      <div className="fees-page-header">
        <div>
          <h1>会費管理</h1>
          <p className="muted">部員ごとの月謝袋配布状況と月謝回収状況を年度単位で管理します。</p>
        </div>
        <div className="fees-year-switcher">
          <button type="button" className="button button-secondary" onClick={() => setFiscalYear((current) => current - 1)}>
            前年
          </button>
          <strong>{fiscalYear}年度</strong>
          <button type="button" className="button button-secondary" onClick={() => setFiscalYear((current) => current + 1)}>
            翌年
          </button>
        </div>
      </div>

      {pageError && <p className="field-error">{pageError}</p>}
      {isLoading && <p className="muted">読み込み中...</p>}

      <div className="fees-table-wrap">
        <table className="fees-table">
          <thead>
            <tr>
              <th scope="col">メンバー</th>
              {monthEntries.map((entry) => (
                <th key={entry.monthKey} scope="col">
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((member) => {
              const memberMap = topStatusByMember.get(member.id) ?? new Map<string, MemberMonthState>();
              return (
                <tr key={member.id}>
                  <th scope="row">
                    <button type="button" className="fees-member-button" onClick={() => openMemberModal(member.id)}>
                      {member.name}
                    </button>
                  </th>
                  {monthEntries.map((entry) => {
                    const state = memberMap.get(entry.monthKey) ?? "unrequested";
                    return (
                      <td key={entry.monthKey}>
                        <span className={`fees-status-icon fees-status-${state}`} aria-label={stateLabel(state)} title={stateLabel(state)}>
                          {stateIcon(state)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!isLoading && visibleMembers.length === 0 && (
              <tr>
                <td colSpan={monthEntries.length + 1} className="muted">
                  表示できる部員がまだいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalMember && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel fees-modal-panel">
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeMemberModal}
            >
              ×
            </button>
            <div className="fees-modal-header">
              <h2>{modalMember.name} の会費状態</h2>
              <p className="muted">{fiscalYear}年度（9月〜翌8月）</p>
            </div>

            <div className="fees-modal-body">
              <div className="fees-month-list" role="list">
                {monthRows.map((row) => {
                  const checked = selectedMonthKeys.includes(row.monthKey);
                  const selectable = row.selectable && !requestedRecord;
                  return (
                    <label key={row.monthKey} className={`fees-month-row fees-month-row-${row.state}`} role="listitem">
                      <span className="fees-month-check">
                        {row.selectable ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!selectable || isSubmitting}
                            onChange={() => toggleMonthSelection(row.monthKey)}
                          />
                        ) : (
                          <span className="fees-check-placeholder" aria-hidden="true" />
                        )}
                      </span>
                      <span className="fees-month-label">{row.label}</span>
                      <span className={`fees-status-icon fees-status-${row.state}`} aria-hidden="true">
                        {stateIcon(row.state)}
                      </span>
                      <span className="fees-month-state">{stateLabel(row.state)}</span>
                      <span className="fees-month-meta">
                        {row.record ? formatMoney(row.record.amount) : ""}
                      </span>
                    </label>
                  );
                })}
              </div>

              {requestedRecord ? (
                <div className="fees-action-card">
                  <strong>請求中の会費</strong>
                  <p>{requestedRecord.title}</p>
                  <p className="muted">
                    金額: {formatMoney(requestedRecord.amount)} / 月謝袋配布日: {toDateLabel(requestedRecord.requestedOn)}
                  </p>
                  <label className="field-label" htmlFor="fees-account-select">
                    入金先口座
                  </label>
                  <select
                    id="fees-account-select"
                    className="field-input"
                    value={receiptAccountId}
                    onChange={(event) => setReceiptAccountId(event.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="">選択してください</option>
                    {availableAccounts.map((account) => (
                      <option key={account.accountId} value={account.accountId}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                  {receiptAccountError && <p className="field-error">{receiptAccountError}</p>}
                  {!currentPeriod && (
                    <p className="field-error">現在の会計期がないため、領収済みにできません。先に会計期を開始してください。</p>
                  )}
                </div>
              ) : monthRows.some((row) => row.selectable) ? (
                <div className="fees-action-card">
                  <strong>未請求月を選んで月謝袋を渡す</strong>
                  <p className="muted">選択した月をまとめて請求中にします。</p>
                </div>
              ) : (
                <div className="fees-action-card">
                  <strong>この年度の会費はすべて領収済みです。</strong>
                </div>
              )}
            </div>

            <div className="fees-modal-footer">
              {modalError && <p className="field-error">{modalError}</p>}
              <div className="modal-actions">
                {requestedRecord ? (
                  <button
                    type="button"
                    className="button"
                    onClick={handleReceive}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "保存中..." : "領収済みにする"}
                  </button>
                ) : monthRows.some((row) => row.selectable) ? (
                  <button
                    type="button"
                    className="button"
                    onClick={handleRequest}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "保存中..." : "月謝袋を渡す"}
                  </button>
                ) : null}
                <button type="button" className="button button-secondary" onClick={closeMemberModal} disabled={isSubmitting}>
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
