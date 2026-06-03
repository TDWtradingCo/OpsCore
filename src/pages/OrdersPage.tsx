import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Plus, 
  Search, 
  Download, 
  Upload, 
  Pencil, 
  Trash2, 
  ShoppingCart, 
  DollarSign, 
  Calendar, 
  Tag, 
  Database,
  X,
  FileSpreadsheet
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { exportToCSV, parseCSV } from '@/lib/csv'
import { toast } from 'sonner'
import { logDashboardActivity } from '@/lib/audit'

// Interface representing Order
interface OrderItem {
  id?: string
  product_id: string
  product_name?: string
  product_sku?: string
  quantity: number
  unit_price: number
}

interface Order {
  id: string
  order_number: string
  customer_name: string
  customer_email: string | null
  order_date: string
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  total_amount: number
  sales_channel_id: string | null
  sales_channel?: { name: string } | null
  sales_channel_name?: string // For local storage
  notes: string | null
  created_at: string
  updated_at: string
  order_items?: OrderItem[]
  items?: OrderItem[] // For compatibility with local storage
}

export function OrdersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [channelFilter, setChannelFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20
  
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Track if we fall back to localStorage
  const [isLocalStorage, setIsLocalStorage] = useState(() => {
    return localStorage.getItem('tdw_use_local_orders') === 'true'
  })

  // Clear page filter on search
  useEffect(() => { setCurrentPage(1) }, [search, statusFilter, channelFilter, dateFrom, dateTo])

  // Get active sales channels for select menus
  const { data: salesChannels } = useQuery({
    queryKey: ['sales-channels-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_channels')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
      if (error) return []
      return data ?? []
    }
  })

  // Get active products for select menus
  const { data: products } = useQuery({
    queryKey: ['products-active-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('status', 'active')
        .order('name')
      if (error) return []
      return data ?? []
    }
  })

  // Local storage mock helpers
  const getStoredOrders = (): Order[] => {
    const data = localStorage.getItem('tdw_mock_orders')
    if (data) return JSON.parse(data)
    
    // Default seed data
    const seed: Order[] = [
      {
        id: 'ord-1',
        order_number: 'ORD-2026-001',
        customer_name: 'Alex Johnson',
        customer_email: 'alex@example.com',
        order_date: '2026-06-01',
        status: 'delivered',
        total_amount: 185.00,
        sales_channel_id: salesChannels?.[0]?.id || null,
        sales_channel_name: 'Shopify',
        notes: 'Customer requested front porch delivery.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          { product_id: products?.[0]?.id || 'prod-1', product_name: products?.[0]?.name || 'Wheel Hub Assembly', product_sku: products?.[0]?.sku || 'WHA-001', quantity: 2, unit_price: 92.50 }
        ]
      },
      {
        id: 'ord-2',
        order_number: 'ORD-2026-002',
        customer_name: 'Sarah Miller',
        customer_email: 'sarah.m@example.com',
        order_date: '2026-06-02',
        status: 'processing',
        total_amount: 320.00,
        sales_channel_id: salesChannels?.[1]?.id || null,
        sales_channel_name: 'Amazon',
        notes: 'Express shipping.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: [
          { product_id: products?.[1]?.id || 'prod-2', product_name: products?.[1]?.name || 'LED Headlight Bulb Kit', product_sku: products?.[1]?.sku || 'LED-HB-002', quantity: 1, unit_price: 320.00 }
        ]
      }
    ]
    localStorage.setItem('tdw_mock_orders', JSON.stringify(seed))
    return seed
  }

  const getLocalFilteredOrders = (
    search: string,
    statusFilter: string,
    channelFilter: string,
    dateFrom: string,
    dateTo: string
  ): Order[] => {
    let list = getStoredOrders()
    if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter)
    }
    if (channelFilter !== 'all') {
      list = list.filter(o => o.sales_channel_id === channelFilter || o.sales_channel_name === channelFilter)
    }
    if (dateFrom) {
      list = list.filter(o => o.order_date >= dateFrom)
    }
    if (dateTo) {
      list = list.filter(o => o.order_date <= dateTo)
    }
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(o => 
        o.order_number.toLowerCase().includes(s) ||
        o.customer_name.toLowerCase().includes(s) ||
        (o.customer_email && o.customer_email.toLowerCase().includes(s)) ||
        (o.items && o.items.some(item => 
          item.product_name?.toLowerCase().includes(s) || 
          item.product_sku?.toLowerCase().includes(s)
        ))
      )
    }
    return list
  }

  // Tanstack Query for orders
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', search, statusFilter, channelFilter, dateFrom, dateTo, isLocalStorage, salesChannels, products],
    queryFn: async () => {
      if (isLocalStorage) {
        return getLocalFilteredOrders(search, statusFilter, channelFilter, dateFrom, dateTo)
      }
      try {
        let query = supabase
          .from('orders')
          .select('*, sales_channel:sales_channels(name), order_items(*, product:products(name, sku))')

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter)
        }
        if (channelFilter !== 'all') {
          query = query.eq('sales_channel_id', channelFilter)
        }
        if (dateFrom) {
          query = query.gte('order_date', dateFrom)
        }
        if (dateTo) {
          query = query.lte('order_date', dateTo)
        }

        query = query.order('order_date', { ascending: false })

        const { data, error } = await query
        if (error) {
          if (error.code === '42P01' || error.message?.includes('relation "public.orders" does not exist')) {
            setIsLocalStorage(true)
            localStorage.setItem('tdw_use_local_orders', 'true')
            return getLocalFilteredOrders(search, statusFilter, channelFilter, dateFrom, dateTo)
          }
          throw error
        }

        let result = data ?? []
        // Convert to standard format
        result = result.map((o: any) => ({
          ...o,
          items: o.order_items?.map((item: any) => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product?.name,
            product_sku: item.product?.sku,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })) ?? []
        }))

        // Apply client search
        if (search) {
          const s = search.toLowerCase()
          result = result.filter((o: any) => 
            o.order_number.toLowerCase().includes(s) ||
            o.customer_name.toLowerCase().includes(s) ||
            (o.customer_email && o.customer_email.toLowerCase().includes(s)) ||
            o.items.some((item: any) => 
              item.product_name?.toLowerCase().includes(s) || 
              item.product_sku?.toLowerCase().includes(s)
            )
          )
        }

        return result as Order[]
      } catch (err: any) {
        if (err.code === '42P01' || err.message?.includes('relation "public.orders" does not exist')) {
          setIsLocalStorage(true)
          localStorage.setItem('tdw_use_local_orders', 'true')
          return getLocalFilteredOrders(search, statusFilter, channelFilter, dateFrom, dateTo)
        }
        throw err
      }
    }
  })

  // Create Order Mutation
  const createOrder = useMutation({
    mutationFn: async (newOrderData: Omit<Order, 'id' | 'created_at' | 'updated_at'> & { items: OrderItem[] }) => {
      if (isLocalStorage) {
        const stored = getStoredOrders()
        const orderId = 'ord-' + Date.now()
        
        // Match sales channel name
        const chanName = salesChannels?.find(c => c.id === newOrderData.sales_channel_id)?.name || 'Custom'
        
        // Enrich items with name & sku
        const enrichedItems = newOrderData.items.map(item => {
          const prodObj = products?.find(p => p.id === item.product_id)
          return {
            ...item,
            product_name: prodObj?.name || 'Unknown Product',
            product_sku: prodObj?.sku || 'N/A'
          }
        })

        const newOrder: Order = {
          id: orderId,
          order_number: newOrderData.order_number,
          customer_name: newOrderData.customer_name,
          customer_email: newOrderData.customer_email,
          order_date: newOrderData.order_date,
          status: newOrderData.status,
          total_amount: newOrderData.total_amount,
          sales_channel_id: newOrderData.sales_channel_id,
          sales_channel_name: chanName,
          notes: newOrderData.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          items: enrichedItems
        }
        
        stored.unshift(newOrder)
        localStorage.setItem('tdw_mock_orders', JSON.stringify(stored))
        return newOrder
      }

      // Supabase insertion
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: newOrderData.order_number,
          customer_name: newOrderData.customer_name,
          customer_email: newOrderData.customer_email,
          order_date: newOrderData.order_date,
          status: newOrderData.status,
          total_amount: newOrderData.total_amount,
          sales_channel_id: newOrderData.sales_channel_id,
          notes: newOrderData.notes,
        })
        .select()
        .single()

      if (orderError) throw orderError

      if (newOrderData.items && newOrderData.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(
            newOrderData.items.map(item => ({
              order_id: order.id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
            }))
          )

        if (itemsError) {
          // Cleanup orphan order header
          await supabase.from('orders').delete().eq('id', order.id)
          throw itemsError
        }
      }

      return order
    },
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setDialogOpen(false)
      resetForm()
      if (user) {
        await logDashboardActivity({
          entityType: 'order',
          action: 'create',
          userId: user.id,
          entityId: created.id,
          description: `Created sales order ${created.order_number}`,
          metadata: { total: created.total_amount }
        })
      }
      toast.success('Order created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create order')
    }
  })

  // Update Order Mutation
  const updateOrder = useMutation({
    mutationFn: async (updatedOrderData: Order & { items: OrderItem[] }) => {
      if (isLocalStorage) {
        const stored = getStoredOrders()
        const idx = stored.findIndex(o => o.id === updatedOrderData.id)
        if (idx !== -1) {
          const chanName = salesChannels?.find(c => c.id === updatedOrderData.sales_channel_id)?.name || 'Custom'
          const enrichedItems = updatedOrderData.items.map(item => {
            const prodObj = products?.find(p => p.id === item.product_id)
            return {
              ...item,
              product_name: prodObj?.name || item.product_name || 'Unknown Product',
              product_sku: prodObj?.sku || item.product_sku || 'N/A'
            }
          })

          stored[idx] = {
            ...updatedOrderData,
            sales_channel_name: chanName,
            updated_at: new Date().toISOString(),
            items: enrichedItems
          }
          localStorage.setItem('tdw_mock_orders', JSON.stringify(stored))
        }
        return updatedOrderData
      }

      // Supabase update
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          order_number: updatedOrderData.order_number,
          customer_name: updatedOrderData.customer_name,
          customer_email: updatedOrderData.customer_email,
          order_date: updatedOrderData.order_date,
          status: updatedOrderData.status,
          total_amount: updatedOrderData.total_amount,
          sales_channel_id: updatedOrderData.sales_channel_id,
          notes: updatedOrderData.notes,
        })
        .eq('id', updatedOrderData.id)

      if (orderError) throw orderError

      // Replace line items: delete old ones & insert new ones
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', updatedOrderData.id)

      if (deleteError) throw deleteError

      if (updatedOrderData.items && updatedOrderData.items.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(
            updatedOrderData.items.map(item => ({
              order_id: updatedOrderData.id,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
            }))
          )
        if (itemsError) throw itemsError
      }

      return updatedOrderData
    },
    onSuccess: async (updated) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setEditDialogOpen(false)
      setSelectedOrder(null)
      resetForm()
      if (user) {
        await logDashboardActivity({
          entityType: 'order',
          action: 'update',
          userId: user.id,
          entityId: updated.id,
          description: `Updated sales order ${updated.order_number}`,
        })
      }
      toast.success('Order updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update order')
    }
  })

  // Delete Order Mutation
  const deleteOrder = useMutation({
    mutationFn: async ({ id, orderNumber }: { id: string; orderNumber: string }) => {
      if (isLocalStorage) {
        const stored = getStoredOrders()
        const filtered = stored.filter(o => o.id !== id)
        localStorage.setItem('tdw_mock_orders', JSON.stringify(filtered))
        return { id, orderNumber }
      }

      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id)
      if (error) throw error
      return { id, orderNumber }
    },
    onSuccess: async ({ id, orderNumber }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      if (user) {
        await logDashboardActivity({
          entityType: 'order',
          action: 'delete',
          userId: user.id,
          entityId: id,
          description: `Deleted sales order ${orderNumber}`,
        })
      }
      toast.success('Order deleted')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete order')
    }
  })

  // Bulk CSV Import Mutation
  const bulkImportOrders = useMutation({
    mutationFn: async (csvText: string) => {
      const rows = parseCSV(csvText)
      if (rows.length === 0) throw new Error('No valid rows in CSV')

      if (isLocalStorage) {
        const stored = getStoredOrders()
        const orderGroups = new Map<string, any>()

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          if (!row) continue

          const orderNumber = row.order_number?.trim() || row.order_id?.trim()
          const customerName = row.customer_name?.trim() || row.customer?.trim()
          const orderDate = row.order_date?.trim() || new Date().toISOString().split('T')[0]

          if (!orderNumber || !customerName) continue

          // Gather product info
          const skuOrName = row.sku?.trim() || row.product_sku?.trim() || row.product?.trim() || row.product_name?.trim()
          const qty = parseInt(row.quantity ?? row.qty ?? '1', 10) || 1
          const unitPrice = parseFloat((row.unit_price ?? row.price ?? '0').replace(/[$,\s]/g, '')) || 0

          const matchedProd = products?.find(p => 
            p.sku?.toLowerCase() === skuOrName?.toLowerCase() ||
            p.name?.toLowerCase() === skuOrName?.toLowerCase()
          )

          const item: OrderItem = {
            product_id: matchedProd?.id || 'custom-prod',
            product_name: matchedProd?.name || skuOrName || 'Unknown Product',
            product_sku: matchedProd?.sku || skuOrName || 'N/A',
            quantity: qty,
            unit_price: unitPrice
          }

          if (!orderGroups.has(orderNumber)) {
            orderGroups.set(orderNumber, {
              order_number: orderNumber,
              customer_name: customerName,
              customer_email: row.customer_email?.trim() || null,
              order_date: orderDate,
              status: (row.status?.trim().toLowerCase() || 'pending') as any,
              notes: row.notes?.trim() || null,
              sales_channel_name: row.sales_channel?.trim() || 'Imported',
              items: []
            })
          }
          orderGroups.get(orderNumber).items.push(item)
        }

        let newCount = 0
        for (const [, group] of orderGroups) {
          const totalAmount = group.items.reduce((sum: number, it: any) => sum + (it.quantity * it.unit_price), 0)
          const newOrder: Order = {
            id: 'ord-csv-' + Math.random().toString(36).substr(2, 9),
            order_number: group.order_number,
            customer_name: group.customer_name,
            customer_email: group.customer_email,
            order_date: group.order_date,
            status: group.status,
            total_amount: totalAmount,
            sales_channel_id: salesChannels?.find(c => c.name.toLowerCase() === group.sales_channel_name.toLowerCase())?.id || null,
            sales_channel_name: group.sales_channel_name,
            notes: group.notes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            items: group.items
          }
          stored.unshift(newOrder)
          newCount++
        }

        localStorage.setItem('tdw_mock_orders', JSON.stringify(stored))
        return { successCount: newCount, newCount, updatedCount: 0 }
      }

      // Supabase Database Bulk Import logic (Fully optimized with minimal network rounds)
      // 1. Fetch channel lookups and existing orders
      const [{ data: existingDbOrders }] = await Promise.all([
        supabase.from('orders').select('id, order_number')
      ])

      const existingOrdersMap = new Map(existingDbOrders?.map(o => [o.order_number.toLowerCase(), o.id]) ?? [])
      const channelsMap = new Map(salesChannels?.map(c => [c.name.toLowerCase(), c.id]) ?? [])
      const productsMapBySku = new Map(products?.map(p => [p.sku?.toLowerCase(), p.id]) ?? [])
      const productsMapByName = new Map(products?.map(p => [p.name?.toLowerCase(), p.id]) ?? [])

      // Group rows by order number to prevent duplication and batch insert
      const orderGroups = new Map<string, any>()
      const skippedRows: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (!row) continue

        const orderNumber = row.order_number?.trim() || row.order_id?.trim()
        const customerName = row.customer_name?.trim() || row.customer?.trim()
        const orderDate = row.order_date?.trim() || new Date().toISOString().split('T')[0]

        if (!orderNumber) { skippedRows.push(`Row ${i + 2}: missing order number`); continue }
        if (!customerName) { skippedRows.push(`Row ${i + 2}: missing customer name`); continue }

        const status = (row.status?.trim().toLowerCase() || 'pending') as any
        const channelName = row.sales_channel?.trim() || ''
        const skuOrName = row.sku?.trim() || row.product_sku?.trim() || row.product?.trim() || row.product_name?.trim()
        const quantity = parseInt(row.quantity ?? row.qty ?? '1', 10) || 1
        const unitPrice = parseFloat((row.unit_price ?? row.price ?? '0').replace(/[$,\s]/g, '')) || 0

        const matchedProductId = productsMapBySku.get(skuOrName?.toLowerCase()) || productsMapByName.get(skuOrName?.toLowerCase())
        if (!matchedProductId) {
          skippedRows.push(`Row ${i + 2}: product "${skuOrName}" not found — skipping item`)
          continue
        }

        const channelId = channelsMap.get(channelName.toLowerCase()) || null

        if (!orderGroups.has(orderNumber)) {
          orderGroups.set(orderNumber, {
            order_number: orderNumber,
            customer_name: customerName,
            customer_email: row.customer_email?.trim() || null,
            order_date: orderDate,
            status,
            sales_channel_id: channelId,
            notes: row.notes?.trim() || null,
            items: []
          })
        }
        orderGroups.get(orderNumber).items.push({
          product_id: matchedProductId,
          quantity,
          unit_price: unitPrice
        })
      }

      // Filter out new orders vs updates
      const toCreateList: any[] = []
      const orderItemsToInsert: any[] = []

      let newCount = 0
      let updatedCount = 0

      for (const [orderNum, group] of orderGroups) {
        const totalAmount = group.items.reduce((sum: number, it: any) => sum + (it.quantity * it.unit_price), 0)
        const lowerNum = orderNum.toLowerCase()
        
        if (existingOrdersMap.has(lowerNum)) {
          // Update order header
          const orderId = existingOrdersMap.get(lowerNum)
          await supabase.from('orders').update({
            customer_name: group.customer_name,
            customer_email: group.customer_email,
            order_date: group.order_date,
            status: group.status,
            total_amount: totalAmount,
            sales_channel_id: group.sales_channel_id,
            notes: group.notes,
          }).eq('id', orderId)

          // Delete and recreate items
          await supabase.from('order_items').delete().eq('order_id', orderId)
          
          group.items.forEach((it: any) => {
            orderItemsToInsert.push({
              order_id: orderId,
              product_id: it.product_id,
              quantity: it.quantity,
              unit_price: it.unit_price
            })
          })
          updatedCount++
        } else {
          toCreateList.push({
            order_number: group.order_number,
            customer_name: group.customer_name,
            customer_email: group.customer_email,
            order_date: group.order_date,
            status: group.status,
            total_amount: totalAmount,
            sales_channel_id: group.sales_channel_id,
            notes: group.notes,
          })
        }
      }

      // Batch insert new orders in one query
      if (toCreateList.length > 0) {
        const { data: createdOrders, error: insertError } = await supabase
          .from('orders')
          .insert(toCreateList)
          .select('id, order_number')

        if (insertError) throw insertError

        createdOrders?.forEach(o => {
          const group = orderGroups.get(o.order_number)
          if (group) {
            group.items.forEach((it: any) => {
              orderItemsToInsert.push({
                order_id: o.id,
                product_id: it.product_id,
                quantity: it.quantity,
                unit_price: it.unit_price
              })
            })
          }
        })
        newCount += toCreateList.length
      }

      // Batch insert all order items in one query
      if (orderItemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItemsToInsert)
        if (itemsError) throw itemsError
      }

      return { successCount: newCount + updatedCount, newCount, updatedCount, errors: skippedRows }
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
      let msg = `Processed ${result.successCount} order(s)`
      if (result.newCount > 0) msg += ` (${result.newCount} new`
      if (result.updatedCount > 0) msg += result.newCount > 0 ? `, ${result.updatedCount} updated)` : ` (${result.updatedCount} updated)`
      else if (result.newCount > 0) msg += ')'
      
      toast.success(msg)
      if (result.errors && result.errors.length > 0) {
        toast.error(`Import warnings:\n${result.errors.slice(0, 3).join('\n')}`)
      }
    },
    onError: (error: any) => {
      setImporting(false)
      toast.error(error.message || 'CSV Import failed')
    }
  })

  // Handle CSV file input
  const handleCSVImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      bulkImportOrders.mutate(text)
    }
    reader.onerror = () => {
      setImporting(false)
      toast.error('Failed to read file')
    }
    reader.readAsText(file)
  }

  // Export orders to CSV
  const handleExport = () => {
    if (orders.length === 0) return
    const exportData = orders.flatMap(o => {
      const channelName = o.sales_channel?.name || o.sales_channel_name || 'Custom'
      if (!o.items || o.items.length === 0) {
        return [{
          order_number: o.order_number,
          customer_name: o.customer_name,
          customer_email: o.customer_email ?? '',
          order_date: o.order_date,
          status: o.status,
          sales_channel: channelName,
          product_name: '',
          sku: '',
          quantity: 0,
          unit_price: 0,
          notes: o.notes ?? '',
        }]
      }
      return o.items.map(it => ({
        order_number: o.order_number,
        customer_name: o.customer_name,
        customer_email: o.customer_email ?? '',
        order_date: o.order_date,
        status: o.status,
        sales_channel: channelName,
        product_name: it.product_name ?? '',
        sku: it.product_sku ?? '',
        quantity: it.quantity,
        unit_price: it.unit_price,
        notes: o.notes ?? '',
      }))
    })

    exportToCSV(exportData, 'sales-orders', [
      { key: 'order_number', header: 'Order Number' },
      { key: 'customer_name', header: 'Customer Name' },
      { key: 'customer_email', header: 'Customer Email' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'status', header: 'Status' },
      { key: 'sales_channel', header: 'Sales Channel' },
      { key: 'product_name', header: 'Product Name' },
      { key: 'sku', header: 'SKU' },
      { key: 'quantity', header: 'Quantity' },
      { key: 'unit_price', header: 'Unit Price' },
      { key: 'notes', header: 'Notes' },
    ])
    toast.success('Orders exported successfully')
  }

  // Download template CSV
  const downloadTemplate = () => {
    const templateData = [
      {
        order_number: 'ORD-TEST-001',
        customer_name: 'John Doe',
        customer_email: 'john.doe@example.com',
        order_date: '2026-06-03',
        status: 'pending',
        sales_channel: 'Shopify',
        sku: products?.[0]?.sku || 'SKU-001',
        quantity: '2',
        unit_price: '49.99',
        notes: 'Deliver after 5 PM'
      }
    ]
    exportToCSV(templateData, 'orders_import_template', [
      { key: 'order_number', header: 'Order Number' },
      { key: 'customer_name', header: 'Customer Name' },
      { key: 'customer_email', header: 'Customer Email' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'status', header: 'Status' },
      { key: 'sales_channel', header: 'Sales Channel' },
      { key: 'sku', header: 'SKU' },
      { key: 'quantity', header: 'Quantity' },
      { key: 'unit_price', header: 'Unit Price' },
      { key: 'notes', header: 'Notes' },
    ])
    toast.success('Import template downloaded')
  }

  // Form states for Add/Edit dialogs
  const [orderNumber, setOrderNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().split('T')[0] || '')
  const [status, setStatus] = useState<'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'>('pending')
  const [salesChannelId, setSalesChannelId] = useState('')
  const [notes, setNotes] = useState('')
  const [orderItemsList, setOrderItemsList] = useState<OrderItem[]>([{ product_id: '', quantity: 1, unit_price: 0 }])

  // Sync edit form fields when selectedOrder changes
  useEffect(() => {
    if (selectedOrder) {
      setOrderNumber(selectedOrder.order_number)
      setCustomerName(selectedOrder.customer_name)
      setCustomerEmail(selectedOrder.customer_email ?? '')
      setOrderDate(selectedOrder.order_date)
      setStatus(selectedOrder.status)
      setSalesChannelId(selectedOrder.sales_channel_id ?? '')
      setNotes(selectedOrder.notes ?? '')
      setOrderItemsList(
        selectedOrder.items && selectedOrder.items.length > 0
          ? selectedOrder.items.map(it => ({ ...it }))
          : [{ product_id: '', quantity: 1, unit_price: 0 }]
      )
    }
  }, [selectedOrder])

  const resetForm = () => {
    setOrderNumber('')
    setCustomerName('')
    setCustomerEmail('')
    setOrderDate(new Date().toISOString().split('T')[0] || '')
    setStatus('pending')
    setSalesChannelId('')
    setNotes('')
    setOrderItemsList([{ product_id: '', quantity: 1, unit_price: 0 }])
  }

  const handleAddLineItem = () => {
    setOrderItemsList([...orderItemsList, { product_id: '', quantity: 1, unit_price: 0 }])
  }

  const handleRemoveLineItem = (index: number) => {
    if (orderItemsList.length === 1) {
      setOrderItemsList([{ product_id: '', quantity: 1, unit_price: 0 }])
    } else {
      setOrderItemsList(orderItemsList.filter((_, i) => i !== index))
    }
  }

  const handleLineItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const updated = [...orderItemsList]
    updated[index] = { ...updated[index]!, [field]: value }
    
    // Auto-fill price from product channel_pricing if available (optional enhancement)
    if (field === 'product_id' && value) {
      // Find default unit price, or set to 0
      updated[index]!.unit_price = 0
    }
    setOrderItemsList(updated)
  }

  // Calculate order total dynamically
  const calculatedTotal = orderItemsList.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  const handleSubmitCreate = () => {
    if (!orderNumber.trim()) return toast.error('Order number is required')
    if (!customerName.trim()) return toast.error('Customer name is required')
    if (orderItemsList.some(item => !item.product_id)) return toast.error('All items must have a product selected')

    createOrder.mutate({
      order_number: orderNumber.trim(),
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      order_date: orderDate,
      status,
      total_amount: calculatedTotal,
      sales_channel_id: salesChannelId || null,
      notes: notes.trim() || null,
      items: orderItemsList
    })
  }

  const handleSubmitUpdate = () => {
    if (!selectedOrder) return
    if (!orderNumber.trim()) return toast.error('Order number is required')
    if (!customerName.trim()) return toast.error('Customer name is required')
    if (orderItemsList.some(item => !item.product_id)) return toast.error('All items must have a product selected')

    updateOrder.mutate({
      ...selectedOrder,
      order_number: orderNumber.trim(),
      customer_name: customerName.trim(),
      customer_email: customerEmail.trim() || null,
      order_date: orderDate,
      status,
      total_amount: calculatedTotal,
      sales_channel_id: salesChannelId || null,
      notes: notes.trim() || null,
      items: orderItemsList
    })
  }

  // Status Badge color decider
  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'delivered':
        return <Badge variant="success" className="capitalize">Delivered</Badge>
      case 'shipped':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-transparent capitalize">Shipped</Badge>
      case 'processing':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-transparent capitalize">Processing</Badge>
      case 'pending':
        return <Badge className="bg-orange-400 hover:bg-orange-500 text-white border-transparent capitalize">Pending</Badge>
      case 'cancelled':
        return <Badge variant="destructive" className="capitalize">Cancelled</Badge>
      default:
        return <Badge variant="secondary" className="capitalize">{status}</Badge>
    }
  }

  // Pagination helper
  const totalPages = Math.ceil(orders.length / PAGE_SIZE)
  const paginatedOrders = orders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Metrics calculation
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total_amount), 0)
  const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'processing').length
  const shippedDeliveredCount = orders.filter(o => o.status === 'shipped' || o.status === 'delivered').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Banner indicating local storage vs database */}
      {isLocalStorage && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-md">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Offline Sandbox Mode (Local Storage)</p>
              <p className="text-xs text-amber-500/80">
                Database table 'orders' was not found in Supabase. Apply migration <code className="bg-amber-500/25 px-1 py-0.5 rounded text-white font-mono">008_create_orders_table.sql</code> to use real-time database sync.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
              onClick={async () => {
                // Force check if table was created in database
                const { error } = await supabase.from('orders').select('id').limit(1)
                if (error) {
                  toast.error('Database table orders still missing. Run the migration first!')
                } else {
                  setIsLocalStorage(false)
                  localStorage.removeItem('tdw_use_local_orders')
                  toast.success('Successfully connected to Supabase orders table!')
                }
              }}
            >
              Verify DB Connection
            </Button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-8 w-8 text-primary" />
            Customer Orders
          </h1>
          <p className="text-muted-foreground">Manage and track customer sales orders, line items, and fulfillment channels</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Invisible file input for import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            className="hidden"
          />
          
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={importing}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            CSV Template
          </Button>

          <Button variant="outline" size="sm" onClick={handleCSVImportClick} disabled={importing}>
            <Upload className="h-4 w-4 mr-1.5" />
            {importing ? 'Importing...' : 'Import CSV'}
          </Button>

          <Button variant="outline" size="sm" onClick={handleExport} disabled={orders.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (open) resetForm() }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Customer Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orderNumber">Order Number *</Label>
                    <Input 
                      id="orderNumber" 
                      placeholder="e.g. ORD-2026-003" 
                      value={orderNumber} 
                      onChange={(e) => setOrderNumber(e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orderDate">Order Date *</Label>
                    <Input 
                      id="orderDate" 
                      type="date" 
                      value={orderDate} 
                      onChange={(e) => setOrderDate(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Customer Name *</Label>
                    <Input 
                      id="customerName" 
                      placeholder="Jane Doe" 
                      value={customerName} 
                      onChange={(e) => setCustomerName(e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerEmail">Customer Email</Label>
                    <Input 
                      id="customerEmail" 
                      type="email" 
                      placeholder="jane.doe@example.com" 
                      value={customerEmail} 
                      onChange={(e) => setCustomerEmail(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="salesChannel">Sales Channel</Label>
                    <Select value={salesChannelId} onValueChange={setSalesChannelId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {salesChannels?.map((chan) => (
                          <SelectItem key={chan.id} value={chan.id}>
                            {chan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Fulfillment Status</Label>
                    <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Line Items Section */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Order Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddLineItem}>
                      <Plus className="h-4 w-4 mr-1" /> Add Product
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {orderItemsList.map((item, idx) => (
                      <div key={idx} className="flex gap-3 items-end border p-3 rounded-lg relative bg-card">
                        <div className="flex-1 min-w-[200px]">
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Product *</Label>
                          <SearchableSelect
                            value={item.product_id}
                            placeholder="Search product..."
                            options={products?.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` })) || []}
                            onValueChange={(val) => handleLineItemChange(idx, 'product_id', val)}
                          />
                        </div>
                        <div className="w-24">
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Quantity</Label>
                          <Input 
                            type="number" 
                            min="1" 
                            value={item.quantity} 
                            onChange={(e) => handleLineItemChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)} 
                          />
                        </div>
                        <div className="w-32">
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Unit Price ($)</Label>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            value={item.unit_price} 
                            onChange={(e) => handleLineItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)} 
                          />
                        </div>
                        <div className="h-10 flex items-center justify-center">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:bg-destructive/10 h-10 w-10" 
                            onClick={() => handleRemoveLineItem(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-2 pr-2 text-right">
                    <span className="text-sm text-muted-foreground">Order Total:</span>
                    <span className="text-xl font-bold font-mono text-primary">${calculatedTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Order Notes</Label>
                  <Textarea 
                    id="notes" 
                    placeholder="Customer delivery notes, instructions..." 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)} 
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmitCreate} disabled={createOrder.isPending}>
                    {createOrder.isPending ? 'Saving...' : 'Save Order'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setSelectedOrder(null) }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Order Details</DialogTitle>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="editOrderNumber">Order Number *</Label>
                      <Input 
                        id="editOrderNumber" 
                        value={orderNumber} 
                        onChange={(e) => setOrderNumber(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editOrderDate">Order Date *</Label>
                      <Input 
                        id="editOrderDate" 
                        type="date" 
                        value={orderDate} 
                        onChange={(e) => setOrderDate(e.target.value)} 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="editCustomerName">Customer Name *</Label>
                      <Input 
                        id="editCustomerName" 
                        value={customerName} 
                        onChange={(e) => setCustomerName(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editCustomerEmail">Customer Email</Label>
                      <Input 
                        id="editCustomerEmail" 
                        type="email" 
                        value={customerEmail} 
                        onChange={(e) => setCustomerEmail(e.target.value)} 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="editSalesChannel">Sales Channel</Label>
                      <Select value={salesChannelId} onValueChange={setSalesChannelId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select channel" />
                        </SelectTrigger>
                        <SelectContent>
                          {salesChannels?.map((chan) => (
                            <SelectItem key={chan.id} value={chan.id}>
                              {chan.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editStatus">Fulfillment Status</Label>
                      <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="shipped">Shipped</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Line Items Section */}
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Order Items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddLineItem}>
                        <Plus className="h-4 w-4 mr-1" /> Add Product
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {orderItemsList.map((item, idx) => (
                        <div key={idx} className="flex gap-3 items-end border p-3 rounded-lg relative bg-card">
                          <div className="flex-1 min-w-[200px]">
                            <Label className="text-[11px] text-muted-foreground mb-1 block">Product *</Label>
                            <SearchableSelect
                              value={item.product_id}
                              placeholder="Search product..."
                              options={products?.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` })) || []}
                              onValueChange={(val) => handleLineItemChange(idx, 'product_id', val)}
                            />
                          </div>
                          <div className="w-24">
                            <Label className="text-[11px] text-muted-foreground mb-1 block">Quantity</Label>
                            <Input 
                              type="number" 
                              min="1" 
                              value={item.quantity} 
                              onChange={(e) => handleLineItemChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)} 
                            />
                          </div>
                          <div className="w-32">
                            <Label className="text-[11px] text-muted-foreground mb-1 block">Unit Price ($)</Label>
                            <Input 
                              type="number" 
                              step="0.01" 
                              value={item.unit_price} 
                              onChange={(e) => handleLineItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)} 
                            />
                          </div>
                          <div className="h-10 flex items-center justify-center">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive hover:bg-destructive/10 h-10 w-10" 
                              onClick={() => handleRemoveLineItem(idx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end items-center gap-2 pt-2 pr-2 text-right">
                      <span className="text-sm text-muted-foreground">Order Total:</span>
                      <span className="text-xl font-bold font-mono text-primary">${calculatedTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="editNotes">Order Notes</Label>
                    <Textarea 
                      id="editNotes" 
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)} 
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitUpdate} disabled={updateOrder.isPending}>
                      {updateOrder.isPending ? 'Saving...' : 'Update Order'}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border bg-card text-card-foreground rounded-lg p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Total Orders</p>
            <h3 className="text-2xl font-bold font-mono">{orders.length}</h3>
          </div>
          <div className="p-3 bg-primary/10 rounded-full text-primary">
            <ShoppingCart className="h-5 w-5" />
          </div>
        </div>

        <div className="border bg-card text-card-foreground rounded-lg p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Net Revenue</p>
            <h3 className="text-2xl font-bold font-mono text-emerald-500">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-500">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="border bg-card text-card-foreground rounded-lg p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Awaiting Dispatch</p>
            <h3 className="text-2xl font-bold font-mono text-orange-500">{pendingCount}</h3>
          </div>
          <div className="p-3 bg-orange-500/10 rounded-full text-orange-500">
            <Calendar className="h-5 w-5" />
          </div>
        </div>

        <div className="border bg-card text-card-foreground rounded-lg p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">Fulfillment Rate</p>
            <h3 className="text-2xl font-bold font-mono text-blue-500">
              {orders.length ? Math.round((shippedDeliveredCount / orders.length) * 100) : 0}%
            </h3>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-full text-blue-500">
            <Tag className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter and search controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search order #, customer, product..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        {/* Sales Channel Filter */}
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sales Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sales Channels</SelectItem>
            {salesChannels?.map(chan => (
              <SelectItem key={chan.id} value={chan.id}>{chan.name}</SelectItem>
            ))}
            {/* Direct channel name supports for local storage fallback */}
            {isLocalStorage && (
              <>
                <SelectItem value="Shopify">Shopify</SelectItem>
                <SelectItem value="Amazon">Amazon</SelectItem>
                <SelectItem value="Walmart">Walmart</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>

        {/* Date Ranges */}
        <div className="flex items-center gap-2">
          <Input 
            type="date" 
            value={dateFrom} 
            onChange={(e) => setDateFrom(e.target.value)} 
            className="w-[140px] text-xs h-9"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input 
            type="date" 
            value={dateTo} 
            onChange={(e) => setDateTo(e.target.value)} 
            className="w-[140px] text-xs h-9"
          />
          {(dateFrom || dateTo) && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Orders Count badge */}
        <span className="ml-auto text-xs text-muted-foreground">
          Showing {orders.length} order(s)
        </span>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Fetching orders data...</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[160px]">Order Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Sales Channel</TableHead>
                <TableHead>Products (Qty)</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Fulfillment Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-20 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <ShoppingCart className="h-10 w-10 text-muted-foreground/30 animate-pulse" />
                      <p className="font-semibold text-sm">No orders found</p>
                      <p className="text-xs text-muted-foreground/80 max-w-xs">
                        Try clearing search terms/filters or add a manual order to get started.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order) => {
                  const channelName = order.sales_channel?.name || order.sales_channel_name || 'Custom'
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-semibold text-primary">{order.order_number}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{order.customer_name}</span>
                          {order.customer_email && (
                            <span className="text-[11px] text-muted-foreground font-mono">{order.customer_email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-muted-foreground text-xs">
                        {order.order_date}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-semibold bg-primary/5 text-primary border-primary/20">
                          {channelName}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 max-w-[220px]">
                          {order.items && order.items.length > 0 ? (
                            order.items.map((item, idx) => (
                              <div key={idx} className="text-xs truncate flex items-center justify-between" title={item.product_name}>
                                <span className="truncate flex-1 text-muted-foreground">{item.product_name}</span>
                                <span className="font-semibold ml-2 text-foreground font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No products</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold font-mono text-sm text-foreground">
                        ${Number(order.total_amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-muted"
                            onClick={() => {
                              setSelectedOrder(order)
                              setEditDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(`Are you sure you want to permanently delete order "${order.order_number}"?`)) {
                                deleteOrder.mutate({ id: order.id, orderNumber: order.order_number })
                              }
                            }}
                            disabled={deleteOrder.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
