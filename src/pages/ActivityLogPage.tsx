import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
import { exportToCSV } from '@/lib/csv'
import { toast } from 'sonner'

export function ActivityLogPage() {
  const [movementType, setMovementType] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: movements, isLoading } = useQuery({
    queryKey: ['activity-log', movementType, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select('*, product:products(name, sku), source_location:warehouse_locations!inventory_movements_source_location_id_fkey(name), destination_location:warehouse_locations!inventory_movements_destination_location_id_fkey(name), created_by_user:users!inventory_movements_created_by_fkey(full_name)')

      if (movementType !== 'all') {
        query = query.eq('movement_type', movementType)
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom)
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59')
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data
    },
  })

  const typeColors: Record<string, string> = {
    adjustment_in: 'success',
    adjustment_out: 'destructive',
    transfer: 'default',
    purchase: 'success',
    sale: 'secondary',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-muted-foreground">Track all inventory movements and changes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          if (!movements?.length) return
          exportToCSV(movements.map((m: any) => ({
            date: new Date(m.created_at).toLocaleString(),
            product: m.product?.name ?? '',
            sku: m.product?.sku ?? '',
            type: m.movement_type,
            from: m.source_location?.name ?? '',
            to: m.destination_location?.name ?? '',
            quantity: m.quantity,
            reason: m.reason ?? '',
            user: m.created_by_user?.full_name ?? '',
          })), 'activity-log', [
            { key: 'date', header: 'Date' },
            { key: 'product', header: 'Product' },
            { key: 'sku', header: 'SKU' },
            { key: 'type', header: 'Type' },
            { key: 'from', header: 'From' },
            { key: 'to', header: 'To' },
            { key: 'quantity', header: 'Quantity' },
            { key: 'reason', header: 'Reason' },
            { key: 'user', header: 'User' },
          ])
          toast.success('Activity log exported')
        }} disabled={!movements?.length}>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={movementType} onValueChange={setMovementType}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="adjustment_in">Adjustment In</SelectItem>
            <SelectItem value="adjustment_out">Adjustment Out</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="sale">Sale</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[calc(50%-6px)] sm:w-[160px]" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[calc(50%-6px)] sm:w-[160px]" />
        <span className="text-sm text-muted-foreground">{movements?.length ?? 0} entries</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No activity found
                    </TableCell>
                  </TableRow>
                ) : (
                  movements?.map((mov: any) => (
                    <TableRow key={mov.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(mov.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{mov.product?.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{mov.product?.sku}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={(typeColors[mov.movement_type] as any) ?? 'default'}>
                          {mov.movement_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{mov.source_location?.name ?? '—'}</TableCell>
                      <TableCell>{mov.destination_location?.name ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono">{mov.quantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{mov.reason ?? '—'}</TableCell>
                      <TableCell className="text-sm">{mov.created_by_user?.full_name ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
