type ConfirmationDialogProps = {
  title: string;
  message?: string;
  summary?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmationDialog({
  title,
  message,
  summary,
  confirmLabel = "確認",
  cancelLabel = "キャンセル",
  danger = false,
  busy = false,
  onClose,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={onClose}>
          ×
        </button>
        <h3>{title}</h3>
        {message && <p className="modal-context">{message}</p>}
        {summary && <p className="modal-summary">{summary}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${danger ? "events-danger-button" : ""}`}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
