import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import type { PostgrestError } from '@supabase/supabase-js'
import { SupabaseService } from '../supabase/supabase.service'
import {
  ApiProductCondition,
  CreateApiProductDto,
  CreateApiProductVariantDto,
  UpdateApiProductDto,
  UpdateApiProductVariantDto,
} from './dto/product-api.dto'

const PRODUCT_TABLE = 'product_api_products'
const VARIANT_TABLE = 'product_api_variants'
const PRODUCT_SELECT = '*'
const VARIANT_SELECT = '*'

type ApiProductRow = {
  id: string
  product_code_integer: number
  name: string
  brand: string | null
  image_url: string | null
  created_at: string
  updated_at: string
  variants?: ApiProductVariantRow[]
}

type ApiProductVariantRow = {
  id: string
  product_id: string
  variant_code: number
  variant_type: string
  variant_value: string | null
  condition: ApiProductCondition
  quantity: number
  image_url: string | null
  created_at: string
  updated_at: string
}

type ProductPayload = {
  id?: string
  product_code_integer?: number
  name?: string
  brand?: string | null
  image_url?: string | null
}

type VariantPayload = {
  id?: string
  product_id?: string
  variant_code?: number
  variant_type?: string
  variant_value?: string | null
  condition?: ApiProductCondition
  quantity?: number
  image_url?: string | null
}

@Injectable()
export class ProductApiService {
  constructor(private readonly supabase: SupabaseService) {}

  async listProducts() {
    const { data: products, error } = await this.productsTable()
      .select(PRODUCT_SELECT)
      .order('product_code_integer', { ascending: true })

    if (error) {
      this.throwSupabaseError(error)
    }

    const variantsByProduct = await this.getVariantsByProductIds((products ?? []).map((product) => product.id as string))

    return (products ?? []).map((product) =>
      this.mapProduct({
        ...(product as ApiProductRow),
        variants: variantsByProduct.get(product.id as string) ?? [],
      }),
    )
  }

  async getProduct(id: string) {
    const { data, error } = await this.productsTable()
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      this.throwSupabaseError(error)
    }

    if (!data) {
      throw new NotFoundException('Product not found')
    }

    const variantsByProduct = await this.getVariantsByProductIds([id])

    return this.mapProduct({
      ...(data as ApiProductRow),
      variants: variantsByProduct.get(id) ?? [],
    })
  }

  async createProduct(dto: CreateApiProductDto) {
    const payload = this.toProductPayload(dto)
    const { data, error } = await this.productsTable()
      .insert(payload)
      .select(PRODUCT_SELECT)
      .single()

    if (error) {
      this.throwSupabaseError(error)
    }

    return this.mapProduct({ ...(data as ApiProductRow), variants: [] })
  }

  async updateProduct(id: string, dto: UpdateApiProductDto) {
    const payload = this.toProductPayload(dto)
    this.requirePayload(payload)

    const { data, error } = await this.productsTable()
      .update(payload)
      .eq('id', id)
      .select(PRODUCT_SELECT)
      .maybeSingle()

    if (error) {
      this.throwSupabaseError(error)
    }
    if (!data) {
      throw new NotFoundException('Product not found')
    }

    const variantsByProduct = await this.getVariantsByProductIds([id])

    return this.mapProduct({
      ...(data as ApiProductRow),
      variants: variantsByProduct.get(id) ?? [],
    })
  }

  async getVariant(id: string) {
    const { data, error } = await this.variantsTable()
      .select(VARIANT_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      this.throwSupabaseError(error)
    }
    if (!data) {
      throw new NotFoundException('Variant not found')
    }

    return this.mapVariant(data as ApiProductVariantRow)
  }

  async createVariant(productId: string, dto: CreateApiProductVariantDto) {
    await this.ensureProductExists(productId)

    const payload: VariantPayload = {
      ...this.toVariantPayload(dto),
      product_id: productId,
    }

    const { data, error } = await this.variantsTable()
      .insert(payload)
      .select(VARIANT_SELECT)
      .single()

    if (error) {
      this.throwSupabaseError(error)
    }

    return this.mapVariant(data as ApiProductVariantRow)
  }

  async updateVariant(id: string, dto: UpdateApiProductVariantDto) {
    const payload = this.toVariantPayload(dto)
    this.requirePayload(payload)

    const { data, error } = await this.variantsTable()
      .update(payload)
      .eq('id', id)
      .select(VARIANT_SELECT)
      .maybeSingle()

    if (error) {
      this.throwSupabaseError(error)
    }
    if (!data) {
      throw new NotFoundException('Variant not found')
    }

    return this.mapVariant(data as ApiProductVariantRow)
  }

  private async ensureProductExists(id: string) {
    const { data, error } = await this.productsTable()
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      this.throwSupabaseError(error)
    }
    if (!data) {
      throw new NotFoundException('Product not found')
    }
  }

  private async getVariantsByProductIds(productIds: string[]) {
    const variantsByProduct = new Map<string, ApiProductVariantRow[]>()

    if (productIds.length === 0) {
      return variantsByProduct
    }

    const { data, error } = await this.variantsTable()
      .select(VARIANT_SELECT)
      .in('product_id', productIds)
      .order('variant_code', { ascending: true })

    if (error) {
      this.throwSupabaseError(error)
    }

    for (const variant of (data ?? []) as ApiProductVariantRow[]) {
      const existing = variantsByProduct.get(variant.product_id) ?? []
      existing.push(variant)
      variantsByProduct.set(variant.product_id, existing)
    }

    return variantsByProduct
  }

  private productsTable() {
    return this.supabase.client.from(PRODUCT_TABLE)
  }

  private variantsTable() {
    return this.supabase.client.from(VARIANT_TABLE)
  }

  private toProductPayload(dto: CreateApiProductDto | UpdateApiProductDto): ProductPayload {
    return this.compact({
      id: 'id' in dto ? dto.id : undefined,
      product_code_integer: dto.productCodeInteger,
      name: this.normalizeRequiredString(dto.name),
      brand: this.normalizeOptionalString(dto.brand),
      image_url: this.normalizeOptionalString(dto.imageUrl),
    })
  }

  private toVariantPayload(dto: CreateApiProductVariantDto | UpdateApiProductVariantDto): VariantPayload {
    return this.compact({
      id: 'id' in dto ? dto.id : undefined,
      variant_code: dto.variantCode,
      variant_type: this.normalizeRequiredString(dto.variantType),
      variant_value: this.normalizeOptionalString(dto.variantValue),
      condition: dto.condition,
      quantity: dto.quantity,
      image_url: this.normalizeOptionalString(dto.imageUrl),
    })
  }

  private mapProduct(row: ApiProductRow) {
    return {
      id: row.id,
      productCodeInteger: row.product_code_integer,
      name: row.name,
      brand: row.brand,
      imageUrl: row.image_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      variants: (row.variants ?? []).map((variant) => this.mapVariant(variant)),
    }
  }

  private mapVariant(row: ApiProductVariantRow) {
    return {
      id: row.id,
      productId: row.product_id,
      variantCode: row.variant_code,
      variantType: row.variant_type,
      variantValue: row.variant_value,
      condition: row.condition,
      quantity: row.quantity,
      imageUrl: row.image_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private compact<T extends Record<string, unknown>>(payload: T): T {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as T
  }

  private normalizeRequiredString(value: string | undefined) {
    if (value === undefined) {
      return undefined
    }

    return value.trim()
  }

  private normalizeOptionalString(value: string | null | undefined) {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private requirePayload(payload: Record<string, unknown>) {
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('At least one field is required')
    }
  }

  private throwSupabaseError(error: PostgrestError): never {
    if (['23502', '23503', '23505', '23514', 'PGRST116'].includes(error.code)) {
      throw new BadRequestException(error.message)
    }

    throw new InternalServerErrorException(error.message)
  }
}