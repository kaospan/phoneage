-- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- The mapper's "View Modes" admin toggle previously only wrote to the admin's own browser
-- localStorage, so disabling a view mode there never actually affected other players — each
-- player's own browser still cycled through every mode. This table makes it a real, universal
-- setting: any signed-in player can read which modes are currently disabled (needed to filter
-- their own view-cycle button), but only admins can change it.

CREATE TABLE IF NOT EXISTS public.disabled_view_modes (
  view_mode   TEXT        PRIMARY KEY,
  disabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.disabled_view_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disabled_view_modes_read_all" ON public.disabled_view_modes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "disabled_view_modes_admin_insert" ON public.disabled_view_modes
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "disabled_view_modes_admin_delete" ON public.disabled_view_modes
  FOR DELETE TO authenticated USING (public.is_admin());
