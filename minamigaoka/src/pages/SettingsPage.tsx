import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../config/firebase";

type PasswordFormErrors = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  form?: string;
};

const toPasswordErrorMessage = (code: string): string => {
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "現在のパスワードが正しくありません。";
  }
  if (code === "auth/weak-password") {
    return "新しいパスワードは 6 文字以上で入力してください。";
  }
  if (code === "auth/requires-recent-login") {
    return "再認証が必要です。いったんログアウトして再ログイン後にもう一度お試しください。";
  }
  if (code === "auth/network-request-failed") {
    return "通信に失敗しました。接続状況を確認してもう一度お試しください。";
  }
  return "パスワード変更に失敗しました。時間をおいてもう一度お試しください。";
};

export function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<PasswordFormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitPasswordChange = async () => {
    const nextErrors: PasswordFormErrors = {};
    const currentUser = auth?.currentUser ?? null;

    if (!currentPassword) nextErrors.currentPassword = "現在のパスワードを入力してください。";
    if (!newPassword) {
      nextErrors.newPassword = "新しいパスワードを入力してください。";
    } else if (newPassword.length < 6) {
      nextErrors.newPassword = "新しいパスワードは 6 文字以上で入力してください。";
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = "確認用パスワードを入力してください。";
    } else if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = "新しいパスワードと確認入力が一致していません。";
    }
    if (!currentUser?.email) {
      nextErrors.form = "現在の認証情報を確認できません。再ログイン後にもう一度お試しください。";
    }

    setErrors(nextErrors);
    setSuccessMessage("");
    if (Object.keys(nextErrors).length > 0 || !currentUser?.email) return;

    setIsSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      setSuccessMessage("パスワードを変更しました。");
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
      setErrors({ form: toPasswordErrorMessage(code) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card settings-page">
      <div className="settings-page-header">
        <h1>設定</h1>
        <p className="muted">ログイン中の本人が利用する設定を扱います。</p>
      </div>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>パスワード変更</h2>
          <p className="muted">現在のパスワードで再認証してから、新しいパスワードへ変更します。</p>
        </div>

        <div className="settings-form-grid">
          <label>
            現在のパスワード
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setErrors((current) => ({ ...current, currentPassword: undefined, form: undefined }));
              }}
            />
            {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
          </label>

          <label>
            新しいパスワード
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setErrors((current) => ({ ...current, newPassword: undefined, confirmPassword: undefined, form: undefined }));
              }}
            />
            {errors.newPassword && <span className="field-error">{errors.newPassword}</span>}
          </label>

          <label>
            新しいパスワード（確認）
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setErrors((current) => ({ ...current, confirmPassword: undefined, form: undefined }));
              }}
            />
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
          </label>
        </div>

        {errors.form && <p className="field-error">{errors.form}</p>}
        {successMessage && <div className="inline-toast">{successMessage}</div>}

        <div className="settings-actions">
          <button type="button" className="button" onClick={() => void submitPasswordChange()} disabled={isSubmitting}>
            {isSubmitting ? "変更中..." : "パスワードを変更"}
          </button>
        </div>
      </section>
    </section>
  );
}
