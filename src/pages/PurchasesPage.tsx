import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Download, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { exportToCSV } from '@/lib/csv'
import { toast } from 'sonner'
import { logDashboardActivity } from '@/lib/audit'

export function PurchasesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', search, statusFilter, dateFrom, dateTo, supplierFilter],
    queryFn: async () => {
      let query = supabase
        .from('purchases')
        .select('*, supplier:suppliers(name)')
        .order('created_at', { ascending: false })

      if (search) {
        query = query.or(`invoice_number.ilike.%${search}%`)
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (dateFrom) {
        query = query.gte('invoice_date', dateFrom)
      }
      if (dateTo) {
        query = query.lte('invoice_date', dateTo)
      }
      if (supplierFilter !== 'all') {
        query = query.eq('supplier_id', supplierFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('status', 'active')
      return data ?? []
    },
  })

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [notes, setNotes] = useState('')

  const [editInvoiceNumber, setEditInvoiceNumber] = useState('')
  const [editSupplierId, setEditSupplierId] = useState('')
  const [editInvoiceDate, setEditInvoiceDate] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const createPurchase = useMutation({
    mutationFn: async () => {
      if (!invoiceNumber || !supplierId || !invoiceDate) {
        throw new Error('Please fill in all required fields')
      }
      const { data, error } = await supabase
        .from('purchases')
        .insert({
          invoice_number: invoiceNumber,
          supplier_id: supplierId,
          invoice_date: invoiceDate,
          notes: notes || null,
          status: 'draft',
          created_by: user!.id,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      setDialogOpen(false)
      setInvoiceNumber('')
      setSupplierId('')
      setInvoiceDate('')
      setNotes('')
      if (user) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'create',
          userId: user.id,
          entityId: created.id,
          description: `Created purchase invoice ${created.invoice_number}`,
          metadata: { supplier_id: created.supplier_id },
        })
      }
      toast.success('Purchase invoice created')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const updatePurchase = useMutation({
    mutationFn: async () => {
      if (!selectedPurchase) throw new Error('No purchase selected')
      if (!editInvoiceNumber || !editSupplierId || !editInvoiceDate) {
        throw new Error('Please fill in all required fields')
      }
      const { data, error } = await supabase
        .from('purchases')
        .update({
          invoice_number: editInvoiceNumber,
          supplier_id: editSupplierId,
          invoice_date: editInvoiceDate,
          notes: editNotes || null,
        })
        .eq('id', selectedPurchase.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async (updated) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      setEditDialogOpen(false)
      setSelectedPurchase(null)
      if (user) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'update',
          userId: user.id,
          entityId: updated.id,
          description: `Updated purchase invoice ${updated.invoice_number}`,
        })
      }
      toast.success('Purchase updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const deletePurchase = useMutation({
    mutationFn: async ({ id, invoiceNumber }: { id: string; invoiceNumber: string }) => {
      const { error } = await supabase
        .from('purchases')
        .delete()
        .eq('id', id)
      if (error) throw error
      return { id, invoiceNumber }
    },
    onSuccess: async ({ id, invoiceNumber }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      if (user) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'delete',
          userId: user.id,
          entityId: id,
          description: `Deleted purchase invoice ${invoiceNumber}`,
        })
      }
      toast.success('Purchase deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  function openEditDialog(purchase: any) {
    setSelectedPurchase(purchase)
    setEditInvoiceNumber(purchase.invoice_number)
    setEditSupplierId(purchase.supplier_id)
    setEditInvoiceDate(purchase.invoice_date)
    setEditNotes(purchase.notes ?? '')
    setEditDialogOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchases</h1>
          <p className="text-muted-foreground">Manage purchase invoices and landed costs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            if (!purchases?.length) return
            exportToCSV(purchases.map((p: any) => ({
              ...p,
              supplier_name: p.supplier?.name ?? '',
            })), 'purchases', [
              { key: 'invoice_number', header: 'Invoice #' },
              { key: 'supplier_name', header: 'Supplier' },
              { key: 'invoice_date', header: 'Date' },
              { key: 'status', header: 'Status' },
              { key: 'notes', header: 'Notes' },
              { key: 'created_at', header: 'Created' },
            ])
            toast.success('Purchases exported')
          }} disabled={!purchases?.length}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Purchase
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Purchase Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Invoice Number *</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
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
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createPurchase.mutate()}
                disabled={createPurchase.isPending}
              >
                {createPurchase.isPending ? 'Creating...' : 'Create Invoice'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Purchase Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
              <Button className="w-full" onClick={() => updatePurchase.mutate()} disabled={updatePurchase.isPending}>
                {updatePurchase.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by invoice number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[calc(50%-6px)] sm:w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[calc(50%-6px)] sm:w-[160px]">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
            placeholder="From"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
            placeholder="To"
          />
        </div>
        {purchases && (
          <span className="text-sm text-muted-foreground">{purchases.length} purchase{purchases.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No purchases found. Create your first purchase invoice.
                  </TableCell>
                </TableRow>
              ) : (
                purchases?.map((purchase: any) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <Link
                        to={`/purchases/${purchase.id}`}
                        className="font-medium font-mono hover:underline"
                      >
                        {purchase.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>{purchase.supplier?.name ?? '—'}</TableCell>
                    <TableCell>{new Date(purchase.invoice_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={purchase.status === 'completed' ? 'success' : 'secondary'}>
                        {purchase.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(purchase.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(purchase)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (!confirm(`Permanently delete invoice ${purchase.invoice_number}?${purchase.status === 'completed' ? ' Inventory will be reverted.' : ''}`)) return
                            deletePurchase.mutate({ id: purchase.id, invoiceNumber: purchase.invoice_number })
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
