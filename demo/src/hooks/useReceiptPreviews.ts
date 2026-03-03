import { useCallback, useEffect, useState } from "react";

export type ReceiptPreview = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

const makeReceiptPreviewId = (file: File) =>
  `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useReceiptPreviews = () => {
  const [previews, setPreviews] = useState<ReceiptPreview[]>([]);

  const revokePreviews = useCallback((items: ReceiptPreview[]) => {
    items.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  useEffect(() => {
    return () => {
      revokePreviews(previews);
    };
  }, [previews, revokePreviews]);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextItems: ReceiptPreview[] = Array.from(files).map((file) => ({
      id: makeReceiptPreviewId(file),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
    }));
    setPreviews((prev) => [...prev, ...nextItems]);
  }, []);

  const removePreview = useCallback((id: string) => {
    setPreviews((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clearPreviews = useCallback(() => {
    setPreviews((prev) => {
      revokePreviews(prev);
      return [];
    });
  }, [revokePreviews]);

  return {
    previews,
    addFiles,
    removePreview,
    clearPreviews,
  };
};
