import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LinkifiedText } from "../components/LinkifiedText";
import { ReceiptImagePicker } from "../components/ReceiptImagePicker";
import { useReceiptPreviews } from "../hooks/useReceiptPreviews";
import type {
  DemoData,
  LunchPaymentSplit,
  LunchRecord,
  QuoCard,
  Reimbursement,
} from "../types";
import { isValidDateKey, todayDateKey } from "../utils/date";

type LunchPageProps = {
  data: DemoData;
  currentUid: string;
  demoRole: "admin" | "parent";
  updateLunchRecords: (updater: (prev: LunchRecord[]) => LunchRecord[]) => void;
  updateReimbursements: (updater: (prev: Reimbursement[]) => Reimbursement[]) => void;
  updateQuoCards: (updater: (prev: QuoCard[]) => QuoCard[]) => void;
};

type LunchDraft = {
  title: string;
  amount: string;
  purchasedAt: string;
  memo: string;
  quoAmounts: Record<string, string>;
  reimbursementAmount: string;
};

const toDateInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toDateLabel = (iso: string): string => {
  return toDateKeyFromIso(iso);
};

const formatDateWithWeekday = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("ja-JP", { weekday: "short" });
  return `${dateKey}（${weekday}）`;
};

const formatShortDateWithWeekday = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("ja-JP", { weekday: "short" });
  const dayLabel = String(day).padStart(2, "0");
  return `${month}/${dayLabel}(${weekday})`;
};

const toIsoFromInput = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const toDateKeyFromIso = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return todayDateKey();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const createLunchId = (rows: LunchRecord[]): string => {
  const numbers = rows
    .map((row) => /^ln-(\d+)$/.exec(row.id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return "ln-001";
  return `ln-${String(Math.max(...numbers) + 1).padStart(3, "0")}`;
};

const createReimbursementId = (rows: Reimbursement[]): string => {
  const numbers = rows
    .map((row) => /^rb-(\d+)$/.exec(row.id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return "rb-001";
  return `rb-${String(Math.max(...numbers) + 1).padStart(3, "0")}`;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("failed_to_read_image"));
    reader.readAsDataURL(file);
  });

const toSplitSummary = (splits: LunchPaymentSplit[], cards: QuoCard[]): string =>
  splits
    .map((split) => {
      if (split.type === "quo") {
        const card = cards.find((item) => item.id === split.cardId);
        const label = card ? `${card.purchaseDate}購入` : split.cardId;
        return `QUO(${label})${split.amount}`;
      }
      return `立替${split.amount}`;
    })
    .join(" + ");

const getQuoInputCards = (cards: QuoCard[]): QuoCard[] =>
  [...cards]
    .filter((card) => card.active && !card.archived)
    .sort((a, b) => Number(b.active) - Number(a.active))
    .slice(0, 2);

const formatQuoCardLabel = (card: QuoCard): string => `QUOカード（${card.purchaseDate}購入）`;

const normalizeQuoCards = (cards: QuoCard[]): QuoCard[] => {
  const normalized = cards.map((card) => {
    if (card.balance <= 0) {
      return { ...card, balance: 0, active: false, archived: true };
    }
    return card.archived ? { ...card, archived: false } : card;
  });
  const activeCount = normalized.filter((card) => card.active && !card.archived).length;
  if (activeCount > 0) return normalized;
  const firstUsableIndex = normalized.findIndex((card) => !card.archived && card.balance > 0);
  if (firstUsableIndex < 0) return normalized;
  return normalized.map((card, index) => (index === firstUsableIndex ? { ...card, active: true } : card));
};

const createInitialDraft = (cards: QuoCard[]): LunchDraft => {
  const activeCards = getQuoInputCards(cards);
  return {
    title: "お弁当",
    amount: "",
    purchasedAt: toDateInputValue(new Date()),
    memo: "",
    quoAmounts: Object.fromEntries(activeCards.map((card) => [card.id, ""])),
    reimbursementAmount: "",
  };
};

export function LunchPage({
  data,
  currentUid,
  demoRole,
  updateLunchRecords,
  updateReimbursements,
  updateQuoCards,
}: LunchPageProps) {
  const lunchFamilyNameByHouseholdId: Record<string, string> = {
    hh01: "渋谷",
    hh02: "中村",
    hh03: "今井",
    hh04: "青木",
    hh05: "水野",
    hh06: "加藤",
  };
  const whitelistLunchNames = new Set([
    "瀬古",
    "大滝",
    "中村",
    "今井",
    "青木",
    "水野",
    "渋谷",
    "熊澤",
    "加藤",
    "井野",
  ]);
  const normalizeLunchPersonName = (rawName?: string): string => {
    const value = (rawName ?? "").trim();
    if (!value) return "未定";
    if (value === "井野") return value;
    const family = value
      .replace(/（.*?）/g, "")
      .replace(/家$/, "")
      .replace(/父|母|祖母|叔母|先生/g, "")
      .trim()
      .split(/\s+/)[0];
    if (!family) return "未定";
    return whitelistLunchNames.has(family) ? family : "中村";
  };
  const [searchParams] = useSearchParams();
  const fallbackDate = todayDateKey();
  const queryDate = searchParams.get("date") ?? "";
  const targetDate = queryDate && isValidDateKey(queryDate) ? queryDate : fallbackDate;
  const isAdmin = demoRole === "admin";
  const alertThreshold = 2000;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSplitDetailsOpen, setIsSplitDetailsOpen] = useState(true);
  const [isMemoDetailsOpen, setIsMemoDetailsOpen] = useState(false);
  const [isReceiptDetailsOpen, setIsReceiptDetailsOpen] = useState(false);
  const [draft, setDraft] = useState<LunchDraft>(() => createInitialDraft(data.quoCards));
  const [errors, setErrors] = useState<{ title?: string; amount?: string; purchasedAt?: string }>({});
  const [splitErrors, setSplitErrors] = useState<{
    section?: string;
    reimbursement?: string;
    quoByCardId: Record<string, string>;
  }>({ quoByCardId: {} });
  const [detailTarget, setDetailTarget] = useState<LunchRecord | null>(null);
  const [isQuoManageOpen, setIsQuoManageOpen] = useState(false);
  const [isQuoAddModalOpen, setIsQuoAddModalOpen] = useState(false);
  const [showArchivedQuoCards, setShowArchivedQuoCards] = useState(false);
  const [quoManageNotice, setQuoManageNotice] = useState("");
  const [newCardPurchaseDate, setNewCardPurchaseDate] = useState(toDateInputValue(new Date()));
  const [newCardBalance, setNewCardBalance] = useState("");
  const [newCardMemo, setNewCardMemo] = useState("");
  const [newCardError, setNewCardError] = useState<{ purchaseDate?: string; balance?: string }>({});
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});

  const {
    previews: receiptPreviews,
    addFiles: addReceiptFiles,
    removePreview: removeReceiptPreview,
    clearPreviews: clearReceiptPreviews,
  } = useReceiptPreviews();

  const sortedRecords = useMemo(
    () => [...data.lunchRecords].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
    [data.lunchRecords],
  );
  const activeQuoCards = useMemo(() => getQuoInputCards(data.quoCards), [data.quoCards]);
  const activeQuoTotalBalance = useMemo(
    () =>
      data.quoCards
        .filter((card) => card.active && !card.archived)
        .reduce((sum, card) => sum + card.balance, 0),
    [data.quoCards],
  );
  const visibleQuoCards = useMemo(
    () => data.quoCards.filter((card) => !card.archived || showArchivedQuoCards),
    [data.quoCards, showArchivedQuoCards],
  );
  const activeQuoCardCount = useMemo(
    () => data.quoCards.filter((card) => card.active && !card.archived).length,
    [data.quoCards],
  );
  const getFamilyDisplayName = (householdId: string | null | undefined): string => {
    if (!householdId) return "未定";
    const mapped = lunchFamilyNameByHouseholdId[householdId];
    if (mapped) return mapped;
    const label = data.households[householdId]?.label ?? householdId;
    return normalizeLunchPersonName(label);
  };
  const currentUserHouseholdId = data.users[currentUid]?.householdId ?? null;
  const upcomingLunchDuties = useMemo(() => {
    return data.lunchDuties
      .filter((duty) => duty.slotType === "WEEKEND_PM" && duty.date >= targetDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2)
      .map((duty) => ({
        dateKey: duty.date,
        householdId: duty.assigneeHouseholdId,
        dutyName: getFamilyDisplayName(duty.assigneeHouseholdId),
      }));
  }, [data.lunchDuties, targetDate]);
  const amountNumber = Number(draft.amount || "0");
  const quoTotal = activeQuoCards.reduce((sum, card) => {
    const value = Number(draft.quoAmounts[card.id] || "0");
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const reimbursementAmount = Number(draft.reimbursementAmount || "0");
  const splitTotal = quoTotal + (Number.isFinite(reimbursementAmount) ? reimbursementAmount : 0);
  const remainAmount = Math.max(0, amountNumber - splitTotal);
  const splitNeedsAttention =
    !draft.amount.trim() ||
    !Number.isFinite(amountNumber) ||
    amountNumber <= 0 ||
    Math.round(splitTotal) !== Math.round(amountNumber);

  useEffect(() => {
    if (isAddModalOpen && splitNeedsAttention) {
      setIsSplitDetailsOpen(true);
    }
  }, [isAddModalOpen, splitNeedsAttention]);

  const openAddModal = () => {
    setDraft(createInitialDraft(data.quoCards));
    setErrors({});
    setSplitErrors({ quoByCardId: {} });
    setIsSplitDetailsOpen(true);
    setIsMemoDetailsOpen(false);
    setIsReceiptDetailsOpen(false);
    clearReceiptPreviews();
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setErrors({});
    setSplitErrors({ quoByCardId: {} });
    clearReceiptPreviews();
  };

  const setQuoAmount = (cardId: string, amount: string) => {
    setDraft((prev) => ({
      ...prev,
      quoAmounts: { ...prev.quoAmounts, [cardId]: amount },
    }));
    setSplitErrors((prev) => ({
      ...prev,
      section: undefined,
      quoByCardId: { ...prev.quoByCardId, [cardId]: "" },
    }));
  };

  const setReimbursementAmount = (amount: string) => {
    setDraft((prev) => ({ ...prev, reimbursementAmount: amount }));
    setSplitErrors((prev) => ({ ...prev, section: undefined, reimbursement: undefined }));
  };

  const fillFromCardBalance = (cardId: string) => {
    const card = data.quoCards.find((item) => item.id === cardId);
    if (!card) return;
    const otherQuoTotal = activeQuoCards.reduce((sum, item) => {
      if (item.id === cardId) return sum;
      const value = Number(draft.quoAmounts[item.id] || "0");
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const reimbursement = Number(draft.reimbursementAmount || "0");
    const usedByOthers = otherQuoTotal + (Number.isFinite(reimbursement) ? reimbursement : 0);
    const target = Math.max(0, Math.min(card.balance, amountNumber - usedByOthers));

    setQuoAmount(cardId, String(target));
  };

  const fillReimbursementRemaining = () => {
    const quoUsed = activeQuoCards.reduce((sum, card) => {
      const value = Number(draft.quoAmounts[card.id] || "0");
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const remaining = Math.max(0, amountNumber - quoUsed);
    setReimbursementAmount(String(remaining));
  };

  const validateSplitSection = (): {
    ok: boolean;
    normalized: LunchPaymentSplit[];
    errors: { section?: string; reimbursement?: string; quoByCardId: Record<string, string> };
  } => {
    const nextErrors: { section?: string; reimbursement?: string; quoByCardId: Record<string, string> } = {
      quoByCardId: {},
    };
    const normalized: LunchPaymentSplit[] = [];
    activeQuoCards.forEach((card) => {
      const amount = Number(draft.quoAmounts[card.id] || "0");
      if (!Number.isFinite(amount) || amount < 0) {
        nextErrors.quoByCardId[card.id] = "金額は0以上で入力してください";
        return;
      }
      if (amount > card.balance) {
        nextErrors.quoByCardId[card.id] = "QUO残高が不足しています";
        return;
      }
      if (amount > 0) {
        normalized.push({ type: "quo", cardId: card.id, amount });
      }
    });

    const reimbursement = Number(draft.reimbursementAmount || "0");
    if (!Number.isFinite(reimbursement) || reimbursement < 0) {
      nextErrors.reimbursement = "金額は0以上で入力してください";
    } else if (reimbursement > 0) {
      normalized.push({ type: "reimbursement", amount: reimbursement });
    }

    const normalizedTotal = normalized.reduce((sum, item) => sum + item.amount, 0);
    if (Math.round(normalizedTotal) !== Math.round(amountNumber)) {
      nextErrors.section = "支払い内訳の合計が購入金額と一致していません";
    }

    const hasRowErrors =
      Boolean(nextErrors.section) ||
      Boolean(nextErrors.reimbursement) ||
      Object.values(nextErrors.quoByCardId).some((message) => Boolean(message));
    return { ok: !hasRowErrors, normalized, errors: nextErrors };
  };

  const submitLunchRecord = async () => {
    const nextErrors: { title?: string; amount?: string; purchasedAt?: string } = {};
    if (!draft.title.trim()) nextErrors.title = "タイトルは必須です";
    if (!draft.amount.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      nextErrors.amount = "金額は1以上の数値で入力してください";
    }
    if (!draft.purchasedAt.trim() || Number.isNaN(Date.parse(draft.purchasedAt))) {
      nextErrors.purchasedAt = "購入日時は必須です";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const splitResult = validateSplitSection();
    setSplitErrors(splitResult.errors);
    if (!splitResult.ok) return;

    const purchasedAtIso = toIsoFromInput(draft.purchasedAt);
    const dateKey = toDateKeyFromIso(purchasedAtIso);
    const receiptFilesMeta = receiptPreviews.map((item) => ({
      name: item.name,
      size: item.size,
      type: item.type,
    }));
    const imageUrls = (
      await Promise.all(receiptPreviews.map((preview) => fileToDataUrl(preview.file).catch(() => "")))
    ).filter((url) => Boolean(url));

    updateLunchRecords((prev) => [
      {
        id: createLunchId(prev),
        title: draft.title.trim(),
        amount: amountNumber,
        purchasedAt: purchasedAtIso,
        date: dateKey,
        buyer: currentUid,
        dutyMemberId: resolveDutyMemberId(dateKey),
        dutyHouseholdId: resolveDutyHouseholdId(dateKey),
        memo: draft.memo.trim() || undefined,
        paymentSplits: splitResult.normalized,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        receiptFilesMeta: receiptFilesMeta.length > 0 ? receiptFilesMeta : undefined,
      },
      ...prev,
    ]);

    const quoUsageMap = new Map<string, number>();
    let reimbursementTotal = 0;
    splitResult.normalized.forEach((split) => {
      if (split.type === "quo") {
        quoUsageMap.set(split.cardId, (quoUsageMap.get(split.cardId) ?? 0) + split.amount);
      } else {
        reimbursementTotal += split.amount;
      }
    });

    updateQuoCards((prev) =>
      normalizeQuoCards(
        prev.map((card) => {
          const used = quoUsageMap.get(card.id) ?? 0;
          if (used === 0) return card;
          return { ...card, balance: Math.max(0, card.balance - used) };
        }),
      ),
    );

    if (reimbursementTotal > 0) {
      updateReimbursements((prev) => [
        {
          id: createReimbursementId(prev),
          title: `お弁当（${dateKey}） ${draft.title.trim()}`,
          amount: reimbursementTotal,
          purchasedAt: purchasedAtIso,
          buyer: currentUid,
          memo: `[source:lunch] ${draft.memo.trim()}`.trim(),
          source: "lunch",
          receiptFilesMeta: receiptFilesMeta.length > 0 ? receiptFilesMeta : undefined,
          receipt: receiptFilesMeta.length > 0 ? `画像${receiptFilesMeta.length}件` : undefined,
        },
        ...prev,
      ]);
    }

    closeAddModal();
  };

  const openQuoManage = () => {
    setBalanceDrafts(
      Object.fromEntries(data.quoCards.map((card) => [card.id, String(card.balance)])),
    );
    setQuoManageNotice("");
    setNewCardBalance("");
    setNewCardPurchaseDate(toDateInputValue(new Date()));
    setNewCardMemo("");
    setNewCardError({});
    setIsQuoAddModalOpen(false);
    setIsQuoManageOpen(true);
  };

  const openQuoAddModal = () => {
    setNewCardPurchaseDate(toDateInputValue(new Date()));
    setNewCardBalance("");
    setNewCardMemo("");
    setNewCardError({});
    setIsQuoAddModalOpen(true);
  };

  const closeQuoAddModal = () => {
    setIsQuoAddModalOpen(false);
    setNewCardError({});
  };

  const addQuoCard = () => {
    const balance = Number(newCardBalance);
    const nextError: { purchaseDate?: string; balance?: string } = {};
    if (!newCardPurchaseDate || Number.isNaN(Date.parse(newCardPurchaseDate))) {
      nextError.purchaseDate = "購入日は必須です";
    }
    if (!Number.isFinite(balance) || balance < 0) {
      nextError.balance = "初期残高は0以上で入力してください";
    }
    setNewCardError(nextError);
    if (Object.keys(nextError).length > 0) return;
    updateQuoCards((prev) =>
      normalizeQuoCards([
        ...prev,
        {
          id: `quo-${Date.now()}`,
          purchaseDate: newCardPurchaseDate,
          balance,
          active: true,
          archived: balance <= 0,
          memo: newCardMemo.trim() || undefined,
        },
      ]),
    );
    setQuoManageNotice("");
    setNewCardBalance("");
    setNewCardPurchaseDate(toDateInputValue(new Date()));
    setNewCardMemo("");
    setIsQuoAddModalOpen(false);
  };

  const toggleCardActive = (cardId: string) => {
    const target = data.quoCards.find((card) => card.id === cardId);
    if (!target || target.archived) return;
    if (target.active && activeQuoCardCount <= 1) {
      setQuoManageNotice("有効カードは最低1枚必要です");
      return;
    }
    setQuoManageNotice("");
    updateQuoCards((prev) =>
      normalizeQuoCards(
        prev.map((card) =>
          card.id === cardId ? { ...card, active: !card.active } : card,
        ),
      ),
    );
  };

  const applyBalanceEdit = (cardId: string) => {
    const next = Number(balanceDrafts[cardId]);
    if (!Number.isFinite(next) || next < 0) return;
    updateQuoCards((prev) =>
      normalizeQuoCards(
        prev.map((card) => (card.id === cardId ? { ...card, balance: next } : card)),
      ),
    );
    setQuoManageNotice("");
  };

  const canSubmit = useMemo(() => {
    if (!draft.title.trim()) return false;
    if (!draft.amount.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) return false;
    if (!draft.purchasedAt.trim() || Number.isNaN(Date.parse(draft.purchasedAt))) return false;
    const splitValidation = validateSplitSection();
    return splitValidation.ok;
  }, [draft, amountNumber, data.quoCards]);

  const resolveDutyMemberId = (dateKey: string): string => {
    const day = data.scheduleDays[dateKey];
    const candidate = day?.sessions.find((session) => session.dutyRequirement === "duty")?.assignees[0];
    return candidate ?? currentUid;
  };

  const resolveDutyHouseholdId = (dateKey: string): string | undefined => {
    const duty = data.lunchDuties.find(
      (item) => item.slotType === "WEEKEND_PM" && item.date === dateKey,
    );
    if (duty?.assigneeHouseholdId) return duty.assigneeHouseholdId;
    const buyerHouseholdId = data.users[currentUid]?.householdId;
    return buyerHouseholdId ?? undefined;
  };

  const resolveDutyName = (record: LunchRecord): string => {
    if (record.dutyHouseholdId) {
      return getFamilyDisplayName(record.dutyHouseholdId);
    }
    if (record.dutyMemberId) {
      const memberHouseholdId = data.users[record.dutyMemberId]?.householdId;
      if (memberHouseholdId) return getFamilyDisplayName(memberHouseholdId);
    }
    const buyerHouseholdId = data.users[record.buyer]?.householdId;
    if (buyerHouseholdId) return getFamilyDisplayName(buyerHouseholdId);
    return normalizeLunchPersonName(data.users[record.buyer]?.displayName ?? record.buyer);
  };

  const resolveBuyerName = (record: LunchRecord): string => {
    const buyerHouseholdId = data.users[record.buyer]?.householdId;
    if (buyerHouseholdId) return getFamilyDisplayName(buyerHouseholdId);
    return normalizeLunchPersonName(data.users[record.buyer]?.displayName ?? record.buyer);
  };

  return (
    <section className="card lunch-page">
      <header className="lunch-header">
        <h1>お弁当</h1>
        <button type="button" className="button button-small" onClick={openAddModal}>
          ＋ 追加
        </button>
      </header>
      <div className="lunch-duty-board">
        <div className="lunch-duty-row">
          <span className="lunch-duty-label">次回のお弁当当番：</span>
          <span className="lunch-duty-value">
            {upcomingLunchDuties[0]
              ? `${formatShortDateWithWeekday(upcomingLunchDuties[0].dateKey)} ${upcomingLunchDuties[0].dutyName}`
              : "未定"}
            {upcomingLunchDuties[0] && upcomingLunchDuties[0].householdId === currentUserHouseholdId && (
              <span className="lunch-you-badge">あなた</span>
            )}
          </span>
        </div>
        <div className="lunch-duty-row">
          <span className="lunch-duty-label">その次：</span>
          <span className="lunch-duty-value">
            {upcomingLunchDuties[1]
              ? `${formatShortDateWithWeekday(upcomingLunchDuties[1].dateKey)} ${upcomingLunchDuties[1].dutyName}`
              : "未定"}
            {upcomingLunchDuties[1] && upcomingLunchDuties[1].householdId === currentUserHouseholdId && (
              <span className="lunch-you-badge">あなた</span>
            )}
          </span>
        </div>
      </div>
      <div className="lunch-subhead">
        <p className="muted">
          QUO残高（有効カード合計）: {activeQuoTotalBalance > 0 ? `${activeQuoTotalBalance.toLocaleString()}円` : "未設定"}
        </p>
        {isAdmin && (
          <button type="button" className="button button-small button-secondary" onClick={openQuoManage}>
            QUOカード管理
          </button>
        )}
      </div>
      {isAdmin && activeQuoTotalBalance > 0 && activeQuoTotalBalance < alertThreshold && (
        <p className="field-error">残高注意: 有効なQUOカード残高が{alertThreshold.toLocaleString()}円未満です。</p>
      )}

      <section className="lunch-grid">
        {sortedRecords.map((record) => {
          const thumbnail = record.imageUrls?.[0];
          return (
            <button
              key={record.id}
              type="button"
              className="lunch-tile"
              onClick={() => setDetailTarget(record)}
            >
              {thumbnail ? (
                <img src={thumbnail} alt={record.title} className="lunch-tile-image" />
              ) : (
                <div className="lunch-tile-placeholder">🍱</div>
              )}
              <span className="lunch-tile-meta">
                <span className="lunch-tile-date">
                  {formatDateWithWeekday(record.date || toDateKeyFromIso(record.purchasedAt))}
                </span>
                <span className="lunch-tile-duty">当番: {resolveDutyName(record)}</span>
              </span>
            </button>
          );
        })}
      </section>
      {sortedRecords.length === 0 && <p className="muted">お弁当記録はまだありません。</p>}

      <div className="modal-actions">
        <Link to={`/today?date=${targetDate}`} className="button button-secondary">
          Todayへ戻る
        </Link>
      </div>

      {isAddModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeAddModal}>
          <section
            className="modal-panel purchases-complete-modal lunch-add-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeAddModal}>
              ×
            </button>
            <h3>お弁当を追加</h3>
            <div className="lunch-add-modal-content">
              <label>
                タイトル
                <input
                  value={draft.title}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, title: event.target.value }));
                    setErrors((prev) => ({ ...prev, title: undefined }));
                  }}
                />
                {errors.title && <span className="field-error">{errors.title}</span>}
              </label>
              <label>
                金額
                <input
                  type="number"
                  min={1}
                  value={draft.amount}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, amount: event.target.value }));
                    setErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                />
                {errors.amount && <span className="field-error">{errors.amount}</span>}
              </label>
              <label>
                購入日
                <input
                  type="date"
                  value={draft.purchasedAt}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, purchasedAt: event.target.value }));
                    setErrors((prev) => ({ ...prev, purchasedAt: undefined }));
                  }}
                />
                {errors.purchasedAt && <span className="field-error">{errors.purchasedAt}</span>}
              </label>
              <details
                className="lunch-fold-details lunch-split-details"
                open={isSplitDetailsOpen}
                onToggle={(event) => setIsSplitDetailsOpen(event.currentTarget.open)}
              >
                <summary>支払い内訳</summary>
                <section className="lunch-split">
                  {activeQuoCards.map((card) => (
                    <div key={card.id} className="lunch-split-row">
                      <span className="lunch-split-row-label">QUOカード（残高{card.balance.toLocaleString()}円）</span>
                      <input
                        type="number"
                        min={0}
                        value={draft.quoAmounts[card.id] ?? ""}
                        onChange={(event) => setQuoAmount(card.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => fillFromCardBalance(card.id)}
                      >
                        全額
                      </button>
                      {splitErrors.quoByCardId[card.id] && (
                        <p className="field-error">{splitErrors.quoByCardId[card.id]}</p>
                      )}
                    </div>
                  ))}
                  <div className="lunch-split-row">
                    <span className="muted lunch-split-row-label">立替（現金等）</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.reimbursementAmount}
                      onChange={(event) => setReimbursementAmount(event.target.value)}
                    />
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      onClick={fillReimbursementRemaining}
                    >
                      全額
                    </button>
                    {splitErrors.reimbursement && <p className="field-error">{splitErrors.reimbursement}</p>}
                  </div>
                  <p className="muted">
                    合計: {splitTotal.toLocaleString()} / {amountNumber.toLocaleString()} 円（残り {remainAmount.toLocaleString()}円）
                  </p>
                  {splitErrors.section && <p className="field-error">{splitErrors.section}</p>}
                </section>
              </details>

              <details
                className="lunch-fold-details"
                open={isMemoDetailsOpen}
                onToggle={(event) => setIsMemoDetailsOpen(event.currentTarget.open)}
              >
                <summary>メモ（任意）</summary>
                <label className="lunch-fold-body">
                  <textarea
                    value={draft.memo}
                    onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
                  />
                </label>
              </details>

              <details
                className="lunch-fold-details"
                open={isReceiptDetailsOpen}
                onToggle={(event) => setIsReceiptDetailsOpen(event.currentTarget.open)}
              >
                <summary>レシート画像（任意・複数可）</summary>
                <ReceiptImagePicker
                  title=""
                  previews={receiptPreviews}
                  onAddFiles={addReceiptFiles}
                  onRemovePreview={removeReceiptPreview}
                />
              </details>
            </div>
            <div className="modal-actions lunch-add-modal-footer">
              <button type="button" className="button button-secondary" onClick={closeAddModal}>
                キャンセル
              </button>
              <button type="button" className="button" disabled={!canSubmit} onClick={() => void submitLunchRecord()}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}

      {detailTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailTarget(null)}>
          <section className="modal-panel purchases-complete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDetailTarget(null)}>
              ×
            </button>
            <h3>{detailTarget.title}</h3>
            <p className="muted">購入日: {toDateLabel(detailTarget.purchasedAt)}</p>
            <p className="muted">購入者: {resolveBuyerName(detailTarget)}</p>
            <p className="muted">金額: {detailTarget.amount.toLocaleString()}円</p>
            <p className="muted">支払い内訳: {toSplitSummary(detailTarget.paymentSplits, data.quoCards)}</p>
            {detailTarget.memo?.trim() && (
              <>
                <p className="muted">メモ</p>
                <p className="todo-memo-full">
                  <LinkifiedText text={detailTarget.memo} className="todo-linkified-text" />
                </p>
              </>
            )}
            {detailTarget.imageUrls && detailTarget.imageUrls.length > 0 && (
              <div className="purchase-receipt-grid">
                {detailTarget.imageUrls.map((imageUrl, index) => (
                  <article key={`${detailTarget.id}-${index}`} className="purchase-receipt-card">
                    <img src={imageUrl} alt={`${detailTarget.title}-${index + 1}`} className="purchase-receipt-image" />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {isAdmin && isQuoManageOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIsQuoManageOpen(false)}>
          <section
            className="modal-panel purchases-create-modal lunch-add-modal lunch-quo-manage-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="lunch-manage-header">
              <h3>QUOカード管理</h3>
              <div className="lunch-manage-header-actions">
                <button
                  type="button"
                  className="button button-small button-secondary"
                  aria-label="閉じる" title="閉じる"
                  onClick={() => setIsQuoManageOpen(false)}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="lunch-add-modal-content">
              <p className="muted">目安管理です。残高は必要に応じて手動修正してください。</p>
              <div className="lunch-manage-toolbar">
                <button type="button" className="button button-small" onClick={openQuoAddModal}>
                  QUOカードを購入
                </button>
                <button
                  type="button"
                  className={`button button-small ${showArchivedQuoCards ? "" : "button-secondary"}`}
                  onClick={() => setShowArchivedQuoCards((prev) => !prev)}
                >
                  使用済みを表示: {showArchivedQuoCards ? "ON" : "OFF"}
                </button>
              </div>
              {quoManageNotice && <p className="field-error">{quoManageNotice}</p>}
              <div className="lunch-quo-list">
                {visibleQuoCards.map((card) => (
                  <article key={card.id} className="lunch-quo-card">
                    <strong>{formatQuoCardLabel(card)}</strong>
                    <p className="muted">残高: {card.balance.toLocaleString()}円</p>
                    <div className="lunch-quo-actions">
                      <button
                        type="button"
                        className={`button button-small ${card.active ? "" : "button-secondary"}`}
                        disabled={card.archived || (card.active && activeQuoCardCount <= 1)}
                        onClick={() => toggleCardActive(card.id)}
                      >
                        {card.active ? "有効" : "無効"}
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={balanceDrafts[card.id] ?? String(card.balance)}
                        onChange={(event) =>
                          setBalanceDrafts((prev) => ({ ...prev, [card.id]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => applyBalanceEdit(card.id)}
                      >
                        残高更新
                      </button>
                    </div>
                  </article>
                ))}
                {visibleQuoCards.length === 0 && <p className="muted">表示できるカードがありません。</p>}
              </div>
            </div>
          </section>
        </div>
      )}

      {isAdmin && isQuoManageOpen && isQuoAddModalOpen && (
        <div className="modal-backdrop modal-backdrop-front" role="dialog" aria-modal="true" onClick={closeQuoAddModal}>
          <section className="modal-panel purchases-create-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeQuoAddModal}>
              ×
            </button>
            <h3>QUOカード購入</h3>
            <label>
              購入日
              <input
                type="date"
                value={newCardPurchaseDate}
                onChange={(event) => {
                  setNewCardPurchaseDate(event.target.value);
                  setNewCardError((prev) => ({ ...prev, purchaseDate: undefined }));
                }}
              />
              {newCardError.purchaseDate && <span className="field-error">{newCardError.purchaseDate}</span>}
            </label>
            <label>
              初期残高
              <input
                type="number"
                min={0}
                value={newCardBalance}
                onChange={(event) => {
                  setNewCardBalance(event.target.value);
                  setNewCardError((prev) => ({ ...prev, balance: undefined }));
                }}
              />
              {newCardError.balance && <span className="field-error">{newCardError.balance}</span>}
            </label>
            <label>
              メモ（任意）
              <input value={newCardMemo} onChange={(event) => setNewCardMemo(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeQuoAddModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={addQuoCard}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
