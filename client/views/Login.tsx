"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, KeyRound, Loader2, Lock, Mail } from "lucide-react";
import { btn } from "@/components/kit";
import { AuthField, AuthAlert, AuthNote, PasswordToggle } from "@/components/auth/AuthField";
import { AuthSplit, AuthHeading, AsideChecklist, AsideHana, AsideStats, asideMuted } from "@/components/auth/AuthSplit";
import { CodeForm, codeErrorMessage } from "@/components/auth/CodeForm";
import { authClient } from "@/lib/authClient";
import { afterSignIn, checkSession, clearAuth, getUser, refreshUser } from "@/lib/auth";
import { withNext } from "@/lib/returnPath";
import { goTo } from "@/lib/consent/store";
import { cn } from "@/lib/utils";

// Sign in leads with an email code: enter your email, type the 6-digit code
// we send. A password works too for anyone who has set one, and a forgotten
// password is reset with a code. Accounts from before the move to Better Auth
// verify their email once: signing in with a code does it, and a password
// sign-in asks for a code first. Admins and mentors sign in the same way.

const validateEmail = (v: string) =>
  !v ? "Enter your email" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Enter a valid email address" : null;

type Mode = "email" | "code" | "password" | "verify" | "forgot" | "reset";

type AuthError = { code?: string; status?: number; message?: string } | null | undefined;

function SubmitButton({ loading, loadingLabel, label, icon }: { loading: boolean; loadingLabel: string; label: string; icon?: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading} aria-busy={loading || undefined} className={cn(btn({ size: "lg" }), "h-11 w-full text-[15px]")}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {loading ? loadingLabel : label}
    </button>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-ui-brand-text hover:underline">
      {children}
    </button>
  );
}

const sendError = (error: AuthError) =>
  error?.status === 429 ? "Too many requests. Please wait a minute and try again." : "Couldn't send the code. Please try again.";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expired, setExpired] = useState(searchParams.get("expired") === "1");
  // ?next=: the page to return to after signing in (an emailed course link).
  // Only used once returnPath has checked it; never rendered as text.
  const returnTo = searchParams.get("next");
  const signUpHref = withNext("/sign-up", returnTo);

  // Ask the server before deciding anything. Already signed in (say, in
  // another tab): go where they were headed instead of showing the form.
  // No session: a cached user left behind means it ended (expired, or signed
  // out elsewhere), so say so and drop the stale copy. If the server couldn't
  // answer, change nothing.
  useEffect(() => {
    let cancelled = false;
    const hadCachedUser = getUser() !== null;
    void checkSession().then(({ ok, user }) => {
      if (cancelled || !ok) return;
      if (user) {
        goTo(router, afterSignIn(user, returnTo), { replace: true });
        return;
      }
      if (hadCachedUser) setExpired(true);
      if (hadCachedUser || searchParams.get("expired") === "1") clearAuth();
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, returnTo]);

  function go(next: Mode) {
    setError(null);
    setNotice(null);
    setMode(next);
  }

  async function finish() {
    const user = await refreshUser();
    // Back to the page asked for, if this role can use it; else the role's home.
    // goTo: into an untracked page (a staff area, a checkout) while GTM runs is a full load.
    if (user) goTo(router, afterSignIn(user, returnTo));
    else setError("Signed in, but the session didn't stick. Please try again.");
  }

  // ── email → code ──
  async function sendSignInCode(e?: React.FormEvent) {
    e?.preventDefault();
    const problem = validateEmail(email);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (err) return setError(sendError(err));
    go("code");
  }

  // ── password ──
  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateEmail(email) ?? (!password ? "Enter your password" : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password, rememberMe: remember });
    setBusy(false);
    if (!err) return finish();
    if (err.code === "EMAIL_NOT_VERIFIED") {
      // Better Auth has just emailed a verification code.
      setMode("verify");
      setNotice("We've moved to a new sign-in system. Please confirm your email once with the code we just sent.");
      return;
    }
    if (err.status === 429) return setError("Too many sign-in attempts. Please wait a minute and try again.");
    if (err.code === "INVALID_EMAIL_OR_PASSWORD")
      return setError("Email or password is incorrect. Try again, or sign in with an email code instead.");
    setError("Something went wrong. Please try again.");
  }

  // ── forgot → reset ──
  async function sendResetCode(e?: React.FormEvent) {
    e?.preventDefault();
    const problem = validateEmail(email);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.requestPasswordReset({ email });
    setBusy(false);
    if (err) return setError(sendError(err));
    go("reset");
  }

  const subtitles: Record<Mode, string> = {
    email: "We'll email you a code to sign in. No password needed.",
    code: "Check your inbox for the 6-digit code.",
    password: "Sign in with your email and password.",
    verify: "Confirm your email to continue.",
    forgot: "We'll email you a code to choose a new password.",
    reset: "Enter the code and your new password.",
  };

  const emailField = (
    <AuthField
      id="si-email"
      type="email"
      label="Email address"
      autoComplete="email"
      required
      placeholder="you@example.com"
      value={email}
      onChange={(e) => {
        setEmail(e.target.value.trim());
        setError(null);
      }}
      icon={<Mail />}
      validator={validateEmail}
    />
  );

  return (
    <AuthSplit
      topPrompt={{ text: "New here?", ctaLabel: "Create a free account", ctaHref: signUpHref }}
      asideLabel="About Hadafi"
      aside={<SignInAside />}
      width={400}
    >
      <div className="flex flex-col gap-7">
        <AuthHeading title="Sign in to Hadafi" subtitle={subtitles[mode]} />

        <div className="flex flex-col gap-4">
          {expired && mode === "email" && (
            <AuthNote icon={<Clock />}>Your session has ended. Please sign in again to continue.</AuthNote>
          )}
          {notice && <AuthNote>{notice}</AuthNote>}

          {mode === "email" && (
            <form onSubmit={sendSignInCode} className="flex flex-col gap-4" noValidate>
              {emailField}
              {error && <AuthAlert id="si-err">{error}</AuthAlert>}
              <SubmitButton loading={busy} loadingLabel="Sending code" label="Email me a sign-in code" icon={<KeyRound className="h-[18px] w-[18px]" aria-hidden />} />
              <p className="text-center text-[13px] text-ui-muted">
                Have a password? <LinkButton onClick={() => go("password")}>Sign in with password</LinkButton>
              </p>
            </form>
          )}

          {mode === "code" && (
            <CodeForm
              email={email}
              intro={
                <>
                  If <strong className="font-semibold">{email}</strong> has a Hadafi account, we sent it a 6-digit code.
                  No email after a minute? Check spam, or{" "}
                  <Link href={signUpHref} className="font-semibold text-ui-brand-text hover:underline">
                    create a free account
                  </Link>
                  .
                </>
              }
              submitLabel="Sign in"
              submittingLabel="Signing in"
              onSubmit={async (otp) => {
                const { error: err } = await authClient.signIn.emailOtp({ email, otp });
                if (err) return codeErrorMessage(err);
                await finish();
                return null;
              }}
              onResend={async () => {
                const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
                return err ? sendError(err) : null;
              }}
              onBack={() => go("email")}
              backLabel="Use a different email"
            />
          )}

          {mode === "password" && (
            <form onSubmit={signInWithPassword} className="flex flex-col gap-4" noValidate>
              {emailField}
              <AuthField
                id="si-pass"
                type={showPassword ? "text" : "password"}
                label="Password"
                labelAside={
                  <button type="button" onClick={() => go("forgot")} className="text-[13px] font-semibold text-ui-brand-text hover:underline">
                    Forgot password?
                  </button>
                }
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                icon={<Lock />}
                trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
              />
              <label className="inline-flex cursor-pointer items-center gap-2 self-start text-sm text-ui-text">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-ui-brand" />
                Remember me
              </label>
              {error && <AuthAlert id="si-err">{error}</AuthAlert>}
              <SubmitButton loading={busy} loadingLabel="Signing in" label="Sign in" />
              <p className="text-center text-[13px] text-ui-muted">
                <LinkButton onClick={() => go("email")}>Sign in with an email code instead</LinkButton>
              </p>
            </form>
          )}

          {mode === "verify" && (
            <CodeForm
              email={email}
              submitLabel="Confirm and sign in"
              submittingLabel="Confirming"
              onSubmit={async (otp) => {
                const { error: err } = await authClient.emailOtp.verifyEmail({ email, otp });
                if (err) return codeErrorMessage(err);
                await finish();
                return null;
              }}
              onResend={async () => {
                const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
                return err ? sendError(err) : null;
              }}
              onBack={() => go("password")}
              backLabel="Back to sign in"
            />
          )}

          {mode === "forgot" && (
            <form onSubmit={sendResetCode} className="flex flex-col gap-4" noValidate>
              {emailField}
              {error && <AuthAlert id="si-err">{error}</AuthAlert>}
              <SubmitButton loading={busy} loadingLabel="Sending code" label="Email me a reset code" />
              <p className="text-center text-[13px] text-ui-muted">
                <LinkButton onClick={() => go("password")}>Back to sign in</LinkButton>
              </p>
            </form>
          )}

          {mode === "reset" && (
            <CodeForm
              email={email}
              intro={
                <>
                  If <strong className="font-semibold">{email}</strong> has a Hadafi account, we sent it a 6-digit code. Enter it with your new password.
                </>
              }
              submitLabel="Set new password and sign in"
              submittingLabel="Saving"
              canSubmit={newPassword.length >= 8}
              onSubmit={async (otp) => {
                const { error: err } = await authClient.emailOtp.resetPassword({ email, otp, password: newPassword });
                if (err) return err.code === "PASSWORD_TOO_SHORT" ? "Use at least 8 characters." : codeErrorMessage(err);
                const signedIn = await authClient.signIn.email({ email, password: newPassword, rememberMe: true });
                if (signedIn.error) {
                  go("password");
                  setNotice("Your password is changed. Sign in with it now.");
                  return null;
                }
                await finish();
                return null;
              }}
              onResend={async () => {
                const { error: err } = await authClient.emailOtp.requestPasswordReset({ email });
                return err ? sendError(err) : null;
              }}
              onBack={() => go("password")}
              backLabel="Back to sign in"
            >
              <AuthField
                id="si-new-pass"
                type={showPassword ? "text" : "password"}
                label="New password"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                icon={<Lock />}
                help="At least 8 characters."
                trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
              />
            </CodeForm>
          )}
        </div>

        <p className="text-sm text-ui-muted">
          Don&apos;t have an account?{" "}
          <Link href={signUpHref} className="font-semibold text-ui-brand-text hover:underline">
            Register for free
          </Link>
        </p>
      </div>
    </AuthSplit>
  );
}

function SignInAside() {
  return (
    <>
      <div className="flex max-w-[460px] flex-col gap-4">
        <h2 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.03em]">
          Empower your business with Hadafi, for free.
        </h2>
        <p className={cn("text-base leading-[1.6]", asideMuted)}>
          Training, mentors, tools and a global community of women entrepreneurs. Everything you need to start and
          grow your business.
        </p>
      </div>
      <AsideChecklist
        items={[
          "24/7 AI mentors built for women entrepreneurs",
          "Live events with global industry experts",
          "Exclusive partner offers and discounts",
          "Free to join, no credit card needed",
        ]}
      />
      <img
        src="/images/redesign/hadafi-hero.webp"
        alt=""
        className="block h-[200px] w-full rounded-[14px] object-cover object-[60%_40%] opacity-[0.92]"
      />
      <div className="mt-auto flex max-w-[460px] flex-col gap-3.5">
        <AsideHana>
          Welcome back. Once you&apos;re in, I&apos;ll pick up where you left off: your next lesson, your certificates
          and your points.
        </AsideHana>
        <AsideStats />
      </div>
    </>
  );
}
