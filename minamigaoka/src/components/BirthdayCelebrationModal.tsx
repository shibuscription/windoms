import type { MemberRecord } from "../members/types";
import { formatBirthdayCelebrationName } from "../members/birthday";
import { formatDateYmd, formatWeekdayJa } from "../utils/date";

type BirthdayCelebrationModalProps = {
  date: string;
  celebrants: MemberRecord[];
  onClose: () => void;
};

export function BirthdayCelebrationModal({
  date,
  celebrants,
  onClose,
}: BirthdayCelebrationModalProps) {
  if (celebrants.length === 0) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel birthday-modal" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="閉じる"
          title="閉じる"
        >
          ×
        </button>
        <p className="modal-context">
          {formatDateYmd(date)}（{formatWeekdayJa(date)}）
        </p>
        <div className="birthday-modal-header">
          <span className="birthday-modal-icon" aria-hidden="true">
            🎂
          </span>
          <h3>お誕生日</h3>
        </div>
        {celebrants.length === 1 ? (
          <p className="modal-summary">
            今日は {formatBirthdayCelebrationName(celebrants[0])} のお誕生日です。
          </p>
        ) : (
          <>
            <p className="modal-summary">今日は次のみなさんのお誕生日です。</p>
            <ul className="birthday-modal-list">
              {celebrants.map((member) => (
                <li key={member.id}>{formatBirthdayCelebrationName(member)}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
