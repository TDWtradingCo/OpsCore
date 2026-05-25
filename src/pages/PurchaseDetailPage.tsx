import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, CheckCircle, Pencil, Trash2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { logDashboardActivity } from '@/lib/audit'

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editLineItemOpen, setEditLineItemOpen] = useState(false)
  const [editCostOpen, setEditCostOpen] = useState(false)
  const [addLineItemInDialogOpen, setAddLineItemInDialogOpen] = useState(false)
  const [addCostInDialogOpen, setAddCostInDialogOpen] = useState(false)
  const [editingLineItem, setEditingLineItem] = useState<any | null>(null)
  const [editingCost, setEditingCost] = useState<any | null>(null)
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('')
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editInvoiceDate, setEditInvoiceDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editLineQuantity, setEditLineQuantity] = useState('')
  const [editLineUnitCost, setEditLineUnitCost] = useState('')
  const [editLineTaxPercent, setEditLineTaxPercent] = useState('')
  const [editLineTaxRecoverability, setEditLineTaxRecoverability] = useState<'recoverable' | 'non_recoverable'>('recoverable')
  const [editCostAmount, setEditCostAmount] = useState('')
  const [editCostNotes, setEditCostNotes] = useState('')
  const [editDialogTab, setEditDialogTab] = useState('details')

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-active-for-purchase-detail'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('status', 'active').order('name')
      return data ?? []
    },
  })

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

      // ── LANDED COST CALCULATION ──
      // Landed Cost = (Unit Cost + Portion of Additional Costs + Non-Recoverable Tax) / Quantity
      // 
      // Step 1: Calculate total value of all line items (quantity × unit cost)
      // Step 2: For each line item, calculate its proportion of the total value
      // Step 3: Allocate additional costs proportionally to each line item
      //         Additional Cost Allocation = Total Additional Costs × (Line Item Value / Total Value)
      // Step 4: Add non-recoverable tax (recoverable tax is not included in landed cost)
      // Step 5: Divide by quantity to get landed unit cost
      //
      // Example:
      // - Line Item 1: 100 units @ $10 = $1,000 (40% of $2,500 total)
      // - Line Item 2: 50 units @ $30 = $1,500 (60% of $2,500 total)
      // - Additional Costs: $100 (shipping)
      // - Line Item 1 gets $40 of shipping (40% × $100)
      // - Line Item 2 gets $60 of shipping (60% × $100)
      // - Line Item 1 landed unit cost = ($1,000 + $40 + tax) / 100
      // - Line Item 2 landed unit cost = ($1,500 + $60 + tax) / 50

      const totalLineValue = lineItems.reduce((sum, li) => sum + li.unit_cost * li.quantity, 0)
      const totalAdditionalCosts = additionalCosts?.reduce((sum, c) => sum + c.amount, 0) ?? 0

      // Update each line item with calculated landed cost
      for (const li of lineItems) {
        const lineValue = li.unit_cost * li.quantity
        const proportion = totalLineValue > 0 ? lineValue / totalLineValue : 0
        
        // Distribute additional costs proportionally based on line item value
        const allocatedCosts = totalAdditionalCosts * proportion
        
        // Only non-recoverable tax is included in landed cost
        // Recoverable tax (VAT, GST, etc.) is deducted and not part of landed cost
        const lineNonRecTax = li.tax_recoverability === 'non_recoverable' ? li.tax_amount : 0
        
        // Final landed unit cost calculation
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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-line-items', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      if (user && purchase) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'complete',
          userId: user.id,
          entityId: purchase.id,
          description: `Completed purchase invoice ${purchase.invoice_number}`,
        })
      }
      toast.success('Purchase completed. Inventory updated and landed costs calculated.')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const updatePurchase = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .update({
          invoice_number: editInvoiceNumber,
          supplier_id: editSupplierId,
          invoice_date: editInvoiceDate,
          notes: editNotes || null,
        })
        .eq('id', id!)
        .select('*, supplier:suppliers(name)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async (updated) => {
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      setEditDialogOpen(false)
      if (user) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'update',
          userId: user.id,
          entityId: updated.id,
          description: `Updated purchase invoice ${updated.invoice_number}`,
        })
      }
      toast.success('Invoice updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const deletePurchase = useMutation({
    mutationFn: async () => {
      // If purchase is completed, revert inventory changes
      if (purchase.status === 'completed' && allocations && allocations.length > 0) {
        // Revert inventory for each allocation
        for (const alloc of allocations) {
          const { data: inv } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', (alloc as any).purchase_line_item?.product_id)
            .eq('warehouse_location_id', alloc.warehouse_location_id)
            .single()

          if (inv) {
            const newQty = Math.max(0, inv.quantity - alloc.quantity)
            if (newQty === 0) {
              await supabase.from('inventory').delete().eq('id', inv.id)
            } else {
              await supabase.from('inventory').update({ quantity: newQty }).eq('id', inv.id)
            }
          }
        }
      }

      const { error } = await supabase
        .from('purchases')
        .delete()
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: async () => {
      if (user && purchase) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'delete',
          userId: user.id,
          entityId: purchase.id,
          description: `Deleted purchase invoice ${purchase.invoice_number}${purchase.status === 'completed' ? ' (inventory reverted)' : ''}`,
        })
      }
      toast.success('Invoice deleted and inventory synced')
      navigate('/purchases')
    },
    onError: (error) => toast.error(error.message),
  })

  const updateLineItem = useMutation({
    mutationFn: async ({ itemId, quantity, unitCost, taxPercent, taxRecoverability }: { itemId: string; quantity: number; unitCost: number; taxPercent: number; taxRecoverability: 'recoverable' | 'non_recoverable' }) => {
      const taxAmount = Number(((quantity * unitCost * taxPercent) / 100).toFixed(2))
      const { error } = await supabase
        .from('purchase_line_items')
        .update({ quantity, unit_cost: unitCost, tax_percent: taxPercent, tax_amount: taxAmount, tax_recoverability: taxRecoverability })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-line-items', id] })
      if (user && purchase) {
        await logDashboardActivity({
          entityType: 'purchase_line_item',
          action: 'update',
          userId: user.id,
          entityId: id,
          description: `Edited a line item in invoice ${purchase.invoice_number}`,
        })
      }
      toast.success('Line item updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteLineItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('purchase_line_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-line-items', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-allocations', id] })
      if (user && purchase) {
        await logDashboardActivity({
          entityType: 'purchase_line_item',
          action: 'delete',
          userId: user.id,
          entityId: id,
          description: `Deleted a line item from invoice ${purchase.invoice_number}`,
        })
      }
      toast.success('Line item deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  const updateAdditionalCost = useMutation({
    mutationFn: async ({ costId, amount, notes }: { costId: string; amount: number; notes: string | null }) => {
      const { error } = await supabase.from('purchase_additional_costs').update({ amount, notes }).eq('id', costId)
      if (error) throw error
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-additional-costs', id] })
      if (user && purchase) {
        await logDashboardActivity({
          entityType: 'purchase_additional_cost',
          action: 'update',
          userId: user.id,
          entityId: id,
          description: `Updated additional cost on invoice ${purchase.invoice_number}`,
        })
      }
      toast.success('Additional cost updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteAdditionalCost = useMutation({
    mutationFn: async (costId: string) => {
      const { error } = await supabase.from('purchase_additional_costs').delete().eq('id', costId)
      if (error) throw error
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-additional-costs', id] })
      if (user && purchase) {
        await logDashboardActivity({
          entityType: 'purchase_additional_cost',
          action: 'delete',
          userId: user.id,
          entityId: id,
          description: `Deleted additional cost on invoice ${purchase.invoice_number}`,
        })
      }
      toast.success('Additional cost deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!purchase) return <div>Purchase not found</div>

  const openEditInvoice = () => {
    setEditInvoiceNumber(purchase.invoice_number)
    setEditSupplierId(purchase.supplier_id)
    setEditInvoiceDate(purchase.invoice_date)
    setEditNotes(purchase.notes ?? '')
    setEditDialogTab('details')
    setEditDialogOpen(true)
  }

  const isDraft = purchase.status === 'draft'
  const canEdit = purchase.status === 'draft' || purchase.status === 'completed'
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
        {canEdit && (
          <Button size="sm" variant="outline" onClick={openEditInvoice}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Invoice
          </Button>
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => {
              if (!confirm(`Delete invoice ${purchase.invoice_number}? This cannot be undone.`)) return
              deletePurchase.mutate()
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        )}
        {isDraft && (
          <Button size="sm" onClick={() => completePurchase.mutate()} disabled={completePurchase.isPending}>
            <CheckCircle className="h-4 w-4 mr-2" />
            {completePurchase.isPending ? 'Processing...' : 'Complete Purchase'}
          </Button>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Purchase Invoice</DialogTitle>
          </DialogHeader>
          <Tabs value={editDialogTab} onValueChange={setEditDialogTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Invoice Details</TabsTrigger>
              <TabsTrigger value="line-items">Line Items</TabsTrigger>
              <TabsTrigger value="costs">Additional Costs</TabsTrigger>
            </TabsList>

            {/* Invoice Details Tab */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Invoice Number *</Label>
                <Input value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={editSupplierId} onValueChange={setEditSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice Date *</Label>
                <Input type="date" value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
              <Button className="w-full" onClick={() => updatePurchase.mutate()} disabled={updatePurchase.isPending}>
                {updatePurchase.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </TabsContent>

            {/* Line Items Tab */}
            <TabsContent value="line-items" className="space-y-4 mt-4">
              <div className="space-y-4">
                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={() => setAddLineItemInDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Line Item
                </Button>
                {lineItems?.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    No line items. Add products to this purchase.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {lineItems?.map((item: any) => (
                      <div key={item.id} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{item.product?.name}</div>
                            <div className="text-sm text-muted-foreground font-mono">{item.product?.sku}</div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingLineItem(item)
                                setEditLineQuantity(String(item.quantity))
                                setEditLineUnitCost(String(item.unit_cost))
                                setEditLineTaxPercent(String(item.tax_percent))
                                setEditLineTaxRecoverability(item.tax_recoverability)
                                setEditLineItemOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (!confirm('Delete this line item?')) return
                                deleteLineItem.mutate(item.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Qty:</span> <span className="font-medium">{item.quantity}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Unit Cost:</span> <span className="font-medium">{formatCurrency(item.unit_cost)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sub Total:</span> <span className="font-medium">{formatCurrency(item.unit_cost * item.quantity)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Tax:</span> <span className="font-medium">{formatCurrency(item.tax_amount)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Tax Type:</span> <Badge variant={item.tax_recoverability === 'recoverable' ? 'outline' : 'destructive'} className="text-xs">{item.tax_recoverability === 'recoverable' ? 'Recoverable' : 'Non-Rec'}</Badge>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Landed Cost:</span> <span className="font-medium">{formatCurrency((item.unit_cost * item.quantity) + item.tax_amount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Additional Costs Tab */}
            <TabsContent value="costs" className="space-y-4 mt-4">
              <div className="space-y-4">
                <Button 
                  size="sm" 
                  className="w-full"
                  onClick={() => setAddCostInDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Cost
                </Button>
                {additionalCosts?.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    No additional costs
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {additionalCosts?.map((cost) => (
                      <div key={cost.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium capitalize">{cost.cost_type.replace('_', ' ')}</div>
                            {cost.notes && <div className="text-sm text-muted-foreground">{cost.notes}</div>}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingCost(cost)
                                setEditCostAmount(String(cost.amount))
                                setEditCostNotes(cost.notes ?? '')
                                setEditCostOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                if (!confirm('Delete this additional cost?')) return
                                deleteAdditionalCost.mutate(cost.id)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-right font-medium text-primary">
                          {formatCurrency(cost.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
              <AddLineItemForm
                purchaseId={id!}
                invoiceNumber={purchase.invoice_number}
                userId={user?.id}
                onSuccess={() => setLineDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Sub Total</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead>Tax Type</TableHead>
                <TableHead className="text-right">Landed Cost</TableHead>
                {isDraft && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isDraft ? 8 : 7} className="text-center text-muted-foreground">
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
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.unit_cost * item.quantity)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.tax_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={item.tax_recoverability === 'recoverable' ? 'outline' : 'destructive'}>
                        {item.tax_recoverability === 'recoverable' ? 'Recoverable' : 'Non-Recoverable'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency((item.unit_cost * item.quantity) + item.tax_amount)}
                    </TableCell>
                    {(isDraft || canEdit) && (
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingLineItem(item)
                              setEditLineQuantity(String(item.quantity))
                              setEditLineUnitCost(String(item.unit_cost))
                              setEditLineTaxPercent(String(item.tax_percent))
                              setEditLineTaxRecoverability(item.tax_recoverability)
                              setEditLineItemOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (!confirm('Delete this line item?')) return
                              deleteLineItem.mutate(item.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
                <AddCostForm
                  purchaseId={id!}
                  invoiceNumber={purchase.invoice_number}
                  userId={user?.id}
                  onSuccess={() => setCostDialogOpen(false)}
                />
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
                {(isDraft || canEdit) && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {additionalCosts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isDraft ? 4 : 3} className="text-center text-muted-foreground">
                    No additional costs
                  </TableCell>
                </TableRow>
              ) : (
                additionalCosts?.map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell className="capitalize">{cost.cost_type.replace('_', ' ')}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(cost.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{cost.notes ?? '—'}</TableCell>
                    {(isDraft || canEdit) && (
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingCost(cost)
                              setEditCostAmount(String(cost.amount))
                              setEditCostNotes(cost.notes ?? '')
                              setEditCostOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (!confirm('Delete this additional cost?')) return
                              deleteAdditionalCost.mutate(cost.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Allocations */}
      {lineItems && lineItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            {lineItems.map((li: any) => (
              <AllocationSection
                key={li.id}
                lineItem={li}
                purchaseId={id!}
                invoiceNumber={purchase.invoice_number}
                userId={user?.id}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Edit Line Item Dialog */}
      <Dialog open={editLineItemOpen} onOpenChange={setEditLineItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Line Item</DialogTitle>
          </DialogHeader>
          {editingLineItem && (
            <div className="space-y-4">
              <div>
                <Label>Product: {editingLineItem.product?.name}</Label>
              </div>
              <div>
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  step="0.01"
                  value={editLineQuantity}
                  onChange={(e) => setEditLineQuantity(e.target.value)}
                  placeholder="Quantity"
                />
              </div>
              <div>
                <Label htmlFor="edit-unit-cost">Unit Cost</Label>
                <Input
                  id="edit-unit-cost"
                  type="number"
                  step="0.01"
                  value={editLineUnitCost}
                  onChange={(e) => setEditLineUnitCost(e.target.value)}
                  placeholder="Unit cost"
                />
              </div>
              <div>
                <Label htmlFor="edit-tax-percent">Tax %</Label>
                <Input
                  id="edit-tax-percent"
                  type="number"
                  step="0.01"
                  value={editLineTaxPercent}
                  onChange={(e) => setEditLineTaxPercent(e.target.value)}
                  placeholder="Tax percentage"
                />
              </div>
              <div>
                <Label htmlFor="edit-tax-recoverability">Tax Type</Label>
                <Select value={editLineTaxRecoverability} onValueChange={(value: any) => setEditLineTaxRecoverability(value)}>
                  <SelectTrigger id="edit-tax-recoverability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recoverable">Recoverable</SelectItem>
                    <SelectItem value="non_recoverable">Non-Recoverable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditLineItemOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const quantity = Number(editLineQuantity)
                    const unitCost = Number(editLineUnitCost)
                    const taxPercent = Number(editLineTaxPercent)
                    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost) || !Number.isFinite(taxPercent)) {
                      toast.error('Please enter valid numbers')
                      return
                    }
                    updateLineItem.mutate({ itemId: editingLineItem.id, quantity, unitCost, taxPercent, taxRecoverability: editLineTaxRecoverability })
                    setEditLineItemOpen(false)
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Cost Dialog */}
      <Dialog open={editCostOpen} onOpenChange={setEditCostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Additional Cost</DialogTitle>
          </DialogHeader>
          {editingCost && (
            <div className="space-y-4">
              <div>
                <Label>Type: {editingCost.cost_type.replace('_', ' ')}</Label>
              </div>
              <div>
                <Label htmlFor="edit-cost-amount">Amount</Label>
                <Input
                  id="edit-cost-amount"
                  type="number"
                  step="0.01"
                  value={editCostAmount}
                  onChange={(e) => setEditCostAmount(e.target.value)}
                  placeholder="Amount"
                />
              </div>
              <div>
                <Label htmlFor="edit-cost-notes">Notes</Label>
                <Textarea
                  id="edit-cost-notes"
                  value={editCostNotes}
                  onChange={(e) => setEditCostNotes(e.target.value)}
                  placeholder="Notes"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditCostOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const amount = Number(editCostAmount)
                    if (!Number.isFinite(amount)) {
                      toast.error('Please enter a valid amount')
                      return
                    }
                    updateAdditionalCost.mutate({ costId: editingCost.id, amount, notes: editCostNotes || null })
                    setEditCostOpen(false)
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Line Item from Edit Dialog */}
      <Dialog open={addLineItemInDialogOpen} onOpenChange={setAddLineItemInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          {purchase && user && (
            <AddLineItemForm
              purchaseId={id!}
              invoiceNumber={purchase.invoice_number}
              userId={user.id}
              onSuccess={() => setAddLineItemInDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Cost from Edit Dialog */}
      <Dialog open={addCostInDialogOpen} onOpenChange={setAddCostInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Additional Cost</DialogTitle>
          </DialogHeader>
          {purchase && user && (
            <AddCostForm
              purchaseId={id!}
              invoiceNumber={purchase.invoice_number}
              userId={user.id}
              onSuccess={() => setAddCostInDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AddLineItemForm({
  purchaseId,
  invoiceNumber,
  userId,
  onSuccess,
}: {
  purchaseId: string
  invoiceNumber: string
  userId?: string
  onSuccess: () => void
}) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [taxPercent, setTaxPercent] = useState('0')
  const [taxAmount, setTaxAmount] = useState('0')
  const [taxRecoverability, setTaxRecoverability] = useState<'recoverable' | 'non_recoverable'>('recoverable')
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: products } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku, product_code, status').order('name')
      return data ?? []
    },
  })

  const filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code?.toLowerCase().includes(productSearch.toLowerCase())
  ) ?? []

  const selectedProduct = products?.find(p => p.id === productId)

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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-line-items', purchaseId] })
      if (userId) {
        await logDashboardActivity({
          entityType: 'purchase_line_item',
          action: 'create',
          userId,
          entityId: purchaseId,
          description: `Added line item to invoice ${invoiceNumber}`,
        })
      }
      toast.success('Line item added')
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  useEffect(() => {
    const qty = Number(quantity)
    const cost = Number(unitCost)
    const percent = Number(taxPercent)
    if (!Number.isFinite(qty) || !Number.isFinite(cost) || !Number.isFinite(percent)) {
      setTaxAmount('0')
      return
    }
    const calculated = ((qty * cost * percent) / 100).toFixed(2)
    setTaxAmount(calculated)
  }, [quantity, unitCost, taxPercent])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Product *</Label>
        <Dialog open={productSearchOpen} onOpenChange={setProductSearchOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal h-auto py-1 px-2 overflow-hidden max-h-12">
              {selectedProduct ? (
                <div className="flex flex-col gap-0 w-full min-w-0">
                  <span className="font-medium line-clamp-1 text-xs">{selectedProduct.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{selectedProduct.sku} | {selectedProduct.product_code}</span>
                </div>
              ) : (
                'Select product...'
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[70vh]">
            <DialogHeader>
              <DialogTitle>Select Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Search by name, SKU, or product ID..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full"
              />
              <div className="overflow-y-auto max-h-[50vh] border rounded-md">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted border-b">
                    <tr>
                      <th className="text-left p-3">Product Name</th>
                      <th className="text-left p-3">SKU</th>
                      <th className="text-left p-3">Product ID</th>
                      <th className="text-left p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-3 text-center text-muted-foreground">
                          No products found
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr key={p.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-3 font-medium max-w-xs truncate">{p.name}</td>
                          <td className="p-3 font-mono text-xs whitespace-nowrap">{p.sku}</td>
                          <td className="p-3 font-mono text-xs whitespace-nowrap">{p.product_code}</td>
                          <td className="p-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setProductId(p.id)
                                setProductSearch('')
                                setProductSearchOpen(false)
                              }}
                            >
                              Select
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Quantity *</Label>
          <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
        <div className="space-y-2">
          <Label>Unit Cost *</Label>
          <Input type="number" step="0.01" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tax %</Label>
          <Input type="number" step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} onFocus={(e) => e.target.select()} />
        </div>
        <div className="space-y-2">
          <Label>Tax Amount</Label>
          <Input type="number" step="0.01" value={taxAmount} readOnly className="bg-muted" />
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

function AddCostForm({
  purchaseId,
  invoiceNumber,
  userId,
  onSuccess,
}: {
  purchaseId: string
  invoiceNumber: string
  userId?: string
  onSuccess: () => void
}) {
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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-additional-costs', purchaseId] })
      if (userId) {
        await logDashboardActivity({
          entityType: 'purchase_additional_cost',
          action: 'create',
          userId,
          entityId: purchaseId,
          description: `Added additional cost to invoice ${invoiceNumber}`,
        })
      }
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

function AllocationSection({
  lineItem,
  purchaseId,
  invoiceNumber,
  userId,
}: {
  lineItem: any
  purchaseId: string
  invoiceNumber: string
  userId?: string
}) {
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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', lineItem.id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-allocations', purchaseId] })
      setQuantity('')
      setLocationId('')
      if (userId) {
        await logDashboardActivity({
          entityType: 'purchase_allocation',
          action: 'create',
          userId,
          entityId: purchaseId,
          description: `Added warehouse allocation to invoice ${invoiceNumber}`,
        })
      }
      toast.success('Allocation added')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteAllocation = useMutation({
    mutationFn: async (allocationId: string) => {
      const { error } = await supabase.from('purchase_allocations').delete().eq('id', allocationId)
      if (error) throw error
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['allocations', lineItem.id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-allocations', purchaseId] })
      if (userId) {
        await logDashboardActivity({
          entityType: 'purchase_allocation',
          action: 'delete',
          userId,
          entityId: purchaseId,
          description: `Removed warehouse allocation from invoice ${invoiceNumber}`,
        })
      }
      toast.success('Allocation removed')
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
              <div className="inline-flex items-center gap-2">
                <span className="font-mono">{a.quantity}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    if (!confirm('Delete this allocation?')) return
                    deleteAllocation.mutate(a.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {remainingQty > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 min-w-0">
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
          <div className="w-full sm:w-24">
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
