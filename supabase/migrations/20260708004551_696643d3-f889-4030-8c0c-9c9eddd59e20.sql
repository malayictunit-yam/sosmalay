
-- Roles enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('citizen','police','mdrrmo','barangay','admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_responder(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('police','mdrrmo','barangay','admin')
  );
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  birthday date,
  gender text,
  address text,
  barangay text,
  municipality text,
  province text,
  blood_type text,
  medical_notes text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or responders read all" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_responder(auth.uid()));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Emergency type + status enums
CREATE TYPE public.emergency_type AS ENUM (
  'medical','fire','crime','domestic_violence','accident',
  'flood','landslide','earthquake','typhoon','rescue','other'
);
CREATE TYPE public.emergency_status AS ENUM ('active','responding','resolved','cancelled');

-- Emergencies
CREATE TABLE public.emergencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type emergency_type NOT NULL DEFAULT 'other',
  status emergency_status NOT NULL DEFAULT 'active',
  notes text,
  -- initial location
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  altitude double precision,
  speed double precision,
  heading double precision,
  address text,
  google_maps_url text,
  -- responder tracking
  police_status text NOT NULL DEFAULT 'notified',
  mdrrmo_status text NOT NULL DEFAULT 'notified',
  responder_notes text,
  cancel_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.emergencies TO authenticated;
GRANT ALL ON public.emergencies TO service_role;
ALTER TABLE public.emergencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or responders view" ON public.emergencies FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_responder(auth.uid()));
CREATE POLICY "citizens create own" ON public.emergencies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own cancel or responders update" ON public.emergencies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_responder(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_responder(auth.uid()));

-- Live location pings
CREATE TABLE public.emergency_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id uuid REFERENCES public.emergencies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  altitude double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.emergency_locations (emergency_id, recorded_at DESC);
GRANT SELECT, INSERT ON public.emergency_locations TO authenticated;
GRANT ALL ON public.emergency_locations TO service_role;
ALTER TABLE public.emergency_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or responders view loc" ON public.emergency_locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_responder(auth.uid()));
CREATE POLICY "own insert loc" ON public.emergency_locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER emergencies_updated_at BEFORE UPDATE ON public.emergencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + citizen role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'citizen');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergencies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_locations;
