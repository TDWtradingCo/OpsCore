-- Tdot Dashboard: Inventory + Pricing Analysis System
-- Supabase Migration: Initial Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. Users table (extends Supabase Auth)
-- =============================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'standard' CHECK (role IN ('admin', 'standard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 2. Products
-- =============================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  upc_gtin TEXT UNIQUE,
  brand TEXT,
  weight NUMERIC,
  weight_unit TEXT CHECK (weight_unit IN ('kg', 'lb', 'oz', 'g')),
  length NUMERIC,
  width NUMERIC,
  height NUMERIC,
  dimension_unit TEXT CHECK (dimension_unit IN ('cm', 'in', 'mm')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weight_unit_required CHECK (
    (weight IS NULL) OR (weight IS NOT NULL AND weight_unit IS NOT NULL)
  ),
  CONSTRAINT dimension_unit_required CHECK (
    (length IS NULL AND width IS NULL AND height IS NULL) OR
    (dimension_unit IS NOT NULL)
  )
);

-- =============================================
-- 3. Warehouse Locations
-- =============================================
CREATE TABLE public.warehouse_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default locations
INSERT INTO public.warehouse_locations (name) VALUES
  ('WFS CA'),
  ('WFS USA'),
  ('Amazon FBA CA'),
  ('Amazon FBA USA'),
  ('3PL Canada'),
  ('3PL USA'),
  ('Local Storage');

-- =============================================
-- 4. Inventory (per product + location)
-- =============================================
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_location_id UUID NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_location_id)
);

-- =============================================
-- 5. Inventory Movements
-- =============================================
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source_location_id UUID REFERENCES public.warehouse_locations(id),
  destination_location_id UUID REFERENCES public.warehouse_locations(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase_allocation', 'transfer', 'adjustment_increase', 'adjustment_decrease')),
  reference_id UUID,
  reference_type TEXT,
  reason TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 6. Suppliers
-- =============================================
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  short_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 7. Purchases (Invoices)
-- =============================================
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  invoice_date DATE NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- =============================================
-- 8. Purchase Line Items
-- =============================================
CREATE TABLE public.purchase_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
  tax_percent NUMERIC NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
  tax_amount NUMERIC NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  tax_recoverability TEXT NOT NULL DEFAULT 'recoverable' CHECK (tax_recoverability IN ('recoverable', 'non_recoverable')),
  landed_unit_cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 9. Purchase Additional Costs
-- =============================================
CREATE TABLE public.purchase_additional_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('shipping', 'customs_duties', 'other')),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 10. Purchase Allocations
-- =============================================
CREATE TABLE public.purchase_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_line_item_id UUID NOT NULL REFERENCES public.purchase_line_items(id) ON DELETE CASCADE,
  warehouse_location_id UUID NOT NULL REFERENCES public.warehouse_locations(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 11. Sales Channels
-- =============================================
CREATE TABLE public.sales_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  commission_percent NUMERIC NOT NULL DEFAULT 15 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default channels
INSERT INTO public.sales_channels (name, commission_percent) VALUES
  ('Amazon', 15),
  ('Walmart', 15),
  ('Best Buy', 15),
  ('Shopify', 3);

-- =============================================
-- 12. Channel Pricing
-- =============================================
CREATE TABLE public.channel_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.sales_channels(id) ON DELETE CASCADE,
  retail_price NUMERIC CHECK (retail_price IS NULL OR retail_price >= 0),
  offer_price NUMERIC CHECK (offer_price IS NULL OR offer_price >= 0),
  promo_price NUMERIC CHECK (promo_price IS NULL OR promo_price >= 0),
  fulfillment_mode TEXT NOT NULL DEFAULT 'seller_fulfilled' CHECK (fulfillment_mode IN ('seller_fulfilled', 'marketplace_fulfilled')),
  seller_shipping_cost NUMERIC NOT NULL DEFAULT 0 CHECK (seller_shipping_cost >= 0),
  marketplace_fulfillment_cost NUMERIC NOT NULL DEFAULT 0 CHECK (marketplace_fulfillment_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, channel_id)
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_inventory_product ON public.inventory(product_id);
CREATE INDEX idx_inventory_location ON public.inventory(warehouse_location_id);
CREATE INDEX idx_movements_product ON public.inventory_movements(product_id);
CREATE INDEX idx_movements_created ON public.inventory_movements(created_at DESC);
CREATE INDEX idx_purchases_status ON public.purchases(status);
CREATE INDEX idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX idx_line_items_purchase ON public.purchase_line_items(purchase_id);
CREATE INDEX idx_line_items_product ON public.purchase_line_items(product_id);
CREATE INDEX idx_allocations_line_item ON public.purchase_allocations(purchase_line_item_id);
CREATE INDEX idx_channel_pricing_product ON public.channel_pricing(product_id);
CREATE INDEX idx_channel_pricing_channel ON public.channel_pricing(channel_id);

-- =============================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.warehouse_locations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_line_items FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sales_channels FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.channel_pricing FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_additional_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_pricing ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Users table: users can read all, only admins can update roles
CREATE POLICY "Users can read all users" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update users" ON public.users FOR UPDATE TO authenticated USING (public.get_user_role() = 'admin');

-- Products: authenticated users can read, create, update
CREATE POLICY "Authenticated can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO authenticated USING (public.get_user_role() = 'admin');

-- Warehouse locations: all authenticated read, admins manage
CREATE POLICY "Authenticated can read locations" ON public.warehouse_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage locations" ON public.warehouse_locations FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "Admins can update locations" ON public.warehouse_locations FOR UPDATE TO authenticated USING (public.get_user_role() = 'admin');

-- Inventory: authenticated read and manage
CREATE POLICY "Authenticated can read inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can manage inventory" ON public.inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update inventory" ON public.inventory FOR UPDATE TO authenticated USING (true);

-- Inventory movements: authenticated read and create
CREATE POLICY "Authenticated can read movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (true);

-- Suppliers: authenticated read and manage
CREATE POLICY "Authenticated can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);

-- Purchases: authenticated read and manage
CREATE POLICY "Authenticated can read purchases" ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create purchases" ON public.purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update purchases" ON public.purchases FOR UPDATE TO authenticated USING (true);

-- Purchase line items
CREATE POLICY "Authenticated can read line items" ON public.purchase_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create line items" ON public.purchase_line_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update line items" ON public.purchase_line_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete line items" ON public.purchase_line_items FOR DELETE TO authenticated USING (true);

-- Purchase additional costs
CREATE POLICY "Authenticated can read costs" ON public.purchase_additional_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create costs" ON public.purchase_additional_costs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update costs" ON public.purchase_additional_costs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete costs" ON public.purchase_additional_costs FOR DELETE TO authenticated USING (true);

-- Purchase allocations
CREATE POLICY "Authenticated can read allocations" ON public.purchase_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create allocations" ON public.purchase_allocations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update allocations" ON public.purchase_allocations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete allocations" ON public.purchase_allocations FOR DELETE TO authenticated USING (true);

-- Sales channels: all read, admins manage
CREATE POLICY "Authenticated can read channels" ON public.sales_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage channels" ON public.sales_channels FOR INSERT TO authenticated WITH CHECK (public.get_user_role() = 'admin');
CREATE POLICY "Admins can update channels" ON public.sales_channels FOR UPDATE TO authenticated USING (public.get_user_role() = 'admin');

-- Channel pricing: authenticated read and manage
CREATE POLICY "Authenticated can read pricing" ON public.channel_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create pricing" ON public.channel_pricing FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update pricing" ON public.channel_pricing FOR UPDATE TO authenticated USING (true);

-- =============================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'standard'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
