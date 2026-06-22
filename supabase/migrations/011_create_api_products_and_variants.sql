-- Supabase Migration: API Products and Variants
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS product_api;

GRANT USAGE ON SCHEMA product_api TO authenticated, service_role;

CREATE OR REPLACE FUNCTION product_api.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS product_api.product_code_integer_seq
  AS INTEGER
  START WITH 0
  INCREMENT BY 1
  MINVALUE 0;

CREATE TABLE IF NOT EXISTS product_api.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_code_integer INTEGER NOT NULL DEFAULT nextval('product_api.product_code_integer_seq') CHECK (product_code_integer >= 0),
  name TEXT NOT NULL,
  brand TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_code_integer)
);

ALTER SEQUENCE product_api.product_code_integer_seq
  OWNED BY product_api.products.product_code_integer;

CREATE TABLE IF NOT EXISTS product_api.variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES product_api.products(id) ON DELETE CASCADE,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON product_api.products TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_api.variants TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE product_api.product_code_integer_seq TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_product_api_products_code
  ON product_api.products(product_code_integer);
CREATE INDEX IF NOT EXISTS idx_product_api_products_name
  ON product_api.products(name);
CREATE INDEX IF NOT EXISTS idx_product_api_variants_product
  ON product_api.variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_api_variants_code
  ON product_api.variants(variant_code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_product_api_products') THEN
    CREATE TRIGGER set_updated_at_product_api_products
      BEFORE UPDATE ON product_api.products
      FOR EACH ROW EXECUTE FUNCTION product_api.handle_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_product_api_variants') THEN
    CREATE TRIGGER set_updated_at_product_api_variants
      BEFORE UPDATE ON product_api.variants
      FOR EACH ROW EXECUTE FUNCTION product_api.handle_updated_at();
  END IF;
END $$;

ALTER TABLE product_api.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_api.variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read API products" ON product_api.products;
DROP POLICY IF EXISTS "Authenticated can create API products" ON product_api.products;
DROP POLICY IF EXISTS "Authenticated can update API products" ON product_api.products;
DROP POLICY IF EXISTS "Authenticated can delete API products" ON product_api.products;
DROP POLICY IF EXISTS "Authenticated can read API product variants" ON product_api.variants;
DROP POLICY IF EXISTS "Authenticated can create API product variants" ON product_api.variants;
DROP POLICY IF EXISTS "Authenticated can update API product variants" ON product_api.variants;
DROP POLICY IF EXISTS "Authenticated can delete API product variants" ON product_api.variants;

CREATE POLICY "Authenticated can read API products"
  ON product_api.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create API products"
  ON product_api.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update API products"
  ON product_api.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete API products"
  ON product_api.products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read API product variants"
  ON product_api.variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create API product variants"
  ON product_api.variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update API product variants"
  ON product_api.variants FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete API product variants"
  ON product_api.variants FOR DELETE TO authenticated USING (true);