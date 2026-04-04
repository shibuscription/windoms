import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

export type UploadedStorageFile = {
  name: string;
  size: number;
  type: string;
  storagePath: string;
  downloadUrl?: string;
};

const sanitizeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, "_");

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const tryGetDownloadUrl = async (storage: FirebaseStorage, storagePath: string): Promise<string | undefined> => {
  try {
    return await withTimeout(
      getDownloadURL(ref(storage, storagePath)),
      8000,
      "画像URLの取得がタイムアウトしました。",
    );
  } catch {
    return undefined;
  }
};

export const uploadFilesToStorage = async (
  storage: FirebaseStorage,
  folder: string,
  files: File[],
): Promise<UploadedStorageFile[]> => {
  return Promise.all(
    files.map(async (file, index) => {
      const storagePath = `${folder}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
      const attachmentRef = ref(storage, storagePath);
      await withTimeout(
        uploadBytes(attachmentRef, file, file.type ? { contentType: file.type } : undefined),
        20000,
        "画像のアップロードがタイムアウトしました。",
      );

      return {
        name: file.name,
        size: file.size,
        type: file.type,
        storagePath,
        downloadUrl: await tryGetDownloadUrl(storage, storagePath),
      };
    }),
  );
};
