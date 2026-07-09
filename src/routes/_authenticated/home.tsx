import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Battery, Wifi, MapPin, Loader2, X, Send, Radio, ShieldCheck, Camera, Image as ImageIcon, Trash2, Siren,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  EMERGENCY_TYPES,
  type Coords,
  type EmergencyType,
  cancelEmergency,
  createEmergency,
  emergencyEmoji,
  emergencyLabel,
  getCurrentPosition,
  googleMapsUrl,
  playAlertBeep,
  pushLocation,
  reverseGeocode,
  vibrate,
  watchPosition,
  uploadEmergencyImage,
  getEmergencyImageUrls,
} from "@/lib/rescue";
import { compressImage } from "@/lib/image";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "RescueNow — Panic button" },
      { name: "description", content: "Your emergency panic button. Tap to alert responders." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomePage,
});

type Phase = "idle" | "locating" | "countdown" | "active";

function HomePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(5);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<EmergencyType>("other");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [responderStatus, setResponderStatus] = useState<{
    acknowledged_at: string | null;
    en_route_at: string | null;
    arrived_at: string | null;
    responder_name: string | null;
    status: string;
  } | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const countdownRef = useRef<number | null>(null);
  const watchStopRef = useRef<(() => void) | null>(null);
  const pushIntervalRef = useRef<number | null>(null);
  const navigate = useNavigate();

  // Profile for greeting
  const { data: profile } = useQuery({
    queryKey: ["profile-me"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.user.id)
        .maybeSingle();
      return { user: user.user, profile: data };
    },
  });

  // Battery + online
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (e: string, cb: () => void) => void }> };
    let cleanup = () => {};
    if (nav.getBattery) {
      nav.getBattery().then((b) => {
        setBattery(Math.round(b.level * 100));
        const upd = () => setBattery(Math.round(b.level * 100));
        b.addEventListener("levelchange", upd);
        cleanup = () => {};
      }).catch(() => {});
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      cleanup();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Ambient GPS on idle
  useEffect(() => {
    if (phase !== "idle") return;
    let alive = true;
    getCurrentPosition()
      .then(async (c) => {
        if (!alive) return;
        setCoords(c);
        const addr = await reverseGeocode(c.latitude, c.longitude);
        if (alive) setAddress(addr);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [phase]);

  // Restore any active emergency (e.g. after refresh)
  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from("emergencies")
        .select("id, started_at, type, latitude, longitude, address, image_urls, acknowledged_at, en_route_at, arrived_at, responder_name, status")
        .eq("user_id", user.user.id)
        .in("status", ["active", "responding"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setActiveId(data.id);
        setStartedAt(new Date(data.started_at));
        setSelectedType(data.type as EmergencyType);
        setAddress(data.address);
        setImagePaths(data.image_urls ?? []);
        setResponderStatus({
          acknowledged_at: data.acknowledged_at,
          en_route_at: data.en_route_at,
          arrived_at: data.arrived_at,
          responder_name: data.responder_name,
          status: data.status,
        });
        setPhase("active");
        startLiveTracking(data.id, user.user.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh signed URLs whenever image paths change
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!imagePaths.length) {
        setImageUrls([]);
        return;
      }
      try {
        const urls = await getEmergencyImageUrls(imagePaths);
        if (alive) setImageUrls(urls);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [imagePaths]);

  // Realtime: listen for responder status updates on the active emergency
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`emergency-${activeId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "emergencies", filter: `id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as {
            acknowledged_at: string | null;
            en_route_at: string | null;
            arrived_at: string | null;
            responder_name: string | null;
            status: string;
            image_urls: string[] | null;
          };
          setResponderStatus((prev) => {
            const next = {
              acknowledged_at: row.acknowledged_at,
              en_route_at: row.en_route_at,
              arrived_at: row.arrived_at,
              responder_name: row.responder_name,
              status: row.status,
            };
            if (row.acknowledged_at && !prev?.acknowledged_at) {
              vibrate([80, 40, 80]);
              playAlertBeep();
              toast.success(
                row.responder_name
                  ? `${row.responder_name} has seen your alert`
                  : "A responder has seen your alert",
              );
            }
            if (row.en_route_at && !prev?.en_route_at) {
              vibrate([120, 60, 120, 60, 120]);
              playAlertBeep();
              toast.success(
                row.responder_name
                  ? `${row.responder_name} is on the way to your location`
                  : "A responder is on the way to your location",
                { duration: 8000 },
              );
            }
            if (row.arrived_at && !prev?.arrived_at) {
              vibrate([200, 100, 200]);
              playAlertBeep();
              toast.success("Responder has arrived at your location", { duration: 8000 });
            }
            return next;
          });
          if (row.image_urls) setImagePaths(row.image_urls);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  function startLiveTracking(emergencyId: string, userId: string) {
    watchStopRef.current?.();
    watchStopRef.current = watchPosition(
      (c) => setCoords(c),
      (e) => toast.error(e.message),
    );
    if (pushIntervalRef.current) window.clearInterval(pushIntervalRef.current);
    pushIntervalRef.current = window.setInterval(async () => {
      try {
        const c = await getCurrentPosition();
        setCoords(c);
        await pushLocation(emergencyId, userId, c);
      } catch {}
    }, 15000);
  }

  function stopLiveTracking() {
    watchStopRef.current?.();
    watchStopRef.current = null;
    if (pushIntervalRef.current) {
      window.clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
  }

  useEffect(() => () => stopLiveTracking(), []);

  async function beginPanic() {
    if (phase !== "idle") return;
    vibrate(30);
    setPhase("locating");
    try {
      const c = await getCurrentPosition();
      setCoords(c);
      const addr = await reverseGeocode(c.latitude, c.longitude);
      setAddress(addr);
      setCount(5);
      setPhase("countdown");
      vibrate([80, 60, 80]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Location unavailable");
      setPhase("idle");
    }
  }

  // Countdown loop
  useEffect(() => {
    if (phase !== "countdown") return;
    playAlertBeep();
    countdownRef.current = window.setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          window.clearInterval(countdownRef.current!);
          void sendEmergency();
          return 0;
        }
        playAlertBeep();
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function sendEmergency() {
    try {
      if (!coords) throw new Error("No GPS coordinates");
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const e = await createEmergency({
        userId: user.user.id,
        type: selectedType,
        coords,
        address,
      });
      setActiveId(e.id);
      setStartedAt(new Date(e.started_at));
      setImagePaths([]);
      setResponderStatus({
        acknowledged_at: null,
        en_route_at: null,
        arrived_at: null,
        responder_name: null,
        status: "active",
      });
      setPhase("active");
      vibrate([120, 80, 120, 80, 200]);
      toast.success("Emergency alert sent to responders");
      startLiveTracking(e.id, user.user.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send alert");
      setPhase("idle");
    }
  }

  function cancelCountdown() {
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    vibrate(20);
    setPhase("idle");
    setCount(5);
  }

  async function cancelActive() {
    if (!activeId) return;
    try {
      await cancelEmergency(activeId, "Cancelled by user");
      stopLiveTracking();
      setActiveId(null);
      setStartedAt(null);
      setImagePaths([]);
      setImageUrls([]);
      setResponderStatus(null);
      setPhase("idle");
      toast.success("Emergency cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    }
  }

  async function handleImagePicked(files: FileList | null) {
    if (!files || !files.length || !activeId) return;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`Skipped ${file.name}: not an image`);
          continue;
        }
        const compressed = await compressImage(file, 2 * 1024 * 1024);
        const path = await uploadEmergencyImage(user.user.id, activeId, compressed);
        setImagePaths((prev) => [...prev, path]);
        toast.success(
          `Photo uploaded (${(compressed.size / 1024 / 1024).toFixed(2)} MB)`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-5 pt-6 md:max-w-2xl md:pt-10">
        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">
              {greeting}
              {profile?.profile?.full_name ? `, ${profile.profile.full_name.split(" ")[0]}` : ""}
            </div>
            <div>You're protected by RescueNow</div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1 ${online ? "" : "text-[color:var(--danger)]"}`}>
              <Wifi className="h-3.5 w-3.5" /> {online ? "Online" : "Offline"}
            </span>
            {battery !== null && (
              <span className="flex items-center gap-1">
                <Battery className="h-3.5 w-3.5" /> {battery}%
              </span>
            )}
          </div>
        </div>

        {/* GPS/Address card */}
        <div className="mt-5 rounded-3xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Your location</div>
              <div className="mt-0.5 truncate text-sm font-medium">
                {address ?? (coords ? "Locating address…" : "Waiting for GPS…")}
              </div>
              {coords && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                  {coords.accuracy ? ` · ±${Math.round(coords.accuracy)}m` : ""}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panic button */}
        <div className="relative mt-8 grid place-items-center">
          <button
            type="button"
            disabled={phase === "locating" || phase === "countdown" || phase === "active"}
            onClick={beginPanic}
            className={`grid h-72 w-72 place-items-center rounded-full text-white transition-transform active:scale-[0.97] focus:outline-none focus:ring-8 focus:ring-[color:var(--danger)]/25 ${
              phase === "active"
                ? "bg-panic-radial panic-active-pulse"
                : phase === "idle"
                ? "bg-panic-radial panic-pulse"
                : "bg-panic-radial"
            }`}
            aria-label="Activate emergency"
          >
            <div className="text-center">
              {phase === "locating" ? (
                <>
                  <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                  <div className="mt-3 text-xs font-semibold uppercase tracking-[0.3em]">Locating GPS</div>
                </>
              ) : phase === "active" ? (
                <>
                  <Radio className="mx-auto h-8 w-8" />
                  <div className="mt-3 font-display text-2xl font-bold">EMERGENCY</div>
                  <div className="text-xs font-medium tracking-[0.3em] opacity-80">ACTIVE</div>
                </>
              ) : (
                <>
                  <ShieldCheck className="mx-auto h-8 w-8" />
                  <div className="mt-3 font-display text-3xl font-bold tracking-tight">SAFE</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.3em] opacity-80">Tap for help</div>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Type selector */}
        {phase === "idle" && (
          <>
            <div className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Emergency type
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 md:grid-cols-6">
              {EMERGENCY_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedType(t.id)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border p-2.5 text-[11px] font-medium transition ${
                    selectedType === t.id
                      ? "border-[color:var(--danger)] bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Active emergency panel */}
        {phase === "active" && activeId && (
          <div className="mt-8 slide-up rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--danger)]">
                  Emergency active
                </div>
                <div className="mt-1 font-display text-2xl font-bold">
                  {emergencyEmoji(selectedType)} {emergencyLabel(selectedType)}
                </div>
              </div>
              <ElapsedClock startedAt={startedAt} />
            </div>

            <div className="mt-4 aspect-video overflow-hidden rounded-2xl border border-border">
              {coords && (
                <iframe
                  key={`${coords.latitude.toFixed(4)}-${coords.longitude.toFixed(4)}`}
                  title="Live location"
                  className="h-full w-full"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.longitude - 0.005}%2C${coords.latitude - 0.005}%2C${coords.longitude + 0.005}%2C${coords.latitude + 0.005}&layer=mapnik&marker=${coords.latitude}%2C${coords.longitude}`}
                />
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <StatusPill
                label="Responder"
                status={
                  responderStatus?.arrived_at
                    ? "Arrived"
                    : responderStatus?.en_route_at
                    ? "On the way"
                    : responderStatus?.acknowledged_at
                    ? "Alert seen"
                    : "Notified"
                }
                highlight={!!(responderStatus?.en_route_at || responderStatus?.arrived_at)}
              />
              <StatusPill
                label="Assigned to"
                status={responderStatus?.responder_name || "Awaiting dispatcher"}
              />
            </div>

            {(responderStatus?.acknowledged_at || responderStatus?.en_route_at || responderStatus?.arrived_at) && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[color:var(--safe)]/40 bg-[color:var(--safe)]/10 p-3 text-sm">
                <Siren className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--safe)]" />
                <div>
                  <div className="font-semibold text-[color:var(--safe)]">
                    {responderStatus?.arrived_at
                      ? "Responder has arrived"
                      : responderStatus?.en_route_at
                      ? "Responder is on the way"
                      : "Your alert has been seen"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {responderStatus?.responder_name
                      ? `${responderStatus.responder_name} · stay where you are and keep your phone reachable.`
                      : "Stay where you are and keep your phone reachable."}
                  </div>
                </div>
              </div>
            )}

            {/* Photo upload */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Photos for responders ({imagePaths.length})
                </div>
                {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Add a photo of the scene or a landmark. Images are compressed to under 2 MB.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-background/50 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" /> Take photo
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-background/50 py-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
                >
                  <ImageIcon className="h-4 w-4" /> From gallery
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleImagePicked(e.target.files)}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleImagePicked(e.target.files)}
              />
              {imageUrls.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {imageUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary"
                    >
                      <img
                        src={url}
                        alt={`Emergency photo ${i + 1}`}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {coords && (
              <a
                href={googleMapsUrl(coords.latitude, coords.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block truncate text-sm text-[color:var(--danger)] underline"
              >
                Open in Google Maps
              </a>
            )}

            <button
              onClick={cancelActive}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-3.5 text-sm font-semibold text-background transition hover:opacity-90"
            >
              <X className="h-4 w-4" /> Cancel emergency
            </button>
          </div>
        )}

        {/* Info footer */}
        {phase === "idle" && (
          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Live location updates every 15 seconds once activated.
          </p>
        )}
      </div>

      {/* Countdown overlay */}
      {phase === "countdown" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-card p-8 text-center shadow-panic-active slide-up">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Emergency will be sent in
            </div>
            <div key={count} className="count-pop mx-auto mt-4 grid h-40 w-40 place-items-center rounded-full bg-panic-radial font-display text-7xl font-bold text-white">
              {count}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={cancelCountdown}
                className="rounded-2xl border border-border py-3 text-sm font-semibold transition hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (countdownRef.current) window.clearInterval(countdownRef.current);
                  void sendEmergency();
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--danger)] py-3 text-sm font-semibold text-white transition hover:brightness-110"
              >
                <Send className="h-4 w-4" /> Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StatusPill({ label, status, highlight }: { label: string; status: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${highlight ? "border-[color:var(--safe)]/50 bg-[color:var(--safe)]/10" : "border-border bg-background/50"}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-2 text-sm font-medium">
        <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${highlight ? "bg-[color:var(--safe)]" : "bg-[color:var(--safe)]"}`} />
        {status}
      </div>
    </div>
  );
}

function ElapsedClock({ startedAt }: { startedAt: Date | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Elapsed</div>
      <div className="font-display text-xl font-semibold tabular-nums">{mm}:{ss}</div>
    </div>
  );
}