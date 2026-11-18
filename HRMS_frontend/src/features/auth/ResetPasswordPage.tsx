import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { AppLogo } from '../../components/ui/AppLogo';
import { INPUT_CLASS, LABEL_CLASS } from '../../components/ui/formStyles';
import { hrApi } from '../../services/hrApi';

const MIN_LENGTH = 10;

/**
 * Opened from the link in a "reset your password" or "set your password" email.
 * The link's token identifies the account and company; nothing else is needed.
 */
export const ResetPasswordPage: React.FC = () => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const rules = [
    { ok: password.length >= MIN_LENGTH, label: `At least ${MIN_LENGTH} characters` },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: 'A letter and a number' },
    { ok: password.length > 0 && password === confirm, label: 'Both entries match' },
  ];
  const canSubmit = !!token && rules.every((r) => r.ok) && !isSaving;

  const goToSignIn = () => {
    window.location.href = '/';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      await hrApi.resetPassword(token, password);
      setIsDone(true);
    } catch (err: any) {
      setError(err.message || 'Could not set your password. Request a new link and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <AppLogo className="w-8 h-8" />
          <span className="text-base font-semibold text-slate-900 dark:text-white">Arisotech HRMS</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          {isDone ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Password set</h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    You can now sign in with your new password. Any other devices have been signed out.
                  </p>
                </div>
              </div>
              <button type="button" onClick={goToSignIn} className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500">
                Go to sign in
              </button>
            </div>
          ) : !token ? (
            <div className="space-y-4">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">This link is not valid</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Open the link from your email again, or request a new one from the sign-in page using “Forgot your password?”.
              </p>
              <button type="button" onClick={goToSignIn} className="text-sm font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer">
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Choose a new password</h1>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">This link works once.</p>
              </div>

              {error && (
                <div role="alert" className="p-2.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="new-password" className={LABEL_CLASS}>New password</label>
                <div className="relative">
                  <input id="new-password" type={show ? 'text' : 'password'} required autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${INPUT_CLASS} pr-10`} />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                    {show ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="confirm-password" className={LABEL_CLASS}>Type it again</label>
                <input id="confirm-password" type={show ? 'text' : 'password'} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT_CLASS} />
              </div>

              <ul className="space-y-1">
                {rules.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {r.label}
                  </li>
                ))}
              </ul>

              <button type="submit" disabled={!canSubmit} className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500">
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Set password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
