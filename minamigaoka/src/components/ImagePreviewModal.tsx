import { createPortal } from "react-dom";
import { useEffect } from "react";

type ImagePreviewModalProps = {
  src: string | null;
  alt?: string;
  onClose: () => void;
};

export function ImagePreviewModal({ src, alt = "添付画像プレビュー", onClose }: ImagePreviewModalProps) {
  useEffect(() => {
    if (!src) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [src, onClose]);

  if (!src) return null;

  const content = (
    <div className="modal-backdrop modal-backdrop-front attachment-preview-backdrop" onClick={onClose}>
      <section
        className="modal-panel attachment-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="画像プレビュー"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={onClose}>
          ×
        </button>
        <img src={src} alt={alt} className="attachment-preview-image" />
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
