import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Download, Upload, Edit, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProductForm } from '@/components/products/ProductForm'
import { toast } from 'sonner'
import { exportToCSV, parseCSV } from '@/lib/csv'
import type { ProductFormData } from '@/lib/validations'
import { logDashboardActivity } from '@/lib/audit'
import { useAuth } from '@/contexts/AuthContext'

export function ProductsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created-desc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => { setCurrentPage(1) }, [search, statusFilter, sortBy])
  const [importing, setImporting] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(productId)) {
      newSelected.delete(productId)
    } else {
      newSelected.add(productId)
    }
    setSelectedProducts(newSelected)
  }

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, statusFilter, sortBy],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,product_code.ilike.%${search}%`)
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      // Apply sorting based on sortBy state
      if (sortBy === 'name-asc') {
        query = query.order('name', { ascending: true })
      } else if (sortBy === 'name-desc') {
        query = query.order('name', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const createProduct = useMutation({
    mutationFn: async ({ values, imageFile }: { values: ProductFormData; imageFile: File | null }) => {
      let image_url = values.image_url ?? null

      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const path = `products/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(path, imageFile)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(path)
        image_url = urlData.publicUrl
      }

      const { data, error } = await supabase
        .from('products')
        .insert({ ...values, image_url })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'], type: 'all' })
      setDialogOpen(false)
      if (user) {
        await logDashboardActivity({
          entityType: 'product',
          action: 'create',
          userId: user.id,
          entityId: data.id,
          description: `Created product ${data.name} (${data.sku})`,
          metadata: { sku: data.sku, product_code: data.product_code },
        })
      }
      toast.success('Product created successfully')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function handleExport() {
    if (!products?.length) return
    exportToCSV(products, 'products', [
      { key: 'name', header: 'Name' },
      { key: 'sku', header: 'SKU' },
      { key: 'status', header: 'Status' },
      { key: 'brand', header: 'Brand' },
      { key: 'upc_gtin', header: 'UPC/GTIN' },
      { key: 'weight', header: 'Weight' },
      { key: 'weight_unit', header: 'Weight Unit' },
      { key: 'length', header: 'Length' },
      { key: 'width', header: 'Width' },
      { key: 'height', header: 'Height' },
      { key: 'dimension_unit', header: 'Dimension Unit' },
      { key: 'image_url', header: 'Image URL' },
    ])
    toast.success('Products exported')
  }

  function downloadTemplate() {
    const templateData = [{
      name: 'Wireless Headphones',
      sku: 'WH-BT-500',
      status: 'active',
      brand: 'AudioTech',
      upc_gtin: '1234567890123',
      weight: '0.25',
      weight_unit: 'kg',
      length: '20',
      width: '18',
      height: '8',
      dimension_unit: 'cm',
      image_url: 'https://example.com/wireless-headphones.jpg',
    }, {
      name: 'USB-C Cable',
      sku: 'USBC-2M',
      status: 'active',
      brand: 'CableMax',
      upc_gtin: '9876543210987',
      weight: '0.05',
      weight_unit: 'kg',
      length: '5',
      width: '3',
      height: '2',
      dimension_unit: 'cm',
      image_url: 'https://example.com/usb-cable.jpg',
    }]
    exportToCSV(templateData, 'products-template', [
      { key: 'name', header: 'Product Name *' },
      { key: 'sku', header: 'SKU (Unique ID) *' },
      { key: 'status', header: 'Status (active/inactive) *' },
      { key: 'brand', header: 'Brand' },
      { key: 'upc_gtin', header: 'UPC/GTIN' },
      { key: 'weight', header: 'Weight' },
      { key: 'weight_unit', header: 'Unit (kg/lb/oz/g)' },
      { key: 'length', header: 'Length' },
      { key: 'width', header: 'Width' },
      { key: 'height', header: 'Height' },
      { key: 'dimension_unit', header: 'Dimension Unit (cm/in/mm)' },
      { key: 'image_url', header: 'Image URL' },
    ])
    toast.success('Products template downloaded')
  }

  const updateProduct = useMutation({
    mutationFn: async ({ values, imageFile, productId }: { values: ProductFormData; imageFile: File | null; productId: string }) => {
      let image_url = values.image_url ?? null
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const path = `products/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, imageFile)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
        image_url = urlData.publicUrl
      }
      const { data, error } = await supabase.from('products').update({ ...values, image_url }).eq('id', productId).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'], type: 'all' })
      setEditDialogOpen(false)
      setEditingProduct(null)
      toast.success('Product updated successfully')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteProduct = useMutation({
    mutationFn: async (productId: string) => {
      // Get product to check if it's a Misc Item
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', productId)
        .single()

      const isMiscItem = product?.name?.includes('Misc Item')

      // Check if product has any inventory or purchase line items
      const { data: inventoryItems } = await supabase
        .from('inventory')
        .select('id')
        .eq('product_id', productId)

      const { data: purchaseItems } = await supabase
        .from('purchase_line_items')
        .select('id, purchase_id')
        .eq('product_id', productId)

      // For Misc Item products, cascade delete all related records
      if (isMiscItem && ((inventoryItems?.length ?? 0) > 0 || (purchaseItems?.length ?? 0) > 0)) {
        // Delete allocations
        const purchaseItemIds = purchaseItems?.map(p => p.id) ?? []
        if (purchaseItemIds.length > 0) {
          await supabase.from('purchase_allocations').delete().in('purchase_line_item_id', purchaseItemIds)
        }

        // Delete line items
        if (purchaseItems && purchaseItems.length > 0) {
          const purchaseIds = [...new Set(purchaseItems.map(p => p.purchase_id))]
          await supabase.from('purchase_line_items').delete().eq('product_id', productId)

          // Delete empty purchases
          for (const pId of purchaseIds) {
            const { data: remaining } = await supabase
              .from('purchase_line_items')
              .select('id')
              .eq('purchase_id', pId)
            if (!remaining || remaining.length === 0) {
              await supabase.from('purchases').delete().eq('id', pId)
            }
          }
        }

        // Delete inventory
        if (inventoryItems && inventoryItems.length > 0) {
          await supabase.from('inventory').delete().eq('product_id', productId)
        }
      } else if ((inventoryItems?.length ?? 0) > 0 || (purchaseItems?.length ?? 0) > 0) {
        throw new Error('Cannot delete product with existing inventory or purchase records. Please archive it instead.')
      }

      const { error } = await supabase.from('products').delete().eq('id', productId)
      if (error) throw error
      return productId
    },
    onSuccess: async (productId) => {
      // Invalidate all products queries regardless of filters
      queryClient.invalidateQueries({ queryKey: ['products'], type: 'all' })
      const newSelected = new Set(selectedProducts)
      newSelected.delete(productId)
      setSelectedProducts(newSelected)
      if (user) {
        await logDashboardActivity({
          entityType: 'product',
          action: 'delete',
          userId: user.id,
          entityId: productId as any,
          description: 'Deleted product from database',
        })
      }
      toast.success('Product permanently deleted from database')
    },
    onError: (error) => toast.error(error.message),
  })

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        toast.error('No data found in CSV')
        return
      }

      let imported = 0
      let skipped = 0

      for (const row of rows) {
        const name = row['name']
        const sku = row['sku']
        if (!name || !sku) {
          skipped++
          continue
        }

        const product: Record<string, unknown> = {
          name,
          sku,
          status: row['status'] === 'inactive' ? 'inactive' : 'active',
          brand: row['brand'] || null,
          upc_gtin: row['upc_gtin'] || null,
          weight: row['weight'] ? Number(row['weight']) : null,
          weight_unit: row['weight_unit'] || null,
          length: row['length'] ? Number(row['length']) : null,
          width: row['width'] ? Number(row['width']) : null,
          height: row['height'] ? Number(row['height']) : null,
          dimension_unit: row['dimension_unit'] || null,
        image_url: row['image_url'] || null,
        }

        const { error } = await supabase.from('products').insert(product)
        if (error) {
          skipped++
        } else {
          imported++
        }
      }

      queryClient.invalidateQueries({ queryKey: ['products'], type: 'all' })
      toast.success(`Imported ${imported} product${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}`)
    } catch {
      toast.error('Failed to parse CSV file')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const totalProductPages = Math.ceil((products?.length ?? 0) / PAGE_SIZE)
  const pagedProducts = products?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" />
            Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" />
            {importing ? 'Importing...' : 'Import CSV'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!products?.length}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Product</DialogTitle>
              </DialogHeader>
              <ProductForm
                onSubmit={(values, imageFile) => createProduct.mutate({ values, imageFile })}
                isLoading={createProduct.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created-desc">Newest First</SelectItem>
            <SelectItem value="name-asc">Name (A-Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z-A)</SelectItem>
          </SelectContent>
        </Select>
        {products && (
          <span className="text-sm text-muted-foreground">{products.length} product{products.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Product Selector with Quick Actions */}
      {selectedProducts.size > 0 && (
        <div className="border rounded-lg p-4 bg-card space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{selectedProducts.size} Product{selectedProducts.size !== 1 ? 's' : ''} Selected</label>
            <Button size="sm" variant="ghost" onClick={() => setSelectedProducts(new Set())}>
              Clear
            </Button>
          </div>
          {selectedProducts.size === 1 && (
            <div className="flex gap-2 pt-2 border-t flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const productId = Array.from(selectedProducts)[0]
                  setEditingProduct(products?.find((p) => p.id === productId))
                  setEditDialogOpen(true)
                }}
                className="gap-1"
              >
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive gap-1"
                onClick={() => {
                  const productId = Array.from(selectedProducts)[0]
                  if (productId && confirm('Permanently delete this product from database? This cannot be undone.')) {
                    deleteProduct.mutate(productId)
                  }
                }}
                disabled={deleteProduct.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const productId = Array.from(selectedProducts)[0]
                  const selectedProd = products?.find((p) => p.id === productId)
                  if (selectedProd) {
                    exportToCSV([selectedProd], `product-${selectedProd.sku}`, [
                      { key: 'name', header: 'Name' },
                      { key: 'sku', header: 'SKU' },
                      { key: 'product_code', header: 'Product ID' },
                      { key: 'status', header: 'Status' },
                      { key: 'brand', header: 'Brand' },
                      { key: 'upc_gtin', header: 'UPC/GTIN' },
                      { key: 'weight', header: 'Weight' },
                    ])
                    toast.success('Product exported')
                  }
                }}
                className="gap-1"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              onSubmit={(values, imageFile) => updateProduct.mutate({ values, imageFile, productId: editingProduct.id })}
              isLoading={updateProduct.isPending}
              defaultValues={{
                name: editingProduct.name,
                sku: editingProduct.sku,
                status: editingProduct.status,
                brand: editingProduct.brand,
                upc_gtin: editingProduct.upc_gtin,
                weight: editingProduct.weight,
                weight_unit: editingProduct.weight_unit,
                length: editingProduct.length,
                width: editingProduct.width,
                height: editingProduct.height,
                dimension_unit: editingProduct.dimension_unit,
                image_url: editingProduct.image_url,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"><input type="checkbox" onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedProducts(new Set(products?.map((p) => p.id) ?? []))
                  } else {
                    setSelectedProducts(new Set())
                  }
                }} checked={selectedProducts.size === products?.length && products?.length > 0} /></TableHead>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>UPC/GTIN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedProducts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No products found. Create your first product to get started.
                  </TableCell>
                </TableRow>
              ) : (
                pagedProducts?.map((product) => (
                  <TableRow key={product.id} className={selectedProducts.has(product.id) ? 'bg-muted' : ''}>
                    <TableCell className="w-[50px]">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                      />
                    </TableCell>
                    <TableCell>
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">{product.name?.charAt(0)?.toUpperCase()}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{product.product_code ?? product.id.slice(0, 8)}</span>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/products/${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                    <TableCell>{product.brand ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={product.status === 'active' ? 'success' : 'secondary'}>
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {product.upc_gtin ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalProductPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, products!.length)} of {products!.length}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                <span className="text-sm">{currentPage} / {totalProductPages}</span>
                <Button size="sm" variant="outline" onClick={() => setCurrentPage(p => Math.min(totalProductPages, p + 1))} disabled={currentPage === totalProductPages}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
