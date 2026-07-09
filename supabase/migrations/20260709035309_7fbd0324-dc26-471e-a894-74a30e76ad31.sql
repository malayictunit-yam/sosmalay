-- Allow admins to fully manage user_roles, and allow the very first admin to bootstrap themselves
-- when no admin exists yet (so the app can be tested without direct DB access).

CREATE POLICY "admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Bootstrap: any authenticated user may insert an 'admin' row for themselves
-- ONLY while no admin exists in the system.
CREATE POLICY "bootstrap first admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  role = 'admin'
  AND user_id = auth.uid()
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
);
