import { GripHorizontal } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ReactNode } from 'react'

interface DraggableCardProps {
  id: string
  title: string
  children: ReactNode
  isDragging: boolean
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: (id: string) => void
}

export function DraggableCard({
  id,
  title,
  children,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
}: DraggableCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(id)}
      onDragOver={() => onDragOver(id)}
      onDrop={() => onDrop(id)}
      onDragEnd={() => onDrop(id)}
      className={`transition-opacity ${isDragging ? 'opacity-50' : 'opacity-100'} cursor-move`}
    >
      <Card className="relative group">
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-grab active:cursor-grabbing">
          <GripHorizontal className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </div>
        <div className="p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
            {title}
          </h3>
          {children}
        </div>
      </Card>
    </div>
  )
}
