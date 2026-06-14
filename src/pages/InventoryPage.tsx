import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ArrowRightLeft, TrendingUp, Search, Download } from 'lucide-react'
import { exportToCSV } from '@/lib/csv'
import { toast } from 'sonner'
import { logDashboardActivity } from '@/lib/audit'

async function getProductInventoryTotals(productId: string) {
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from('inventory')
    .select('quantity')
    .eq('product_id', productId)
  if (inventoryError) throw inventoryError

  const { data: lineItems, error: lineItemsError } = await supabase
    .from('purchase_line_items')
    .select('id')
    .eq('product_id', productId)
  if (lineItemsError) throw lineItemsError

  let totalReceived = 0
  if (lineItems && lineItems.length > 0) {
    const { data: allocations, error: allocationsError } = await supabase
      .from('purchase_allocations')
      .select('quantity')
      .in('purchase_line_item_id', lineItems.map((lineItem) => lineItem.id))
    if (allocationsError) throw allocationsError

    totalReceived = allocations?.reduce((sum, allocation) => sum + allocation.quantity, 0) ?? 0
  }

  return {
    currentStock: inventoryRows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0,
    totalReceived,
  }
}

export function InventoryPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all')
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [summaryPage, setSummaryPage] = useState(1)
  const [locationPage, setLocationPage] = useState(1)
  const [movementsPage, setMovementsPage] = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => { setSummaryPage(1); setLocationPage(1) }, [search, warehouseFilter])

  const { data: warehouseLocations } = useQuery({
    queryKey: ['warehouse-locations-filter'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouse_locations').select('id, name').eq('status', 'active').order('name')
      return data ?? []
    },
  })

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory', search, warehouseFilter],
    queryFn: async () => {
      let query = supabase
        .from('inventory')
        .select(`
          *,
          product:products(id, name, sku, product_code),
          warehouse_location:warehouse_locations(id, name)
        `)

      if (warehouseFilter !== 'all') {
        query = query.eq('warehouse_location_id', warehouseFilter)
      }

      const { data, error } = await query
      if (error) throw error

      if (search) {
        return data.filter(
          (inv: any) =>
            inv.product?.name.toLowerCase().includes(search.toLowerCase()) ||
            inv.product?.sku.toLowerCase().includes(search.toLowerCase()) ||
            inv.warehouse_location?.name.toLowerCase().includes(search.toLowerCase())
        )
      }

      return data
    },
  })

  // Query to get tax information for each inventory item
  const { data: inventoryTaxMap } = useQuery({
    queryKey: ['inventory-tax-info'],
    queryFn: async () => {
      const { data: allocations, error } = await supabase
        .from('purchase_allocations')
        .select(`
          warehouse_location_id,
          purchase_line_item:purchase_line_items(
            product_id,
            tax_amount
          )
        `)

      if (error) throw error

      // Map: {inventory_id or product_warehouse_combo} -> total_tax
      const taxMap: Record<string, number> = {}
      
      allocations?.forEach((alloc: any) => {
        const key = `${alloc.purchase_line_item.product_id}-${alloc.warehouse_location_id}`
        if (!taxMap[key]) {
          taxMap[key] = 0
        }
        taxMap[key] += alloc.purchase_line_item.tax_amount
      })

      return taxMap
    },
  })

  const [movementType, setMovementType] = useState<string>('all')
  const [moveDateFrom, setMoveDateFrom] = useState('')
  const [moveDateTo, setMoveDateTo] = useState('')

  useEffect(() => { setMovementsPage(1) }, [movementType, moveDateFrom, moveDateTo])

  const { data: movements } = useQuery({
    queryKey: ['inventory-movements', movementType, moveDateFrom, moveDateTo],
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select('*, product:products(name, sku), source_location:warehouse_locations!inventory_movements_source_location_id_fkey(name), destination_location:warehouse_locations!inventory_movements_destination_location_id_fkey(name)')

      if (movementType !== 'all') {
        query = query.eq('movement_type', movementType)
      }
      if (moveDateFrom) {
        query = query.gte('created_at', moveDateFrom)
      }
      if (moveDateTo) {
        query = query.lte('created_at', moveDateTo + 'T23:59:59')
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data
    },
  })

  // Group inventory by product for summary view
  const inventorySummary = inventory?.reduce((acc: Record<string, any>, inv: any) => {
    const productId = inv.product?.id
    if (!productId) return acc
    if (!acc[productId]) {
      acc[productId] = {
        productId: productId,
        product: inv.product,
        total: 0,
        locations: [],
        totalTax: 0,
      }
    }
    acc[productId].total += inv.quantity
    const taxKey = `${inv.product_id}-${inv.warehouse_location_id}`
    const invTax = inventoryTaxMap?.[taxKey] ?? 0
    acc[productId].totalTax += invTax
    if (inv.quantity > 0) {
      acc[productId].locations.push({
        location: inv.warehouse_location,
        quantity: inv.quantity,
        tax: invTax,
      })
    }
    return acc
  }, {})

  const summaryItems = Object.values(inventorySummary ?? {})
  const totalSummaryPages = Math.ceil(summaryItems.length / PAGE_SIZE)
  const pagedSummary = summaryItems.slice((summaryPage - 1) * PAGE_SIZE, summaryPage * PAGE_SIZE)

  const locationItems = inventory?.filter((inv: any) => inv.quantity > 0) ?? []
  const totalLocationPages = Math.ceil(locationItems.length / PAGE_SIZE)
  const pagedLocation = locationItems.slice((locationPage - 1) * PAGE_SIZE, locationPage * PAGE_SIZE)

  const totalMovementsPages = Math.ceil((movements?.length ?? 0) / PAGE_SIZE)
  const pagedMovements = movements?.slice((movementsPage - 1) * PAGE_SIZE, movementsPage * PAGE_SIZE)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Track inventory across warehouse locations</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            if (!inventory?.length) return
            exportToCSV(inventory.map((inv: any) => {
              const taxKey = `${inv.product_id}-${inv.warehouse_location_id}`
              const taxAmount = inventoryTaxMap?.[taxKey] ?? 0
              return {
                product_name: inv.product?.name ?? '',
                sku: inv.product?.sku ?? '',
                warehouse: inv.warehouse_location?.name ?? '',
                quantity: inv.quantity,
                tax_paid: taxAmount,
              }
            }), 'inventory', [
              { key: 'product_name', header: 'Product' },
              { key: 'sku', header: 'SKU' },
              { key: 'warehouse', header: 'Warehouse' },
              { key: 'quantity', header: 'Quantity' },
              { key: 'tax_paid', header: 'Tax Paid' },
            ])
            toast.success('Inventory exported')
          }} disabled={!inventory?.length}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <TrendingUp className="h-4 w-4 mr-2" />
                Adjust
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inventory Adjustment</DialogTitle>
              </DialogHeader>
              <AdjustmentForm onSuccess={() => setAdjustDialogOpen(false)} />
            </DialogContent>
          </Dialog>

          <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inventory Transfer</DialogTitle>
              </DialogHeader>
              <TransferForm onSuccess={() => setTransferDialogOpen(false)} />
            </DialogContent>
          </Dialog>
          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Bulk Update</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bulk Inventory Update</DialogTitle>
              </DialogHeader>
              <BulkInventoryUpdateForm onSuccess={() => setBulkDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <SearchableSelect
            value={warehouseFilter}
            onValueChange={setWarehouseFilter}
            placeholder="Search warehouses..."
            options={[
              { value: 'all', label: 'All Warehouses' },
              ...(warehouseLocations?.map(wh => ({ value: wh.id, label: wh.name })) ?? [])
            ]}
          />
        </div>
        <span className="text-sm text-muted-foreground">{inventory?.length ?? 0} records</span>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="by-location">By Location</TabsTrigger>
          <TabsTrigger value="movements">Movement History</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Available Quantity</TableHead>
                    <TableHead>Locations</TableHead>
                    <TableHead className="text-right">Tax Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedSummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No inventory records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedSummary.map((item: any) => (
                      <TableRow key={item.product.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell
                          className="font-medium text-primary hover:underline"
                          onClick={() => navigate(`/inventory/${item.productId}`)}
                        >
                          {item.product.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.product.sku}</TableCell>
                        <TableCell className="text-right font-bold">{item.total}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.locations.map((l: any) => `${l.location.name} (${l.quantity})`).join(', ')}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">${item.totalTax.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalSummaryPages > 1 && (
                <div className="flex items-center justify-between px-2 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {(summaryPage - 1) * PAGE_SIZE + 1}–{Math.min(summaryPage * PAGE_SIZE, summaryItems.length)} of {summaryItems.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSummaryPage(p => Math.max(1, p - 1))} disabled={summaryPage === 1}>Previous</Button>
                    <span className="text-sm">{summaryPage} / {totalSummaryPages}</span>
                    <Button size="sm" variant="outline" onClick={() => setSummaryPage(p => Math.min(totalSummaryPages, p + 1))} disabled={summaryPage === totalSummaryPages}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-location">
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Tax Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : locationItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No inventory records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedLocation.map((inv: any) => {
                      const taxKey = `${inv.product_id}-${inv.warehouse_location_id}`
                      const taxAmount = inventoryTaxMap?.[taxKey] ?? 0
                      return (
                        <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell
                            className="font-medium text-primary hover:underline"
                            onClick={() => navigate(`/inventory/${inv.product_id}`)}
                          >
                            {inv.product?.name}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{inv.product?.sku}</TableCell>
                          <TableCell className="font-mono text-xs">{inv.product?.product_code ?? inv.product?.id.slice(0, 8)}</TableCell>
                          <TableCell>{inv.warehouse_location?.name}</TableCell>
                          <TableCell className="text-right font-mono">{inv.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">${taxAmount.toFixed(2)}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              {totalLocationPages > 1 && (
                <div className="flex items-center justify-between px-2 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {(locationPage - 1) * PAGE_SIZE + 1}–{Math.min(locationPage * PAGE_SIZE, locationItems.length)} of {locationItems.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLocationPage(p => Math.max(1, p - 1))} disabled={locationPage === 1}>Previous</Button>
                    <span className="text-sm">{locationPage} / {totalLocationPages}</span>
                    <Button size="sm" variant="outline" onClick={() => setLocationPage(p => Math.min(totalLocationPages, p + 1))} disabled={locationPage === totalLocationPages}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={movementType} onValueChange={setMovementType}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="adjustment_in">Adjustment In</SelectItem>
                    <SelectItem value="adjustment_out">Adjustment Out</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="sale">Sale</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={moveDateFrom} onChange={(e) => setMoveDateFrom(e.target.value)} className="w-full sm:w-[160px]" placeholder="From" />
                <Input type="date" value={moveDateTo} onChange={(e) => setMoveDateTo(e.target.value)} className="w-full sm:w-[160px]" placeholder="To" />
                <span className="text-sm text-muted-foreground">{movements?.length ?? 0} movements</span>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
                  if (!movements?.length) return
                  exportToCSV(movements.map((m: any) => ({
                    date: new Date(m.created_at).toLocaleString(),
                    product: m.product?.name ?? '',
                    type: m.movement_type,
                    from: m.source_location?.name ?? '',
                    to: m.destination_location?.name ?? '',
                    quantity: m.quantity,
                    reason: m.reason ?? '',
                  })), 'inventory-movements', [
                    { key: 'date', header: 'Date' },
                    { key: 'product', header: 'Product' },
                    { key: 'type', header: 'Type' },
                    { key: 'from', header: 'From' },
                    { key: 'to', header: 'To' },
                    { key: 'quantity', header: 'Quantity' },
                    { key: 'reason', header: 'Reason' },
                  ])
                  toast.success('Movements exported')
                }} disabled={!movements?.length}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedMovements?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No movement history
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedMovements?.map((mov: any) => (
                      <TableRow key={mov.id}>
                        <TableCell className="text-sm">
                          {new Date(mov.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">{mov.product?.name}</TableCell>
                        <TableCell className="capitalize text-sm">
                          {mov.movement_type.replace('_', ' ')}
                        </TableCell>
                        <TableCell>{mov.source_location?.name ?? '—'}</TableCell>
                        <TableCell>{mov.destination_location?.name ?? '—'}</TableCell>
                        <TableCell className="text-right font-mono">{mov.quantity}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{mov.reason ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              {totalMovementsPages > 1 && (
                <div className="flex items-center justify-between px-2 py-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {(movementsPage - 1) * PAGE_SIZE + 1}–{Math.min(movementsPage * PAGE_SIZE, movements!.length)} of {movements!.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setMovementsPage(p => Math.max(1, p - 1))} disabled={movementsPage === 1}>Previous</Button>
                    <span className="text-sm">{movementsPage} / {totalMovementsPages}</span>
                    <Button size="sm" variant="outline" onClick={() => setMovementsPage(p => Math.min(totalMovementsPages, p + 1))} disabled={movementsPage === totalMovementsPages}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AdjustmentForm({ onSuccess }: { onSuccess: () => void }) {
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [adjustmentSource, setAdjustmentSource] = useState<'manual' | 'purchase'>('manual')
  const [purchaseAllocationId, setPurchaseAllocationId] = useState('')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku').eq('status', 'active')
      return data ?? []
    },
  })

  const { data: locations } = useQuery({
    queryKey: ['warehouse-locations'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouse_locations').select('id, name').eq('status', 'active')
      return data ?? []
    },
  })

  // Query purchases that contributed to this product/location
  const { data: purchaseAllocations } = useQuery({
    queryKey: ['purchase-allocations-for-adjustment', productId, locationId],
    enabled: !!productId && !!locationId && adjustmentType === 'decrease',
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_allocations')
        .select(`
          id,
          quantity,
          warehouse_location:warehouse_locations(name),
          purchase_line_item:purchase_line_items(
            id,
            quantity,
            unit_cost,
            tax_amount,
            purchase:purchases(
              id,
              invoice_number,
              invoice_date,
              supplier:suppliers(name)
            )
          )
        `)
        .eq('warehouse_location_id', locationId)

      // Filter to this product
      return (data ?? []).filter(
        (alloc: any) => alloc.purchase_line_item?.product_id === productId
      )
    },
  })

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(quantity, 10)
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be positive')
      if (!reason.trim()) throw new Error('Reason is required')

      const { data: existing, error: existingError } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_location_id', locationId)
        .maybeSingle()
      if (existingError) throw existingError

      if (adjustmentType === 'decrease' && (!existing || existing.quantity < qty)) {
        throw new Error('Insufficient inventory for decrease')
      }

      if (adjustmentType === 'increase') {
        const { currentStock, totalReceived } = await getProductInventoryTotals(productId)
        const availableToIncrease = Math.max(totalReceived - currentStock, 0)

        if (currentStock + qty > totalReceived) {
          throw new Error(`Inventory in stock cannot be more than inventory received. You can increase by at most ${availableToIncrease} unit${availableToIncrease === 1 ? '' : 's'}.`)
        }
      }

      const newQty = adjustmentType === 'increase'
        ? (existing?.quantity ?? 0) + qty
        : (existing?.quantity ?? 0) - qty

      if (existing) {
        const { error } = await supabase
          .from('inventory')
          .update({ quantity: newQty })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert({ product_id: productId, warehouse_location_id: locationId, quantity: newQty })
        if (error) throw error
      }

      // Create movement record
      const { error: movError } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: productId,
          source_location_id: adjustmentType === 'decrease' ? locationId : null,
          destination_location_id: adjustmentType === 'increase' ? locationId : null,
          quantity: qty,
          movement_type: adjustmentType === 'increase' ? 'adjustment_increase' : 'adjustment_decrease',
          reason,
          reference_id: adjustmentSource === 'purchase' ? purchaseAllocationId : null,
          reference_type: adjustmentSource === 'purchase' ? 'purchase_allocation' : null,
          user_id: user!.id,
        })
      if (movError) throw movError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-total'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-tax-info'] })
      if (user) {
        void logDashboardActivity({
          entityType: 'inventory_adjustment',
          action: 'create',
          userId: user.id,
          description: `Applied inventory ${adjustmentType} adjustment of ${quantity} units (via ${adjustmentSource === 'purchase' ? 'purchase' : 'manual'})`,
          metadata: {
            adjustment_type: adjustmentType,
            adjustment_source: adjustmentSource,
            quantity: parseInt(quantity),
            reason,
            purchase_allocation_id: adjustmentSource === 'purchase' ? purchaseAllocationId : null,
          },
        })
      }
      toast.success('Inventory adjusted successfully')
      onSuccess()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Product</Label>
        <SearchableSelect
          value={productId}
          onValueChange={setProductId}
          placeholder="Search products..."
          options={products?.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` })) ?? []}
        />
      </div>

      <div className="space-y-2">
        <Label>Location</Label>
        <SearchableSelect
          value={locationId}
          onValueChange={setLocationId}
          placeholder="Search locations..."
          options={locations?.map(l => ({ value: l.id, label: l.name })) ?? []}
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as 'increase' | 'decrease')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="increase">Increase</SelectItem>
            <SelectItem value="decrease">Decrease</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {adjustmentType === 'decrease' && purchaseAllocations && purchaseAllocations.length > 0 && (
        <div className="space-y-2 bg-muted/30 p-3 rounded border">
          <Label>Adjustment Source</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="manual"
                value="manual"
                checked={adjustmentSource === 'manual'}
                onChange={(e) => {
                  setAdjustmentSource(e.target.value as 'manual' | 'purchase')
                  setPurchaseAllocationId('')
                }}
              />
              <label htmlFor="manual" className="cursor-pointer text-sm">
                Manual Adjustment
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="purchase"
                value="purchase"
                checked={adjustmentSource === 'purchase'}
                onChange={(e) => setAdjustmentSource(e.target.value as 'manual' | 'purchase')}
              />
              <label htmlFor="purchase" className="cursor-pointer text-sm">
                From Purchase
              </label>
            </div>
          </div>

          {adjustmentSource === 'purchase' && (
            <div className="space-y-2 mt-2">
              <Label className="text-xs">Select Purchase</Label>
              <Select value={purchaseAllocationId} onValueChange={setPurchaseAllocationId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select purchase to adjust from..." />
                </SelectTrigger>
                <SelectContent>
                  {purchaseAllocations?.map((alloc: any) => (
                    <SelectItem key={alloc.id} value={alloc.id}>
                      {alloc.purchase_line_item?.purchase?.invoice_number} - {alloc.purchase_line_item?.purchase?.supplier?.name} ({alloc.quantity} units)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Quantity</Label>
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Enter quantity"
          onFocus={(e) => e.target.select()}
        />
      </div>

      <div className="space-y-2">
        <Label>Reason *</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter reason for adjustment"
        />
      </div>

      <Button
        className="w-full"
        onClick={() => adjustMutation.mutate()}
        disabled={!productId || !locationId || !quantity || !reason || adjustMutation.isPending || (adjustmentSource === 'purchase' && !purchaseAllocationId)}
      >
        {adjustMutation.isPending ? 'Processing...' : 'Submit Adjustment'}
      </Button>
    </div>
  )
}

function TransferForm({ onSuccess }: { onSuccess: () => void }) {
  const [productId, setProductId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [destId, setDestId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku').eq('status', 'active')
      return data ?? []
    },
  })

  const { data: locations } = useQuery({
    queryKey: ['warehouse-locations'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouse_locations').select('id, name').eq('status', 'active')
      return data ?? []
    },
  })

  const transferMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(quantity)
      if (qty <= 0) throw new Error('Quantity must be positive')
      if (sourceId === destId) throw new Error('Source and destination must be different')

      // Check source inventory
      const { data: sourceInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_location_id', sourceId)
        .single()

      if (!sourceInv || sourceInv.quantity < qty) {
        throw new Error('Insufficient inventory at source location')
      }

      // Decrease source
      const { error: decErr } = await supabase
        .from('inventory')
        .update({ quantity: sourceInv.quantity - qty })
        .eq('id', sourceInv.id)
      if (decErr) throw decErr

      // Increase destination (upsert)
      const { data: destInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_location_id', destId)
        .single()

      if (destInv) {
        const { error } = await supabase
          .from('inventory')
          .update({ quantity: destInv.quantity + qty })
          .eq('id', destInv.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert({ product_id: productId, warehouse_location_id: destId, quantity: qty })
        if (error) throw error
      }

      // Movement record
      const { error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
          product_id: productId,
          source_location_id: sourceId,
          destination_location_id: destId,
          quantity: qty,
          movement_type: 'transfer',
          reason: reason || 'Transfer',
          user_id: user!.id,
        })
      if (movErr) throw movErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      if (user) {
        void logDashboardActivity({
          entityType: 'inventory_transfer',
          action: 'create',
          userId: user.id,
          description: 'Completed inventory transfer',
        })
      }
      toast.success('Transfer completed successfully')
      onSuccess()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Product</Label>
        <SearchableSelect
          value={productId}
          onValueChange={setProductId}
          placeholder="Search products..."
          options={products?.map(p => ({ value: p.id, label: `${p.name} (${p.sku})` })) ?? []}
        />
      </div>

      <div className="space-y-2">
        <Label>From Location</Label>
        <SearchableSelect
          value={sourceId}
          onValueChange={setSourceId}
          placeholder="Search locations..."
          options={locations?.map(l => ({ value: l.id, label: l.name })) ?? []}
        />
      </div>

      <div className="space-y-2">
        <Label>To Location</Label>
        <SearchableSelect
          value={destId}
          onValueChange={setDestId}
          placeholder="Search locations..."
          options={locations?.filter((l) => l.id !== sourceId).map(l => ({ value: l.id, label: l.name })) ?? []}
        />
        {sourceId && destId && sourceId === destId && (
          <p className="text-sm text-destructive">Source and destination must be different</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Quantity</Label>
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Enter quantity"
          onFocus={(e) => e.target.select()}
        />
      </div>

      <div className="space-y-2">
        <Label>Reason</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional reason"
        />
      </div>

      <Button
        className="w-full"
        onClick={() => transferMutation.mutate()}
        disabled={!productId || !sourceId || !destId || !quantity || sourceId === destId || transferMutation.isPending}
      >
        {transferMutation.isPending ? 'Processing...' : 'Complete Transfer'}
      </Button>
    </div>
  )
}

function BulkInventoryUpdateForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const downloadTemplate = async () => {
    const { data: products } = await supabase.from('products').select('id, sku, product_code, name').eq('status', 'active')
    
    const templateData = (products ?? []).slice(0, 5).map((p) => ({
      product_id: p.product_code ?? p.sku,
      product_name: p.name,
      warehouse_name: 'WFS CA',
      quantity: '100',
    }))

    exportToCSV(templateData, 'inventory-bulk-update', [
      { key: 'product_id', header: 'Product ID' },
      { key: 'product_name', header: 'Product Name' },
      { key: 'warehouse_name', header: 'Warehouse Name' },
      { key: 'quantity', header: 'Quantity' },
    ])
    toast.success('Template downloaded - fill it out and upload the CSV')
  }

  const bulkUpdate = useMutation({
    mutationFn: async (file: File) => {
      if (!file) throw new Error('No file selected')
      
      const text = await file.text()
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
      
      if (lines.length < 2) throw new Error('CSV must have header row and at least one data row')

      // Parse header to find column indices
      const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase())
      const productIdIdx = headers.findIndex((h) => h.includes('product') && h.includes('id'))
      const warehouseIdx = headers.findIndex((h) => h.includes('warehouse'))
      const quantityIdx = headers.findIndex((h) => h.includes('quantity'))

      if (productIdIdx === -1 || warehouseIdx === -1 || quantityIdx === -1) {
        throw new Error('CSV must have Product ID, Warehouse Name, and Quantity columns')
      }

      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, sku, product_code')
      if (productsError) throw productsError

      const { data: locations, error: locationsError } = await supabase
        .from('warehouse_locations')
        .select('id, name')
      if (locationsError) throw locationsError

      const productByCode = new Map((products ?? []).map((p) => [p.product_code?.toLowerCase() ?? '', p.id]))
      const productBySku = new Map((products ?? []).map((p) => [p.sku.toLowerCase(), p.id]))
      const locationByName = new Map((locations ?? []).map((l) => [l.name.toLowerCase(), l.id]))

      let updated = 0
      let skipped = 0
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!
        const cols = line.split(',').map((c) => c.trim())
        
        const rawProductId = cols[productIdIdx]?.trim()
        const rawLocation = cols[warehouseIdx]?.trim()
        const rawQty = cols[quantityIdx]?.trim()

        if (!rawProductId || !rawLocation || !rawQty) {
          skipped++
          continue
        }

        let productId = productByCode.get(rawProductId.toLowerCase())
        if (!productId) productId = productBySku.get(rawProductId.toLowerCase())
        const locationId = locationByName.get(rawLocation.toLowerCase())
        const quantity = Number(rawQty)

        if (!productId || !locationId || !Number.isFinite(quantity) || quantity < 0) {
          skipped++
          continue
        }

        const { data: existing } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', productId)
          .eq('warehouse_location_id', locationId)
          .single()

        if (existing) {
          const { error } = await supabase.from('inventory').update({ quantity }).eq('id', existing.id)
          if (!error) updated++
          else skipped++
          continue
        }

        const { error } = await supabase
          .from('inventory')
          .insert({ product_id: productId, warehouse_location_id: locationId, quantity })
        if (!error) updated++
        else skipped++
      }

      return { updated, skipped }
    },
    onSuccess: async ({ updated, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      if (user) {
        await logDashboardActivity({
          entityType: 'inventory',
          action: 'bulk_update',
          userId: user.id,
          description: `Bulk inventory update: ${updated} rows updated${skipped > 0 ? `, ${skipped} skipped` : ''}`,
          metadata: { rows_updated: updated, rows_skipped: skipped },
        })
      }
      setSelectedFile(null)
      toast.success(`Bulk update complete - ${updated} row${updated === 1 ? '' : 's'} updated${skipped > 0 ? `, ${skipped} skipped` : ''}`)
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Upload a CSV file to bulk update inventory quantities. The CSV should include columns for Product ID (PRD code or SKU), Warehouse Name, and Quantity.
        </p>
        <Button size="sm" variant="outline" onClick={downloadTemplate} className="mb-4">
          Download Template
        </Button>
      </div>
      
      <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            if (file) setSelectedFile(file)
          }}
        />
        <p className="text-sm text-muted-foreground">
          {selectedFile ? (
            <span className="font-medium text-foreground">{selectedFile.name}</span>
          ) : (
            <>
              <button
                className="text-primary hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                Click to upload
              </button>
              {' '}or drag and drop CSV file
            </>
          )}
        </p>
        {selectedFile && (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedFile(null)}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (selectedFile) bulkUpdate.mutate(selectedFile)
              }}
              disabled={bulkUpdate.isPending || !selectedFile}
            >
              {bulkUpdate.isPending ? 'Uploading...' : 'Upload & Update'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
