import { formatDateYmd, formatWeekdayJa } from "../utils/date";

type DayNoticeViewModalProps = {
  date: string;
  notice: string;
  onClose: () => void;
};

type DayNoticeEditorModalProps = {
  date: string;
  value: string;
  error?: string;
  busy?: boolean;
  canDelete?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  onDelete?: () => void;
};

export function DayNoticeViewModal({ date, notice, onClose }: DayNoticeViewModalProps) {
  return (
    <div className="modal-backdrop modal-backdrop-front" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="modal-panel day-notice-modal-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={onClose}>
          ×
        </button>
        <h3>当日の注意事項</h3>
        <p className="modal-context">
          {formatDateYmd(date)}（{formatWeekdayJa(date)}）
        </p>
        <p className="day-notice-modal-text">{notice}</p>
        <div className="modal-actions">
          <button type="button" className="button button-small" onClick={onClose}>
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}

export function DayNoticeEditorModal({
  date,
  value,
  error,
  busy = false,
  canDelete = false,
  onChange,
  onClose,
  onSave,
  onDelete,
}: DayNoticeEditorModalProps) {
  return (
    <div className="modal-backdrop modal-backdrop-front" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="modal-panel day-notice-editor-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={onClose}>
          ×
        </button>
        <h3>当日の注意事項</h3>
        <p className="modal-context">
          {formatDateYmd(date)}（{formatWeekdayJa(date)}）
        </p>
        <label className="day-notice-editor-field">
          <span>本文</span>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="注意事項を入力してください"
            disabled={busy}
          />
          {error && <span className="field-error">{error}</span>}
        </label>
        <div className="modal-actions day-notice-editor-actions">
          {canDelete && onDelete && (
            <button type="button" className="button button-secondary" onClick={onDelete} disabled={busy}>
              削除
            </button>
          )}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
            キャンセル
          </button>
          <button type="button" className="button" onClick={() => void onSave()} disabled={busy}>
            保存
          </button>
        </div>
      </section>
    </div>
  );
}
