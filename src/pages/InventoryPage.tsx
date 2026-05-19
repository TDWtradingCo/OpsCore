import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRightLeft, TrendingUp, Search, Download } from 'lucide-react'
import { exportToCSV } from '@/lib/csv'
import { toast } from 'sonner'
import { logDashboardActivity } from '@/lib/audit'

export function InventoryPage() {
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all')
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)

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
        .select('*, product:products(id, name, sku), warehouse_location:warehouse_locations(id, name)')

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

  const [movementType, setMovementType] = useState<string>('all')
  const [moveDateFrom, setMoveDateFrom] = useState('')
  const [moveDateTo, setMoveDateTo] = useState('')

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
        product: inv.product,
        total: 0,
        locations: [],
      }
    }
    acc[productId].total += inv.quantity
    if (inv.quantity > 0) {
      acc[productId].locations.push({
        location: inv.warehouse_location,
        quantity: inv.quantity,
      })
    }
    return acc
  }, {})

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
            exportToCSV(inventory.map((inv: any) => ({
              product_name: inv.product?.name ?? '',
              sku: inv.product?.sku ?? '',
              warehouse: inv.warehouse_location?.name ?? '',
              quantity: inv.quantity,
            })), 'inventory', [
              { key: 'product_name', header: 'Product' },
              { key: 'sku', header: 'SKU' },
              { key: 'warehouse', header: 'Warehouse' },
              { key: 'quantity', header: 'Quantity' },
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
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Warehouse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouseLocations?.map((wh) => (
              <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                    <TableHead className="text-right">Total Qty</TableHead>
                    <TableHead>Locations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!inventorySummary || Object.keys(inventorySummary).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No inventory records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.values(inventorySummary).map((item: any) => (
                      <TableRow key={item.product.id}>
                        <TableCell className="font-medium">{item.product.name}</TableCell>
                        <TableCell className="font-mono text-sm">{item.product.sku}</TableCell>
                        <TableCell className="text-right font-bold">{item.total}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.locations.map((l: any) => `${l.location.name} (${l.quantity})`).join(', ')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : inventory?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No inventory records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventory?.filter((inv: any) => inv.quantity > 0).map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.product?.name}</TableCell>
                        <TableCell className="font-mono text-sm">{inv.product?.sku}</TableCell>
                        <TableCell>{inv.warehouse_location?.name}</TableCell>
                        <TableCell className="text-right font-mono">{inv.quantity}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                  {movements?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No movement history
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements?.map((mov: any) => (
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

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(quantity)
      if (qty <= 0) throw new Error('Quantity must be positive')
      if (!reason.trim()) throw new Error('Reason is required')

      // Check current inventory for decreases
      if (adjustmentType === 'decrease') {
        const { data: current } = await supabase
          .from('inventory')
          .select('quantity')
          .eq('product_id', productId)
          .eq('warehouse_location_id', locationId)
          .single()

        if (!current || current.quantity < qty) {
          throw new Error('Insufficient inventory for decrease')
        }
      }

      // Upsert inventory record
      const { data: existing } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_location_id', locationId)
        .single()

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
          user_id: user!.id,
        })
      if (movError) throw movError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-total'] })
      if (user) {
        void logDashboardActivity({
          entityType: 'inventory_adjustment',
          action: 'create',
          userId: user.id,
          description: `Applied inventory ${adjustmentType} adjustment`,
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
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger>
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
          <SelectContent>
            {products?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Location</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger>
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {locations?.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        disabled={!productId || !locationId || !quantity || !reason || adjustMutation.isPending}
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
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger>
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
          <SelectContent>
            {products?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>From Location</Label>
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger>
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            {locations?.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>To Location</Label>
        <Select value={destId} onValueChange={setDestId}>
          <SelectTrigger>
            <SelectValue placeholder="Select destination" />
          </SelectTrigger>
          <SelectContent>
            {locations?.filter((l) => l.id !== sourceId).map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  const [payload, setPayload] = useState('')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const lines = payload
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length === 0) throw new Error('Enter at least one row')

      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, sku')
      if (productsError) throw productsError

      const { data: locations, error: locationsError } = await supabase
        .from('warehouse_locations')
        .select('id, name')
      if (locationsError) throw locationsError

      const productBySku = new Map((products ?? []).map((p) => [p.sku.toLowerCase(), p.id]))
      const locationByName = new Map((locations ?? []).map((l) => [l.name.toLowerCase(), l.id]))

      let updated = 0
      for (const line of lines) {
        const [rawSku, rawLocation, rawQty] = line.split(',').map((part) => part?.trim())
        if (!rawSku || !rawLocation || !rawQty) continue

        const productId = productBySku.get(rawSku.toLowerCase())
        const locationId = locationByName.get(rawLocation.toLowerCase())
        const quantity = Number(rawQty)

        if (!productId || !locationId || !Number.isFinite(quantity) || quantity < 0) continue

        const { data: existing } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', productId)
          .eq('warehouse_location_id', locationId)
          .single()

        if (existing) {
          const { error } = await supabase.from('inventory').update({ quantity }).eq('id', existing.id)
          if (!error) updated++
          continue
        }

        const { error } = await supabase
          .from('inventory')
          .insert({ product_id: productId, warehouse_location_id: locationId, quantity })
        if (!error) updated++
      }

      return { updated }
    },
    onSuccess: async ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      if (user) {
        await logDashboardActivity({
          entityType: 'inventory',
          action: 'update',
          userId: user.id,
          description: `Bulk updated inventory rows: ${updated}`,
          metadata: { rows_updated: updated },
        })
      }
      toast.success(`Bulk update complete (${updated} row${updated === 1 ? '' : 's'})`)
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter one row per line in this format: <span className="font-mono">SKU,Warehouse Name,Quantity</span>
      </p>
      <Textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder="SKU-001,WFS CA,25"
        className="h-36"
      />
      <Button className="w-full" onClick={() => bulkUpdate.mutate()} disabled={bulkUpdate.isPending}>
        {bulkUpdate.isPending ? 'Updating...' : 'Run Bulk Update'}
      </Button>
    </div>
  )
}
