import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import {
  Package,
  Warehouse,
  ShoppingCart,
  Truck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  GripVertical,
  Plus,
  Clock,
  DollarSign,
  BarChart3,
  BoxIcon,
  MapPin,
  Plane,
} from 'lucide-react'

const CHART_COLORS = [
  'hsl(0, 72%, 51%)',    // red (primary)
  'hsl(0, 0%, 15%)',     // near-black
  'hsl(0, 0%, 35%)',     // dark gray
  'hsl(0, 0%, 55%)',     // medium gray
  'hsl(0, 72%, 65%)',    // lighter red
  'hsl(0, 0%, 70%)',     // light gray
  'hsl(0, 72%, 40%)',    // dark red
  'hsl(0, 0%, 85%)',     // pale gray
]

const DASHBOARD_STATS_ORDER_KEY = 'tdw.dashboard.stats-order.v1'

export function DashboardPage() {
  const [statOrder, setStatOrder] = useState<string[]>([
    'products',
    'inventory',
    'purchases',
    'suppliers',
    'channels',
    'warehouses',
  ])
  const [draggingStatKey, setDraggingStatKey] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DASHBOARD_STATS_ORDER_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (!Array.isArray(parsed)) return
      const sanitized = parsed.filter((k): k is string => typeof k === 'string')
      if (sanitized.length) {
        setStatOrder(sanitized)
      }
    } catch {
      // ignore invalid local storage payload
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    localStorage.setItem(DASHBOARD_STATS_ORDER_KEY, JSON.stringify(statOrder))
  }, [statOrder])

  // ── Date Range Helper ──
  const getDateRange = (): { start: string; end: string } => {
    const endDate = new Date()
    const startDate = new Date()

    if (dateRange === '7d') {
      startDate.setDate(startDate.getDate() - 7)
    } else if (dateRange === '30d') {
      startDate.setDate(startDate.getDate() - 30)
    } else if (dateRange === '90d') {
      startDate.setDate(startDate.getDate() - 90)
    }

    return {
      start: startDate.toISOString().split('T')[0]!,
      end: endDate.toISOString().split('T')[0]!,
    }
  }

  // ── Stats Queries ──
  const { data: productCount } = useQuery({
    queryKey: ['dashboard-products-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
      return count ?? 0
    },
  })

  const { data: inventoryTotal } = useQuery({
    queryKey: ['dashboard-inventory-total'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('quantity')
      return data?.reduce((sum: number, row: any) => sum + (row.quantity ?? 0), 0) ?? 0
    },
  })

  const { data: purchaseStats } = useQuery({
    queryKey: ['dashboard-purchase-stats'],
    queryFn: async () => {
      const { data } = await supabase.from('purchases').select('id, status')
      const total = data?.length ?? 0
      const draft = data?.filter((p: any) => p.status === 'draft').length ?? 0
      const completed = data?.filter((p: any) => p.status === 'completed').length ?? 0
      return { total, draft, completed }
    },
  })

  const { data: supplierCount } = useQuery({
    queryKey: ['dashboard-suppliers-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('suppliers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
      return count ?? 0
    },
  })

  const { data: channelCount } = useQuery({
    queryKey: ['dashboard-channels-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('sales_channels')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
      return count ?? 0
    },
  })

  const { data: warehouseCount } = useQuery({
    queryKey: ['dashboard-warehouse-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('warehouse_locations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
      return count ?? 0
    },
  })

  // ── Inventory By Location ──
  const { data: inventoryByLocation } = useQuery({
    queryKey: ['dashboard-inventory-by-location'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('quantity, warehouse_location_id, warehouse_locations(name)')
        .gt('quantity', 0)
      const locationMap = new Map<string, { name: string; total: number }>()
      data?.forEach((row: any) => {
        const name = row.warehouse_locations?.name ?? 'Unknown'
        const existing = locationMap.get(name)
        if (existing) {
          existing.total += row.quantity ?? 0
        } else {
          locationMap.set(name, { name, total: row.quantity ?? 0 })
        }
      })
      return Array.from(locationMap.values())
        .sort((a, b) => b.total - a.total)
    },
  })

  // ── Low Stock Products (<=5 units total) ──
  const { data: lowStockProducts } = useQuery({
    queryKey: ['dashboard-low-stock'],
    queryFn: async () => {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('status', 'active')
      if (!products?.length) return []

      const { data: inventory } = await supabase
        .from('inventory')
        .select('product_id, quantity')

      const productTotals = new Map<string, number>()
      inventory?.forEach((row: any) => {
        const current = productTotals.get(row.product_id) ?? 0
        productTotals.set(row.product_id, current + (row.quantity ?? 0))
      })

      return products
        .map((p: any) => ({ ...p, totalQty: productTotals.get(p.id) ?? 0 }))
        .filter((p: any) => p.totalQty <= 5)
        .sort((a: any, b: any) => a.totalQty - b.totalQty)
        .slice(0, 8)
    },
  })

  // ── Recent Purchases ──
  const { data: recentPurchases } = useQuery({
    queryKey: ['dashboard-recent-purchases'],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchases')
        .select('id, invoice_number, status, invoice_date, suppliers(name)')
        .order('created_at', { ascending: false })
        .limit(5)
      return data ?? []
    },
  })

  // ── Recent Inventory Movements ──
  const { data: recentMovements } = useQuery({
    queryKey: ['dashboard-recent-movements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_movements')
        .select('id, quantity, movement_type, created_at, products(name), warehouse_locations!inventory_movements_destination_location_id_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(6)
      return data ?? []
    },
  })

  // ── Top Products by Inventory Value ──
  const { data: topProducts } = useQuery({
    queryKey: ['dashboard-top-products'],
    queryFn: async () => {
      const { data: lineItems } = await supabase
        .from('purchase_line_items')
        .select('product_id, quantity, unit_cost, products(name, sku)')

      if (!lineItems?.length) return []

      const productMap = new Map<string, { name: string; sku: string; totalValue: number; totalQty: number }>()
      lineItems.forEach((item: any) => {
        const key = item.product_id
        const existing = productMap.get(key)
        const value = (item.quantity ?? 0) * (item.unit_cost ?? 0)
        if (existing) {
          existing.totalValue += value
          existing.totalQty += item.quantity ?? 0
        } else {
          productMap.set(key, {
            name: item.products?.name ?? 'Unknown',
            sku: item.products?.sku ?? '',
            totalValue: value,
            totalQty: item.quantity ?? 0,
          })
        }
      })

      return Array.from(productMap.values())
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 5)
    },
  })

  // ── Monthly Purchase Spending ──
  const { data: monthlySpending } = useQuery({
    queryKey: ['dashboard-monthly-spending', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange()

      const { data } = await supabase
        .from('purchases')
        .select('invoice_date, purchase_line_items(quantity, unit_cost)')
        .gte('invoice_date', start)
        .lte('invoice_date', end)

      const dateMap = new Map<string, number>()

      // Pre-fill date range based on selected range
      let current = new Date(start)
      const endDateObj = new Date(end)

      if (dateRange === '7d') {
        while (current <= endDateObj) {
          const key = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          dateMap.set(key, 0)
          current.setDate(current.getDate() + 1)
        }
      } else {
        while (current <= endDateObj) {
          const key = current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          if (!dateMap.has(key)) {
            dateMap.set(key, 0)
          }
          current.setMonth(current.getMonth() + 1)
        }
      }

      data?.forEach((purchase: any) => {
        const date = new Date(purchase.invoice_date)
        let key: string
        if (dateRange === '7d') {
          key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        } else {
          key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        }
        const purchaseTotal = (purchase.purchase_line_items ?? []).reduce(
          (sum: number, li: any) => sum + (li.quantity ?? 0) * (li.unit_cost ?? 0),
          0
        )
        dateMap.set(key, (dateMap.get(key) ?? 0) + purchaseTotal)
      })

      // Sort dates chronologically (oldest to newest)
      const sortedEntries = Array.from(dateMap.entries()).sort((a, b) => {
        const dateA = new Date(a[0])
        const dateB = new Date(b[0])
        return dateA.getTime() - dateB.getTime()
      })
      return sortedEntries.map(([date, total]) => ({ month: date, total }))
    },
  })

  // ── Inventory Distribution for Pie Chart ──
  const { data: inventoryPieData } = useQuery({
    queryKey: ['dashboard-inventory-pie'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory')
        .select('quantity, warehouse_locations(name)')
        .gt('quantity', 0)

      const locationMap = new Map<string, number>()
      data?.forEach((row: any) => {
        const name = row.warehouse_locations?.name ?? 'Unknown'
        locationMap.set(name, (locationMap.get(name) ?? 0) + (row.quantity ?? 0))
      })

      return Array.from(locationMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    },
  })

  // ── Active Shipments ──
  const { data: activeShipments } = useQuery({
    queryKey: ['dashboard-active-shipments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipment_tracking')
        .select('id, status, carrier, tracking_number, estimated_arrival, origin_country, purchase:purchases(invoice_number, supplier:suppliers(name))')
        .neq('status', 'received')
        .order('estimated_arrival', { ascending: true })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  // ── Estimated Recoverable Tax ──
  const { data: estimatedRecoveryTax } = useQuery({
    queryKey: ['dashboard-estimated-recovery-tax'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_line_items')
        .select('tax_amount, tax_recoverability')
      if (error) throw error
      return (data ?? []).reduce((sum: number, row: any) => {
        if (row.tax_recoverability !== 'recoverable') return sum
        return sum + (Number(row.tax_amount) || 0)
      }, 0)
    },
  })

  const stats = [
    { key: 'products', name: 'Active Products', value: productCount ?? 0, icon: Package, href: '/products', color: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10' },
    { key: 'inventory', name: 'Total Inventory', value: inventoryTotal ?? 0, icon: BoxIcon, href: '/inventory', color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500/10' },
    { key: 'purchases', name: 'Total Purchases', value: purchaseStats?.total ?? 0, icon: ShoppingCart, href: '/purchases', color: 'from-violet-500 to-violet-600', bg: 'bg-violet-500/10' },
    { key: 'suppliers', name: 'Active Suppliers', value: supplierCount ?? 0, icon: Truck, href: '/suppliers', color: 'from-amber-500 to-amber-600', bg: 'bg-amber-500/10' },
    { key: 'channels', name: 'Sales Channels', value: channelCount ?? 0, icon: BarChart3, href: '/sales-channels', color: 'from-rose-500 to-rose-600', bg: 'bg-rose-500/10' },
    { key: 'warehouses', name: 'Warehouses', value: warehouseCount ?? 0, icon: Warehouse, href: '/settings', color: 'from-cyan-500 to-cyan-600', bg: 'bg-cyan-500/10' },
  ]

  const orderedStats = [...stats].sort((a, b) => {
    const aIndex = statOrder.indexOf(a.key)
    const bIndex = statOrder.indexOf(b.key)
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex
    return safeA - safeB
  })

  function reorderStatCard(fromKey: string, toKey: string) {
    setStatOrder((prev) => {
      const current = [...prev]
      const fromIdx = current.indexOf(fromKey)
      const toIdx = current.indexOf(toKey)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev

      const moved = current.splice(fromIdx, 1)[0]
      if (!moved) return prev
      current.splice(toIdx, 0, moved)
      return current
    })
  }

  const movementTypeLabels: Record<string, { label: string; icon: typeof TrendingUp; color: string }> = {
    purchase_allocation: { label: 'Purchase', icon: ShoppingCart, color: 'text-blue-600' },
    transfer: { label: 'Transfer', icon: ArrowRight, color: 'text-violet-600' },
    adjustment_increase: { label: 'Increase', icon: TrendingUp, color: 'text-emerald-600' },
    adjustment_decrease: { label: 'Decrease', icon: TrendingDown, color: 'text-red-600' },
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Welcome back</p>
          <h1 className="text-5xl font-black tracking-tight">OpsCore</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/products">
            <Button variant="outline" size="sm" className="shadow-soft">
              <Plus className="h-4 w-4 mr-1" /> Product
            </Button>
          </Link>
          <Link to="/purchases">
            <Button size="sm" className="shadow-soft">
              <Plus className="h-4 w-4 mr-1" /> Purchase
            </Button>
          </Link>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground py-2">Filter by:</span>
        <Button
          variant={dateRange === '7d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDateRange('7d')}
        >
          Last 7 days
        </Button>
        <Button
          variant={dateRange === '30d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDateRange('30d')}
        >
          Last 30 days
        </Button>
        <Button
          variant={dateRange === '90d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setDateRange('90d')}
        >
          Last 90 days
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tax-recovery">Tax Recovery</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8">

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {orderedStats.map((stat, i) => (
          <div
            key={stat.key}
            draggable
            onDragStart={(e) => {
              setDraggingStatKey(stat.key)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', stat.key)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              e.preventDefault()
              const fromKey = draggingStatKey ?? e.dataTransfer.getData('text/plain')
              if (fromKey && fromKey !== stat.key) {
                reorderStatCard(fromKey, stat.key)
              }
              setDraggingStatKey(null)
            }}
            onDragEnd={() => setDraggingStatKey(null)}
            className={draggingStatKey === stat.key ? 'opacity-50' : ''}
          >
            <Link to={stat.href}>
              <Card className="group relative overflow-hidden hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-transparent" style={{ animationDelay: `${i * 50}ms` }}>
                <CardContent className="p-5">
                  <div className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity bg-background/70">
                    <GripVertical className="h-3.5 w-3.5" />
                    Drag
                  </div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{stat.name}</p>
                      <p className="text-2xl font-bold mt-2 tabular-nums">{stat.value.toLocaleString()}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                      <stat.icon className={`h-4 w-4 bg-gradient-to-br ${stat.color} bg-clip-text text-transparent`} style={{ color: `var(--tw-gradient-from)` }} />
                    </div>
                  </div>
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${stat.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                </CardContent>
              </Card>
            </Link>
          </div>
        ))}
      </div>

      {/* Draft Purchases Banner */}
      {(purchaseStats?.draft ?? 0) > 0 && (
        <Card className="border-amber-200/50 bg-gradient-to-r from-amber-50/80 to-orange-50/30 hover:shadow-soft">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2.5 bg-amber-100 text-amber-700">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  You have {purchaseStats?.draft} draft purchase{purchaseStats?.draft === 1 ? '' : 's'} pending completion
                </p>
                <p className="text-xs text-muted-foreground">Complete purchases to update inventory and landed costs</p>
              </div>
            </div>
            <Link to="/purchases">
              <Button variant="outline" size="sm">
                View Purchases <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Main Grid: 2 columns */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-7 w-full">
        {/* Left Column - 4/7 */}
        <div className="lg:col-span-4 space-y-4 md:space-y-6 min-w-0">
          {/* Purchase Spending Trend */}
          <Card className="overflow-hidden w-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Purchase Spending Trend</CardTitle>
                <Link to="/purchases" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(!monthlySpending || monthlySpending.every(m => m.total === 0)) ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No purchase data yet</p>
                  <p className="text-xs mt-1">Create purchases to see spending trends</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={monthlySpending} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(0, 0%, 60%)" tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(0, 0%, 60%)" tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.12)', fontSize: 13, padding: '8px 12px' }}
                      formatter={(value: any) => [formatCurrency(Number(value)), 'Spending']}
                    />
                    <Area type="monotone" dataKey="total" stroke="hsl(0, 72%, 51%)" strokeWidth={2} fill="url(#spendGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Inventory by Warehouse - Bar Chart */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inventory by Warehouse</CardTitle>
                <Link to="/inventory" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(!inventoryByLocation || inventoryByLocation.length === 0) ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Warehouse className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No inventory data yet</p>
                  <p className="text-xs mt-1">Add products and purchases to see inventory distribution</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, inventoryByLocation.length * 40)}>
                  <BarChart data={inventoryByLocation} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(0, 0%, 60%)" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={isMobile ? 60 : 100} tick={{ fontSize: 11 }} stroke="hsl(0, 0%, 60%)" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.12)', fontSize: 13, padding: '8px 12px' }}
                      formatter={(value: any) => [Number(value).toLocaleString() + ' units', 'Quantity']}
                    />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {inventoryByLocation.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Products by Purchase Value */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top Products by Purchase Value</CardTitle>
                <Link to="/products" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(!topProducts || topProducts.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No purchase data yet</p>
                  <p className="text-xs mt-1">Create purchases to see top products</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={topProducts.length * 48}>
                  <BarChart data={topProducts} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(0, 0%, 60%)" tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={isMobile ? 60 : 120} tick={{ fontSize: 11 }} stroke="hsl(0, 0%, 60%)" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.12)', fontSize: 13, padding: '8px 12px' }}
                      formatter={(value: any) => [formatCurrency(Number(value)), 'Value']}
                    />
                    <Bar dataKey="totalValue" radius={[0, 4, 4, 0]} maxBarSize={22} fill="hsl(0, 72%, 51%)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - 3/7 */}
        <div className="lg:col-span-3 space-y-4 md:space-y-6 min-w-0">
          {/* Inventory Distribution Donut */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Inventory Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {(!inventoryPieData || inventoryPieData.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BoxIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No inventory data yet</p>
                </div>
              ) : (
                <div>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={inventoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {inventoryPieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.12)', fontSize: 13, padding: '8px 12px' }}
                        formatter={(value: any) => [Number(value).toLocaleString() + ' units', 'Quantity']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 sm:gap-x-4 gap-y-1.5 mt-2">
                    {inventoryPieData.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2 text-xs min-w-0">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{item.name}</span>
                        <span className="ml-auto font-medium tabular-nums shrink-0">{item.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Purchase Status Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Purchase Status</CardTitle>
            </CardHeader>
            <CardContent>
              {(!purchaseStats || purchaseStats.total === 0) ? (
                <div className="text-center py-6 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No purchases yet</p>
                </div>
              ) : (
                <div>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Completed', value: purchaseStats.completed },
                          { name: 'Draft', value: purchaseStats.draft },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill="hsl(0, 72%, 51%)" />
                        <Cell fill="hsl(0, 0%, 75%)" />
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -4px rgba(0,0,0,0.12)', fontSize: 13, padding: '8px 12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-3 md:gap-6 mt-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'hsl(0, 72%, 51%)' }} />
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-semibold">{purchaseStats.completed}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'hsl(0, 0%, 75%)' }} />
                      <span className="text-muted-foreground">Draft</span>
                      <span className="font-semibold">{purchaseStats.draft}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock Alerts */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Low Stock Alerts
                </CardTitle>
                <Link to="/inventory" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(!lowStockProducts || lowStockProducts.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">All products are well stocked</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {lowStockProducts.map((product: any) => (
                    <Link
                      key={product.id}
                      to={`/products/${product.id}`}
                      className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-accent/70 transition-all duration-200"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                      <Badge variant={product.totalQty === 0 ? 'destructive' : 'outline'}>
                        {product.totalQty === 0 ? 'Out of stock' : `${product.totalQty} left`}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Purchases */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent Purchases</CardTitle>
                <Link to="/purchases" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(!recentPurchases || recentPurchases.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No purchases yet</p>
                  <Link to="/purchases">
                    <Button variant="outline" size="sm" className="mt-2">
                      <Plus className="h-3 w-3 mr-1" /> Create Purchase
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentPurchases.map((purchase: any) => (
                    <Link
                      key={purchase.id}
                      to={`/purchases/${purchase.id}`}
                      className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-accent/70 transition-all duration-200"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{purchase.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {purchase.suppliers?.name} · {new Date(purchase.invoice_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={purchase.status === 'completed' ? 'success' : 'secondary'}>
                        {purchase.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipment Tracking */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Plane className="h-4 w-4 text-blue-500" />
                  In-Transit Shipments
                </CardTitle>
                <Link to="/tracking" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(!activeShipments || activeShipments.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active shipments</p>
                  <Link to="/tracking">
                    <Button variant="outline" size="sm" className="mt-2">
                      <Plus className="h-3 w-3 mr-1" /> Track Shipment
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeShipments.map((s: any) => {
                    const isDelayed = s.estimated_arrival && new Date(s.estimated_arrival) < new Date()
                    const statusLabels: Record<string, string> = {
                      ordered: 'Ordered',
                      shipped: 'Shipped',
                      in_transit: 'In Transit',
                      customs: 'Customs',
                      delivered: 'Delivered',
                    }
                    return (
                      <Link
                        key={s.id}
                        to="/tracking"
                        className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-accent/70 transition-all duration-200"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.purchase?.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.purchase?.supplier?.name}{s.origin_country ? ` · ${s.origin_country}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant={isDelayed ? 'destructive' : 'outline'} className="text-[10px]">
                            {statusLabels[s.status] ?? s.status}
                          </Badge>
                          {s.estimated_arrival && (
                            <p className={`text-[10px] mt-0.5 ${isDelayed ? 'text-red-500' : 'text-muted-foreground'}`}>
                              ETA {new Date(s.estimated_arrival).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {(!recentMovements || recentMovements.length === 0) ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No inventory movements yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentMovements.map((movement: any) => {
                    const typeInfo = movementTypeLabels[movement.movement_type] ?? {
                      label: movement.movement_type,
                      icon: ArrowRight,
                      color: 'text-muted-foreground',
                    }
                    const TypeIcon = typeInfo.icon
                    return (
                      <div key={movement.id} className="flex items-start gap-3">
                        <div className={`mt-0.5 ${typeInfo.color}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className="font-medium">{typeInfo.label}</span>
                            {' · '}
                            <span className="text-muted-foreground">{movement.quantity} units</span>
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {movement.products?.name ?? 'Unknown product'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(movement.created_at).toLocaleDateString()} {new Date(movement.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="tax-recovery" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Estimated Recovery Tax</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold tabular-nums">{formatCurrency(estimatedRecoveryTax ?? 0)}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                This is the sum of all recoverable line-item taxes across purchase invoices.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
