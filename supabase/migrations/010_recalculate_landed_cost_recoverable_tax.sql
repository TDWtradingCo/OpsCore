-- Recalculate stored landed costs so recoverable tax is excluded from product cost.

WITH line_totals AS (
  SELECT purchase_id, SUM(quantity)::NUMERIC AS total_quantity
  FROM public.purchase_line_items
  GROUP BY purchase_id
),
cost_totals AS (
  SELECT purchase_id, COALESCE(SUM(amount), 0)::NUMERIC AS total_additional_cost
  FROM public.purchase_additional_costs
  GROUP BY purchase_id
)
UPDATE public.purchase_line_items pli
SET landed_unit_cost = (
  (pli.unit_cost * pli.quantity)
  + CASE WHEN pli.tax_recoverability = 'non_recoverable' THEN pli.tax_amount ELSE 0 END
  + CASE
      WHEN line_totals.total_quantity > 0 THEN COALESCE(cost_totals.total_additional_cost, 0) * (pli.quantity::NUMERIC / line_totals.total_quantity)
      ELSE 0
    END
) / pli.quantity
FROM public.purchases p
JOIN line_totals ON line_totals.purchase_id = p.id
LEFT JOIN cost_totals ON cost_totals.purchase_id = p.id
WHERE pli.purchase_id = p.id
  AND p.status = 'completed'
  AND pli.quantity > 0;