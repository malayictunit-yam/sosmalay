import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { MapPin, Phone, Loader2, Radio, CheckCircle2, Eye, Navigation2, Flag } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  emergencyEmoji,
  emergencyLabel,
  googleMapsUrl,
  resolveEmergency,
  acknowledgeEmergency,
  markEnRoute,
  markArrived,
  getEmergencyImageUrls,
} from "@/lib/rescue";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Responder dashboard — RescueNow" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

type Emergency = {
  id: string;
  user_id: string;
  type: string;
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  started_at: string;
  google_maps_url: string | null;
  image_urls: string[] | null;
  acknowledged_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  responder_name: string | null;
};

function DashboardPage() {
  const qc = useQueryClient();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return setAuthorized(false);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id);
      setAuthorized(!!data?.some((r) => ["police", "mdrrmo", "barangay", "admin"].includes(r.role)));
    })();
  }, []);

  const { data: emergencies, isLoading } = useQuery({
    queryKey: ["all-emergencies"],
    enabled: authorized === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emergencies")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Emergency[];
    },
  });

  // Realtime updates
  useEffect(() => {
    if (!authorized) return;
    const channel = supabase
      .channel("emergencies-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "emergencies" }, () => {
        qc.invalidateQueries({ queryKey: ["all-emergencies"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_locations" }, () => {
        qc.invalidateQueries({ queryKey: ["emergency-locations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, qc]);

  const selectedEmergency = emergencies?.find((e) => e.id === selected) ?? emergencies?.find((e) => e.status === "active") ?? emergencies?.[0];

  if (authorized === null)
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );

  if (!authorized)
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-5 pt-16 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-4 font-display text-2xl font-bold">Responders only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This dashboard is available to Police, MDRRMO, Barangay, and Admin accounts. Contact your LGU administrator to be added.
          </p>
        </div>
      </AppShell>
    );

  const active = emergencies?.filter((e) => e.status === "active") ?? [];
  const past = emergencies?.filter((e) => e.status !== "active") ?? [];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 pt-6 md:pt-10">
        <header className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--danger)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--danger)]" />
              Live dispatch
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Responder dashboard</h1>
          </div>
          <button
            onClick={() => exportCsv(emergencies ?? [])}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            Export CSV
          </button>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* List */}
          <section className="space-y-4">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active — {active.length}
              </h2>
              <div className="space-y-2">
                {isLoading ? (
                  <div className="h-20 animate-pulse rounded-2xl border border-border bg-card" />
                ) : active.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No active emergencies. Good.
                  </div>
                ) : (
                  active.map((e) => (
                    <EmergencyRow key={e.id} e={e} selected={selectedEmergency?.id === e.id} onSelect={() => setSelected(e.id)} />
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent</h2>
              <div className="space-y-2">
                {past.slice(0, 8).map((e) => (
                  <EmergencyRow key={e.id} e={e} selected={selectedEmergency?.id === e.id} onSelect={() => setSelected(e.id)} muted />
                ))}
              </div>
            </div>
          </section>

          {/* Detail */}
          <section>
            {selectedEmergency ? (
              <EmergencyDetail e={selectedEmergency} qc={qc} />
            ) : (
              <div className="grid min-h-96 place-items-center rounded-3xl border border-dashed border-border text-sm text-muted-foreground">
                Select an emergency to view details
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function EmergencyRow({ e, selected, onSelect, muted }: { e: Emergency; selected: boolean; onSelect: () => void; muted?: boolean }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3 text-left transition ${
        selected ? "border-[color:var(--danger)] bg-[color:var(--danger)]/5" : "border-border bg-card hover:bg-secondary"
      } ${muted ? "opacity-80" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-lg">
          {emergencyEmoji(e.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{emergencyLabel(e.type)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              e.status === "active" ? "bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
              : e.status === "resolved" ? "bg-[color:var(--safe)]/15 text-[color:var(--safe)]"
              : "bg-muted text-muted-foreground"
            }`}>{e.status}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {e.address ?? `${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)}`}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(e.started_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmergencyDetail({ e, qc }: { e: Emergency; qc: ReturnType<typeof useQueryClient> }) {
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<null | "ack" | "enroute" | "arrived">(null);
  const { data: profile } = useQuery({
    queryKey: ["profile", e.user_id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", e.user_id).maybeSingle();
      return data;
    },
  });
  const { data: me } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", u.user.id)
        .maybeSingle();
      return { userId: u.user.id, name: p?.full_name || u.user.email || "Responder" };
    },
  });
  const { data: photoUrls } = useQuery({
    queryKey: ["emergency-photos", e.id, e.image_urls?.length ?? 0],
    enabled: !!e.image_urls && e.image_urls.length > 0,
    queryFn: () => getEmergencyImageUrls(e.image_urls ?? []),
  });
  const { data: locations } = useQuery({
    queryKey: ["emergency-locations", e.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("emergency_locations")
        .select("*")
        .eq("emergency_id", e.id)
        .order("recorded_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const latest = locations?.[0];
  const lat = latest?.latitude ?? e.latitude;
  const lng = latest?.longitude ?? e.longitude;

  async function markResolved() {
    setBusy(true);
    try {
      await resolveEmergency(e.id);
      toast.success("Marked as resolved");
      qc.invalidateQueries({ queryKey: ["all-emergencies"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "ack" | "enroute" | "arrived") {
    if (!me) return;
    setBusyAction(action);
    try {
      if (action === "ack") {
        await acknowledgeEmergency(e.id, me.userId, me.name);
        toast.success("Citizen has been notified that you saw their alert");
      } else if (action === "enroute") {
        await markEnRoute(e.id, me.userId, me.name);
        toast.success("Citizen has been notified you're on the way");
      } else if (action === "arrived") {
        await markArrived(e.id);
        toast.success("Marked as arrived on scene");
      }
      qc.invalidateQueries({ queryKey: ["all-emergencies"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 slide-up">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {e.status === "active" ? "Live emergency" : "Emergency"}
          </div>
          <div className="mt-1 font-display text-2xl font-bold">
            {emergencyEmoji(e.type)} {emergencyLabel(e.type)}
          </div>
        </div>
        {e.status === "active" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--danger)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--danger)]">
            <Radio className="h-3 w-3" /> Live
          </span>
        )}
      </div>

      <div className="mt-4 aspect-video overflow-hidden rounded-2xl border border-border">
        <iframe
          key={`${lat.toFixed(4)}-${lng.toFixed(4)}`}
          title="Emergency location"
          className="h-full w-full"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005}%2C${lat - 0.005}%2C${lng + 0.005}%2C${lat + 0.005}&layer=mapnik&marker=${lat}%2C${lng}`}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Caller" value={profile?.full_name || "Unknown"} />
        <Info
          label="Contact"
          value={profile?.phone || "—"}
          href={profile?.phone ? `tel:${profile.phone}` : undefined}
          icon={<Phone className="h-3.5 w-3.5" />}
        />
        <Info label="Coordinates" value={`${lat.toFixed(5)}, ${lng.toFixed(5)}`} />
        <Info label="Address" value={e.address || "—"} />
        <Info label="Barangay" value={profile?.barangay || "—"} />
        <Info label="Started" value={formatDistanceToNow(new Date(e.started_at), { addSuffix: true })} />
        <Info label="Blood type" value={profile?.blood_type || "—"} />
        <Info label="Medical" value={profile?.medical_notes || "None"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={googleMapsUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          <MapPin className="h-4 w-4" /> Navigate
        </a>
        {e.status !== "resolved" && e.status !== "cancelled" && !e.acknowledged_at && (
          <button
            onClick={() => runAction("ack")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            {busyAction === "ack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Acknowledge (mark as seen)
          </button>
        )}
        {e.status !== "resolved" && e.status !== "cancelled" && !e.en_route_at && (
          <button
            onClick={() => runAction("enroute")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--danger)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
          >
            {busyAction === "enroute" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation2 className="h-4 w-4" />}
            On the way
          </button>
        )}
        {e.status !== "resolved" && e.status !== "cancelled" && e.en_route_at && !e.arrived_at && (
          <button
            onClick={() => runAction("arrived")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {busyAction === "arrived" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
            Arrived on scene
          </button>
        )}
        {e.status !== "resolved" && e.status !== "cancelled" && (
          <button
            onClick={markResolved}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--safe)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Mark resolved
          </button>
        )}
      </div>

      {(e.acknowledged_at || e.en_route_at || e.arrived_at) && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-border bg-background/40 p-3 text-xs sm:grid-cols-3">
          <StatusRow label="Seen" value={e.acknowledged_at} />
          <StatusRow label="En route" value={e.en_route_at} />
          <StatusRow label="Arrived" value={e.arrived_at} />
        </div>
      )}

      {photoUrls && photoUrls.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Photos from citizen · {photoUrls.length}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photoUrls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary"
              >
                <img
                  src={url}
                  alt={`Scene photo ${i + 1}`}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {locations && locations.length > 1 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Location trail · {locations.length} pings
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-auto rounded-2xl border border-border bg-background/40 p-2 text-xs">
            {locations.map((l) => (
              <div key={l.id} className="flex items-center justify-between font-mono">
                <span>{l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}</span>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(l.recorded_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, href, icon }: { label: string; value: string; href?: string; icon?: React.ReactNode }) {
  const content = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">{icon}{value}</div>
    </>
  );
  return href ? (
    <a href={href} className="block rounded-2xl border border-border bg-background/50 p-3 hover:bg-secondary">
      {content}
    </a>
  ) : (
    <div className="rounded-2xl border border-border bg-background/50 p-3">{content}</div>
  );
}

function StatusRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-medium ${value ? "text-foreground" : "text-muted-foreground"}`}>
        {value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "—"}
      </div>
    </div>
  );
}

function exportCsv(rows: Emergency[]) {
  // helper unchanged
  if (!rows.length) return;
  const headers = ["id", "type", "status", "latitude", "longitude", "address", "started_at"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => JSON.stringify((r as unknown as Record<string, unknown>)[h] ?? ""))
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rescuenow-emergencies-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}