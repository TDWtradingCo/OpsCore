import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import type { User } from '@supabase/supabase-js'
import { SupabaseAuthGuard } from './auth/supabase-auth.guard'
import { SupabaseService } from './supabase/supabase.service'

type RequestWithUser = {
  user: User
}

@Controller()
export class AppController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'tdot-dashboard-backend',
      supabase: {
        configured: this.supabase.isConfigured,
        serviceRoleEnabled: this.supabase.serviceRoleEnabled,
      },
    }
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  me(@Req() request: RequestWithUser) {
    return { user: request.user }
  }
}