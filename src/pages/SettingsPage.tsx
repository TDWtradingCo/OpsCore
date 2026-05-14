import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

export function SettingsPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage system configuration</p>
      </div>

      <Tabs defaultValue="warehouses">
        <TabsList>
          <TabsTrigger value="warehouses">Warehouse Locations</TabsTrigger>
          <TabsTrigger value="channels">Sales Channels</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
        </TabsList>

        <TabsContent value="warehouses">
          <WarehouseSettings isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="channels">
          <ChannelSettings isAdmin={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users">
            <UserSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function WarehouseSettings({ isAdmin }: { isAdmin: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const queryClient = useQueryClient()

  const { data: locations } = useQuery({
    queryKey: ['warehouse-locations-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouse_locations').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const addLocation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('Name is required')
      const { error } = await supabase.from('warehouse_locations').insert({ name: newName.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] })
      toast.success('Location added')
      setNewName('')
      setDialogOpen(false)
    },
    onError: (error) => toast.error(error.message),
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = (status === 'active' ? 'inactive' : 'active') as 'active' | 'inactive'
      const { error } = await supabase.from('warehouse_locations').update({ status: newStatus }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse-locations'] })
      toast.success('Status updated')
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Warehouse Locations</CardTitle>
          <CardDescription>Manage inventory storage locations</CardDescription>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Location
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Warehouse Location</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Location Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., WFS CA" />
                </div>
                <Button className="w-full" onClick={() => addLocation.mutate()} disabled={addLocation.isPending}>
                  {addLocation.isPending ? 'Adding...' : 'Add Location'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations?.map((loc) => (
              <TableRow key={loc.id}>
                <TableCell className="font-medium">{loc.name}</TableCell>
                <TableCell>
                  <Badge variant={loc.status === 'active' ? 'success' : 'secondary'}>{loc.status}</Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleStatus.mutate({ id: loc.id, status: loc.status })}
                    >
                      {loc.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ChannelSettings({ isAdmin }: { isAdmin: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCommission, setNewCommission] = useState('15')
  const queryClient = useQueryClient()

  const { data: channels } = useQuery({
    queryKey: ['sales-channels-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_channels').select('*').order('name')
      if (error) throw error
      return data
    },
  })

  const addChannel = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('Name is required')
      const { error } = await supabase.from('sales_channels').insert({
        name: newName.trim(),
        commission_percent: parseFloat(newCommission),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-channels'] })
      toast.success('Channel added')
      setNewName('')
      setNewCommission('15')
      setDialogOpen(false)
    },
    onError: (error) => toast.error(error.message),
  })

  const updateCommission = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase.from('sales_channels').update({ commission_percent: value }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-channels'] })
      toast.success('Commission updated')
    },
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Sales Channels</CardTitle>
          <CardDescription>Manage channels and commission rates</CardDescription>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Sales Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Channel Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Amazon" />
                </div>
                <div className="space-y-2">
                  <Label>Commission %</Label>
                  <Input type="number" step="0.1" value={newCommission} onChange={(e) => setNewCommission(e.target.value)} onFocus={(e) => e.target.select()} />
                </div>
                <Button className="w-full" onClick={() => addChannel.mutate()} disabled={addChannel.isPending}>
                  {addChannel.isPending ? 'Adding...' : 'Add Channel'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Commission %</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels?.map((ch) => (
              <TableRow key={ch.id}>
                <TableCell className="font-medium">{ch.name}</TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Input
                      type="number"
                      step="0.1"
                      className="w-20 h-8"
                      defaultValue={ch.commission_percent}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value)
                        if (!isNaN(val) && val !== ch.commission_percent) {
                          updateCommission.mutate({ id: ch.id, value: val })
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  ) : (
                    `${ch.commission_percent}%`
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={ch.status === 'active' ? 'success' : 'secondary'}>{ch.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function UserSettings() {
  const queryClient = useQueryClient()

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'admin' | 'standard' }) => {
      const { error } = await supabase.from('users').update({ role }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Role updated')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Manage user roles and permissions</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name ?? '—'}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    onValueChange={(role) => updateRole.mutate({ id: user.id, role: role as 'admin' | 'standard' })}
                  >
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
