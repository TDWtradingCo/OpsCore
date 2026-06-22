import { Module } from '@nestjs/common'
import { SupabaseModule } from '../supabase/supabase.module'
import { ProductApiController } from './product-api.controller'
import { ProductApiService } from './product-api.service'

@Module({
  imports: [SupabaseModule],
  controllers: [ProductApiController],
  providers: [ProductApiService],
})
export class ProductApiModule {}