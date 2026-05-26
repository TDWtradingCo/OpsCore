import { supabase } from '@/lib/supabase'

interface LogDashboardActivityInput {
  entityType: string
  action: string
  userId: string
  entityId?: string | null
  description?: string
  metadata?: Record<string, unknown>
  changes?: Record<string, { old: any; new: any }> // Track field-level changes
}

export async function logDashboardActivity(input: LogDashboardActivityInput) {
  // If changes are provided, enhance the description with before/after values
  let enhancedDescription = input.description ?? ''
  
  if (input.changes && Object.keys(input.changes).length > 0) {
    const changesList = Object.entries(input.changes)
      .map(([field, { old: oldVal, new: newVal }]) => {
        const oldDisplay = oldVal === null || oldVal === undefined ? 'empty' : oldVal
        const newDisplay = newVal === null || newVal === undefined ? 'empty' : newVal
        return `${field}: ${oldDisplay} → ${newDisplay}`
      })
      .join('; ')
    
    enhancedDescription = enhancedDescription + (enhancedDescription ? ` | Changes: ${changesList}` : `Changed: ${changesList}`)
  }

  const { error } = await supabase.from('dashboard_activity_log').insert({
    entity_type: input.entityType,
    action: input.action,
    user_id: input.userId,
    entity_id: input.entityId ?? null,
    description: enhancedDescription,
    metadata: input.metadata ?? input.changes ?? null, // Store changes in metadata
  })

  if (error) {
    console.error('Failed to write dashboard activity log:', error.message)
  }
}

// Helper function to format currency for logging
export function formatChangeValue(value: any): string {
  if (typeof value === 'number') {
    return value.toFixed(2)
  }
  return String(value)
}
