import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().min(1, 'SKU is required'),
  status: z.enum(['active', 'inactive']).default('active'),
  upc_gtin: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  weight: z.number().positive('Weight must be positive').nullable().optional(),
  weight_unit: z.enum(['kg', 'lb', 'oz', 'g']).nullable().optional(),
  length: z.number().positive('Length must be positive').nullable().optional(),
  width: z.number().positive('Width must be positive').nullable().optional(),
  height: z.number().positive('Height must be positive').nullable().optional(),
  dimension_unit: z.enum(['cm', 'in', 'mm']).nullable().optional(),
}).refine(
  (data) => {
    if (data.weight && !data.weight_unit) return false
    return true
  },
  { message: 'Weight unit is required when weight is provided', path: ['weight_unit'] }
).refine(
  (data) => {
    if ((data.length || data.width || data.height) && !data.dimension_unit) return false
    return true
  },
  { message: 'Dimension unit is required when dimensions are provided', path: ['dimension_unit'] }
)

export type ProductFormData = z.infer<typeof productSchema>

export const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  short_name: z.string().nullable().optional(),
  email: z.string().email('Invalid email').nullable().optional().or(z.literal('')),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

export type SupplierFormData = z.infer<typeof supplierSchema>

export const purchaseSchema = z.object({
  invoice_number: z.string().min(1, 'Invoice number is required'),
  supplier_id: z.string().min(1, 'Supplier is required'),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  notes: z.string().nullable().optional(),
})

export type PurchaseFormData = z.infer<typeof purchaseSchema>

export const purchaseLineItemSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unit_cost: z.number().positive('Unit cost must be positive'),
  tax_percent: z.number().min(0).default(0),
  tax_amount: z.number().min(0).default(0),
  tax_recoverability: z.enum(['recoverable', 'non_recoverable']).default('recoverable'),
})

export type PurchaseLineItemFormData = z.infer<typeof purchaseLineItemSchema>

export const inventoryAdjustmentSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  warehouse_location_id: z.string().min(1, 'Location is required'),
  adjustment_type: z.enum(['increase', 'decrease']),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  reason: z.string().min(1, 'Reason is required'),
})

export type InventoryAdjustmentFormData = z.infer<typeof inventoryAdjustmentSchema>

export const inventoryTransferSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  source_location_id: z.string().min(1, 'Source location is required'),
  destination_location_id: z.string().min(1, 'Destination location is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  reason: z.string().optional(),
}).refine(
  (data) => data.source_location_id !== data.destination_location_id,
  { message: 'Source and destination must be different', path: ['destination_location_id'] }
)

export type InventoryTransferFormData = z.infer<typeof inventoryTransferSchema>

export const channelPricingSchema = z.object({
  retail_price: z.number().min(0).nullable().optional(),
  offer_price: z.number().min(0).nullable().optional(),
  promo_price: z.number().min(0).nullable().optional(),
  fulfillment_mode: z.enum(['seller_fulfilled', 'marketplace_fulfilled']).default('seller_fulfilled'),
  seller_shipping_cost: z.number().min(0).default(0),
  marketplace_fulfillment_cost: z.number().min(0).default(0),
})

export type ChannelPricingFormData = z.infer<typeof channelPricingSchema>
