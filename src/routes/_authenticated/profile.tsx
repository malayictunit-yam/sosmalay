import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [{ title: "Profile — RescueNow" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
  phone: z.string().trim().max(20).optional().nullable(),
  birthday: z.string().max(20).optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  barangay: z.string().max(100).optional().nullable(),
  municipality: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  emergency_contact_name: z.string().max(100).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
  blood_type: z.string().max(5).optional().nullable(),
  medical_notes: z.string().max(1000).optional().nullable(),
});

type Form = z.infer<typeof schema>;

function ProfilePage() {
  const [form, setForm] = useState<Form>({
    full_name: "",
    phone: "",
    birthday: "",
    gender: "",
    address: "",
    barangay: "",
    municipality: "",
    province: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    blood_type: "",
    medical_notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.user.id).maybeSingle();
      if (data) {
        setForm({
          full_name: data.full_name ?? "",
          phone: data.phone ?? "",
          birthday: data.birthday ?? "",
          gender: data.gender ?? "",
          address: data.address ?? "",
          barangay: data.barangay ?? "",
          municipality: data.municipality ?? "",
          province: data.province ?? "",
          emergency_contact_name: data.emergency_contact_name ?? "",
          emergency_contact_phone: data.emergency_contact_phone ?? "",
          blood_type: data.blood_type ?? "",
          medical_notes: data.medical_notes ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          ...parsed.data,
          birthday: parsed.data.birthday || null,
        })
        .eq("id", user.user.id);
      if (error) throw error;
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  if (loading)
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );

  return (
    <AppShell>
      <form onSubmit={save} className="mx-auto max-w-2xl space-y-6 px-5 pt-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Details responders see when you send an alert.
          </p>
        </div>

        <Section title="Personal">
          <Grid>
            <Field label="Full name"><input required className="input" value={form.full_name ?? ""} onChange={set("full_name")} /></Field>
            <Field label="Mobile number"><input className="input" value={form.phone ?? ""} onChange={set("phone")} /></Field>
            <Field label="Birthday"><input type="date" className="input" value={form.birthday ?? ""} onChange={set("birthday")} /></Field>
            <Field label="Gender">
              <select className="input" value={form.gender ?? ""} onChange={set("gender")}>
                <option value="">—</option>
                <option>Female</option>
                <option>Male</option>
                <option>Non-binary</option>
                <option>Prefer not to say</option>
              </select>
            </Field>
          </Grid>
        </Section>

        <Section title="Address">
          <Grid>
            <Field label="Street / Purok"><input className="input" value={form.address ?? ""} onChange={set("address")} /></Field>
            <Field label="Barangay"><input className="input" value={form.barangay ?? ""} onChange={set("barangay")} /></Field>
            <Field label="Municipality / City"><input className="input" value={form.municipality ?? ""} onChange={set("municipality")} /></Field>
            <Field label="Province"><input className="input" value={form.province ?? ""} onChange={set("province")} /></Field>
          </Grid>
        </Section>

        <Section title="Emergency contact">
          <Grid>
            <Field label="Contact name"><input className="input" value={form.emergency_contact_name ?? ""} onChange={set("emergency_contact_name")} /></Field>
            <Field label="Contact number"><input className="input" value={form.emergency_contact_phone ?? ""} onChange={set("emergency_contact_phone")} /></Field>
          </Grid>
        </Section>

        <Section title="Medical">
          <Grid>
            <Field label="Blood type">
              <select className="input" value={form.blood_type ?? ""} onChange={set("blood_type")}>
                <option value="">—</option>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Medical notes (allergies, conditions)" full>
              <textarea className="input min-h-24" value={form.medical_notes ?? ""} onChange={set("medical_notes")} />
            </Field>
          </Grid>
        </Section>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--danger)] px-6 py-3 text-sm font-semibold text-white shadow-panic transition hover:brightness-110 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save profile
        </button>

        <style>{`
          .input {
            width: 100%;
            border-radius: 1rem;
            border: 1px solid var(--color-border);
            background: var(--color-card);
            padding: 0.75rem 0.9rem;
            font-size: 0.9rem;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .input:focus {
            border-color: var(--color-ring);
            box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-ring) 15%, transparent);
          }
        `}</style>
      </form>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}