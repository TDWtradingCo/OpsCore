import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProductForm } from '@/components/products/ProductForm'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import type { ProductFormData } from '@/lib/validations'

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: inventory } = useQuery({
    queryKey: ['product-inventory', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, warehouse_location:warehouse_locations(*)')
        .eq('product_id', id!)
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: purchaseHistory } = useQuery({
    queryKey: ['product-purchases', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_line_items')
        .select('*, purchase:purchases(*, supplier:suppliers(name))')
        .eq('product_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const updateProduct = useMutation({
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
        .update({ ...values, image_url })
        .eq('id', id!)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Product updated successfully')
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

  if (!product) {
    return <div className="text-center py-8">Product not found</div>
  }

  const totalInventory = inventory?.reduce((sum, inv) => sum + inv.quantity, 0) ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{product.name}</h1>
          <p className="text-muted-foreground font-mono text-sm">{product.sku}</p>
          <p className="text-muted-foreground font-mono text-xs">ID: {product.product_code ?? product.id.slice(0, 8)}</p>
        </div>
        {product.image_url && (
          <img src={product.image_url} alt={product.name} className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg object-cover border" />
        )}
        <Badge variant={product.status === 'active' ? 'success' : 'secondary'}>
          {product.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInventory}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inventory?.filter((inv) => inv.quantity > 0).length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchaseHistory?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Edit Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm
                defaultValues={{
                  name: product.name,
                  sku: product.sku,
                  status: product.status,
                  upc_gtin: product.upc_gtin,
                  brand: product.brand,
                  image_url: product.image_url,
                  weight: product.weight,
                  weight_unit: product.weight_unit,
                  length: product.length,
                  width: product.width,
                  height: product.height,
                  dimension_unit: product.dimension_unit,
                }}
                onSubmit={(values, imageFile) => updateProduct.mutate({ values, imageFile })}
                isLoading={updateProduct.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Inventory by Location</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        No inventory records
                      </TableCell>
                    </TableRow>
                  ) : (
                    inventory?.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.warehouse_location?.name ?? 'Unknown'}</TableCell>
                        <TableCell className="text-right font-mono">{inv.quantity}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle>Purchase History</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Landed Cost</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseHistory?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No purchase history
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchaseHistory?.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono">
                          {item.purchase?.invoice_number ?? '—'}
                        </TableCell>
                        <TableCell>{item.purchase?.supplier?.name ?? '—'}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                        <TableCell className="text-right">
                          {item.landed_unit_cost ? formatCurrency(item.landed_unit_cost) : '—'}
                        </TableCell>
                        <TableCell>
                          {item.purchase?.invoice_date
                            ? new Date(item.purchase.invoice_date).toLocaleDateString()
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
