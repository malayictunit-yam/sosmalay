import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldAlert, Loader2, Eye, EyeOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — RescueNow" },
      { name: "description", content: "Sign in or create a RescueNow account to activate emergency alerts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/home" });
  },
  component: AuthPage,
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <a href="/auth" className="mt-4 inline-block text-[color:var(--danger)] underline">
          Reload
        </a>
      </div>
    </div>
  ),
});

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", phone: "" });
  const navigate = useNavigate();

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const parsed = signUpSchema.safeParse(form);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/home`,
            data: { full_name: parsed.data.fullName, phone: parsed.data.phone },
          },
        });
        if (error) throw error;
        toast.success("Welcome to RescueNow");
        navigate({ to: "/home" });
      } else {
        const parsed = signInSchema.safeParse(form);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/home" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        return;
      }
      if (!result.redirected) navigate({ to: "/home" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-panic-radial p-12 text-white md:block">
        <Link to="/" className="inline-flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-5 w-5" /> RescueNow
        </Link>
        <div className="mt-24">
          <h2 className="font-display text-4xl font-bold leading-tight">
            Help arrives faster
            <br /> when seconds matter.
          </h2>
          <p className="mt-4 max-w-sm text-white/85">
            Your one-tap link to Police and MDRRMO. Live GPS updates every 15 seconds until
            the emergency is resolved.
          </p>
        </div>
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      </aside>

      <main className="grid place-items-center p-6 md:p-12">
        <div className="w-full max-w-md slide-up">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 font-semibold md:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--danger)] text-white">
              <ShieldAlert className="h-5 w-5" />
            </span>
            RescueNow
          </Link>

          <h1 className="font-display text-3xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to activate emergency alerts."
              : "You'll be ready to send help in under a minute."}
          </p>

          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium transition hover:bg-secondary disabled:opacity-50"
          >
            <GoogleIcon /> Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or with email <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === "signup" && (
              <>
                <Field label="Full name">
                  <input
                    required
                    value={form.fullName}
                    onChange={update("fullName")}
                    className="input"
                    placeholder="Juan dela Cruz"
                  />
                </Field>
                <Field label="Mobile number">
                  <input
                    required
                    inputMode="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    className="input"
                    placeholder="09XX XXX XXXX"
                  />
                </Field>
              </>
            )}
            <Field label="Email">
              <input
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={update("email")}
                className="input"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  required
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={form.password}
                  onChange={update("password")}
                  className="input pr-10"
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute inset-y-0 right-3 grid place-items-center text-muted-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              disabled={busy}
              className="!mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--danger)] py-3.5 text-sm font-semibold text-white shadow-panic transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to RescueNow? " : "Already have an account? "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-foreground underline underline-offset-4"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </main>

      <style>{`
        .input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid var(--color-border);
          background: var(--color-card);
          padding: 0.85rem 1rem;
          font-size: 0.925rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: var(--color-ring);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-ring) 15%, transparent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}