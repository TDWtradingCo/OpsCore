import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Download, Upload } from 'lucide-react'
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
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
      queryClient.invalidateQueries({ queryKey: ['products'] })
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
    ])
    toast.success('Products exported')
  }

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
        }

        const { error } = await supabase.from('products').insert(product)
        if (error) {
          skipped++
        } else {
          imported++
        }
      }

      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(`Imported ${imported} product${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}`)
    } catch {
      toast.error('Failed to parse CSV file')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
        {products && (
          <span className="text-sm text-muted-foreground">{products.length} product{products.length !== 1 ? 's' : ''}</span>
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
              {products?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No products found. Create your first product to get started.
                  </TableCell>
                </TableRow>
              ) : (
                products?.map((product) => (
                  <TableRow key={product.id}>
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
        </div>
      )}
    </div>
  )
}
