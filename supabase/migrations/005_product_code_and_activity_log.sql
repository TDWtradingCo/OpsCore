-- Add business-friendly product identifier and dashboard-wide audit log

-- 1) Product public code (e.g. PRD-000123)
CREATE SEQUENCE IF NOT EXISTS public.product_code_seq START 1001;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_code TEXT;

CREATE OR REPLACE FUNCTION public.generate_product_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PRD-' || LPAD(nextval('public.product_code_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

UPDATE public.products
SET product_code = public.generate_product_code()
WHERE product_code IS NULL;

ALTER TABLE public.products
ALTER COLUMN product_code SET DEFAULT public.generate_product_code();

ALTER TABLE public.products
ALTER COLUMN product_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code ON public.products(product_code);

-- 2) Dashboard activity log
CREATE TABLE IF NOT EXISTS public.dashboard_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id UUID,
  description TEXT,
  metadata JSONB,
  user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_activity_created_at
  ON public.dashboard_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_activity_user_id
  ON public.dashboard_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_activity_entity
  ON public.dashboard_activity_log(entity_type, action);

ALTER TABLE public.dashboard_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read dashboard activity"
  ON public.dashboard_activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create dashboard activity"
  ON public.dashboard_activity_log FOR INSERT TO authenticated WITH CHECK (true);