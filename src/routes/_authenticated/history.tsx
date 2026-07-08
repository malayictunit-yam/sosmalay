import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MapPin, Clock } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { emergencyEmoji, emergencyLabel, googleMapsUrl } from "@/lib/rescue";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — RescueNow" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-emergencies"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const { data, error } = await supabase
        .from("emergencies")
        .select("*")
        .eq("user_id", user.user.id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-5 pt-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Emergency history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A record of every alert you've activated with RescueNow.
        </p>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-3xl border border-border bg-card" />
            ))
          ) : !data?.length ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/60 p-10 text-center">
              <div className="text-4xl">🕊️</div>
              <div className="mt-2 font-medium">No emergencies yet</div>
              <div className="text-sm text-muted-foreground">Stay safe. We're standing by.</div>
            </div>
          ) : (
            data.map((e) => (
              <article key={e.id} className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-secondary text-lg">
                      {emergencyEmoji(e.type)}
                    </div>
                    <div>
                      <div className="font-medium">{emergencyLabel(e.type)}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(e.started_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{e.address ?? `${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)}`}</span>
                </div>
                <a
                  href={googleMapsUrl(e.latitude, e.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-[color:var(--danger)] underline"
                >
                  View on Google Maps
                </a>
              </article>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-[color:var(--danger)]/10 text-[color:var(--danger)]" },
    responding: { label: "Responding", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    resolved: { label: "Resolved", className: "bg-[color:var(--safe)]/15 text-[color:var(--safe)]" },
    cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${s.className}`}>
      {s.label}
    </span>
  );
}