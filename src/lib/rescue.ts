import { supabase } from "@/integrations/supabase/client";

export const EMERGENCY_TYPES = [
  { id: "medical", label: "Medical", emoji: "🚑" },
  { id: "fire", label: "Fire", emoji: "🔥" },
  { id: "crime", label: "Crime", emoji: "🚨" },
  { id: "domestic_violence", label: "Domestic", emoji: "🛡️" },
  { id: "accident", label: "Accident", emoji: "🚗" },
  { id: "flood", label: "Flood", emoji: "🌊" },
  { id: "landslide", label: "Landslide", emoji: "⛰️" },
  { id: "earthquake", label: "Earthquake", emoji: "🌐" },
  { id: "typhoon", label: "Typhoon", emoji: "🌀" },
  { id: "rescue", label: "Rescue", emoji: "🆘" },
  { id: "other", label: "Other", emoji: "❗" },
] as const;

export type EmergencyType = (typeof EMERGENCY_TYPES)[number]["id"];

export type Coords = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
};

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(coordsFromPosition(pos)),
      (err) => reject(new Error(err.message || "Unable to get your location.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function watchPosition(onUpdate: (c: Coords) => void, onError?: (e: Error) => void): () => void {
  if (!("geolocation" in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate(coordsFromPosition(pos)),
    (err) => onError?.(new Error(err.message)),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

function coordsFromPosition(pos: GeolocationPosition): Coords {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    altitude: pos.coords.altitude,
    speed: pos.coords.speed,
    heading: pos.coords.heading,
  };
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: string };
    return json.display_name ?? null;
  } catch {
    return null;
  }
}

export async function createEmergency(input: {
  userId: string;
  type: EmergencyType;
  notes?: string;
  coords: Coords;
  address: string | null;
}) {
  const { data, error } = await supabase
    .from("emergencies")
    .insert({
      user_id: input.userId,
      type: input.type,
      status: "active",
      notes: input.notes ?? null,
      latitude: input.coords.latitude,
      longitude: input.coords.longitude,
      accuracy: input.coords.accuracy,
      altitude: input.coords.altitude,
      speed: input.coords.speed,
      heading: input.coords.heading,
      address: input.address,
      google_maps_url: googleMapsUrl(input.coords.latitude, input.coords.longitude),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function pushLocation(emergencyId: string, userId: string, c: Coords) {
  await supabase.from("emergency_locations").insert({
    emergency_id: emergencyId,
    user_id: userId,
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy,
    speed: c.speed,
    heading: c.heading,
    altitude: c.altitude,
  });
}

export async function cancelEmergency(id: string, reason: string) {
  const { error } = await supabase
    .from("emergencies")
    .update({ status: "cancelled", cancel_reason: reason, resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function resolveEmergency(id: string) {
  const { error } = await supabase
    .from("emergencies")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---------- Emergency images ----------

const BUCKET = "emergency-images";

export async function uploadEmergencyImage(
  userId: string,
  emergencyId: string,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${emergencyId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  const { data: current, error: readErr } = await supabase
    .from("emergencies")
    .select("image_urls")
    .eq("id", emergencyId)
    .single();
  if (readErr) throw readErr;

  const next: string[] = [...((current?.image_urls ?? []) as string[]), path];
  const { error: upErr } = await supabase
    .from("emergencies")
    .update({ image_urls: next })
    .eq("id", emergencyId);
  if (upErr) throw upErr;
  return path;
}

export async function getEmergencyImageUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  return (data ?? []).map((d) => d.signedUrl);
}

// ---------- Responder status transitions ----------

export async function acknowledgeEmergency(id: string, responderId: string, responderName: string) {
  const { error } = await supabase
    .from("emergencies")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: responderId,
      responder_name: responderName,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markEnRoute(id: string, responderId: string, responderName: string) {
  const { error } = await supabase
    .from("emergencies")
    .update({
      status: "responding",
      en_route_at: new Date().toISOString(),
      acknowledged_by: responderId,
      responder_name: responderName,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markArrived(id: string) {
  const { error } = await supabase
    .from("emergencies")
    .update({ arrived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function playAlertBeep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(1320, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {}
}

export function vibrate(pattern: number | number[]) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {}
}

export function emergencyLabel(t: string) {
  return EMERGENCY_TYPES.find((x) => x.id === t)?.label ?? t;
}

export function emergencyEmoji(t: string) {
  return EMERGENCY_TYPES.find((x) => x.id === t)?.emoji ?? "❗";
}