import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { Search, TrendingUp, TrendingDown } from 'lucide-react'

type PriceBasis = 'retail' | 'offer' | 'promo' | 'active'

export function ProfitabilityPage() {
  const [search, setSearch] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<string>('all')
  const [priceBasis, setPriceBasis] = useState<PriceBasis>('active')

  const { data: channels } = useQuery({
    queryKey: ['sales-channels'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_channels').select('*').eq('status', 'active')
      if (error) throw error
      return data
    },
  })

  const { data: pricing } = useQuery({
    queryKey: ['profitability-data', selectedChannel],
    queryFn: async () => {
      let query = supabase
        .from('channel_pricing')
        .select('*, product:products(id, name, sku), sales_channel:sales_channels(id, name, commission_percent)')

      if (selectedChannel !== 'all') {
        query = query.eq('channel_id', selectedChannel)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  // Get latest landed cost per product
  const { data: landedCosts } = useQuery({
    queryKey: ['landed-costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_line_items')
        .select('product_id, landed_unit_cost')
        .not('landed_unit_cost', 'is', null)
        .order('created_at', { ascending: false })
      if (error) throw error

      // Get most recent landed cost per product
      const costMap: Record<string, number> = {}
      for (const item of data ?? []) {
        if (!costMap[item.product_id] && item.landed_unit_cost != null) {
          costMap[item.product_id] = item.landed_unit_cost
        }
      }
      return costMap
    },
  })

  function getSelectedPrice(item: any): number | null {
    switch (priceBasis) {
      case 'retail': return item.retail_price
      case 'offer': return item.offer_price
      case 'promo': return item.promo_price
      case 'active':
        if (item.promo_price != null && item.promo_price > 0) return item.promo_price
        if (item.offer_price != null && item.offer_price > 0) return item.offer_price
        if (item.retail_price != null && item.retail_price > 0) return item.retail_price
        return null
    }
  }

  function calculateProfitability(item: any) {
    const selectedPrice = getSelectedPrice(item)
    if (!selectedPrice) return null

    const landedCost = landedCosts?.[item.product?.id] ?? 0
    const commissionPercent = item.sales_channel?.commission_percent ?? 0
    const commissionAmount = selectedPrice * (commissionPercent / 100)
    const fulfillmentCost = item.fulfillment_mode === 'seller_fulfilled'
      ? item.seller_shipping_cost
      : item.marketplace_fulfillment_cost

    const grossProfit = selectedPrice - landedCost - commissionAmount - fulfillmentCost
    const marginPercent = selectedPrice > 0 ? (grossProfit / selectedPrice) * 100 : 0

    return {
      selectedPrice,
      landedCost,
      commissionPercent,
      commissionAmount,
      fulfillmentCost,
      grossProfit,
      marginPercent,
    }
  }

  const analysisData = pricing
    ?.map((item: any) => ({
      ...item,
      analysis: calculateProfitability(item),
    }))
    .filter((item: any) => {
      if (!search) return true
      return (
        item.product?.name.toLowerCase().includes(search.toLowerCase()) ||
        item.product?.sku.toLowerCase().includes(search.toLowerCase())
      )
    })

  const avgMargin = analysisData?.filter((d: any) => d.analysis)
    .reduce((sum: number, d: any, _i: number, arr: any[]) => sum + (d.analysis.marginPercent / arr.length), 0) ?? 0

  const profitableCount = analysisData?.filter((d: any) => d.analysis && d.analysis.grossProfit > 0).length ?? 0
  const unprofitableCount = analysisData?.filter((d: any) => d.analysis && d.analysis.grossProfit <= 0).length ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profitability Analysis</h1>
        <p className="text-muted-foreground">Projected profitability by channel and product</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(avgMargin)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" /> Profitable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{profitableCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" /> Unprofitable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{unprofitableCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
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
        <Select value={priceBasis} onValueChange={(v) => setPriceBasis(v as PriceBasis)}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Price</SelectItem>
            <SelectItem value="retail">Retail</SelectItem>
            <SelectItem value="offer">Offer</SelectItem>
            <SelectItem value="promo">Promo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Analysis Table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Landed Cost</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Fulfillment</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysisData?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No data available. Set up pricing and complete purchases to see profitability.
                  </TableCell>
                </TableRow>
              ) : (
                analysisData?.map((item: any) => {
                  const a = item.analysis
                  if (!a) return null
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.product?.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{item.product?.sku}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.sales_channel?.name}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(a.selectedPrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(a.landedCost)}</TableCell>
                      <TableCell className="text-right">
                        <div>{formatCurrency(a.commissionAmount)}</div>
                        <div className="text-xs text-muted-foreground">{formatPercent(a.commissionPercent)}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(a.fulfillmentCost)}</TableCell>
                      <TableCell className={`text-right font-bold ${a.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(a.grossProfit)}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${a.marginPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(a.marginPercent)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
