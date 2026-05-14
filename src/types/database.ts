export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'standard'
export type ProductStatus = 'active' | 'inactive'
export type PurchaseStatus = 'draft' | 'completed'
export type MovementType = 'purchase_allocation' | 'transfer' | 'adjustment_increase' | 'adjustment_decrease'
export type AdjustmentType = 'increase' | 'decrease'
export type AdditionalCostType = 'shipping' | 'customs_duties' | 'other'
export type TaxRecoverability = 'recoverable' | 'non_recoverable'
export type FulfillmentMode = 'seller_fulfilled' | 'marketplace_fulfilled'
export type PriceType = 'retail' | 'offer' | 'promo'
export type WeightUnit = 'kg' | 'lb' | 'oz' | 'g'
export type DimensionUnit = 'cm' | 'in' | 'mm'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: UserRole
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          name: string
          sku: string
          status: ProductStatus
          upc_gtin: string | null
          brand: string | null
          weight: number | null
          weight_unit: WeightUnit | null
          length: number | null
          width: number | null
          height: number | null
          dimension_unit: DimensionUnit | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sku: string
          status?: ProductStatus
          upc_gtin?: string | null
          brand?: string | null
          weight?: number | null
          weight_unit?: WeightUnit | null
          length?: number | null
          width?: number | null
          height?: number | null
          dimension_unit?: DimensionUnit | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sku?: string
          status?: ProductStatus
          upc_gtin?: string | null
          brand?: string | null
          weight?: number | null
          weight_unit?: WeightUnit | null
          length?: number | null
          width?: number | null
          height?: number | null
          dimension_unit?: DimensionUnit | null
          updated_at?: string
        }
      }
      warehouse_locations: {
        Row: {
          id: string
          name: string
          status: ProductStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: ProductStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          status?: ProductStatus
          updated_at?: string
        }
      }
      inventory: {
        Row: {
          id: string
          product_id: string
          warehouse_location_id: string
          quantity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          warehouse_location_id: string
          quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          quantity?: number
          updated_at?: string
        }
      }
      inventory_movements: {
        Row: {
          id: string
          product_id: string
          source_location_id: string | null
          destination_location_id: string | null
          quantity: number
          movement_type: MovementType
          reference_id: string | null
          reference_type: string | null
          reason: string | null
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          source_location_id?: string | null
          destination_location_id?: string | null
          quantity: number
          movement_type: MovementType
          reference_id?: string | null
          reference_type?: string | null
          reason?: string | null
          user_id: string
          created_at?: string
        }
        Update: never
      }
      suppliers: {
        Row: {
          id: string
          name: string
          short_name: string | null
          email: string | null
          phone: string | null
          notes: string | null
          status: ProductStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          short_name?: string | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          status?: ProductStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          short_name?: string | null
          email?: string | null
          phone?: string | null
          notes?: string | null
          status?: ProductStatus
          updated_at?: string
        }
      }
      purchases: {
        Row: {
          id: string
          invoice_number: string
          supplier_id: string
          status: PurchaseStatus
          invoice_date: string
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          invoice_number: string
          supplier_id: string
          status?: PurchaseStatus
          invoice_date: string
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          invoice_number?: string
          supplier_id?: string
          status?: PurchaseStatus
          invoice_date?: string
          notes?: string | null
          updated_at?: string
          completed_at?: string | null
        }
      }
      purchase_line_items: {
        Row: {
          id: string
          purchase_id: string
          product_id: string
          quantity: number
          unit_cost: number
          tax_percent: number
          tax_amount: number
          tax_recoverability: TaxRecoverability
          landed_unit_cost: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          purchase_id: string
          product_id: string
          quantity: number
          unit_cost: number
          tax_percent?: number
          tax_amount?: number
          tax_recoverability?: TaxRecoverability
          landed_unit_cost?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          product_id?: string
          quantity?: number
          unit_cost?: number
          tax_percent?: number
          tax_amount?: number
          tax_recoverability?: TaxRecoverability
          landed_unit_cost?: number | null
          updated_at?: string
        }
      }
      purchase_additional_costs: {
        Row: {
          id: string
          purchase_id: string
          cost_type: AdditionalCostType
          amount: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          purchase_id: string
          cost_type: AdditionalCostType
          amount: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          cost_type?: AdditionalCostType
          amount?: number
          notes?: string | null
        }
      }
      purchase_allocations: {
        Row: {
          id: string
          purchase_line_item_id: string
          warehouse_location_id: string
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          purchase_line_item_id: string
          warehouse_location_id: string
          quantity: number
          created_at?: string
        }
        Update: {
          warehouse_location_id?: string
          quantity?: number
        }
      }
      sales_channels: {
        Row: {
          id: string
          name: string
          commission_percent: number
          status: ProductStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          commission_percent: number
          status?: ProductStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          commission_percent?: number
          status?: ProductStatus
          updated_at?: string
        }
      }
      channel_pricing: {
        Row: {
          id: string
          product_id: string
          channel_id: string
          retail_price: number | null
          offer_price: number | null
          promo_price: number | null
          fulfillment_mode: FulfillmentMode
          seller_shipping_cost: number
          marketplace_fulfillment_cost: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          channel_id: string
          retail_price?: number | null
          offer_price?: number | null
          promo_price?: number | null
          fulfillment_mode?: FulfillmentMode
          seller_shipping_cost?: number
          marketplace_fulfillment_cost?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          retail_price?: number | null
          offer_price?: number | null
          promo_price?: number | null
          fulfillment_mode?: FulfillmentMode
          seller_shipping_cost?: number
          marketplace_fulfillment_cost?: number
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
