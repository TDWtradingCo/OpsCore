import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { User } from '@supabase/supabase-js'
import { SupabaseService } from '../supabase/supabase.service'

type RequestWithAuth = {
  headers: {
    authorization?: string
  }
  user?: User
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithAuth>()
    const [scheme, token] = request.headers.authorization?.split(' ') ?? []

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing Supabase bearer token')
    }

    request.user = await this.supabase.getUserFromToken(token)
    return true
  }
}