import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, MapPin, Radio, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--danger)] text-white">
            <ShieldAlert className="h-5 w-5" />
          </span>
          RescueNow
        </div>
        <Link
          to="/auth"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition hover:opacity-90"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <section className="grid gap-12 md:grid-cols-2 md:items-center">
          <div className="slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--danger)]" />
              LGU-grade emergency response
            </span>
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              One tap.
              <br />
              <span className="text-[color:var(--danger)]">Help is on the way.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              RescueNow is the digital panic button for citizens. In one press it alerts local
              Police and MDRRMO with your exact GPS location, then keeps them updated live
              every 15 seconds.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="rounded-full bg-[color:var(--danger)] px-7 py-3.5 text-base font-semibold text-white shadow-panic transition hover:brightness-110 active:scale-[0.98]"
              >
                Get RescueNow
              </Link>
              <a
                href="#how"
                className="rounded-full border border-border bg-card px-7 py-3.5 text-base font-medium transition hover:bg-secondary"
              >
                How it works
              </a>
            </div>
            <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4" /> &lt; 3s activation</div>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Live GPS</div>
              <div className="flex items-center gap-2"><Radio className="h-4 w-4" /> Realtime dispatch</div>
            </div>
          </div>

          <div className="relative mx-auto flex aspect-square w-full max-w-md items-center justify-center">
            <div className="absolute inset-8 rounded-full bg-panic-radial panic-pulse" />
            <div className="relative grid h-56 w-56 place-items-center rounded-full bg-panic-radial text-white shadow-panic-active">
              <div className="text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">
                  Panic
                </div>
                <div className="mt-1 font-display text-4xl font-bold">SOS</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { t: "1 · Tap the button", d: "A 5-second countdown lets you cancel accidental taps.", icon: ShieldAlert },
            { t: "2 · Location shared", d: "Latitude, longitude, address and a Google Maps link are transmitted instantly.", icon: MapPin },
            { t: "3 · Responders dispatched", d: "Police and MDRRMO see your live position on the dashboard in real time.", icon: Radio },
          ].map(({ t, d, icon: Icon }) => (
            <div key={t} className="rounded-3xl border border-border bg-card p-6">
              <Icon className="h-6 w-6 text-[color:var(--danger)]" />
              <div className="mt-4 font-display text-lg font-semibold">{t}</div>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        RescueNow — For emergencies, always try to call your local hotline as well.
      </footer>
    </div>
  );
}
