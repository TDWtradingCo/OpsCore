import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Search, Plus } from 'lucide-react'

export function PricingPage() {
  const [search, setSearch] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<string>('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: channels } = useQuery({
    queryKey: ['sales-channels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_channels').select('*').eq('status', 'active')
      if (error) throw error
      return data
    },
  })

  const { data: products } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, sku').eq('status', 'active')
      if (error) throw error
      return data
    },
  })

  const { data: pricing, isLoading } = useQuery({
    queryKey: ['channel-pricing', selectedChannel, search],
    queryFn: async () => {
      let query = supabase
        .from('channel_pricing')
        .select('*, product:products(id, name, sku), sales_channel:sales_channels(id, name, commission_percent)')

      if (selectedChannel !== 'all') {
        query = query.eq('channel_id', selectedChannel)
      }

      const { data, error } = await query
      if (error) throw error

      if (search) {
        return data.filter(
          (p: any) =>
            p.product?.name.toLowerCase().includes(search.toLowerCase()) ||
            p.product?.sku.toLowerCase().includes(search.toLowerCase())
        )
      }

      return data
    },
  })

  const updatePricing = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: number | null | string }) => {
      const { error } = await supabase
        .from('channel_pricing')
        .update({ [field]: value })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-pricing'] })
    },
    onError: (error) => toast.error(error.message),
  })

  function getActivePrice(item: any): number | null {
    if (item.promo_price != null && item.promo_price > 0) return item.promo_price
    if (item.offer_price != null && item.offer_price > 0) return item.offer_price
    if (item.retail_price != null && item.retail_price > 0) return item.retail_price
    return null
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Channel Pricing</h1>
          <p className="text-muted-foreground">Manage pricing across sales channels</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Pricing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Channel Pricing</DialogTitle>
            </DialogHeader>
            <AddPricingForm
              products={products ?? []}
              channels={channels ?? []}
              onSuccess={() => {
                setAddDialogOpen(false)
                queryClient.invalidateQueries({ queryKey: ['channel-pricing'] })
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedChannel} onValueChange={setSelectedChannel}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {channels?.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                  <TableHead className="text-right">Offer</TableHead>
                  <TableHead className="text-right">Promo</TableHead>
                  <TableHead className="text-right">Active Price</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead className="text-right">Fulfillment Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No pricing records found. Set up channel pricing for your products.
                    </TableCell>
                  </TableRow>
                ) : (
                  pricing?.map((item: any) => {
                    const activePrice = getActivePrice(item)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.product?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{item.product?.sku}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.sales_channel?.name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <EditablePrice
                            value={item.retail_price}
                            onSave={(val) => updatePricing.mutate({ id: item.id, field: 'retail_price', value: val })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <EditablePrice
                            value={item.offer_price}
                            onSave={(val) => updatePricing.mutate({ id: item.id, field: 'offer_price', value: val })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <EditablePrice
                            value={item.promo_price}
                            onSave={(val) => updatePricing.mutate({ id: item.id, field: 'promo_price', value: val })}
                          />
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {activePrice ? formatCurrency(activePrice) : '—'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.fulfillment_mode}
                            onValueChange={(val) => updatePricing.mutate({ id: item.id, field: 'fulfillment_mode', value: val })}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seller_fulfilled">Seller Fulfilled</SelectItem>
                              <SelectItem value="marketplace_fulfilled">Marketplace</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <EditablePrice
                            value={item.fulfillment_mode === 'seller_fulfilled'
                              ? item.seller_shipping_cost
                              : item.marketplace_fulfillment_cost}
                            onSave={(val) =>
                              updatePricing.mutate({
                                id: item.id,
                                field: item.fulfillment_mode === 'seller_fulfilled'
                                  ? 'seller_shipping_cost'
                                  : 'marketplace_fulfillment_cost',
                                value: val ?? 0,
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EditablePrice({ value, onSave }: { value: number | null; onSave: (val: number | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value?.toString() ?? '')

  if (editing) {
    return (
      <Input
        type="number"
        step="0.01"
        className="h-8 w-24 text-right text-sm"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(inputValue)
          onSave(isNaN(parsed) ? null : parsed)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const parsed = parseFloat(inputValue)
            onSave(isNaN(parsed) ? null : parsed)
            setEditing(false)
          }
          if (e.key === 'Escape') setEditing(false)
        }}
        autoFocus
        onFocus={(e) => e.target.select()}
      />
    )
  }

  return (
    <button
      className="text-sm hover:bg-accent px-2 py-1 rounded cursor-pointer"
      onClick={() => {
        setInputValue(value?.toString() ?? '')
        setEditing(true)
      }}
    >
      {value != null ? formatCurrency(value) : '—'}
    </button>
  )
}

function AddPricingForm({
  products,
  channels,
  onSuccess,
}: {
  products: { id: string; name: string; sku: string }[]
  channels: { id: string; name: string }[]
  onSuccess: () => void
}) {
  const [productId, setProductId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [retailPrice, setRetailPrice] = useState('')

  const addPricing = useMutation({
    mutationFn: async () => {
      if (!productId || !channelId) throw new Error('Product and channel are required')
      const { error } = await supabase.from('channel_pricing').insert({
        product_id: productId,
        channel_id: channelId,
        retail_price: retailPrice ? parseFloat(retailPrice) : null,
        fulfillment_mode: 'seller_fulfilled',
        seller_shipping_cost: 0,
        marketplace_fulfillment_cost: 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Pricing record created')
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
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
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Channel</Label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger>
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((ch) => (
              <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Retail Price (optional)</Label>
        <Input type="number" step="0.01" value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} placeholder="0.00" onFocus={(e) => e.target.select()} />
      </div>
      <Button className="w-full" onClick={() => addPricing.mutate()} disabled={addPricing.isPending}>
        {addPricing.isPending ? 'Adding...' : 'Add Pricing'}
      </Button>
    </div>
  )
}
