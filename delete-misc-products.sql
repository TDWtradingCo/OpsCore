-- Delete all Misc Item products and their associated data
-- This deletes in order: allocations → line items → inventory → products

DELETE FROM purchase_allocations
WHERE purchase_line_item_id IN (
  SELECT pli.id FROM purchase_line_items pli
  JOIN products p ON pli.product_id = p.id
  WHERE p.name LIKE 'Misc Item —%'
);

DELETE FROM purchase_line_items
WHERE product_id IN (
  SELECT id FROM products WHERE name LIKE 'Misc Item —%'
);

DELETE FROM inventory
WHERE product_id IN (
  SELECT id FROM products WHERE name LIKE 'Misc Item —%'
);

DELETE FROM products
WHERE name LIKE 'Misc Item —%';

-- Verify deletion
SELECT 'Done! All Misc Item products deleted.' as status;
