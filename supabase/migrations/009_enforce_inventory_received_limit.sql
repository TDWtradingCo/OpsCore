-- Enforce that stock on hand can never exceed received inventory.

CREATE OR REPLACE FUNCTION public.validate_product_inventory_balance(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
  total_stock INTEGER;
  total_received INTEGER;
BEGIN
  SELECT COALESCE(SUM(quantity), 0)::INTEGER
  INTO total_stock
  FROM public.inventory
  WHERE product_id = p_product_id;

  SELECT COALESCE(SUM(pa.quantity), 0)::INTEGER
  INTO total_received
  FROM public.purchase_allocations pa
  JOIN public.purchase_line_items pli ON pli.id = pa.purchase_line_item_id
  WHERE pli.product_id = p_product_id;

  IF total_stock > total_received THEN
    RAISE EXCEPTION 'Inventory in stock (%) cannot be more than inventory received (%) for product %', total_stock, total_received, p_product_id
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.validate_inventory_balance_from_inventory()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.validate_product_inventory_balance(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.validate_product_inventory_balance(NEW.product_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.validate_inventory_balance_from_allocation()
RETURNS TRIGGER AS $$
DECLARE
  affected_product_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT product_id INTO affected_product_id
    FROM public.purchase_line_items
    WHERE id = OLD.purchase_line_item_id;

    PERFORM public.validate_product_inventory_balance(affected_product_id);
    RETURN OLD;
  END IF;

  SELECT product_id INTO affected_product_id
  FROM public.purchase_line_items
  WHERE id = NEW.purchase_line_item_id;

  PERFORM public.validate_product_inventory_balance(affected_product_id);

  IF TG_OP = 'UPDATE' THEN
    IF OLD.purchase_line_item_id IS DISTINCT FROM NEW.purchase_line_item_id THEN
      SELECT product_id INTO affected_product_id
      FROM public.purchase_line_items
      WHERE id = OLD.purchase_line_item_id;

      PERFORM public.validate_product_inventory_balance(affected_product_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.validate_inventory_balance_from_line_item()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.validate_product_inventory_balance(OLD.product_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM public.validate_product_inventory_balance(NEW.product_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_inventory_received_limit_on_inventory ON public.inventory;
CREATE TRIGGER enforce_inventory_received_limit_on_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_balance_from_inventory();

DROP TRIGGER IF EXISTS enforce_inventory_received_limit_on_allocations ON public.purchase_allocations;
CREATE TRIGGER enforce_inventory_received_limit_on_allocations
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_balance_from_allocation();

DROP TRIGGER IF EXISTS enforce_inventory_received_limit_on_line_items ON public.purchase_line_items;
CREATE TRIGGER enforce_inventory_received_limit_on_line_items
AFTER UPDATE OF product_id OR DELETE ON public.purchase_line_items
FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_balance_from_line_item();