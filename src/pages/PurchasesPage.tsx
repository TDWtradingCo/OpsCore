import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Download, Upload, Pencil, Trash2 } from 'lucide-react'
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
import { exportToCSV, parseCSV } from '@/lib/csv'
import { toast } from 'sonner'
import { logDashboardActivity } from '@/lib/audit'

export function PurchasesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date-desc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20
  const [dialogOpen, setDialogOpen] = useState(false)
  const [completeDraftsOpen, setCompleteDraftsOpen] = useState(false)
  const [completeDraftsWarehouse, setCompleteDraftsWarehouse] = useState('')
  const [completingDrafts, setCompletingDrafts] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  useEffect(() => { setCurrentPage(1) }, [search, statusFilter, dateFrom, dateTo, supplierFilter, sortBy])

  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases', search, statusFilter, dateFrom, dateTo, supplierFilter, sortBy],
    queryFn: async () => {
      let query = supabase
        .from('purchases')
        .select('*, supplier:suppliers(name)')

      if (search) {
        const { data: matchingSuppliers } = await supabase
          .from('suppliers')
          .select('id')
          .ilike('name', `%${search}%`)
        const supplierIds = matchingSuppliers?.map(s => s.id) ?? []
        if (supplierIds.length > 0) {
          query = query.or(`invoice_number.ilike.%${search}%,supplier_id.in.(${supplierIds.join(',')})`)
        } else {
          query = query.ilike('invoice_number', `%${search}%`)
        }
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

      if (sortBy === 'date-asc') {
        query = query.order('invoice_date', { ascending: true })
      } else if (sortBy === 'invoice-asc') {
        query = query.order('invoice_number', { ascending: true })
      } else if (sortBy === 'invoice-desc') {
        query = query.order('invoice_number', { ascending: false })
      } else {
        query = query.order('invoice_date', { ascending: false })
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

  const { data: warehouseLocations } = useQuery({
    queryKey: ['warehouse-locations-active'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouse_locations').select('id, name').eq('status', 'active').order('name')
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

  const bulkImportPurchases = useMutation({
    mutationFn: async (csvText: string) => {
      const rows = parseCSV(csvText)
      if (rows.length === 0) throw new Error('No valid rows in CSV')

      // ── Lookup maps ──────────────────────────────────────────────────────
      const { data: supplierData } = await supabase.from('suppliers').select('id, name')
      const supplierByName = new Map<string, string>(
        supplierData?.map((s: any) => [s.name.toLowerCase(), s.id as string]) ?? []
      )

      const { data: productData } = await supabase.from('products').select('id, sku, product_code')
      const productBySku = new Map<string, string>(
        productData?.flatMap((p: any) => p.sku ? [[p.sku.toLowerCase() as string, p.id as string]] : []) ?? []
      )
      const productByCode = new Map<string, string>(
        productData?.flatMap((p: any) => p.product_code ? [[p.product_code.toLowerCase() as string, p.id as string]] : []) ?? []
      )

      // ── Helpers ──────────────────────────────────────────────────────────
      function normaliseDateToISO(raw: string): string {
        const s = raw.trim()
        if (!s) return ''
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
        if (mdy) {
          const [, m, d, y] = mdy
          return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
        }
        const monthMap: Record<string, string> = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        }
        const dmon = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
        if (dmon) {
          const [, d, mon, yr] = dmon
          const month = monthMap[mon!.toLowerCase()]
          if (month) {
            const year = yr!.length === 2 ? `20${yr}` : yr
            return `${year}-${month}-${d!.padStart(2, '0')}`
          }
        }
        return s
      }

      // ── Parse & group rows by invoice ────────────────────────────────────
      interface ParsedLine {
        productIdRaw: string | null
        quantity: number
        unitCost: number
        taxPercent: number
        taxRecoverability: string
        rowIndex: number
        warehouseName: string
      }
      interface InvoiceGroup {
        invoiceNumber: string
        supplierName: string
        invoiceDate: string
        lines: ParsedLine[]
      }

      const invoiceMap = new Map<string, InvoiceGroup>()
      const skippedRows: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (!row) continue

        const invoiceNumber = row.invoice_number?.trim()
        const supplierName  = row.supplier_name?.trim()
        const invoiceDate   = normaliseDateToISO(row.invoice_date ?? '')

        // Skip rows missing the three invoice-level required fields
        if (!invoiceNumber) { skippedRows.push(`Row ${i + 2}: missing invoice number`); continue }
        if (!supplierName)  { skippedRows.push(`Row ${i + 2}: missing supplier name`); continue }
        if (!invoiceDate)   { skippedRows.push(`Row ${i + 2}: missing or unrecognised date`); continue }

        const quantity     = parseInt(row.quantity ?? '', 10)
        const unitCostRaw  = (row.unit_cost ?? '').replace(/[$,\s]/g, '')
        const unitCost     = parseFloat(unitCostRaw)
        const taxPercentRaw = (row.tax_percentage ?? row.tax_percent ?? '0').replace(/[$,\s]/g, '')
        const taxPercent    = parseFloat(taxPercentRaw || '0') || 0
        const taxRecoverability = (row.tax_type ?? row.tax_recoverability)?.trim() || 'recoverable'
        const warehouseName = row.warehouse_name?.trim() || ''

        // Skip rows with invalid quantity or cost
        if (!Number.isFinite(quantity) || quantity <= 0) {
          skippedRows.push(`Row ${i + 2}: invalid or missing quantity — skipped`)
          continue
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          skippedRows.push(`Row ${i + 2}: invalid unit cost — skipped`)
          continue
        }

        const productIdRaw = row.product_id?.trim() || null

        // Group by invoice_number + supplier (one purchase per invoice)
        const groupKey = `${invoiceNumber}|||${supplierName.toLowerCase()}`
        if (!invoiceMap.has(groupKey)) {
          invoiceMap.set(groupKey, { invoiceNumber, supplierName, invoiceDate, lines: [] })
        }
        invoiceMap.get(groupKey)!.lines.push({
          productIdRaw,
          quantity,
          unitCost,
          taxPercent,
          taxRecoverability,
          rowIndex: i + 2,
          warehouseName,
        })
      }

      if (invoiceMap.size === 0) {
        const detail = skippedRows.length ? `\n${skippedRows.slice(0, 5).join('\n')}` : ''
        throw new Error(`No valid rows found.${detail}`)
      }

      // ── Process each invoice group ────────────────────────────────────────
      const createdPurchases: any[] = []
      let successCount = 0
      let errorCount   = 0
      const errors: string[] = []

      for (const [, group] of invoiceMap) {
        try {
          // Supplier must exist — skip invoice if not found
          const supplierId = supplierByName.get(group.supplierName.toLowerCase())
          if (!supplierId) {
            throw new Error(`Supplier "${group.supplierName}" not found in the system`)
          }

          // Create ONE purchase per invoice number
          const { data: purchase, error: purchaseError } = await supabase
            .from('purchases')
            .insert({
              invoice_number: group.invoiceNumber,
              supplier_id: supplierId,
              invoice_date: group.invoiceDate,
              status: 'draft',
              created_by: user!.id,
            })
            .select()
            .single()
          if (purchaseError) throw purchaseError

          // ── Build warehouse lookup (lazy — only if needed) ──────────────
          let warehouseByName: Map<string, string> | null = null
          async function getWarehouseId(name: string): Promise<string> {
            if (!warehouseByName) {
              const { data: wData } = await supabase.from('warehouse_locations').select('id, name')
              warehouseByName = new Map(wData?.map((w: any) => [w.name.toLowerCase(), w.id as string]) ?? [])
            }
            const id = warehouseByName.get(name.toLowerCase())
            if (!id) throw new Error(`Warehouse "${name}" not found in the system`)
            return id
          }

          // Create a line item for each row and capture the IDs
          interface CreatedLI { id: string; productId: string; quantity: number; unitCost: number; taxAmount: number; warehouseName: string }
          const createdLIs: CreatedLI[] = []

          for (const line of group.lines) {
            // Resolve product — auto-create if not found
            let matchedProductId: string | undefined =
              (line.productIdRaw ? productByCode.get(line.productIdRaw.toLowerCase()) : undefined) ??
              (line.productIdRaw ? productBySku.get(line.productIdRaw.toLowerCase()) : undefined) ??
              (line.productIdRaw ? productData?.find((p: any) => p.id === line.productIdRaw)?.id : undefined)

            if (!matchedProductId) {
              const suffix   = Date.now().toString(36).toUpperCase() +
                               Math.random().toString(36).slice(2, 5).toUpperCase()
              const autoSku  = line.productIdRaw ? `${line.productIdRaw}-IMP` : `MISC-${suffix}`
              const autoName = line.productIdRaw
                ? `${line.productIdRaw} (Auto-imported)`
                : `Misc Item — ${group.supplierName} (${group.invoiceNumber})`

              const { data: newProduct, error: productError } = await supabase
                .from('products')
                .insert({ name: autoName, sku: autoSku, status: 'active' })
                .select()
                .single()
              if (productError) throw new Error(`Row ${line.rowIndex}: could not create product — ${productError.message}`)

              matchedProductId = newProduct.id
              if (line.productIdRaw) {
                productByCode.set(line.productIdRaw.toLowerCase(), matchedProductId!)
                productBySku.set(autoSku.toLowerCase(), matchedProductId!)
              }
            }

            const taxAmount = parseFloat(
              ((line.quantity * line.unitCost * line.taxPercent) / 100).toFixed(2)
            )
            const { data: insertedLI, error: lineItemError } = await supabase
              .from('purchase_line_items')
              .insert({
                purchase_id: purchase.id,
                product_id: matchedProductId,
                quantity: line.quantity,
                unit_cost: line.unitCost,
                tax_percent: line.taxPercent,
                tax_amount: taxAmount,
                tax_recoverability: line.taxRecoverability,
              })
              .select('id')
              .single()
            if (lineItemError) throw lineItemError
            createdLIs.push({ id: insertedLI.id, productId: matchedProductId!, quantity: line.quantity, unitCost: line.unitCost, taxAmount, warehouseName: line.warehouseName })
          }

          // ── Auto-complete if every line has a warehouse name ─────────────
          const allHaveWarehouse = createdLIs.every(li => li.warehouseName)
          if (allHaveWarehouse) {
            for (const li of createdLIs) {
              const warehouseId = await getWarehouseId(li.warehouseName)

              await supabase.from('purchase_allocations').insert({
                purchase_line_item_id: li.id,
                warehouse_location_id: warehouseId,
                quantity: li.quantity,
              })

              // Landed unit cost = unit cost (no additional costs in CSV import)
              await supabase.from('purchase_line_items')
                .update({ landed_unit_cost: li.unitCost })
                .eq('id', li.id)

              // Upsert inventory
              const { data: existingInv } = await supabase
                .from('inventory')
                .select('id, quantity')
                .eq('product_id', li.productId)
                .eq('warehouse_location_id', warehouseId)
                .single()

              if (existingInv) {
                await supabase.from('inventory').update({ quantity: existingInv.quantity + li.quantity }).eq('id', existingInv.id)
              } else {
                await supabase.from('inventory').insert({ product_id: li.productId, warehouse_location_id: warehouseId, quantity: li.quantity })
              }
            }
            await supabase.from('purchases').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', purchase.id)
          }

          createdPurchases.push(purchase)
          successCount++

          if (user) {
            await logDashboardActivity({
              entityType: 'purchase',
              action: 'create',
              userId: user.id,
              entityId: purchase.id,
              description: `Bulk imported purchase invoice ${group.invoiceNumber}${allHaveWarehouse ? ' (completed)' : ' (draft)'}`,
              metadata: { supplier_id: supplierId, line_count: group.lines.length },
            })
          }
        } catch (err: any) {
          errorCount++
          errors.push(`Invoice ${group.invoiceNumber}: ${err.message}`)
        }
      }

      if (successCount === 0) {
        throw new Error(`Failed to import any purchases:\n${errors.slice(0, 10).join('\n')}`)
      }

      const completedCount = createdPurchases.filter((p: any) => {
        const group = [...invoiceMap.values()].find(g => g.invoiceNumber === p.invoice_number)
        return group?.lines.every(l => l.warehouseName)
      }).length

      return { successCount, errorCount, completedCount, errors: [...skippedRows, ...errors], createdPurchases }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      let message = `Imported ${result.successCount} purchase${result.successCount !== 1 ? 's' : ''}`
      if (result.completedCount > 0) message += ` (${result.completedCount} completed → inventory updated)`
      else message += ` — add warehouse_name to CSV to auto-complete`
      if (result.errorCount > 0) message += `, ${result.errorCount} failed`
      toast.success(message)

      if (result.errors.length > 0) {
        toast.error(`Some rows failed:\n${result.errors.slice(0, 3).join('\n')}${result.errors.length > 3 ? `\n... and ${result.errors.length - 3} more` : ''}`)
      }
    },
    onError: (error: any) => {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      toast.error(error.message || 'Failed to import purchases')
    },
  })

  const bulkCompleteDrafts = useMutation({
    mutationFn: async (warehouseId: string) => {
      setCompletingDrafts(true)
      const { data: draftPurchases } = await supabase
        .from('purchases')
        .select('id, invoice_number')
        .eq('status', 'draft')

      let completed = 0
      let failed = 0
      const errors: string[] = []

      for (const purchase of draftPurchases ?? []) {
        try {
          const { data: lineItems } = await supabase
            .from('purchase_line_items')
            .select('id, product_id, quantity, unit_cost')
            .eq('purchase_id', purchase.id)

          if (!lineItems?.length) {
            errors.push(`${purchase.invoice_number}: no line items`)
            failed++
            continue
          }

          for (const li of lineItems) {
            const { data: existingAllocs } = await supabase
              .from('purchase_allocations')
              .select('quantity')
              .eq('purchase_line_item_id', li.id)

            const allocatedQty = existingAllocs?.reduce((sum, a) => sum + a.quantity, 0) ?? 0
            const remaining = li.quantity - allocatedQty

            if (remaining > 0) {
              await supabase.from('purchase_allocations').insert({
                purchase_line_item_id: li.id,
                warehouse_location_id: warehouseId,
                quantity: remaining,
              })

              const { data: existingInv } = await supabase
                .from('inventory')
                .select('id, quantity')
                .eq('product_id', li.product_id)
                .eq('warehouse_location_id', warehouseId)
                .single()

              if (existingInv) {
                await supabase.from('inventory').update({ quantity: existingInv.quantity + remaining }).eq('id', existingInv.id)
              } else {
                await supabase.from('inventory').insert({ product_id: li.product_id, warehouse_location_id: warehouseId, quantity: remaining })
              }
            }

            await supabase.from('purchase_line_items')
              .update({ landed_unit_cost: li.unit_cost })
              .eq('id', li.id)
          }

          await supabase.from('purchases')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', purchase.id)

          completed++
        } catch (err: any) {
          failed++
          errors.push(`${purchase.invoice_number}: ${err.message}`)
        }
      }

      return { completed, failed, errors }
    },
    onSuccess: async ({ completed, failed, errors }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setCompletingDrafts(false)
      setCompleteDraftsOpen(false)
      setCompleteDraftsWarehouse('')
      toast.success(`Completed ${completed} draft purchase${completed !== 1 ? 's' : ''} — inventory updated${failed > 0 ? ` (${failed} failed)` : ''}`)
      if (errors.length > 0) {
        toast.error(`Some failed:\n${errors.slice(0, 3).join('\n')}`)
      }
      if (user) {
        await logDashboardActivity({
          entityType: 'purchase',
          action: 'complete',
          userId: user.id,
          description: `Bulk completed ${completed} draft purchases`,
        })
      }
    },
    onError: (error: any) => {
      setCompletingDrafts(false)
      toast.error(error.message || 'Failed to complete drafts')
    },
  })

  function handleBulkImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string
        bulkImportPurchases.mutate(csv)
      } catch (err: any) {
        setImporting(false)
        toast.error('Failed to read file')
      }
    }
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const templateData = [{
      invoice_number: 'INV-2026-001',
      supplier_name: 'Global Electronics Supplier',
      invoice_date: '05/15/2026',
      product_id: 'PRD-1001',
      quantity: '500',
      unit_cost: '12.50',
      tax_percent: '10',
      tax_recoverability: 'recoverable',
      warehouse_name: 'WFS CA',
      notes: 'Fill warehouse_name to auto-complete and update inventory',
    }, {
      invoice_number: 'INV-2026-002',
      supplier_name: 'Premium Parts Inc',
      invoice_date: '05/16/2026',
      product_id: 'PRD-1005',
      quantity: '250',
      unit_cost: '45.75',
      tax_percent: '8',
      tax_recoverability: 'recoverable',
      warehouse_name: 'WFS CA',
      notes: 'Standard order',
    }]
    exportToCSV(templateData, 'purchases-template', [
      { key: 'invoice_number', header: 'Invoice Number *' },
      { key: 'supplier_name', header: 'Supplier Name (must exist) *' },
      { key: 'invoice_date', header: 'Invoice Date (MM/DD/YYYY) *' },
      { key: 'product_id', header: 'Product ID / SKU / Code *' },
      { key: 'quantity', header: 'Quantity *' },
      { key: 'unit_cost', header: 'Unit Cost *' },
      { key: 'tax_percent', header: 'Tax Percentage (%)' },
      { key: 'tax_recoverability', header: 'Tax Type (recoverable/non_recoverable)' },
      { key: 'warehouse_name', header: 'Warehouse Name (fills inventory on import)' },
      { key: 'notes', header: 'Notes' },
    ])
    toast.success('Purchases template downloaded')
  }

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
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" />
            Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-1" />
            {importing ? 'Importing...' : 'Import'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCompleteDraftsWarehouse(''); setCompleteDraftsOpen(true) }}
          >
            Complete Drafts
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleBulkImport}
            disabled={importing}
          />
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
            placeholder="Search by invoice # or supplier name..."
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
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[calc(50%-6px)] sm:w-[160px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Date (Newest)</SelectItem>
            <SelectItem value="date-asc">Date (Oldest)</SelectItem>
            <SelectItem value="invoice-asc">Invoice (A–Z)</SelectItem>
            <SelectItem value="invoice-desc">Invoice (Z–A)</SelectItem>
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
      ) : (() => {
        const totalPages = Math.ceil((purchases?.length ?? 0) / PAGE_SIZE)
        const paged = purchases?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
        return (
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
                {paged?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No purchases found. Create your first purchase invoice.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged?.map((purchase: any) => (
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, purchases!.length)} of {purchases!.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                  <span className="text-sm">{currentPage} / {totalPages}</span>
                  <Button size="sm" variant="outline" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Complete Drafts Dialog */}
      <Dialog open={completeDraftsOpen} onOpenChange={setCompleteDraftsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete All Draft Purchases</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will allocate all unallocated draft purchases to the selected warehouse, mark them as completed, and update inventory quantities.
            </p>
            <div className="space-y-2">
              <Label>Warehouse *</Label>
              <Select value={completeDraftsWarehouse} onValueChange={setCompleteDraftsWarehouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouseLocations?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!completeDraftsWarehouse || completingDrafts || bulkCompleteDrafts.isPending}
              onClick={() => bulkCompleteDrafts.mutate(completeDraftsWarehouse)}
            >
              {bulkCompleteDrafts.isPending ? 'Processing...' : 'Complete All Drafts & Update Inventory'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
