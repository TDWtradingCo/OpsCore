-- Supabase Migration: Public Product API Tables
-- =====================================================================
-- Supabase Data API can be locked down per schema/table in the dashboard.
-- These public-prefixed tables avoid custom schema exposure while staying
-- separate from the existing dashboard public.products table.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'product_api_variants'
      AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.product_api_variants;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'product_api_products'
      AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.product_api_products;
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.product_api_product_code_integer_seq
  AS INTEGER
  START WITH 0
  INCREMENT BY 1
  MINVALUE 0;

CREATE TABLE IF NOT EXISTS public.product_api_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_code_integer INTEGER NOT NULL DEFAULT nextval('public.product_api_product_code_integer_seq') CHECK (product_code_integer >= 0),
  name TEXT NOT NULL,
  brand TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_code_integer)
);

ALTER SEQUENCE public.product_api_product_code_integer_seq
  OWNED BY public.product_api_products.product_code_integer;

CREATE TABLE IF NOT EXISTS public.product_api_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.product_api_products(id) ON DELETE CASCADE,
  variant_code INTEGER NOT NULL CHECK (variant_code >= 0),
  variant_type TEXT NOT NULL,
  variant_value TEXT,
  condition TEXT NOT NULL DEFAULT 'New' CHECK (condition IN ('New', 'Open Box', 'Used - Good', 'Used - Very Good', 'Used - Like New', 'Refurbished')),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, variant_code)
);

DO $$
BEGIN
  IF to_regclass('product_api.products') IS NOT NULL THEN
    INSERT INTO public.product_api_products (
      id,
      product_code_integer,
      name,
      brand,
      image_url,
      created_at,
      updated_at
    )
    SELECT
      id,
      product_code_integer,
      name,
      brand,
      image_url,
      created_at,
      updated_at
    FROM product_api.products
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('product_api.variants') IS NOT NULL THEN
    INSERT INTO public.product_api_variants (
      id,
      product_id,
      variant_code,
      variant_type,
      variant_value,
      condition,
      quantity,
      image_url,
      created_at,
      updated_at
    )
    SELECT
      id,
      product_id,
      variant_code,
      variant_type,
      variant_value,
      condition,
      quantity,
      image_url,
      created_at,
      updated_at
    FROM product_api.variants
    WHERE product_id IN (SELECT id FROM public.product_api_products)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

SELECT setval(
  'public.product_api_product_code_integer_seq',
  COALESCE((SELECT MAX(product_code_integer) + 1 FROM public.product_api_products), 0),
  false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_api_products TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_api_variants TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.product_api_product_code_integer_seq TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_public_product_api_products_code
  ON public.product_api_products(product_code_integer);
CREATE INDEX IF NOT EXISTS idx_public_product_api_products_name
  ON public.product_api_products(name);
CREATE INDEX IF NOT EXISTS idx_public_product_api_variants_product
  ON public.product_api_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_public_product_api_variants_code
  ON public.product_api_variants(variant_code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_public_product_api_products') THEN
    CREATE TRIGGER set_updated_at_public_product_api_products
      BEFORE UPDATE ON public.product_api_products
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_public_product_api_variants') THEN
    CREATE TRIGGER set_updated_at_public_product_api_variants
      BEFORE UPDATE ON public.product_api_variants
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

ALTER TABLE public.product_api_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_api_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read public product API products" ON public.product_api_products;
DROP POLICY IF EXISTS "Authenticated can create public product API products" ON public.product_api_products;
DROP POLICY IF EXISTS "Authenticated can update public product API products" ON public.product_api_products;
DROP POLICY IF EXISTS "Authenticated can delete public product API products" ON public.product_api_products;
DROP POLICY IF EXISTS "Authenticated can read public product API variants" ON public.product_api_variants;
DROP POLICY IF EXISTS "Authenticated can create public product API variants" ON public.product_api_variants;
DROP POLICY IF EXISTS "Authenticated can update public product API variants" ON public.product_api_variants;
DROP POLICY IF EXISTS "Authenticated can delete public product API variants" ON public.product_api_variants;

CREATE POLICY "Authenticated can read public product API products"
  ON public.product_api_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create public product API products"
  ON public.product_api_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update public product API products"
  ON public.product_api_products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete public product API products"
  ON public.product_api_products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read public product API variants"
  ON public.product_api_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create public product API variants"
  ON public.product_api_variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update public product API variants"
  ON public.product_api_variants FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete public product API variants"
  ON public.product_api_variants FOR DELETE TO authenticated USING (true);