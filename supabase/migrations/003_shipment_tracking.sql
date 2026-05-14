-- Shipment tracking for purchase orders
CREATE TABLE public.shipment_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'shipped', 'in_transit', 'customs', 'delivered', 'received')),
  carrier TEXT,
  tracking_number TEXT,
  estimated_arrival DATE,
  actual_arrival DATE,
  origin_country TEXT,
  destination_country TEXT DEFAULT 'CA',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shipment status history/events for timeline
CREATE TABLE public.shipment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id UUID NOT NULL REFERENCES public.shipment_tracking(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ordered', 'shipped', 'in_transit', 'customs', 'delivered', 'received')),
  location TEXT,
  notes TEXT,
  event_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id)
);

-- Add geographic coordinates to warehouse_locations for map view
ALTER TABLE public.warehouse_locations ADD COLUMN latitude NUMERIC;
ALTER TABLE public.warehouse_locations ADD COLUMN longitude NUMERIC;
ALTER TABLE public.warehouse_locations ADD COLUMN address TEXT;

-- Add geographic coordinates to suppliers for map view
ALTER TABLE public.suppliers ADD COLUMN country TEXT;
ALTER TABLE public.suppliers ADD COLUMN city TEXT;
ALTER TABLE public.suppliers ADD COLUMN latitude NUMERIC;
ALTER TABLE public.suppliers ADD COLUMN longitude NUMERIC;

-- Indexes
CREATE INDEX idx_shipment_tracking_purchase ON public.shipment_tracking(purchase_id);
CREATE INDEX idx_shipment_tracking_status ON public.shipment_tracking(status);
CREATE INDEX idx_shipment_events_shipment ON public.shipment_events(shipment_id);

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shipment_tracking FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.shipment_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read shipments" ON public.shipment_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create shipments" ON public.shipment_tracking FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update shipments" ON public.shipment_tracking FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can read shipment events" ON public.shipment_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create shipment events" ON public.shipment_events FOR INSERT TO authenticated WITH CHECK (true);
