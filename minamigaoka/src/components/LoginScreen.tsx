import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, hasFirebaseAuthConfig } from "../config/firebase";
import { isValidLoginId, normalizeLoginId, toInternalAuthEmail } from "../auth/loginId";
import { appRuntimeConfig } from "../config/runtime";

type FieldErrors = {
  loginId?: string;
  password?: string;
};

export function LoginScreen() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedLoginId = normalizeLoginId(loginId);
    const nextErrors: FieldErrors = {};

    if (!normalizedLoginId) {
      nextErrors.loginId = "ログイン ID を入力してください。";
    } else if (!isValidLoginId(normalizedLoginId)) {
      nextErrors.loginId = "ログイン ID は英小文字・数字・.-_ のみ利用できます。";
    }

    if (!password) {
      nextErrors.password = "パスワードを入力してください。";
    }

    setFieldErrors(nextErrors);
    setFormError("");

    if (nextErrors.loginId || nextErrors.password) return;
    if (!hasFirebaseAuthConfig || !auth) {
      setFormError("Firebase 認証設定が未入力です。.env を設定してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, toInternalAuthEmail(normalizedLoginId), password);
    } catch {
      setFormError("ログイン ID またはパスワードが正しくありません。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <section className="auth-card">
        <p className="auth-eyebrow">{appRuntimeConfig.appName}</p>
        <h1>ログイン</h1>
        <p className="muted">配布されたログイン ID とパスワードを入力してください。</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            ログイン ID
            <input
              autoComplete="username"
              value={loginId}
              onChange={(event) => {
                setLoginId(event.target.value);
                setFieldErrors((current) => ({ ...current, loginId: undefined }));
              }}
              placeholder="例: tanaka01"
            />
            {fieldErrors.loginId && <span className="field-error">{fieldErrors.loginId}</span>}
          </label>
          <label>
            パスワード
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
            />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </label>
          {formError && <p className="field-error auth-form-error">{formError}</p>}
          {!hasFirebaseAuthConfig && (
            <p className="field-error auth-form-error">
              Firebase 設定が未入力のためログインできません。`.env` を設定してください。
            </p>
          )}
          <button type="submit" className="button" disabled={isSubmitting}>
            {isSubmitting ? "ログイン中..." : "ログイン"}
          </button>
        </form>
        <p className="muted auth-help">パスワードを忘れた場合は管理者へ連絡してください。</p>
      </section>
    </div>
  );
}
