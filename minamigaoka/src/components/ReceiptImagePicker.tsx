import type { ReceiptPreview } from "../hooks/useReceiptPreviews";
import { useState } from "react";
import { ImagePreviewModal } from "./ImagePreviewModal";

type ReceiptImagePickerProps = {
  previews: ReceiptPreview[];
  onAddFiles: (files: FileList | null) => void;
  onRemovePreview: (id: string) => void;
  title?: string;
};

export function ReceiptImagePicker({
  previews,
  onAddFiles,
  onRemovePreview,
  title = "レシート画像（任意・複数）",
}: ReceiptImagePickerProps) {
  const [previewTarget, setPreviewTarget] = useState<{ src: string; alt: string } | null>(null);

  return (
    <div className="purchase-receipts">
      {title ? <p className="purchase-receipts-title">{title}</p> : null}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          onAddFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      {previews.length > 0 && (
        <div className="purchase-receipt-grid">
          {previews.map((preview) => (
            <article key={preview.id} className="purchase-receipt-card">
              <button
                type="button"
                className="purchase-receipt-image-button"
                onClick={() => setPreviewTarget({ src: preview.url, alt: preview.name })}
              >
                <img src={preview.url} alt={preview.name} className="purchase-receipt-image" />
              </button>
              <p className="purchase-receipt-name" title={preview.name}>
                {preview.name}
              </p>
              <button
                type="button"
                className="button button-small button-secondary"
                onClick={() => onRemovePreview(preview.id)}
              >
                削除
              </button>
            </article>
          ))}
        </div>
      )}
      <ImagePreviewModal src={previewTarget?.src ?? null} alt={previewTarget?.alt} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}
