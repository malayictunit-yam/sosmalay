import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Trash2, UserCog } from "lucide-react";

type AppRole = "citizen" | "police" | "mdrrmo" | "barangay" | "admin";
const ASSIGNABLE: AppRole[] = ["police", "mdrrmo", "barangay", "admin"];

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  municipality: string | null;
  barangay: string | null;
};

type RoleRow = { user_id: string; role: AppRole };

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [anyAdminExists, setAnyAdminExists] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    setMe(uid);

    const { data: myRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid ?? "");
    const admin = !!myRoles?.some((r) => r.role === "admin");
    setIsAdmin(admin);

    // Check if any admin exists (readable via own-rows policy always returns own; we use head count via RPC-less trick)
    // If not admin, we attempt to read all admin rows — RLS will only return our own, but has_role() lets admins see all.
    // For bootstrap detection, try inserting is gated by policy; here we just show the bootstrap CTA when user has no admin.
    // Simpler: assume no admin exists if the user isn't admin AND has zero rows returned when selecting admins.
    const { data: adminRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    setAnyAdminExists((adminRows?.length ?? 0) > 0);

    if (admin) {
      const [{ data: profs }, { data: allRoles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, municipality, barangay")
          .order("full_name", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setProfiles(profs ?? []);
      setRoles((allRoles ?? []) as RoleRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const rolesByUser = useMemo(() => {
    const map = new Map<string, AppRole[]>();
    for (const r of roles) {
      const arr = map.get(r.user_id) ?? [];
      arr.push(r.role);
      map.set(r.user_id, arr);
    }
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.municipality?.toLowerCase().includes(q) ||
        p.barangay?.toLowerCase().includes(q),
    );
  }, [profiles, query]);

  async function claimAdmin() {
    if (!me) return;
    setBusy("bootstrap");
    const { error } = await supabase.from("user_roles").insert({ user_id: me, role: "admin" });
    setBusy(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("You are now an admin");
      refresh();
    }
  }

  async function assignRole(userId: string, role: AppRole) {
    setBusy(userId + ":" + role);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role });
    setBusy(null);
    if (error) {
      if (error.code === "23505") {
        toast.info("User already has that role");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success(`Assigned ${role}`);
    refresh();
  }

  async function removeRole(userId: string, role: AppRole) {
    if (role === "admin" && userId === me) {
      if (!confirm("Remove your own admin role? You will lose access to this page.")) return;
    }
    setBusy(userId + ":-" + role);
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Removed ${role}`);
    refresh();
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-[color:var(--danger)]" />
          <h1 className="text-xl font-semibold">Admin access required</h1>
          {!anyAdminExists ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                No admin exists yet. Claim the first admin role to manage responder access.
              </p>
              <button
                onClick={claimAdmin}
                disabled={busy === "bootstrap"}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[color:var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "bootstrap" && <Loader2 className="h-4 w-4 animate-spin" />}
                Claim admin role
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Ask an existing admin to grant you the admin role.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--danger)]/10 text-[color:var(--danger)]">
          <UserCog className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Role management</h1>
          <p className="text-sm text-muted-foreground">
            Assign responder and admin roles. Changes take effect immediately.
          </p>
        </div>
      </header>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, municipality, or user id"
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--danger)]/30"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="divide-y divide-border">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No users found.</div>
          )}
          {filtered.map((p) => {
            const userRoles = rolesByUser.get(p.id) ?? [];
            return (
              <div key={p.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {p.full_name || "(no name)"}
                    </span>
                    {p.id === me && (
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        you
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">
                    {p.phone || "—"} · {[p.barangay, p.municipality].filter(Boolean).join(", ") || "—"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {userRoles.length === 0 && (
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                        citizen
                      </span>
                    )}
                    {userRoles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 rounded-md bg-[color:var(--danger)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--danger)]"
                      >
                        {r}
                        {r !== "citizen" && (
                          <button
                            onClick={() => removeRole(p.id, r)}
                            disabled={busy === p.id + ":-" + r}
                            aria-label={`Remove ${r}`}
                            className="rounded p-0.5 hover:bg-[color:var(--danger)]/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ASSIGNABLE.map((role) => {
                    const has = userRoles.includes(role);
                    const key = p.id + ":" + role;
                    return (
                      <button
                        key={role}
                        onClick={() => assignRole(p.id, role)}
                        disabled={has || busy === key}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          has
                            ? "cursor-not-allowed border-border bg-secondary text-muted-foreground"
                            : "border-border bg-background hover:border-[color:var(--danger)] hover:text-[color:var(--danger)]"
                        }`}
                      >
                        {busy === key ? "…" : has ? `✓ ${role}` : `+ ${role}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Tip: assigning police, MDRRMO, barangay, or admin unlocks the responder dashboard for that user on next sign-in refresh.
      </p>
    </div>
  );
}