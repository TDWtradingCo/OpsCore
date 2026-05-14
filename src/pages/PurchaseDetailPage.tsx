import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [costDialogOpen, setCostDialogOpen] = useState(false)

  const { data: purchase, isLoading } = useQuery({
    queryKey: ['purchase', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, supplier:suppliers(name)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: lineItems } = useQuery({
    queryKey: ['purchase-line-items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_line_items')
        .select('*, product:products(name, sku)')
        .eq('purchase_id', id!)
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: additionalCosts } = useQuery({
    queryKey: ['purchase-additional-costs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_additional_costs')
        .select('*')
        .eq('purchase_id', id!)
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: allocations } = useQuery({
    queryKey: ['purchase-allocations', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_allocations')
        .select('*, warehouse_location:warehouse_locations(name), purchase_line_item:purchase_line_items(product_id)')
        .in('purchase_line_item_id', lineItems?.map((li) => li.id) ?? [])
      if (error) throw error
      return data
    },
    enabled: !!lineItems && lineItems.length > 0,
  })

  const completePurchase = useMutation({
    mutationFn: async () => {
      if (!lineItems || lineItems.length === 0) {
        throw new Error('Purchase must have at least one line item')
      }

      // Calculate landed costs
      const totalLineValue = lineItems.reduce((sum, li) => sum + li.unit_cost * li.quantity, 0)
      const totalAdditionalCosts = additionalCosts?.reduce((sum, c) => sum + c.amount, 0) ?? 0

      // Update each line item with landed cost
      for (const li of lineItems) {
        const lineValue = li.unit_cost * li.quantity
        const proportion = totalLineValue > 0 ? lineValue / totalLineValue : 0
        const allocatedCosts = totalAdditionalCosts * proportion
        const lineNonRecTax = li.tax_recoverability === 'non_recoverable' ? li.tax_amount : 0
        const landedUnitCost = (li.unit_cost * li.quantity + allocatedCosts + lineNonRecTax) / li.quantity

        await supabase
          .from('purchase_line_items')
          .update({ landed_unit_cost: landedUnitCost })
          .eq('id', li.id)

        // Create inventory movements for allocations
        const lineAllocations = allocations?.filter((a: any) => a.purchase_line_item_id === li.id) ?? []

        if (lineAllocations.length === 0) {
          throw new Error(`Line item for ${(li as any).product?.name} has no warehouse allocations`)
        }

        for (const alloc of lineAllocations) {
          // Upsert inventory
          const { data: existing } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', li.product_id)
            .eq('warehouse_location_id', alloc.warehouse_location_id)
            .single()

          if (existing) {
            await supabase
              .from('inventory')
              .update({ quantity: existing.quantity + alloc.quantity })
              .eq('id', existing.id)
          } else {
            await supabase
              .from('inventory')
              .insert({
                product_id: li.product_id,
                warehouse_location_id: alloc.warehouse_location_id,
                quantity: alloc.quantity,
              })
          }

          // Movement record
          await supabase
            .from('inventory_movements')
            .insert({
              product_id: li.product_id,
              destination_location_id: alloc.warehouse_location_id,
              quantity: alloc.quantity,
              movement_type: 'purchase_allocation',
              reference_id: id,
              reference_type: 'purchase',
              user_id: user!.id,
              reason: `Purchase ${purchase?.invoice_number}`,
            })
        }
      }

      // Mark purchase as completed
      const { error } = await supabase
        .from('purchases')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-line-items', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      toast.success('Purchase completed. Inventory updated and landed costs calculated.')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!purchase) return <div>Purchase not found</div>

  const isDraft = purchase.status === 'draft'
  const subtotal = lineItems?.reduce((sum, li) => sum + li.unit_cost * li.quantity, 0) ?? 0
  const totalTax = lineItems?.reduce((sum, li) => sum + li.tax_amount, 0) ?? 0
  const totalAdditional = additionalCosts?.reduce((sum, c) => sum + c.amount, 0) ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/purchases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">Invoice #{purchase.invoice_number}</h1>
          <p className="text-muted-foreground text-sm">
            {(purchase as any).supplier?.name} &bull; {new Date(purchase.invoice_date).toLocaleDateString()}
          </p>
        </div>
        <Badge variant={purchase.status === 'completed' ? 'success' : 'secondary'}>
          {purchase.status}
        </Badge>
        {isDraft && (
          <Button size="sm" onClick={() => completePurchase.mutate()} disabled={completePurchase.isPending}>
            <CheckCircle className="h-4 w-4 mr-2" />
            {completePurchase.isPending ? 'Processing...' : 'Complete Purchase'}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Subtotal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(subtotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tax</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalTax)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Additional Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAdditional)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(subtotal + totalTax + totalAdditional)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          {isDraft && (
            <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Line Item</DialogTitle>
                </DialogHeader>
                <AddLineItemForm purchaseId={id!} onSuccess={() => setLineDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead>Tax Type</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
                <TableHead className="text-right">Landed Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No line items. Add products to this purchase.
                  </TableCell>
                </TableRow>
              ) : (
                lineItems?.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.product?.name}</div>
                      <div className="text-sm text-muted-foreground font-mono">{item.product?.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.tax_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={item.tax_recoverability === 'recoverable' ? 'outline' : 'destructive'}>
                        {item.tax_recoverability === 'recoverable' ? 'Recoverable' : 'Non-Recoverable'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.unit_cost * item.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.landed_unit_cost ? formatCurrency(item.landed_unit_cost) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Additional Costs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Additional Costs</CardTitle>
          {isDraft && (
            <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> Add Cost
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Additional Cost</DialogTitle>
                </DialogHeader>
                <AddCostForm purchaseId={id!} onSuccess={() => setCostDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {additionalCosts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No additional costs
                  </TableCell>
                </TableRow>
              ) : (
                additionalCosts?.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell className="capitalize">{cost.cost_type.replace('_', ' ')}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(cost.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{cost.notes ?? '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Allocations */}
      {isDraft && lineItems && lineItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            {lineItems.map((li: any) => (
              <AllocationSection key={li.id} lineItem={li} purchaseId={id!} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AddLineItemForm({ purchaseId, onSuccess }: { purchaseId: string; onSuccess: () => void }) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [taxPercent, setTaxPercent] = useState('0')
  const [taxAmount, setTaxAmount] = useState('0')
  const [taxRecoverability, setTaxRecoverability] = useState<'recoverable' | 'non_recoverable'>('recoverable')
  const queryClient = useQueryClient()

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku').eq('status', 'active')
      return data ?? []
    },
  })

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('purchase_line_items').insert({
        purchase_id: purchaseId,
        product_id: productId,
        quantity: parseInt(quantity),
        unit_cost: parseFloat(unitCost),
        tax_percent: parseFloat(taxPercent),
        tax_amount: parseFloat(taxAmount),
        tax_recoverability: taxRecoverability,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-line-items', purchaseId] })
      toast.success('Line item added')
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Product *</Label>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Quantity *</Label>
          <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
        <div className="space-y-2">
          <Label>Unit Cost *</Label>
          <Input type="number" step="0.01" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tax %</Label>
          <Input type="number" step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
        <div className="space-y-2">
          <Label>Tax Amount</Label>
          <Input type="number" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Tax Recoverability</Label>
        <Select value={taxRecoverability} onValueChange={(v) => setTaxRecoverability(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recoverable">Recoverable</SelectItem>
            <SelectItem value="non_recoverable">Non-Recoverable</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full" onClick={() => addItem.mutate()} disabled={!productId || !quantity || !unitCost || addItem.isPending}>
        {addItem.isPending ? 'Adding...' : 'Add Line Item'}
      </Button>
    </div>
  )
}

function AddCostForm({ purchaseId, onSuccess }: { purchaseId: string; onSuccess: () => void }) {
  const [costType, setCostType] = useState<'shipping' | 'customs_duties' | 'other'>('shipping')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const queryClient = useQueryClient()

  const addCost = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('purchase_additional_costs').insert({
        purchase_id: purchaseId,
        cost_type: costType,
        amount: parseFloat(amount),
        notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-additional-costs', purchaseId] })
      toast.success('Additional cost added')
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Cost Type</Label>
        <Select value={costType} onValueChange={(v) => setCostType(v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shipping">Shipping</SelectItem>
            <SelectItem value="customs_duties">Customs & Duties</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Amount *</Label>
        <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>
      <Button className="w-full" onClick={() => addCost.mutate()} disabled={!amount || addCost.isPending}>
        {addCost.isPending ? 'Adding...' : 'Add Cost'}
      </Button>
    </div>
  )
}

function AllocationSection({ lineItem, purchaseId }: { lineItem: any; purchaseId: string }) {
  const [locationId, setLocationId] = useState('')
  const [quantity, setQuantity] = useState('')
  const queryClient = useQueryClient()

  const { data: locations } = useQuery({
    queryKey: ['warehouse-locations'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouse_locations').select('id, name').eq('status', 'active')
      return data ?? []
    },
  })

  const { data: existingAllocations } = useQuery({
    queryKey: ['allocations', lineItem.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_allocations')
        .select('*, warehouse_location:warehouse_locations(name)')
        .eq('purchase_line_item_id', lineItem.id)
      return data ?? []
    },
  })

  const allocatedQty = existingAllocations?.reduce((sum, a) => sum + a.quantity, 0) ?? 0
  const remainingQty = lineItem.quantity - allocatedQty

  const addAllocation = useMutation({
    mutationFn: async () => {
      const qty = parseInt(quantity)
      if (qty > remainingQty) throw new Error(`Cannot allocate more than remaining (${remainingQty})`)
      const { error } = await supabase.from('purchase_allocations').insert({
        purchase_line_item_id: lineItem.id,
        warehouse_location_id: locationId,
        quantity: qty,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', lineItem.id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-allocations', purchaseId] })
      setQuantity('')
      setLocationId('')
      toast.success('Allocation added')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="border rounded-md p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-medium">{lineItem.product?.name}</span>
          <span className="text-sm text-muted-foreground ml-2">
            ({allocatedQty}/{lineItem.quantity} allocated)
          </span>
        </div>
        {remainingQty === 0 && <Badge variant="success">Fully Allocated</Badge>}
      </div>

      {existingAllocations && existingAllocations.length > 0 && (
        <div className="mb-3 space-y-1">
          {existingAllocations.map((a: any) => (
            <div key={a.id} className="text-sm flex justify-between">
              <span>{a.warehouse_location?.name}</span>
              <span className="font-mono">{a.quantity}</span>
            </div>
          ))}
        </div>
      )}

      {remainingQty > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                {locations?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24">
            <Input
              type="number"
              min="1"
              max={remainingQty}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Qty"
              onFocus={(e) => e.target.select()}
            />
          </div>
          <Button
            size="sm"
            onClick={() => addAllocation.mutate()}
            disabled={!locationId || !quantity || addAllocation.isPending}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
