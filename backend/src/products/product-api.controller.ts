import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard'
import {
  CreateApiProductDto,
  CreateApiProductVariantDto,
  UpdateApiProductDto,
  UpdateApiProductVariantDto,
} from './dto/product-api.dto'
import { ProductApiService } from './product-api.service'

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ProductApiController {
  constructor(private readonly products: ProductApiService) {}

  @Get('products')
  listProducts() {
    return this.products.listProducts()
  }

  @Get('product/:id')
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getProduct(id)
  }

  @Post('product')
  createProduct(@Body() dto: CreateApiProductDto) {
    return this.products.createProduct(dto)
  }

  @Patch('product/:id')
  patchProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApiProductDto) {
    return this.products.updateProduct(id, dto)
  }

  @Put('product/:id')
  putProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApiProductDto) {
    return this.products.updateProduct(id, dto)
  }

  @Get('variant/:id')
  getVariant(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.getVariant(id)
  }

  @Post('product/:productId/variant')
  createVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateApiProductVariantDto,
  ) {
    return this.products.createVariant(productId, dto)
  }

  @Patch('variant/:id')
  patchVariant(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApiProductVariantDto) {
    return this.products.updateVariant(id, dto)
  }

  @Put('variant/:id')
  putVariant(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApiProductVariantDto) {
    return this.products.updateVariant(id, dto)
  }
}