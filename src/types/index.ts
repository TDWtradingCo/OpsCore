import type { Database } from './database'

// Convenience type aliases
export type User = Database['public']['Tables']['users']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type WarehouseLocation = Database['public']['Tables']['warehouse_locations']['Row']
export type Inventory = Database['public']['Tables']['inventory']['Row']
export type InventoryMovement = Database['public']['Tables']['inventory_movements']['Row']
export type Supplier = Database['public']['Tables']['suppliers']['Row']
export type Purchase = Database['public']['Tables']['purchases']['Row']
export type PurchaseLineItem = Database['public']['Tables']['purchase_line_items']['Row']
export type PurchaseAdditionalCost = Database['public']['Tables']['purchase_additional_costs']['Row']
export type PurchaseAllocation = Database['public']['Tables']['purchase_allocations']['Row']
export type SalesChannel = Database['public']['Tables']['sales_channels']['Row']
export type ChannelPricing = Database['public']['Tables']['channel_pricing']['Row']
export type DashboardActivityLog = Database['public']['Tables']['dashboard_activity_log']['Row']

// Extended types with relations
export interface InventoryWithRelations extends Inventory {
  product?: Product
  warehouse_location?: WarehouseLocation
}

export interface PurchaseWithRelations extends Purchase {
  supplier?: Supplier
  purchase_line_items?: PurchaseLineItemWithRelations[]
  purchase_additional_costs?: PurchaseAdditionalCost[]
}

export interface PurchaseLineItemWithRelations extends PurchaseLineItem {
  product?: Product
  purchase_allocations?: PurchaseAllocationWithRelations[]
}

export interface PurchaseAllocationWithRelations extends PurchaseAllocation {
  warehouse_location?: WarehouseLocation
}

export interface ChannelPricingWithRelations extends ChannelPricing {
  product?: Product
  sales_channel?: SalesChannel
}

export interface ProfitabilityAnalysis {
  product_id: string
  product_name: string
  sku: string
  channel_id: string
  channel_name: string
  selected_price: number
  landed_cost: number
  commission_percent: number
  commission_amount: number
  fulfillment_cost: number
  gross_profit: number
  margin_percent: number
}
