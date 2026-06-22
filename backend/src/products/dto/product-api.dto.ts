import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export enum ApiProductCondition {
  New = 'New',
  OpenBox = 'Open Box',
  UsedGood = 'Used - Good',
  UsedVeryGood = 'Used - Very Good',
  UsedLikeNew = 'Used - Like New',
  Refurbished = 'Refurbished',
}

export class CreateApiProductDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productCodeInteger?: number

  @IsString()
  @IsNotEmpty()
  name!: string

  @IsOptional()
  @IsString()
  brand?: string | null

  @IsOptional()
  @IsString()
  imageUrl?: string | null
}

export class UpdateApiProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productCodeInteger?: number

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  brand?: string | null

  @IsOptional()
  @IsString()
  imageUrl?: string | null
}

export class CreateApiProductVariantDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  variantCode?: number

  @IsString()
  @IsNotEmpty()
  variantType!: string

  @IsOptional()
  @IsString()
  variantValue?: string | null

  @IsOptional()
  @IsEnum(ApiProductCondition)
  condition?: ApiProductCondition

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number

  @IsOptional()
  @IsString()
  imageUrl?: string | null
}

export class UpdateApiProductVariantDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  variantCode?: number

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  variantType?: string

  @IsOptional()
  @IsString()
  variantValue?: string | null

  @IsOptional()
  @IsEnum(ApiProductCondition)
  condition?: ApiProductCondition

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number

  @IsOptional()
  @IsString()
  imageUrl?: string | null
}