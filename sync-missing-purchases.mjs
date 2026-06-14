import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://siprplhdenznrzfuecvx.supabase.co'
const SOURCE_CSV = process.env.PURCHASE_SOURCE_CSV || path.resolve(process.cwd(), '..', 'TDW Past Purchases till Date - Purchase Tracker.csv')
const APPLY = process.argv.includes('--apply')
const REPAIR_RECENT = process.argv.includes('--repair-recent')
const REPAIR_RECENT_MINUTES = Number(process.argv.find((arg) => arg.startsWith('--repair-recent-minutes='))?.split('=')[1] ?? 60)

function readEnvFileValue(name) {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return ''

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    if (key !== name) continue

    return trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
  }

  return ''
}

async function readHiddenLine(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return ''

  process.stdout.write(prompt)
  return new Promise((resolve) => {
    let value = ''
    const wasRaw = process.stdin.isRaw

    function cleanup() {
      process.stdin.setRawMode(Boolean(wasRaw))
      process.stdin.pause()
      process.stdin.off('data', onData)
      process.stdout.write('\n')
    }

    function onData(buffer) {
      const text = buffer.toString('utf8')
      for (const char of text) {
        if (char === '\r' || char === '\n') {
          cleanup()
          resolve(value.trim())
          return
        }
        if (char === '\u0003') {
          cleanup()
          process.exit(130)
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1)
          continue
        }
        value += char
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvFileValue('SUPABASE_SERVICE_ROLE_KEY') || await readHiddenLine('Paste SUPABASE_SERVICE_ROLE_KEY: ')
if (!serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in the environment or terminal input.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"'
          index++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

function normalizeHeader(header) {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .split('/')[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = parseCsvLine(lines[0] || '').map(normalizeHeader)
  const rows = []

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (!line || !line.trim()) continue

    const values = parseCsvLine(line)
    const row = { rowNumber: lineIndex + 1 }
    headers.forEach((header, valueIndex) => {
      if (!header) return
      row[header] = values[valueIndex]?.trim() ?? ''
    })
    rows.push(row)
  }

  return rows
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row[key]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function parseMoney(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return Number.NaN
  const negative = /^\(.+\)$/.test(value)
  const cleaned = value.replace(/[()$,\s]/g, '')
  if (!cleaned) return Number.NaN
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : Number.NaN
}

function parseQuantity(raw) {
  const cleaned = String(raw ?? '').replace(/[,\s]/g, '')
  if (!cleaned) return Number.NaN
  const parsed = Number(cleaned)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

function normalizeDateToIso(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashDate) {
    const [, month, day, year] = slashDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const monthNameDate = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (monthNameDate) {
    const [, monthName, day, year] = monthNameDate
    const month = MONTHS[monthName.slice(0, 3).toLowerCase()]
    if (month) return `${year}-${month}-${day.padStart(2, '0')}`
  }

  const dayMonthDate = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (dayMonthDate) {
    const [, day, monthName, rawYear] = dayMonthDate
    const month = MONTHS[monthName.toLowerCase()]
    if (month) {
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
      return `${year}-${month}-${day.padStart(2, '0')}`
    }
  }

  return ''
}

function key(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function productCodeKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function isClose(a, b, tolerance) {
  return Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= tolerance
}

function isBlankSourceRow(row) {
  const fields = [
    'date', 'invoice_number', 'vendor', 'supplier_name', 'product_id', 'item_name',
    'cost', 'hst', 'quantity', 'total_cost', 'total_tax', 'comments', 'notes',
  ]
  return fields.every((field) => !String(row[field] ?? '').trim() || String(row[field] ?? '').trim() === '$0.00')
}

function buildSourceLines(rows) {
  const sourceLines = []
  const invalidRows = []
  let blankRows = 0

  for (const row of rows) {
    if (isBlankSourceRow(row)) {
      blankRows++
      continue
    }

    const invoiceNumber = firstValue(row, ['invoice_number', 'invoice'])
    const supplierName = firstValue(row, ['supplier_name', 'vendor', 'vendor_supplier', 'supplier'])
    const invoiceDate = normalizeDateToIso(firstValue(row, ['invoice_date', 'date']))
    const productCode = firstValue(row, ['product_id', 'product_code', 'sku']).trim()
    const itemName = firstValue(row, ['item_name', 'product_name', 'name']) || productCode || 'Unknown Purchase Item'
    const comments = firstValue(row, ['comments', 'notes'])
    const quantity = parseQuantity(firstValue(row, ['quantity', 'qty', 'quanty']))
    const totalCost = parseMoney(firstValue(row, ['total_cost', 'amount', 'subtotal']))
    const unitTax = parseMoney(firstValue(row, ['hst', 'unit_tax', 'tax_unit']))
    const totalTax = parseMoney(firstValue(row, ['total_tax', 'tax_amount']))

    let unitCost = parseMoney(firstValue(row, ['unit_cost', 'cost']))
    if (!Number.isFinite(unitCost) && Number.isFinite(totalCost) && Number.isFinite(quantity) && quantity > 0) {
      unitCost = totalCost === 0 ? 0 : totalCost / quantity
    }

    const issues = []
    if (!invoiceNumber) issues.push('missing invoice number')
    if (!supplierName) issues.push('missing supplier')
    if (!invoiceDate) issues.push('missing or unrecognized date')
    if (!Number.isFinite(quantity) || quantity <= 0) issues.push('invalid quantity')
    if (!Number.isFinite(unitCost) || unitCost < 0) issues.push('invalid unit cost')

    if (issues.length > 0) {
      invalidRows.push({ rowNumber: row.rowNumber, issues, invoiceNumber, itemName })
      continue
    }

    let taxAmount = 0
    if (Number.isFinite(totalTax)) {
      taxAmount = totalTax
    } else if (Number.isFinite(unitTax)) {
      taxAmount = unitTax * quantity
    }

    const subtotal = quantity * unitCost
    const taxPercent = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0

    sourceLines.push({
      rowNumber: row.rowNumber,
      invoiceNumber,
      supplierName,
      invoiceDate,
      productCode,
      itemName,
      comments,
      quantity,
      unitCost: round(unitCost, 4),
      taxAmount: round(Math.max(0, taxAmount), 2),
      taxPercent: round(Math.max(0, taxPercent), 4),
      taxRecoverability: 'recoverable',
    })
  }

  return { sourceLines, invalidRows, blankRows }
}

async function fetchAll(table, columns) {
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }

  return rows
}

async function loadState() {
  const [suppliers, products, purchases, lineItems, warehouses, users] = await Promise.all([
    fetchAll('suppliers', 'id, name, status'),
    fetchAll('products', 'id, product_code, sku, name, status'),
    fetchAll('purchases', 'id, invoice_number, supplier_id, invoice_date, status, notes'),
    fetchAll('purchase_line_items', 'id, purchase_id, product_id, quantity, unit_cost, tax_amount, tax_percent'),
    fetchAll('warehouse_locations', 'id, name, status'),
    fetchAll('users', 'id, email, role'),
  ])

  const supplierByName = new Map(suppliers.map((supplier) => [key(supplier.name), supplier]))
  const productByCode = new Map()
  const productBySku = new Map()
  const productByName = new Map()
  const productById = new Map()
  for (const product of products) {
    productById.set(product.id, product)
    if (product.product_code) productByCode.set(productCodeKey(product.product_code), product)
    if (product.sku) productBySku.set(productCodeKey(product.sku), product)
    if (product.name) productByName.set(key(product.name), product)
  }

  const purchasesByExact = new Map()
  const purchasesByInvoiceSupplier = new Map()
  for (const purchase of purchases) {
    const invoiceSupplierKey = `${key(purchase.invoice_number)}|||${purchase.supplier_id}`
    const exactKey = `${invoiceSupplierKey}|||${purchase.invoice_date}`
    const exactMatches = purchasesByExact.get(exactKey) ?? []
    exactMatches.push(purchase)
    purchasesByExact.set(exactKey, exactMatches)
    const invoiceMatches = purchasesByInvoiceSupplier.get(invoiceSupplierKey) ?? []
    invoiceMatches.push(purchase)
    purchasesByInvoiceSupplier.set(invoiceSupplierKey, invoiceMatches)
  }

  const lineItemsByPurchase = new Map()
  for (const lineItem of lineItems) {
    const rows = lineItemsByPurchase.get(lineItem.purchase_id) ?? []
    rows.push({ ...lineItem, used: false })
    lineItemsByPurchase.set(lineItem.purchase_id, rows)
  }

  const warehouseByName = new Map(warehouses.map((warehouse) => [key(warehouse.name), warehouse]))
  const actor = users.find((user) => user.role === 'admin') ?? users[0]

  return {
    suppliers,
    products,
    purchases,
    lineItems,
    warehouses,
    users,
    actor,
    supplierByName,
    productByCode,
    productBySku,
    productByName,
    productById,
    purchasesByExact,
    purchasesByInvoiceSupplier,
    lineItemsByPurchase,
    warehouseByName,
  }
}

function choosePurchase(matches) {
  return matches.find((purchase) => purchase.status === 'completed') ?? matches[0]
}

function resolveProduct(state, line) {
  const rawCode = productCodeKey(line.productCode)
  if (rawCode) {
    return state.productByCode.get(rawCode) ?? state.productBySku.get(rawCode) ?? state.productById.get(line.productCode)
  }
  return state.productByName.get(key(line.itemName)) ??
    state.productBySku.get(productCodeKey(buildSku(line))) ??
    state.productByName.get(key(buildProductName(line)))
}

function productRequestKey(line) {
  return line.productCode ? `code:${productCodeKey(line.productCode)}` : `source-row:${line.rowNumber}`
}

function buildSku(line) {
  if (line.productCode) return line.productCode.trim()
  const slug = key(line.itemName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 24)
  return `SRC-PUR-${line.rowNumber}${slug ? `-${slug}` : ''}`.slice(0, 64)
}

function buildProductName(line) {
  const base = line.itemName || 'Unknown Purchase Item'
  if (line.productCode) return base
  const detail = line.comments ? ` - ${line.comments}` : ''
  return `${base} - source row ${line.rowNumber}${detail}`.slice(0, 240)
}

function buildSourceGroupKey(line) {
  return `${key(line.invoiceNumber)}|||${key(line.supplierName)}|||${line.invoiceDate}`
}

function buildPlan(state, sourceLines) {
  const missingSuppliers = new Map()
  const missingProducts = new Map()
  const groups = new Map()

  for (const line of sourceLines) {
    const supplier = state.supplierByName.get(key(line.supplierName))
    if (!supplier) missingSuppliers.set(key(line.supplierName), line.supplierName)

    const sourceGroupKey = buildSourceGroupKey(line)
    if (!groups.has(sourceGroupKey)) {
      groups.set(sourceGroupKey, {
        key: sourceGroupKey,
        invoiceNumber: line.invoiceNumber,
        supplierName: line.supplierName,
        supplierId: supplier?.id ?? null,
        invoiceDate: line.invoiceDate,
        sourceLines: [],
        purchase: null,
        dateMatchedByInvoiceOnly: false,
      })
    }
    groups.get(sourceGroupKey).sourceLines.push(line)

    const product = resolveProduct(state, line)
    if (!product) missingProducts.set(productRequestKey(line), line)
  }

  const missingPurchaseGroups = []
  const duplicatePurchaseGroups = []
  const dateFallbackGroups = []

  for (const group of groups.values()) {
    if (!group.supplierId) {
      missingPurchaseGroups.push(group)
      continue
    }

    const invoiceSupplierKey = `${key(group.invoiceNumber)}|||${group.supplierId}`
    const exactKey = `${invoiceSupplierKey}|||${group.invoiceDate}`
    const exactMatches = state.purchasesByExact.get(exactKey) ?? []
    if (exactMatches.length > 0) {
      group.purchase = choosePurchase(exactMatches)
      if (exactMatches.length > 1) duplicatePurchaseGroups.push(group)
      continue
    }

    const invoiceMatches = state.purchasesByInvoiceSupplier.get(invoiceSupplierKey) ?? []
    if (invoiceMatches.length === 1) {
      group.purchase = invoiceMatches[0]
      group.dateMatchedByInvoiceOnly = invoiceMatches[0].invoice_date !== group.invoiceDate
      if (group.dateMatchedByInvoiceOnly) dateFallbackGroups.push(group)
      continue
    }

    missingPurchaseGroups.push(group)
  }

  const matchedLines = []
  const matchedWithTaxDifference = []
  const missingLines = []

  for (const line of sourceLines) {
    const group = groups.get(buildSourceGroupKey(line))
    const product = resolveProduct(state, line)
    const purchase = group?.purchase ?? null

    if (!product || !purchase) {
      missingLines.push({ line, group, product, reason: !product ? 'missing product' : 'missing purchase' })
      continue
    }

    const candidates = state.lineItemsByPurchase.get(purchase.id) ?? []
    let match = candidates.find((candidate) => (
      !candidate.used &&
      candidate.product_id === product.id &&
      Number(candidate.quantity) === line.quantity &&
      isClose(candidate.unit_cost, line.unitCost, 0.01) &&
      isClose(candidate.tax_amount, line.taxAmount, 0.05)
    ))

    let taxDifference = false
    if (!match) {
      match = candidates.find((candidate) => (
        !candidate.used &&
        candidate.product_id === product.id &&
        Number(candidate.quantity) === line.quantity &&
        isClose(candidate.unit_cost, line.unitCost, 0.01)
      ))
      taxDifference = Boolean(match)
    }

    if (match) {
      match.used = true
      matchedLines.push({ line, group, product, purchase, match })
      if (taxDifference) matchedWithTaxDifference.push({ line, group, product, purchase, match })
    } else {
      missingLines.push({ line, group, product, purchase, reason: 'missing line item' })
    }
  }

  return {
    groups: [...groups.values()],
    missingSuppliers: [...missingSuppliers.values()],
    missingProducts: [...missingProducts.values()],
    missingPurchaseGroups,
    duplicatePurchaseGroups,
    dateFallbackGroups,
    matchedLines,
    matchedWithTaxDifference,
    missingLines,
  }
}

function summarizeMissingByInvoice(missingLines) {
  const summary = new Map()
  for (const item of missingLines) {
    const line = item.line
    const summaryKey = `${line.invoiceNumber} | ${line.supplierName} | ${line.invoiceDate}`
    const current = summary.get(summaryKey) ?? { count: 0, rows: [] }
    current.count++
    current.rows.push(line.rowNumber)
    summary.set(summaryKey, current)
  }
  return [...summary.entries()].map(([label, value]) => ({ label, ...value }))
}

function printPlan(label, parsed, state, plan) {
  const missingInvoiceSummary = summarizeMissingByInvoice(plan.missingLines)
  console.log(`\n${label}`)
  console.log('='.repeat(label.length))
  console.log(`Source valid lines: ${parsed.sourceLines.length}`)
  console.log(`Source invalid rows skipped: ${parsed.invalidRows.length}`)
  console.log(`Source blank/template rows skipped: ${parsed.blankRows}`)
  console.log(`Database rows loaded: ${state.suppliers.length} suppliers, ${state.products.length} products, ${state.purchases.length} purchases, ${state.lineItems.length} line items`)
  console.log(`Matching source lines already in DB: ${plan.matchedLines.length}`)
  console.log(`Missing source lines to insert: ${plan.missingLines.length}`)
  console.log(`Suppliers to create: ${plan.missingSuppliers.length}`)
  console.log(`Products to create for unmatched source rows: ${plan.missingProducts.length}`)
  console.log(`Purchase invoice groups to create: ${plan.missingPurchaseGroups.length}`)
  console.log(`Invoice groups matched by invoice/supplier but different date: ${plan.dateFallbackGroups.length}`)
  console.log(`Line matches with tax differences ignored: ${plan.matchedWithTaxDifference.length}`)

  if (missingInvoiceSummary.length > 0) {
    console.log('\nInvoices/groups with missing source lines:')
    for (const item of missingInvoiceSummary.slice(0, 80)) {
      console.log(`  - ${item.label}: ${item.count} line(s), source rows ${item.rows.slice(0, 8).join(', ')}${item.rows.length > 8 ? ', ...' : ''}`)
    }
    if (missingInvoiceSummary.length > 80) {
      console.log(`  ... ${missingInvoiceSummary.length - 80} more invoice groups`)
    }
  }

  if (parsed.invalidRows.length > 0) {
    console.log('\nInvalid source rows skipped:')
    for (const invalid of parsed.invalidRows.slice(0, 20)) {
      console.log(`  - Row ${invalid.rowNumber}: ${invalid.issues.join(', ')}${invalid.invoiceNumber ? ` (${invalid.invoiceNumber})` : ''}${invalid.itemName ? ` - ${invalid.itemName}` : ''}`)
    }
    if (parsed.invalidRows.length > 20) {
      console.log(`  ... ${parsed.invalidRows.length - 20} more invalid rows`)
    }
  }
}

async function createMissingSuppliers(missingSuppliers) {
  if (missingSuppliers.length === 0) return 0
  const { error } = await supabase
    .from('suppliers')
    .insert(missingSuppliers.map((name) => ({ name })))
  if (error) throw error
  return missingSuppliers.length
}

async function createMissingProducts(missingProducts) {
  if (missingProducts.length === 0) return 0
  const inserts = missingProducts.map((line) => ({
    name: buildProductName(line),
    sku: buildSku(line),
    ...(line.productCode ? { product_code: line.productCode.trim() } : {}),
    status: 'active',
  }))

  const { error } = await supabase.from('products').insert(inserts)
  if (error) throw error
  return inserts.length
}

async function createMissingPurchases(state, missingPurchaseGroups) {
  const groups = missingPurchaseGroups.filter((group) => group.supplierId)
  if (groups.length === 0) return 0
  if (!state.actor?.id) throw new Error('No public.users row found for purchases.created_by')

  const inserts = groups.map((group) => {
    const comments = group.sourceLines.map((line) => line.comments).filter(Boolean)
    return {
      invoice_number: group.invoiceNumber,
      supplier_id: group.supplierId,
      invoice_date: group.invoiceDate,
      status: 'draft',
      created_by: state.actor.id,
      notes: comments.length > 0 ? [...new Set(comments)].join('\n') : null,
    }
  })

  const { error } = await supabase.from('purchases').insert(inserts)
  if (error) throw error
  return inserts.length
}

async function ensureLocalStorage(state) {
  const existing = state.warehouseByName.get('local storage')
  if (existing) return existing.id

  const { data, error } = await supabase
    .from('warehouse_locations')
    .insert({ name: 'Local Storage' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function applyInventoryDeltas(deltas) {
  if (deltas.size === 0) return 0

  const productIds = [...new Set([...deltas.values()].map((delta) => delta.productId))]
  const { data: currentInventory, error: inventoryFetchError } = await supabase
    .from('inventory')
    .select('id, product_id, warehouse_location_id, quantity')
    .in('product_id', productIds)
  if (inventoryFetchError) throw inventoryFetchError

  const updates = []
  const inserts = []

  for (const delta of deltas.values()) {
    const existing = currentInventory?.find((row) => row.product_id === delta.productId && row.warehouse_location_id === delta.warehouseId)
    if (existing) {
      updates.push({
        id: existing.id,
        product_id: delta.productId,
        warehouse_location_id: delta.warehouseId,
        quantity: Number(existing.quantity ?? 0) + delta.quantity,
      })
    } else {
      inserts.push({
        product_id: delta.productId,
        warehouse_location_id: delta.warehouseId,
        quantity: delta.quantity,
      })
    }
  }

  if (updates.length > 0) {
    const { error } = await supabase.from('inventory').upsert(updates, { onConflict: 'id' })
    if (error) throw error
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from('inventory').insert(inserts)
    if (error) throw error
  }

  return updates.length + inserts.length
}

async function insertMissingLines(state, plan) {
  const insertable = plan.missingLines.filter((item) => item.group?.purchase?.id && item.product?.id)
  if (insertable.length === 0) return { insertedLines: 0, allocations: 0, inventoryRows: 0, completedPurchases: 0, auditRows: 0 }

  const localStorageId = await ensureLocalStorage(state)
  const lineRows = insertable.map((item) => ({
    purchase_id: item.group.purchase.id,
    product_id: item.product.id,
    quantity: item.line.quantity,
    unit_cost: item.line.unitCost,
    tax_percent: item.line.taxPercent,
    tax_amount: item.line.taxAmount,
    tax_recoverability: item.line.taxRecoverability,
    landed_unit_cost: item.line.unitCost + (item.line.taxRecoverability === 'non_recoverable' ? item.line.taxAmount / item.line.quantity : 0),
  }))

  const { data: insertedLineItems, error: lineError } = await supabase
    .from('purchase_line_items')
    .insert(lineRows)
    .select('id, purchase_id, product_id, quantity')
  if (lineError) throw lineError

  const allocationRows = insertedLineItems.map((lineItem) => ({
    purchase_line_item_id: lineItem.id,
    warehouse_location_id: localStorageId,
    quantity: lineItem.quantity,
  }))
  const { error: allocationError } = await supabase.from('purchase_allocations').insert(allocationRows)
  if (allocationError) throw allocationError

  const deltas = new Map()
  for (const lineItem of insertedLineItems) {
    const deltaKey = `${lineItem.product_id}|||${localStorageId}`
    const current = deltas.get(deltaKey) ?? { productId: lineItem.product_id, warehouseId: localStorageId, quantity: 0 }
    current.quantity += lineItem.quantity
    deltas.set(deltaKey, current)
  }

  const inventoryRowCount = await applyInventoryDeltas(deltas)

  const purchaseIds = [...new Set(insertable.map((item) => item.group.purchase.id))]
  const { error: completeError } = await supabase
    .from('purchases')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .in('id', purchaseIds)
  if (completeError) throw completeError

  let auditRows = 0
  if (state.actor?.id) {
    const countsByPurchase = new Map()
    for (const item of insertable) {
      const purchaseId = item.group.purchase.id
      countsByPurchase.set(purchaseId, (countsByPurchase.get(purchaseId) ?? 0) + 1)
    }
    const audits = [...countsByPurchase.entries()].map(([purchaseId, lineCount]) => {
      const purchase = state.purchases.find((row) => row.id === purchaseId)
      return {
        entity_type: 'purchase',
        action: 'update',
        entity_id: purchaseId,
        user_id: state.actor.id,
        description: `Direct synced ${lineCount} missing source purchase line(s)${purchase ? ` for invoice ${purchase.invoice_number}` : ''}`,
        metadata: { source: 'original_purchase_tracker_csv', inserted_line_count: lineCount },
      }
    })
    if (audits.length > 0) {
      const { error: auditError } = await supabase.from('dashboard_activity_log').insert(audits)
      if (!auditError) auditRows = audits.length
    }
  }

  return {
    insertedLines: insertedLineItems.length,
    allocations: allocationRows.length,
    inventoryRows: inventoryRowCount,
    completedPurchases: purchaseIds.length,
    auditRows,
  }
}

async function updateTaxDifferences(plan) {
  let updated = 0
  for (const item of plan.matchedWithTaxDifference) {
    const { error } = await supabase
      .from('purchase_line_items')
      .update({
        tax_percent: item.line.taxPercent,
        tax_amount: item.line.taxAmount,
        tax_recoverability: item.line.taxRecoverability,
      })
      .eq('id', item.match.id)
    if (error) throw error
    updated++
  }
  return updated
}

async function repairRecentInsertedLineInventory(minutes) {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString()
  const { data: recentLineItems, error: lineError } = await supabase
    .from('purchase_line_items')
    .select('id, purchase_id, product_id, quantity, created_at')
    .gte('created_at', since)
  if (lineError) throw lineError
  if (!recentLineItems?.length) {
    return { recentLines: 0, allocations: 0, inventoryRows: 0, completedPurchases: 0 }
  }

  const lineItemIds = recentLineItems.map((lineItem) => lineItem.id)
  const { data: allocations, error: allocationError } = await supabase
    .from('purchase_allocations')
    .select('purchase_line_item_id, warehouse_location_id, quantity')
    .in('purchase_line_item_id', lineItemIds)
  if (allocationError) throw allocationError

  const lineItemById = new Map(recentLineItems.map((lineItem) => [lineItem.id, lineItem]))
  const deltas = new Map()
  for (const allocation of allocations ?? []) {
    const lineItem = lineItemById.get(allocation.purchase_line_item_id)
    if (!lineItem) continue
    const deltaKey = `${lineItem.product_id}|||${allocation.warehouse_location_id}`
    const current = deltas.get(deltaKey) ?? { productId: lineItem.product_id, warehouseId: allocation.warehouse_location_id, quantity: 0 }
    current.quantity += allocation.quantity
    deltas.set(deltaKey, current)
  }

  const inventoryRows = await applyInventoryDeltas(deltas)
  const purchaseIds = [...new Set(recentLineItems.map((lineItem) => lineItem.purchase_id))]
  if (purchaseIds.length > 0) {
    const { error: completeError } = await supabase
      .from('purchases')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .in('id', purchaseIds)
    if (completeError) throw completeError
  }

  return {
    recentLines: recentLineItems.length,
    allocations: allocations?.length ?? 0,
    inventoryRows,
    completedPurchases: purchaseIds.length,
  }
}

async function main() {
  if (!fs.existsSync(SOURCE_CSV)) {
    throw new Error(`Source CSV not found: ${SOURCE_CSV}`)
  }

  if (REPAIR_RECENT) {
    const repaired = await repairRecentInsertedLineInventory(REPAIR_RECENT_MINUTES)
    console.log('\nRecent line repair applied')
    console.log('==========================')
    console.log(`Recent line items scanned: ${repaired.recentLines}`)
    console.log(`Allocations used: ${repaired.allocations}`)
    console.log(`Inventory rows updated/created: ${repaired.inventoryRows}`)
    console.log(`Purchases marked completed: ${repaired.completedPurchases}`)
    return
  }

  const parsed = buildSourceLines(parseCsv(fs.readFileSync(SOURCE_CSV, 'utf8')))
  let state = await loadState()
  let plan = buildPlan(state, parsed.sourceLines)
  printPlan(APPLY ? 'Pre-apply plan' : 'Dry run plan', parsed, state, plan)

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write the missing rows.')
    return
  }

  const createdSuppliers = await createMissingSuppliers(plan.missingSuppliers)
  state = await loadState()
  plan = buildPlan(state, parsed.sourceLines)

  const createdProducts = await createMissingProducts(plan.missingProducts)
  state = await loadState()
  plan = buildPlan(state, parsed.sourceLines)

  const createdPurchases = await createMissingPurchases(state, plan.missingPurchaseGroups)
  state = await loadState()
  plan = buildPlan(state, parsed.sourceLines)

  const inserted = await insertMissingLines(state, plan)
  const taxDifferencesUpdated = await updateTaxDifferences(plan)
  state = await loadState()
  plan = buildPlan(state, parsed.sourceLines)

  console.log('\nApplied update')
  console.log('==============')
  console.log(`Suppliers created: ${createdSuppliers}`)
  console.log(`Products created: ${createdProducts}`)
  console.log(`Purchase invoices created: ${createdPurchases}`)
  console.log(`Purchase line items inserted: ${inserted.insertedLines}`)
  console.log(`Allocations inserted: ${inserted.allocations}`)
  console.log(`Inventory rows updated/created: ${inserted.inventoryRows}`)
  console.log(`Purchases marked completed: ${inserted.completedPurchases}`)
  console.log(`Audit rows written: ${inserted.auditRows}`)
  console.log(`Existing line tax fields updated: ${taxDifferencesUpdated}`)
  console.log(`Remaining missing source lines after apply: ${plan.missingLines.length}`)
  if (plan.missingLines.length > 0) {
    for (const item of plan.missingLines.slice(0, 20)) {
      console.log(`  - Row ${item.line.rowNumber}: ${item.line.invoiceNumber}, ${item.reason}`)
    }
  }
}

main().catch((error) => {
  console.error('\nSync failed:')
  console.error(error.message)
  process.exit(1)
})