import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, History, LayoutDashboard, LogOut, ShieldAlert, User, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isResponder, setIsResponder] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id);
      if (!alive) return;
      setIsResponder(!!data?.some((r) => ["police", "mdrrmo", "barangay", "admin"].includes(r.role)));
      setIsAdmin(!!data?.some((r) => r.role === "admin"));
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const items = [
    { to: "/home", label: "Home", icon: Home },
    { to: "/history", label: "History", icon: History },
    { to: "/profile", label: "Profile", icon: User },
    ...(isResponder ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: UserCog }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop side rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card/60 backdrop-blur md:flex">
        <Link to="/home" className="flex items-center gap-2 px-6 py-6 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--danger)] text-white">
            <ShieldAlert className="h-5 w-5" />
          </span>
          RescueNow
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="mx-3 mb-6 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <div className="md:pl-64">
        <main className="pb-24 md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {items.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] font-medium transition ${
                  active ? "text-[color:var(--danger)]" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
          <button
            onClick={signOut}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] font-medium text-muted-foreground"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );
}