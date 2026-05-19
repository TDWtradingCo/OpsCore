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
  const [entityType, setEntityType] = useState<string>('all')
  const [actionType, setActionType] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: activityLogs, isLoading } = useQuery({
    queryKey: ['dashboard-activity-log', entityType, actionType, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('dashboard_activity_log')
        .select('*, user:users(full_name, email)')

      if (entityType !== 'all') {
        query = query.eq('entity_type', entityType)
      }
      if (actionType !== 'all') {
        query = query.eq('action', actionType)
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom)
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59')
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data ?? []
    },
  })

  const typeColors: Record<string, string> = {
    create: 'success',
    update: 'default',
    delete: 'destructive',
    complete: 'secondary',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-muted-foreground">Track all inventory movements and changes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          if (!activityLogs?.length) return
          exportToCSV(activityLogs.map((m: any) => ({
            date: new Date(m.created_at).toLocaleString(),
            entity: m.entity_type,
            action: m.action,
            description: m.description ?? '',
            user: m.user?.full_name ?? m.user?.email ?? '',
            metadata: m.metadata ? JSON.stringify(m.metadata) : '',
          })), 'activity-log', [
            { key: 'date', header: 'Date' },
            { key: 'entity', header: 'Entity' },
            { key: 'action', header: 'Action' },
            { key: 'description', header: 'Description' },
            { key: 'user', header: 'User' },
            { key: 'metadata', header: 'Metadata' },
          ])
          toast.success('Activity log exported')
        }} disabled={!activityLogs?.length}>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="product">Product</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="purchase_line_item">Purchase Line Item</SelectItem>
            <SelectItem value="purchase_additional_cost">Additional Cost</SelectItem>
            <SelectItem value="purchase_allocation">Allocation</SelectItem>
            <SelectItem value="inventory_adjustment">Inventory Adjustment</SelectItem>
            <SelectItem value="inventory_transfer">Inventory Transfer</SelectItem>
            <SelectItem value="warehouse_location">Warehouse Location</SelectItem>
            <SelectItem value="sales_channel">Sales Channel</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[calc(50%-6px)] sm:w-[160px]" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[calc(50%-6px)] sm:w-[160px]" />
        <span className="text-sm text-muted-foreground">{activityLogs?.length ?? 0} entries</span>
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
                  <TableHead>Entity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityLogs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No activity found
                    </TableCell>
                  </TableRow>
                ) : (
                  activityLogs?.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium capitalize">{(log.entity_type ?? '').replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant={(typeColors[log.action] as any) ?? 'default'}>
                          {(log.action ?? '').replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[320px] truncate">{log.description ?? '—'}</TableCell>
                      <TableCell className="text-sm">{log.user?.full_name ?? log.user?.email ?? '—'}</TableCell>
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
