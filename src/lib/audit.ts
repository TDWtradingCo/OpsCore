import { supabase } from '@/lib/supabase'

interface LogDashboardActivityInput {
  entityType: string
  action: string
  userId: string
  entityId?: string | null
  description?: string
  metadata?: Record<string, unknown>
}

export async function logDashboardActivity(input: LogDashboardActivityInput) {
  const { error } = await supabase.from('dashboard_activity_log').insert({
    entity_type: input.entityType,
    action: input.action,
    user_id: input.userId,
    entity_id: input.entityId ?? null,
    description: input.description ?? null,
    metadata: input.metadata ?? null,
  })

  if (error) {
    console.error('Failed to write dashboard activity log:', error.message)
  }
}
