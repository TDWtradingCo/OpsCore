-- Supabase Migration: Create Orders and Order Items Tables
-- =====================================================================

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  sales_channel_id UUID REFERENCES public.sales_channels(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policies for orders
CREATE POLICY "Authenticated can read orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update orders" ON public.orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete orders" ON public.orders FOR DELETE TO authenticated USING (true);

-- Policies for order_items
CREATE POLICY "Authenticated can read order items" ON public.order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update order items" ON public.order_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete order items" ON public.order_items FOR DELETE TO authenticated USING (true);

-- Indexing
CREATE INDEX idx_orders_order_number ON public.orders(order_number);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_sales_channel ON public.orders(sales_channel_id);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_product ON public.order_items(product_id);

-- Triggers for updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
