import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'

@Injectable()
export class SupabaseService {
  private readonly adminClient: SupabaseClient
  private readonly authClient: SupabaseClient
  readonly serviceRoleEnabled: boolean
  readonly isConfigured: boolean

  constructor(private readonly config: ConfigService) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL') ?? this.config.get<string>('VITE_SUPABASE_URL')
    const anonKey = this.config.get<string>('SUPABASE_ANON_KEY') ?? this.config.get<string>('VITE_SUPABASE_ANON_KEY')
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey) {
      throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY for the backend.')
    }

    const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }

    this.authClient = createClient(supabaseUrl, anonKey, options)
    this.adminClient = createClient(supabaseUrl, serviceRoleKey ?? anonKey, options)
    this.serviceRoleEnabled = Boolean(serviceRoleKey)
    this.isConfigured = true
  }

  get client() {
    return this.adminClient
  }

  async getUserFromToken(accessToken: string): Promise<User> {
    const { data, error } = await this.authClient.auth.getUser(accessToken)

    if (error || !data.user) {
      throw error ?? new Error('Supabase user not found for token')
    }

    return data.user
  }
}