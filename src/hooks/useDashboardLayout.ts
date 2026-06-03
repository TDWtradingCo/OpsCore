import { useState, useEffect } from 'react'

export type DashboardCard =
  | 'spending-trend'
  | 'inventory-distribution'
  | 'inventory-warehouse'
  | 'purchase-status'
  | 'top-products'
  | 'low-stock'

const DEFAULT_LAYOUT: DashboardCard[] = [
  'spending-trend',
  'inventory-distribution',
  'inventory-warehouse',
  'purchase-status',
  'top-products',
  'low-stock',
]

const STORAGE_KEY = 'dashboard-card-layout'

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardCard[]>(DEFAULT_LAYOUT)
  const [draggedCard, setDraggedCard] = useState<DashboardCard | null>(null)

  // Load layout from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setLayout(parsed)
        }
      } catch {
        setLayout(DEFAULT_LAYOUT)
      }
    }
  }, [])

  // Save layout to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  }, [layout])

  const reorderCards = (draggedId: DashboardCard, targetId: DashboardCard) => {
    const draggedIndex = layout.indexOf(draggedId)
    const targetIndex = layout.indexOf(targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newLayout = [...layout]
    newLayout.splice(draggedIndex, 1)
    newLayout.splice(targetIndex, 0, draggedId)
    setLayout(newLayout)
  }

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT)
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    layout,
    draggedCard,
    setDraggedCard,
    reorderCards,
    resetLayout,
  }
}
