import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Download, Trash2, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { exportToCSV } from '@/lib/csv'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { logDashboardActivity } from '@/lib/audit'

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<any>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', search, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('suppliers')
        .select('*')
        .order('name')

      if (search) {
        query = query.or(`name.ilike.%${search}%,short_name.ilike.%${search}%`)
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })

  const deleteSupplier = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      // Check if supplier has any purchases
      const { data: purchases, error: checkError } = await supabase
        .from('purchases')
        .select('id')
        .eq('supplier_id', id)
        .limit(1)
      
      if (checkError) throw checkError
      if (purchases && purchases.length > 0) {
        throw new Error(`Cannot delete supplier "${name}" - they have ${purchases.length} purchase(s) associated. Delete or reassign purchases first.`)
      }

      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
      return { id, name }
    },
    onSuccess: async ({ id, name }) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      if (user) {
        await logDashboardActivity({
          entityType: 'supplier',
          action: 'delete',
          userId: user.id,
          entityId: id,
          description: `Deleted supplier ${name}`,
          metadata: { supplier_name: name },
        })
      }
      toast.success('Supplier deleted')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete supplier')
    },
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage your suppliers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            if (!suppliers?.length) return
            exportToCSV(suppliers, 'suppliers', [
              { key: 'name', header: 'Name' },
              { key: 'short_name', header: 'Short Name' },
              { key: 'email', header: 'Email' },
              { key: 'phone', header: 'Phone' },
              { key: 'status', header: 'Status' },
              { key: 'notes', header: 'Notes' },
            ])
            toast.success('Suppliers exported')
          }} disabled={!suppliers?.length}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingSupplier(null) }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
            </DialogHeader>
            <SupplierForm
              defaultValues={editingSupplier}
              onSuccess={() => { setDialogOpen(false); setEditingSupplier(null) }}
            />
          </DialogContent>
          </Dialog>
          <Dialog open={bulkImportOpen} onOpenChange={setBulkImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Bulk Import
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Bulk Import Suppliers</DialogTitle>
              </DialogHeader>
              <BulkSupplierImportForm onSuccess={() => setBulkImportOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
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
        {suppliers && (
          <span className="text-sm text-muted-foreground">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</span>
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
                <TableHead>Name</TableHead>
                <TableHead>Short Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No suppliers found.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers?.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>{supplier.short_name ?? '—'}</TableCell>
                    <TableCell>{supplier.email ?? '—'}</TableCell>
                    <TableCell>{supplier.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.status === 'active' ? 'success' : 'secondary'}>
                        {supplier.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditingSupplier(supplier)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (!confirm(`Permanently delete supplier "${supplier.name}"? This cannot be undone.`)) return
                            deleteSupplier.mutate({ id: supplier.id, name: supplier.name })
                          }}
                          disabled={deleteSupplier.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

function SupplierForm({ defaultValues, onSuccess }: { defaultValues?: any; onSuccess: () => void }) {
  const [name, setName] = useState(defaultValues?.name ?? '')
  const [shortName, setShortName] = useState(defaultValues?.short_name ?? '')
  const [email, setEmail] = useState(defaultValues?.email ?? '')
  const [phone, setPhone] = useState(defaultValues?.phone ?? '')
  const [notes, setNotes] = useState(defaultValues?.notes ?? '')
  const [status, setStatus] = useState<string>(defaultValues?.status ?? 'active')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Name is required')

      const payload: {
        name: string
        short_name: string | null
        email: string | null
        phone: string | null
        notes: string | null
        status: 'active' | 'inactive'
      } = {
        name: name.trim(),
        short_name: shortName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        status: status as 'active' | 'inactive',
      }

      if (defaultValues?.id) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', defaultValues.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success(defaultValues ? 'Supplier updated' : 'Supplier created')
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Supplier name" />
      </div>
      <div className="space-y-2">
        <Label>Short Name</Label>
        <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Abbreviation" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 8900" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : defaultValues ? 'Update Supplier' : 'Create Supplier'}
      </Button>
    </div>
  )
}

function BulkSupplierImportForm({ onSuccess }: { onSuccess: () => void }) {
  const [csvContent, setCsvContent] = useState('')
  const [fileName, setFileName] = useState<string>('')
  const [preview, setPreview] = useState<any[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setPreview([])
    setErrors([])

    try {
      const text = await file.text()
      setCsvContent(text)
      // Auto-parse on file upload
      parsePreviewFromContent(text)
    } catch (error) {
      setErrors(['Failed to read file: ' + (error instanceof Error ? error.message : 'Unknown error')])
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!csvContent.trim()) throw new Error('Please upload a CSV file')
      
      // Parse CSV manually (simple parser for comma-separated values)
      const lines = csvContent.trim().split('\n')
      if (lines.length < 2) throw new Error('CSV must have at least a header and one data row')

      // Parse header
      const headerLine = lines[0]
      if (!headerLine) throw new Error('CSV header is missing')
      
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase())
      const nameIdx = headers.indexOf('name')
      const emailIdx = headers.indexOf('email')
      const phoneIdx = headers.indexOf('phone')
      const shortNameIdx = headers.indexOf('short_name') >= 0 ? headers.indexOf('short_name') : headers.indexOf('short name')
      const notesIdx = headers.indexOf('notes')

      if (nameIdx < 0) throw new Error('CSV must have a "name" column')

      // Parse data rows
      const suppliers: any[] = []
      const parseErrors: string[] = []

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line || !line.trim()) continue // Skip empty lines

        const cols = line.split(',').map(c => c.trim())
        const name = cols[nameIdx]

        if (!name) {
          parseErrors.push(`Row ${i + 1}: Name is required`)
          continue
        }

        suppliers.push({
          name: name,
          short_name: shortNameIdx >= 0 && cols[shortNameIdx] ? cols[shortNameIdx] : null,
          email: emailIdx >= 0 && cols[emailIdx] ? cols[emailIdx] : null,
          phone: phoneIdx >= 0 && cols[phoneIdx] ? cols[phoneIdx] : null,
          notes: notesIdx >= 0 && cols[notesIdx] ? cols[notesIdx] : null,
          status: 'active',
        })
      }

      if (parseErrors.length > 0) {
        setErrors(parseErrors)
        throw new Error(`${parseErrors.length} row(s) had errors. Check details below.`)
      }

      if (suppliers.length === 0) throw new Error('No valid suppliers found in CSV')

      // Bulk insert
      const { error } = await supabase.from('suppliers').insert(suppliers)
      if (error) throw error

      // Log activity
      if (user) {
        await logDashboardActivity({
          entityType: 'supplier',
          action: 'bulk_create',
          userId: user.id,
          description: `Bulk imported ${suppliers.length} suppliers`,
          metadata: { count: suppliers.length },
        })
      }

      return suppliers
    },
    onSuccess: async (suppliers) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success(`Successfully imported ${suppliers.length} suppliers`)
      onSuccess()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const parsePreviewFromContent = (content: string) => {
    const lines = content.trim().split('\n')
    if (lines.length < 2) {
      setErrors(['CSV must have at least a header and one data row'])
      setPreview([])
      return
    }

    const headerLine = lines[0]
    if (!headerLine) {
      setErrors(['CSV header is missing'])
      setPreview([])
      return
    }

    const headers = headerLine.split(',').map(h => h.trim().toLowerCase())
    const nameIdx = headers.indexOf('name')
    const emailIdx = headers.indexOf('email')
    const phoneIdx = headers.indexOf('phone')
    const shortNameIdx = headers.indexOf('short_name') >= 0 ? headers.indexOf('short_name') : headers.indexOf('short name')

    if (nameIdx < 0) {
      setErrors(['CSV must have a "name" column'])
      setPreview([])
      return
    }

    const rows: any[] = []
    const newErrors: string[] = []

    for (let i = 1; i < Math.min(6, lines.length); i++) {
      const line = lines[i]
      if (!line || !line.trim()) continue

      const cols = line.split(',').map(c => c.trim())
      const name = cols[nameIdx]

      if (!name) {
        newErrors.push(`Row ${i + 1}: Name is required`)
        continue
      }

      rows.push({
        name: name,
        short_name: shortNameIdx >= 0 && cols[shortNameIdx] ? cols[shortNameIdx] : '—',
        email: emailIdx >= 0 && cols[emailIdx] ? cols[emailIdx] : '—',
        phone: phoneIdx >= 0 && cols[phoneIdx] ? cols[phoneIdx] : '—',
      })
    }

    setErrors(newErrors)
    setPreview(rows)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>CSV File</Label>
        <p className="text-xs text-muted-foreground">
          Required columns: <code className="bg-muted px-1 rounded">name</code>
        </p>
        <p className="text-xs text-muted-foreground">
          Optional columns: <code className="bg-muted px-1 rounded">short_name</code>, <code className="bg-muted px-1 rounded">email</code>, <code className="bg-muted px-1 rounded">phone</code>, <code className="bg-muted px-1 rounded">notes</code>
        </p>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground hover:file:bg-accent cursor-pointer flex-1"
          />
          {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded p-3 space-y-1">
          <p className="text-sm font-medium text-destructive">Errors:</p>
          {errors.slice(0, 5).map((err, idx) => (
            <p key={idx} className="text-xs text-destructive">{err}</p>
          ))}
          {errors.length > 5 && <p className="text-xs text-muted-foreground">+{errors.length - 5} more</p>}
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Preview ({preview.length} rows)</p>
          <div className="rounded border overflow-x-auto max-h-48 overflow-y-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Short Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.short_name}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.phone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || preview.length === 0}>
        {mutation.isPending ? 'Importing...' : `Import ${preview.length} Suppliers`}
      </Button>
    </div>
  )
}
