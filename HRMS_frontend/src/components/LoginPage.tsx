import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { UserRole } from '../types';
import { Eye, EyeOff, AlertCircle, Loader2, Sun, Moon } from 'lucide-react';

import { AppLogo } from './ui/AppLogo';
import { InteractiveKraCard, InteractiveReviewPath, LoginShowcase } from './login/LoginShowcase';
import { getCompanyCode, setCompanyCode } from '../services/api';
import { hrApi } from '../services/hrApi';

/** Slightly larger fields than the in-app forms: the sign-in form is the only thing on screen. */
const FIELD_LABEL = 'block text-sm font-medium text-slate-800 dark:text-slate-200';
const FIELD_INPUT =
  'w-full h-11 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition-colors disabled:opacity-60';

interface QuickRole {
  role: UserRole;
  title: string;
  shortLabel: string;
  email: string;
  name: string;
}

const QUICK_ROLES: QuickRole[] = [
  { role: 'SUPER_ADMIN', title: 'Super Admin', shortLabel: 'Admin', email: 'admin@arisotech.com', name: 'Arisotech Admin' },
  { role: 'HR', title: 'HR Manager', shortLabel: 'HR', email: 'hr@arisotech.com', name: 'Arisotech HR' },
  { role: 'MANAGEMENT', title: 'Executive Management', shortLabel: 'Executive', email: 'executive@arisotech.com', name: 'Arisotech Executive' },
];

/** Soft diagonal light planes behind the brand panel. Purely decorative. */
const BrandBackdrop: React.FC = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="absolute -top-1/4 -right-1/4 w-[70%] h-[80%] rotate-[35deg] bg-gradient-to-b from-white/[0.09] to-transparent" />
    <div className="absolute top-[10%] right-[-15%] w-[40%] h-[55%] rotate-[35deg] bg-gradient-to-b from-white/[0.06] to-transparent" />
    <div className="absolute -bottom-1/3 -left-1/4 w-[65%] h-[60%] rotate-[35deg] bg-gradient-to-t from-black/20 to-transparent" />
  </div>
);

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotInfo, setShowForgotInfo] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<QuickRole | null>(null);
  // Company code: asked for only when the server hosts more than one company.
  const [companyCode, setCompanyCodeState] = useState(() => getCompanyCode());
  const [showCompanyCode, setShowCompanyCode] = useState(() => Boolean(getCompanyCode()));

  const updateCompanyCode = (value: string) => {
    setCompanyCodeState(value);
    setCompanyCode(value);
  };

  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSendResetLink = async () => {
    if (!email.trim()) {
      setError('Enter your employee ID or work email first, then ask for a reset link.');
      return;
    }
    setError(null);
    setResetState('sending');
    try {
      await hrApi.forgotPassword(email.trim());
      setResetState('sent');
    } catch (err: any) {
      setResetState('idle');
      handleLoginError(err, 'Could not send a reset link. Try again in a moment.');
    }
  };

  const handleLoginError = (err: any, fallback: string) => {
    if (err?.code === 'COMPANY_CODE_REQUIRED') setShowCompanyCode(true);
    setError(err?.message || fallback);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter your employee ID or email, and your password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      handleLoginError(err, 'Sign-in failed. Check your ID and password, then try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (quickRole: QuickRole) => {
    setError(null);
    if (!password.trim()) {
      setError(`Enter the password for ${quickRole.email}.`);
      return;
    }
    setIsSubmitting(true);
    try {
      await login(quickRole.email, password);
    } catch (err: any) {
      handleLoginError(err, 'Demo sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectPersona = (qr: QuickRole) => {
    setSelectedPersona(qr);
    setEmail(qr.email);
    setPassword('password@123');
    setError(null);
  };

  const isActionLocked = isLoading || isSubmitting;
  const showDemo = import.meta.env.VITE_ENABLE_DEMO_PERSONAS === 'true';

  return (
    <div className="h-dvh max-h-dvh w-full overflow-hidden flex bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased">
      {/* Brand panel (large screens): what Arisotech HRMS does, shown with the app's own rating scale */}
      <aside className="relative hidden lg:flex lg:w-1/2 flex-col h-full overflow-hidden bg-indigo-900 dark:bg-indigo-950 text-white px-10 xl:px-16 py-8 shrink-0">
        <BrandBackdrop />
        <LoginShowcase />

        <div className="relative flex items-center gap-2.5 shrink-0">
          <AppLogo className="w-8 h-8" />
          <span className="text-lg font-semibold tracking-tight">Arisotech HRMS</span>
        </div>

        <div className="relative w-full max-w-lg my-auto py-6">
          <span className="inline-flex items-center rounded-md bg-white/10 ring-1 ring-inset ring-white/15 px-2.5 py-1 text-xs font-medium text-indigo-50">
            Enterprise HRMS
          </span>
          <h2 className="mt-4 text-3xl xl:text-4xl 2xl:text-[2.75rem] font-bold leading-[1.15] tracking-tight text-balance">
            Every rating comes with its reason.
          </h2>
          <p className="mt-3 text-sm xl:text-base text-indigo-100/80 leading-relaxed max-w-md">
            Self-assessments, manager and HOD scoring, and HR approval, all on one scale everyone can read.
          </p>

          <div className="mt-7">
            <InteractiveKraCard />
          </div>

          <InteractiveReviewPath />
        </div>
      </aside>

      {/* Sign-in */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 lg:bg-white lg:dark:bg-slate-950">
        <header className="px-5 sm:px-8 pt-5 sm:pt-6 flex items-center justify-between lg:justify-end shrink-0">
          <div className="flex items-center gap-2 lg:hidden">
            <AppLogo className="w-7 h-7" />
            <span className="text-base font-semibold text-slate-900 dark:text-white">Arisotech HRMS</span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            id="login-theme-toggle-btn"
            className="h-8 w-11 inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <main className="flex-1 w-full px-5 sm:px-8 flex items-center justify-center py-6 min-h-0">
          <div className="w-full max-w-[25rem]">
            <h1 className="text-3xl sm:text-[2.125rem] font-bold tracking-tight text-slate-900 dark:text-white">Welcome back</h1>
            <p className="mt-1.5 text-sm sm:text-base text-slate-600 dark:text-slate-400">Sign in to your workspace</p>

            <div className="mt-6 space-y-4">
              {/* Demo users: only when VITE_ENABLE_DEMO_PERSONAS=true */}
              {showDemo && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Demo access</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Demo only</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {QUICK_ROLES.map((qr) => {
                      const isSelected = selectedPersona?.role === qr.role;
                      return (
                        <button
                          key={qr.role}
                          type="button"
                          onClick={() => handleSelectPersona(qr)}
                          aria-pressed={isSelected}
                          title={`Use the ${qr.title} demo user`}
                          className={`h-9 px-2 rounded-lg border text-sm font-medium truncate transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 dark:border-indigo-500 text-indigo-800 dark:text-indigo-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {qr.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  {selectedPersona && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-850 px-2.5 py-2 animate-fadeIn">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{selectedPersona.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{selectedPersona.email}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickLogin(selectedPersona)}
                        disabled={isActionLocked}
                        className="shrink-0 h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                      >
                        {isActionLocked && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                        Sign in as {selectedPersona.shortLabel}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-300 flex items-start gap-2 animate-fadeIn"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className={FIELD_LABEL}>
                    Employee ID or work email
                  </label>
                  <input
                    id="login-email"
                    type="text"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com or EMP001"
                    disabled={isActionLocked}
                    className={FIELD_INPUT}
                  />
                </div>

                {showCompanyCode && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label htmlFor="login-company" className={FIELD_LABEL}>
                      Company code
                    </label>
                    <input
                      id="login-company"
                      type="text"
                      autoComplete="organization"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={companyCode}
                      onChange={(e) => updateCompanyCode(e.target.value)}
                      placeholder="e.g. acme"
                      disabled={isActionLocked}
                      className={FIELD_INPUT}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">The short code your HR team gave you for your company.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="login-password" className={FIELD_LABEL}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotInfo(!showForgotInfo)}
                      aria-expanded={showForgotInfo}
                      aria-controls="login-forgot-help"
                      className="text-sm font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isActionLocked}
                      className={`${FIELD_INPUT} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 px-3.5 flex items-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer rounded-r-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {showForgotInfo && (
                  <div
                    id="login-forgot-help"
                    className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed rounded-lg bg-slate-100 dark:bg-slate-800/60 px-3 py-2.5 space-y-1.5 animate-fadeIn"
                  >
                    {resetState === 'sent' ? (
                      <p role="status">
                        If an account matches, we have emailed a link to choose a new password. It works once and expires in 30 minutes.
                      </p>
                    ) : (
                      <>
                        <p>Enter your employee ID or work email above and we will email you a link to choose a new password.</p>
                        <button
                          type="button"
                          onClick={handleSendResetLink}
                          disabled={resetState === 'sending'}
                          className="font-semibold text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer disabled:opacity-60 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          {resetState === 'sending' ? 'Sending…' : 'Email me a reset link'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isActionLocked}
                  className="w-full h-11 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-offset-slate-950 !mt-6"
                >
                  {isActionLocked && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {isActionLocked ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>
          </div>
        </main>

        <footer className="px-5 sm:px-8 pb-5 text-xs text-slate-500 dark:text-slate-400 shrink-0 text-center">
          © {new Date().getFullYear()} Arisotech HRMS
        </footer>
      </div>
    </div>
  );
};
