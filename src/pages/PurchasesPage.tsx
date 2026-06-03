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
import { SearchableSelect } from '@/components/ui/searchable-select'
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
      const seen = new Set<string>()
      return (data ?? []).filter(p => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })
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

      // ── Fetch all lookup data in parallel ────────────────────────────────
      const [{ data: supplierData }, { data: productData }, { data: warehouseData }] = await Promise.all([
        supabase.from('suppliers').select('id, name'),
        supabase.from('products').select('id, sku, product_code, name'),
        supabase.from('warehouse_locations').select('id, name'),
      ])

      const supplierByName = new Map<string, string>(
        supplierData?.map((s: any) => [s.name.toLowerCase(), s.id as string]) ?? []
      )
      const productByCode = new Map<string, string>(
        productData?.flatMap((p: any) => p.product_code ? [[p.product_code.toLowerCase() as string, p.id as string]] : []) ?? []
      )
      const productBySku = new Map<string, string>(
        productData?.flatMap((p: any) => p.sku ? [[p.sku.toLowerCase() as string, p.id as string]] : []) ?? []
      )
      const productByName = new Map<string, string>(
        productData?.flatMap((p: any) => p.name ? [[p.name.toLowerCase() as string, p.id as string]] : []) ?? []
      )
      const warehouseByName = new Map<string, string>(
        warehouseData?.map((w: any) => [w.name.toLowerCase(), w.id as string]) ?? []
      )

      function getWarehouseId(name: string): string {
        const wid = warehouseByName.get(name.toLowerCase())
        if (!wid) throw new Error(`Warehouse "${name}" not found in the system`)
        return wid
      }

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

        if (!invoiceNumber) { skippedRows.push(`Row ${i + 2}: missing invoice number`); continue }
        if (!supplierName)  { skippedRows.push(`Row ${i + 2}: missing supplier name`); continue }
        if (!invoiceDate)   { skippedRows.push(`Row ${i + 2}: missing or unrecognised date`); continue }

        // Support multiple quantity field names (quantity, quanty, qty)
        const qtyRaw = row.quantity ?? row.quanty ?? row.qty ?? ''
        const quantity = parseInt(qtyRaw, 10)

        // Support unit cost and amount fields
        const unitCostRaw = (row.unit_cost ?? '').replace(/[$,\s]/g, '')
        let unitCost = parseFloat(unitCostRaw)

        const amountRaw = (row.amount ?? row.subtotal ?? '').replace(/[$,\s]/g, '')
        const amount = parseFloat(amountRaw)

        // If unit_cost is not provided but amount (subtotal) and quantity are, calculate unit_cost
        if ((!Number.isFinite(unitCost) || unitCost <= 0) && Number.isFinite(amount) && amount > 0 && Number.isFinite(quantity) && quantity > 0) {
          unitCost = parseFloat((amount / quantity).toFixed(4))
        }

        // Prefer an explicit "Tax Percentage" column.
        // Note: `parseCSV()` normalizes headers like "Tax Percentage (%)" -> `tax_percentage`.
        const taxPercentRawCandidate =
          row['tax_percentage'] ??
          row['tax_percent'] ??
          row['taxpercentage'] ??
          row['taxpercent'] ??
          ''

        const taxPercentRaw = String(taxPercentRawCandidate).replace(/[$,\s%]/g, '')
        let taxPercent = parseFloat(taxPercentRaw || '0') || 0

        // Tax Amount (can calculate taxPercent if missing)
        const taxAmountRawCandidate =
          row['tax_amount'] ??
          row['tax'] ??
          row['taxamount'] ??
          ''
        const taxAmountRaw = String(taxAmountRawCandidate).replace(/[$,\s]/g, '')
        const taxAmountVal = parseFloat(taxAmountRaw || '0') || 0

        // If tax percent is not specified, but tax amount is, compute the percent
        if (taxPercent === 0 && taxAmountVal > 0 && quantity > 0 && unitCost > 0) {
          taxPercent = parseFloat(((taxAmountVal / (quantity * unitCost)) * 100).toFixed(4))
        }

        const taxRecoverability = (row.tax_type ?? row.tax_recoverability)?.trim() || 'recoverable'
        const warehouseName = row.warehouse_name?.trim() || ''

        if (!Number.isFinite(quantity) || quantity <= 0) {
          skippedRows.push(`Row ${i + 2}: invalid or missing quantity — skipped`)
          continue
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          skippedRows.push(`Row ${i + 2}: invalid unit cost — skipped`)
          continue
        }

        const productIdRaw = row.product_id?.trim() || null
        const groupKey = `${invoiceNumber}|||${supplierName.toLowerCase()}`
        if (!invoiceMap.has(groupKey)) {
          invoiceMap.set(groupKey, { invoiceNumber, supplierName, invoiceDate, lines: [] })
        }
        invoiceMap.get(groupKey)!.lines.push({
          productIdRaw, quantity, unitCost, taxPercent, taxRecoverability, rowIndex: i + 2, warehouseName,
        })
      }

      if (invoiceMap.size === 0) {
        const detail = skippedRows.length ? `\n${skippedRows.slice(0, 5).join('\n')}` : ''
        throw new Error(`No valid rows found.${detail}`)
      }

      // ── BATCH: Check all invoices in one query ────────────────────────────
      const allInvoiceNumbers = [...invoiceMap.values()].map(g => g.invoiceNumber)
      console.log('🔍 Invoice numbers from CSV:', allInvoiceNumbers)

      const { data: existingPurchases } = await supabase
        .from('purchases')
        .select('id, status, invoice_number, supplier_id')
        .in('invoice_number', allInvoiceNumbers)

      console.log('📦 Existing purchases found in DB:', existingPurchases?.map(p => ({ id: p.id, invoice: p.invoice_number, supplier: p.supplier_id, status: p.status })))

      // Group by invoice_number + supplier_id to detect DB duplicates
      const existingByKeyAll = new Map<string, any[]>()
      for (const p of existingPurchases ?? []) {
        const key = `${p.invoice_number.toLowerCase()}|||${p.supplier_id}`
        const arr = existingByKeyAll.get(key) ?? []
        arr.push(p)
        existingByKeyAll.set(key, arr)
      }

      // For each key (invoice_number + supplier_id) with >1 DB row, keep the best (completed first) and delete extras
      const duplicateIdsToDelete: string[] = []
      const existingByKey = new Map<string, any>()
      for (const [key, matches] of existingByKeyAll) {
        const best = matches.find((p: any) => p.status === 'completed') ?? matches[0]!
        existingByKey.set(key, best)
        for (const p of matches) {
          if (p.id !== best.id) duplicateIdsToDelete.push(p.id)
        }
      }

      const completedIds = [
        ...[...existingByKey.values()].filter((p: any) => p.status === 'completed').map((p: any) => p.id as string),
        ...(existingPurchases ?? [])
          .filter((p: any) => duplicateIdsToDelete.includes(p.id) && p.status === 'completed')
          .map((p: any) => p.id as string)
      ]
      const allExistingIds = [...existingByKey.values()].map((p: any) => p.id as string)

      // ── BATCH: Revert inventory for completed purchases being re-imported ──
      if (completedIds.length > 0) {
        const { data: oldLIs } = await supabase
          .from('purchase_line_items')
          .select('id, product_id')
          .in('purchase_id', completedIds)

        const oldLIIds = oldLIs?.map((li: any) => li.id as string) ?? []
        const liProductMap = new Map(oldLIs?.map((li: any) => [li.id as string, li.product_id as string]) ?? [])

        if (oldLIIds.length > 0) {
          const { data: oldAllocs } = await supabase
            .from('purchase_allocations')
            .select('purchase_line_item_id, warehouse_location_id, quantity')
            .in('purchase_line_item_id', oldLIIds)

          // Aggregate reductions by product+warehouse
          const reductions = new Map<string, number>()
          for (const alloc of oldAllocs ?? []) {
            const productId = liProductMap.get(alloc.purchase_line_item_id)
            if (productId) {
              const key = `${productId}:::${alloc.warehouse_location_id}`
              reductions.set(key, (reductions.get(key) ?? 0) + alloc.quantity)
            }
          }

          if (reductions.size > 0) {
            const affectedProductIds = [...new Set([...reductions.keys()].map(k => k.split(':::')[0]))]
            const { data: affectedInv } = await supabase
              .from('inventory')
              .select('id, quantity, product_id, warehouse_location_id')
              .in('product_id', affectedProductIds)

            const rollbackRows = (affectedInv ?? [])
              .map((inv: any) => {
                const reduction = reductions.get(`${inv.product_id}:::${inv.warehouse_location_id}`)
                if (!reduction) return null
                return {
                  id: inv.id,
                  product_id: inv.product_id,
                  warehouse_location_id: inv.warehouse_location_id,
                  quantity: Math.max(0, inv.quantity - reduction),
                }
              })
              .filter((r): r is NonNullable<typeof r> => r !== null)

            if (rollbackRows.length > 0) {
              await supabase.from('inventory')
                .upsert(rollbackRows, { onConflict: 'product_id,warehouse_location_id' })
            }
          }

          await supabase.from('purchase_allocations').delete().in('purchase_line_item_id', oldLIIds)
        }

        await Promise.all([
          supabase.from('purchase_line_items').delete().in('purchase_id', completedIds),
          supabase.from('purchases').update({ status: 'draft', completed_at: null }).in('id', completedIds),
        ])
      }

      // Delete the duplicate purchase records from DB after their inventory has been safely rolled back
      if (duplicateIdsToDelete.length > 0) {
        await supabase.from('purchase_line_items').delete().in('purchase_id', duplicateIdsToDelete)
        await supabase.from('purchases').delete().in('id', duplicateIdsToDelete)
      }

      // Delete line items for non-completed existing purchases (drafts being re-imported)
      const draftExistingIds = allExistingIds.filter(id => !completedIds.includes(id))
      if (draftExistingIds.length > 0) {
        await supabase.from('purchase_line_items').delete().in('purchase_id', draftExistingIds)
      }

      // ── BATCH: Create new purchases + update existing headers in parallel ──
      const errors: string[] = []
      let errorCount = 0

      const toCreate: Array<{ invoiceNumber: string; supplierId: string; invoiceDate: string }> = []
      const toUpdate: Array<{ id: string; invoiceNumber: string; supplierId: string; invoiceDate: string }> = []

      for (const [, group] of invoiceMap) {
        const supplierId = supplierByName.get(group.supplierName.toLowerCase())
        if (!supplierId) {
          errors.push(`Invoice ${group.invoiceNumber}: Supplier "${group.supplierName}" not found in the system`)
          errorCount++
          continue
        }
        const lookupKey = `${group.invoiceNumber.toLowerCase()}|||${supplierId}`
        const existing = existingByKey.get(lookupKey)
        if (existing) {
          toUpdate.push({ id: existing.id, invoiceNumber: group.invoiceNumber, supplierId, invoiceDate: group.invoiceDate })
        } else {
          toCreate.push({ invoiceNumber: group.invoiceNumber, supplierId, invoiceDate: group.invoiceDate })
        }
      }

      // Batch create new purchases + single upsert to update existing headers
      const [createdResult] = await Promise.all([
        toCreate.length > 0
          ? supabase.from('purchases').insert(
              toCreate.map(c => ({
                invoice_number: c.invoiceNumber,
                supplier_id: c.supplierId,
                invoice_date: c.invoiceDate,
                status: 'draft',
                created_by: user!.id,
              }))
            ).select('id, invoice_number, supplier_id')
          : Promise.resolve({ data: [] as any[], error: null }),
        toUpdate.length > 0
          ? supabase.from('purchases').upsert(
              toUpdate.map(u => ({
                id: u.id,
                supplier_id: u.supplierId,
                invoice_date: u.invoiceDate,
              })),
              { onConflict: 'id' }
            )
          : Promise.resolve(),
      ])

      if ((createdResult as any).error) throw (createdResult as any).error

      // Track newly created vs existing purchase IDs separately so we can
      // delete orphans (invoices where no product lines matched)
      const newPurchaseIdByKey = new Map<string, string>()
      const purchaseIdByKey = new Map<string, string>()
      for (const p of (createdResult as any).data ?? []) {
        const key = `${p.invoice_number.toLowerCase()}|||${p.supplier_id}`
        purchaseIdByKey.set(key, p.id)
        newPurchaseIdByKey.set(key, p.id)
      }
      for (const u of toUpdate) {
        const key = `${u.invoiceNumber.toLowerCase()}|||${u.supplierId}`
        purchaseIdByKey.set(key, u.id)
      }

      // ── BATCH: Prepare all line items across every invoice ────────────────
      interface LIMeta { warehouseName: string; invoiceNumber: string }
      const liInserts: any[] = []
      const liMetas: LIMeta[] = []

      for (const [, group] of invoiceMap) {
        const supplierId = supplierByName.get(group.supplierName.toLowerCase())
        if (!supplierId) continue
        const lookupKey = `${group.invoiceNumber.toLowerCase()}|||${supplierId}`
        const purchaseId = purchaseIdByKey.get(lookupKey)
        if (!purchaseId) continue

        let skippedLinesCount = 0
        for (const line of group.lines) {
          const matchedProductId =
            (line.productIdRaw ? productByCode.get(line.productIdRaw.toLowerCase()) : undefined) ??
            (line.productIdRaw ? productBySku.get(line.productIdRaw.toLowerCase()) : undefined) ??
            (line.productIdRaw ? productByName.get(line.productIdRaw.toLowerCase()) : undefined) ??
            (line.productIdRaw ? productData?.find((p: any) => p.id === line.productIdRaw)?.id : undefined)

          if (!matchedProductId) { skippedLinesCount++; continue }

          const taxAmount = parseFloat(((line.quantity * line.unitCost * line.taxPercent) / 100).toFixed(2))
          liInserts.push({
            purchase_id: purchaseId,
            product_id: matchedProductId,
            quantity: line.quantity,
            unit_cost: line.unitCost,
            landed_unit_cost: line.unitCost,
            tax_percent: line.taxPercent,
            tax_amount: taxAmount,
            tax_recoverability: line.taxRecoverability,
          })
          liMetas.push({ warehouseName: line.warehouseName, invoiceNumber: group.invoiceNumber })
        }

        if (skippedLinesCount === group.lines.length) {
          errors.push(`Invoice ${group.invoiceNumber}: all ${group.lines.length} line item(s) skipped — no matching products found`)
          const key = `${group.invoiceNumber.toLowerCase()}|||${supplierId}`
          purchaseIdByKey.delete(key)
          errorCount++
        } else if (skippedLinesCount > 0) {
          errors.push(`Invoice ${group.invoiceNumber}: ${skippedLinesCount} of ${group.lines.length} line item(s) skipped (product not found)`)
        }
      }

      // Delete any newly created purchases whose lines all failed to match —
      // they were created as drafts above but have no line items, so remove them
      const orphanIds = [...newPurchaseIdByKey.entries()]
        .filter(([key]) => !purchaseIdByKey.has(key))
        .map(([, id]) => id)
      if (orphanIds.length > 0) {
        await supabase.from('purchases').delete().in('id', orphanIds)
      }

      if (liInserts.length === 0) {
        throw new Error(`Failed to import any purchases:\n${errors.slice(0, 10).join('\n')}`)
      }

      // Single batch insert for all line items
      const { data: insertedLIs, error: liError } = await supabase
        .from('purchase_line_items')
        .insert(liInserts)
        .select('id, product_id, quantity, unit_cost')
      if (liError) throw liError

      // ── BATCH: Build allocations + aggregate inventory additions ──────────
      let localStorageId: string
      try {
        localStorageId = getWarehouseId('Local Storage')
      } catch {
        throw new Error('Warehouse "Local Storage" not found — it is required as the default warehouse')
      }

      const allocationInserts: any[] = []
      // Aggregate quantity changes per product+warehouse to minimise inventory fetches
      const inventoryDelta = new Map<string, { productId: string; warehouseId: string; qty: number }>()

      for (let i = 0; i < (insertedLIs?.length ?? 0); i++) {
        const li = insertedLIs![i]!
        const meta = liMetas[i]!

        let warehouseId: string
        try {
          warehouseId = meta.warehouseName ? getWarehouseId(meta.warehouseName) : localStorageId
        } catch (err: any) {
          errors.push(`Invoice ${meta.invoiceNumber}: ${err.message}`)
          errorCount++
          continue
        }

        allocationInserts.push({
          purchase_line_item_id: li.id,
          warehouse_location_id: warehouseId,
          quantity: li.quantity,
        })

        const key = `${li.product_id}:::${warehouseId}`
        const existing = inventoryDelta.get(key)
        if (existing) {
          existing.qty += li.quantity
        } else {
          inventoryDelta.set(key, { productId: li.product_id, warehouseId, qty: li.quantity })
        }
      }

      // Single batch insert for all allocations
      if (allocationInserts.length > 0) {
        await supabase.from('purchase_allocations').insert(allocationInserts)
      }

      // Single inventory fetch, then single upsert for all changes
      const affectedProductIds = [...new Set([...inventoryDelta.values()].map(v => v.productId))]
      const { data: currentInventory } = await supabase
        .from('inventory')
        .select('id, quantity, product_id, warehouse_location_id')
        .in('product_id', affectedProductIds)

      await supabase.from('inventory').upsert(
        [...inventoryDelta.values()].map(({ productId, warehouseId, qty }) => {
          const existing = currentInventory?.find(
            (r: any) => r.product_id === productId && r.warehouse_location_id === warehouseId
          )
          return {
            ...(existing?.id ? { id: existing.id } : {}),
            product_id: productId,
            warehouse_location_id: warehouseId,
            quantity: (existing?.quantity ?? 0) + qty,
          }
        }),
        { onConflict: 'product_id,warehouse_location_id' }
      )

      // ── BATCH: Complete all purchases in one query ────────────────────────
      const finalPurchaseIds = [...purchaseIdByKey.values()]
      await supabase.from('purchases')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .in('id', finalPurchaseIds)

      // ── Audit logs: single batch insert ──────────────────────────────────
      if (user) {
        const auditRows = [...invoiceMap.values()]
          .filter(g => {
            const supplierId = supplierByName.get(g.supplierName.toLowerCase())
            if (!supplierId) return false
            const key = `${g.invoiceNumber.toLowerCase()}|||${supplierId}`
            return purchaseIdByKey.has(key)
          })
          .map(g => {
            const supplierId = supplierByName.get(g.supplierName.toLowerCase())!
            const key = `${g.invoiceNumber.toLowerCase()}|||${supplierId}`
            const hasExisting = existingByKey.has(key)
            return {
              entity_type: 'purchase',
              action: hasExisting ? 'update' : 'create',
              user_id: user.id,
              entity_id: purchaseIdByKey.get(key),
              description: `${hasExisting ? 'Updated' : 'Imported'} purchase invoice ${g.invoiceNumber} — completed, inventory updated`,
              metadata: { supplier_id: supplierId, line_count: g.lines.length },
            }
          })
        if (auditRows.length > 0) {
          const { error: auditError } = await supabase.from('dashboard_activity_log').insert(auditRows)
          if (auditError) console.error('Failed to write audit log:', auditError.message)
        }
      }

      const successCount = purchaseIdByKey.size
      const updatedCount = toUpdate.filter(u => {
        const key = `${u.invoiceNumber.toLowerCase()}|||${u.supplierId}`
        return purchaseIdByKey.has(key)
      }).length
      const newCount = successCount - updatedCount

      if (successCount === 0) {
        throw new Error(`Failed to import any purchases:\n${errors.slice(0, 10).join('\n')}`)
      }

      return { successCount, newCount, updatedCount, completedCount: successCount, errorCount, errors: [...skippedRows, ...errors] }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      const parts: string[] = []
      if (result.newCount > 0) parts.push(`${result.newCount} new`)
      if (result.updatedCount > 0) parts.push(`${result.updatedCount} updated`)
      let message = `Processed ${result.successCount} purchase${result.successCount !== 1 ? 's' : ''} (${parts.join(', ')})`
      if (result.completedCount > 0) message += ` — ${result.completedCount} completed, inventory updated`
      else message += ` — add warehouse_name to CSV to update inventory`
      if (result.errorCount > 0) message += `, ${result.errorCount} failed`
      toast.success(message)

      if (result.errors.length > 0) {
        toast.error(`Some rows had issues:\n${result.errors.slice(0, 3).join('\n')}${result.errors.length > 3 ? `\n... and ${result.errors.length - 3} more` : ''}`)
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
      amount: '6250.00',
      tax_percent: '10',
      tax_amount: '625.00',
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
      amount: '11437.50',
      tax_percent: '8',
      tax_amount: '915.00',
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
      { key: 'amount', header: 'Amount' },
      { key: 'tax_percent', header: 'Tax Percentage (%)' },
      { key: 'tax_amount', header: 'Tax Amount' },
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
          <Button variant="outline" size="sm" onClick={async () => {
            if (!purchases?.length) return
            try {
              const purchaseIds = purchases.map((p: any) => p.id)
              const { data: lineItemsData, error } = await supabase
                .from('purchase_line_items')
                .select(`
                  *,
                  product:products(sku, name, product_code),
                  purchase_allocations(
                    quantity,
                    warehouse_location:warehouse_locations(name)
                  )
                `)
                .in('purchase_id', purchaseIds)

              if (error) throw error

              // Group line items by purchase_id for easy lookup
              const lineItemsByPurchase = new Map<string, any[]>()
              for (const li of lineItemsData ?? []) {
                const list = lineItemsByPurchase.get(li.purchase_id) ?? []
                list.push(li)
                lineItemsByPurchase.set(li.purchase_id, list)
              }

              const exportData: any[] = []
              for (const p of purchases) {
                const pLineItems = lineItemsByPurchase.get(p.id) ?? []
                const supplierName = p.supplier?.name ?? ''

                // Format date as MM/DD/YYYY for template compatibility
                let formattedDate = ''
                if (p.invoice_date) {
                  const d = new Date(p.invoice_date)
                  if (!isNaN(d.getTime())) {
                    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
                    const day = String(d.getUTCDate()).padStart(2, '0')
                    const year = d.getUTCFullYear()
                    formattedDate = `${month}/${day}/${year}`
                  }
                }

                if (pLineItems.length === 0) {
                  exportData.push({
                    invoice_number: p.invoice_number,
                    supplier_name: supplierName,
                    invoice_date: formattedDate,
                    product_id: '',
                    quantity: '',
                    unit_cost: '',
                    amount: '',
                    tax_percent: '',
                    tax_amount: '',
                    tax_recoverability: '',
                    warehouse_name: '',
                    notes: p.notes ?? '',
                  })
                } else {
                  for (const li of pLineItems) {
                    const productId = li.product?.sku ?? li.product?.product_code ?? li.product?.name ?? ''
                    const amount = (li.quantity * li.unit_cost).toFixed(2)
                    const warehouseName = li.purchase_allocations?.[0]?.warehouse_location?.name ?? ''
                    exportData.push({
                      invoice_number: p.invoice_number,
                      supplier_name: supplierName,
                      invoice_date: formattedDate,
                      product_id: productId,
                      quantity: String(li.quantity),
                      unit_cost: String(li.unit_cost),
                      amount: amount,
                      tax_percent: String(li.tax_percent),
                      tax_amount: String(li.tax_amount),
                      tax_recoverability: li.tax_recoverability,
                      warehouse_name: warehouseName,
                      notes: p.notes ?? '',
                    })
                  }
                }
              }

              exportToCSV(exportData, 'purchases-export', [
                { key: 'invoice_number', header: 'Invoice Number *' },
                { key: 'supplier_name', header: 'Supplier Name (must exist) *' },
                { key: 'invoice_date', header: 'Invoice Date (MM/DD/YYYY) *' },
                { key: 'product_id', header: 'Product ID / SKU / Code *' },
                { key: 'quantity', header: 'Quantity *' },
                { key: 'unit_cost', header: 'Unit Cost *' },
                { key: 'amount', header: 'Amount' },
                { key: 'tax_percent', header: 'Tax Percentage (%)' },
                { key: 'tax_amount', header: 'Tax Amount' },
                { key: 'tax_recoverability', header: 'Tax Type (recoverable/non_recoverable)' },
                { key: 'warehouse_name', header: 'Warehouse Name (fills inventory on import)' },
                { key: 'notes', header: 'Notes' },
              ])
              toast.success('Purchases exported')
            } catch (err: any) {
              toast.error(err.message || 'Failed to export purchases')
            }
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
                <SearchableSelect
                  value={supplierId}
                  onValueChange={setSupplierId}
                  placeholder="Search suppliers..."
                  options={suppliers?.map(s => ({ value: s.id, label: s.name })) ?? []}
                />
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
                <SearchableSelect
                  value={editSupplierId}
                  onValueChange={setEditSupplierId}
                  placeholder="Search suppliers..."
                  options={suppliers?.map(s => ({ value: s.id, label: s.name })) ?? []}
                />
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
              <SearchableSelect
                value={completeDraftsWarehouse}
                onValueChange={setCompleteDraftsWarehouse}
                placeholder="Search warehouses..."
                options={warehouseLocations?.map(w => ({ value: w.id, label: w.name })) ?? []}
              />
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
