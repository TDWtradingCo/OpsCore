import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Package,
  Truck,
  Plane,
  Shield,
  MapPin,
  CheckCircle2,
  Plus,
  ArrowRight,
  Clock,
  Globe,
} from 'lucide-react'
import { toast } from 'sonner'

const STATUSES = [
  { key: 'ordered', label: 'Ordered', icon: Package, color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { key: 'shipped', label: 'Shipped', icon: Truck, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'in_transit', label: 'In Transit', icon: Plane, color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'customs', label: 'Customs', icon: Shield, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'delivered', label: 'Delivered', icon: MapPin, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'received', label: 'Received', icon: CheckCircle2, color: 'bg-green-50 text-green-700 border-green-200' },
] as const



export function ShipmentTrackingPage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data: shipments, isLoading } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipment_tracking')
        .select('*, purchase:purchases(id, invoice_number, supplier:suppliers(name, country, city))')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const { data: events } = useQuery({
    queryKey: ['shipment-events', selectedShipment?.id],
    queryFn: async () => {
      if (!selectedShipment) return []
      const { data, error } = await supabase
        .from('shipment_events')
        .select('*, created_by_user:users(full_name)')
        .eq('shipment_id', selectedShipment.id)
        .order('event_date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!selectedShipment,
  })

  const shipmentsByStatus = STATUSES.map((status) => ({
    ...status,
    shipments: shipments?.filter((s: any) => s.status === status.key) ?? [],
  }))

  const activeShipments = shipments?.filter((s: any) => s.status !== 'received').length ?? 0
  const delayedShipments = shipments?.filter((s: any) => {
    if (!s.estimated_arrival || s.status === 'received') return false
    return new Date(s.estimated_arrival) < new Date()
  }).length ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shipment Tracking</h1>
          <p className="text-muted-foreground">Track purchase orders from supplier to warehouse</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Track Shipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Shipment Tracking</DialogTitle>
            </DialogHeader>
            <AddShipmentForm onSuccess={() => {
              setAddDialogOpen(false)
              queryClient.invalidateQueries({ queryKey: ['shipments'] })
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-transparent">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-2.5 bg-blue-500/10">
              <Truck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{activeShipments}</p>
              <p className="text-xs text-muted-foreground font-medium">Active Shipments</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-transparent">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-2.5 bg-amber-500/10">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600 tabular-nums">{delayedShipments}</p>
              <p className="text-xs text-muted-foreground font-medium">Delayed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-transparent">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-2.5 bg-violet-500/10">
              <Globe className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {new Set(shipments?.map((s: any) => s.origin_country).filter(Boolean)).size}
              </p>
              <p className="text-xs text-muted-foreground font-medium">Origin Countries</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-transparent">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-2.5 bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {shipments?.filter((s: any) => s.status === 'received').length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground font-medium">Received</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
        </TabsList>

        {/* Pipeline/Kanban View */}
        <TabsContent value="pipeline">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {shipmentsByStatus.map((stage) => {
                const Icon = stage.icon
                return (
                  <div key={stage.key} className="space-y-2">
                    <div className={`rounded-lg px-3 py-2 border ${stage.color} flex items-center gap-2`}>
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">{stage.label}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
                        {stage.shipments.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 min-h-[100px]">
                      {stage.shipments.map((shipment: any) => (
                        <ShipmentCard
                          key={shipment.id}
                          shipment={shipment}
                          onClick={() => setSelectedShipment(shipment)}
                        />
                      ))}
                      {stage.shipments.length === 0 && (
                        <div className="border border-dashed rounded-md p-3 text-center">
                          <p className="text-[10px] text-muted-foreground">No shipments</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* List View */}
        <TabsContent value="list">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {shipments?.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No shipments tracked yet</p>
                    <p className="text-sm mt-1">Click "Track Shipment" to start tracking a purchase order</p>
                  </div>
                ) : (
                  shipments?.map((shipment: any) => (
                    <ShipmentListRow
                      key={shipment.id}
                      shipment={shipment}
                      onClick={() => setSelectedShipment(shipment)}
                    />
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shipment Detail Dialog */}
      <Dialog open={!!selectedShipment} onOpenChange={(open) => !open && setSelectedShipment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Shipment Details</DialogTitle>
          </DialogHeader>
          {selectedShipment && (
            <ShipmentDetail
              shipment={selectedShipment}
              events={events ?? []}
              onStatusUpdate={() => {
                queryClient.invalidateQueries({ queryKey: ['shipments'] })
                queryClient.invalidateQueries({ queryKey: ['shipment-events', selectedShipment.id] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ShipmentCard({ shipment, onClick }: { shipment: any; onClick: () => void }) {
  const isDelayed = shipment.estimated_arrival && new Date(shipment.estimated_arrival) < new Date() && shipment.status !== 'received'

  return (
    <button
      onClick={onClick}
      className="w-full text-left border rounded-md p-2.5 hover:bg-accent transition-colors space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold truncate">{shipment.purchase?.invoice_number}</span>
        {isDelayed && <Clock className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
      <p className="text-[11px] text-muted-foreground truncate">
        {shipment.purchase?.supplier?.name}
      </p>
      {shipment.carrier && (
        <p className="text-[10px] text-muted-foreground truncate">
          {shipment.carrier} {shipment.tracking_number ? `· ${shipment.tracking_number}` : ''}
        </p>
      )}
      {shipment.estimated_arrival && (
        <p className={`text-[10px] ${isDelayed ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
          ETA: {new Date(shipment.estimated_arrival).toLocaleDateString()}
        </p>
      )}
    </button>
  )
}

function ShipmentListRow({ shipment, onClick }: { shipment: any; onClick: () => void }) {
  const isDelayed = shipment.estimated_arrival && new Date(shipment.estimated_arrival) < new Date() && shipment.status !== 'received'
  const statusInfo = STATUSES.find((s) => s.key === shipment.status)
  const StatusIcon = statusInfo?.icon ?? Package

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 border rounded-lg hover:bg-accent transition-colors text-left"
    >
      <div className={`rounded-lg p-2 ${statusInfo?.color ?? 'bg-muted'}`}>
        <StatusIcon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{shipment.purchase?.invoice_number}</span>
          <Badge variant="outline" className="text-[10px]">{statusInfo?.label}</Badge>
          {isDelayed && <Badge variant="destructive" className="text-[10px]">Delayed</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {shipment.purchase?.supplier?.name}
          {shipment.origin_country && ` · ${shipment.origin_country} → ${shipment.destination_country ?? 'CA'}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        {shipment.carrier && <p className="text-xs font-medium">{shipment.carrier}</p>}
        {shipment.estimated_arrival && (
          <p className={`text-xs ${isDelayed ? 'text-amber-600' : 'text-muted-foreground'}`}>
            ETA {new Date(shipment.estimated_arrival).toLocaleDateString()}
          </p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  )
}

function ShipmentDetail({
  shipment,
  events,
  onStatusUpdate,
}: {
  shipment: any
  events: any[]
  onStatusUpdate: () => void
}) {
  const { user } = useAuth()
  const [newStatus, setNewStatus] = useState<string>('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventNotes, setEventNotes] = useState('')

  const currentIndex = STATUSES.findIndex((s) => s.key === shipment.status)

  const updateStatus = useMutation({
    mutationFn: async () => {
      if (!newStatus) throw new Error('Select a status')

      // Update shipment status
      const updates: Record<string, any> = { status: newStatus }
      if (newStatus === 'received') {
        updates.actual_arrival = new Date().toISOString().split('T')[0]
      }
      const { error: updateError } = await supabase
        .from('shipment_tracking')
        .update(updates)
        .eq('id', shipment.id)
      if (updateError) throw updateError

      // Create event
      const { error: eventError } = await supabase
        .from('shipment_events')
        .insert({
          shipment_id: shipment.id,
          status: newStatus,
          location: eventLocation || null,
          notes: eventNotes || null,
          created_by: user?.id,
        })
      if (eventError) throw eventError
    },
    onSuccess: () => {
      toast.success('Shipment status updated')
      setNewStatus('')
      setEventLocation('')
      setEventNotes('')
      onStatusUpdate()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-5">
      {/* Progress Tracker */}
      <div className="flex items-center gap-1">
        {STATUSES.map((status, i) => {
          const isCompleted = i <= currentIndex
          const Icon = status.icon
          return (
            <div key={status.key} className="flex items-center gap-1 flex-1">
              <div className={`flex flex-col items-center gap-1 flex-1`}>
                <div className={`rounded-full p-1.5 ${isCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <span className={`text-[9px] text-center leading-tight ${isCompleted ? 'font-semibold' : 'text-muted-foreground'}`}>
                  {status.label}
                </span>
              </div>
              {i < STATUSES.length - 1 && (
                <div className={`h-0.5 flex-1 rounded ${i < currentIndex ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground text-xs">Invoice</span>
          <p className="font-medium">{shipment.purchase?.invoice_number}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Supplier</span>
          <p className="font-medium">{shipment.purchase?.supplier?.name}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Carrier</span>
          <p className="font-medium">{shipment.carrier ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Tracking #</span>
          <p className="font-medium font-mono text-xs">{shipment.tracking_number ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Origin</span>
          <p className="font-medium">{shipment.origin_country ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">ETA</span>
          <p className="font-medium">{shipment.estimated_arrival ? new Date(shipment.estimated_arrival).toLocaleDateString() : '—'}</p>
        </div>
      </div>

      {/* Update Status */}
      {shipment.status !== 'received' && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-semibold">Update Status</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.slice(currentIndex + 1).map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <Input className="h-8 text-xs" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="e.g., Shanghai Port" />
            </div>
          </div>
          <Input className="h-8 text-xs" value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} placeholder="Notes (optional)" />
          <Button size="sm" className="w-full" onClick={() => updateStatus.mutate()} disabled={!newStatus || updateStatus.isPending}>
            {updateStatus.isPending ? 'Updating...' : 'Update Status'}
          </Button>
        </div>
      )}

      {/* Event Timeline */}
      {events.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-3">Timeline</h4>
          <div className="space-y-3">
            {events.map((event: any) => {
              const statusInfo = STATUSES.find((s) => s.key === event.status)
              const EventIcon = statusInfo?.icon ?? Package
              return (
                <div key={event.id} className="flex gap-3">
                  <div className={`shrink-0 rounded-full p-1 ${statusInfo?.color ?? 'bg-muted'}`}>
                    <EventIcon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{statusInfo?.label}</span>
                      {event.location && <span className="text-[10px] text-muted-foreground">· {event.location}</span>}
                    </div>
                    {event.notes && <p className="text-xs text-muted-foreground">{event.notes}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(event.event_date).toLocaleString()}
                      {event.created_by_user?.full_name && ` · ${event.created_by_user.full_name}`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AddShipmentForm({ onSuccess }: { onSuccess: () => void }) {
  const [purchaseId, setPurchaseId] = useState('')
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [originCountry, setOriginCountry] = useState('')
  const [estimatedArrival, setEstimatedArrival] = useState('')
  const { user } = useAuth()

  const { data: purchases } = useQuery({
    queryKey: ['purchases-for-tracking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('id, invoice_number, supplier:suppliers(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
  })

  const createShipment = useMutation({
    mutationFn: async () => {
      if (!purchaseId) throw new Error('Select a purchase order')
      const { data, error } = await supabase
        .from('shipment_tracking')
        .insert({
          purchase_id: purchaseId,
          carrier: carrier || null,
          tracking_number: trackingNumber || null,
          origin_country: originCountry || null,
          estimated_arrival: estimatedArrival || null,
          status: 'ordered',
        })
        .select()
        .single()
      if (error) throw error

      // Create initial event
      await supabase.from('shipment_events').insert({
        shipment_id: data.id,
        status: 'ordered',
        notes: 'Shipment tracking started',
        created_by: user?.id,
      })
    },
    onSuccess: () => {
      toast.success('Shipment tracking created')
      onSuccess()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Purchase Order *</Label>
        <Select value={purchaseId} onValueChange={setPurchaseId}>
          <SelectTrigger>
            <SelectValue placeholder="Select purchase..." />
          </SelectTrigger>
          <SelectContent>
            {purchases?.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.invoice_number} — {p.supplier?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Carrier</Label>
          <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g., DHL, FedEx" />
        </div>
        <div className="space-y-2">
          <Label>Tracking Number</Label>
          <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Origin Country</Label>
          <Input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} placeholder="e.g., China" />
        </div>
        <div className="space-y-2">
          <Label>Estimated Arrival</Label>
          <Input type="date" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} />
        </div>
      </div>
      <Button className="w-full" onClick={() => createShipment.mutate()} disabled={createShipment.isPending}>
        {createShipment.isPending ? 'Creating...' : 'Start Tracking'}
      </Button>
    </div>
  )
}
