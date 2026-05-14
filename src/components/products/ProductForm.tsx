import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productSchema, type ProductFormData } from '@/lib/validations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, X } from 'lucide-react'

interface ProductFormProps {
  onSubmit: (values: ProductFormData, imageFile: File | null) => void
  isLoading?: boolean
  defaultValues?: Partial<ProductFormData>
}

export function ProductForm({ onSubmit, isLoading, defaultValues }: ProductFormProps) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(defaultValues?.image_url ?? null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      status: 'active',
      ...defaultValues,
    },
  })

  const status = watch('status')
  const weightUnit = watch('weight_unit')
  const dimensionUnit = watch('dimension_unit')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return // 5MB max
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    setValue('image_url', null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(values, imageFile))} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="Enter product name"
            onFocus={(e) => e.target.select()}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sku">SKU *</Label>
          <Input
            id="sku"
            {...register('sku')}
            placeholder="Enter SKU"
            onFocus={(e) => e.target.select()}
          />
          {errors.sku && <p className="text-sm text-destructive">{errors.sku.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status *</Label>
          <Select value={status} onValueChange={(value) => setValue('status', value as 'active' | 'inactive')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="upc_gtin">UPC/GTIN</Label>
          <Input
            id="upc_gtin"
            {...register('upc_gtin')}
            placeholder="Enter UPC/GTIN"
            onFocus={(e) => e.target.select()}
          />
          {errors.upc_gtin && <p className="text-sm text-destructive">{errors.upc_gtin.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            {...register('brand')}
            placeholder="Enter brand"
            onFocus={(e) => e.target.select()}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Product Image</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {imagePreview ? (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Product preview"
                className="h-24 w-24 rounded-lg object-cover border"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg hover:border-primary/50 hover:bg-accent transition-colors cursor-pointer"
            >
              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">Click to upload image</span>
              <span className="text-xs text-muted-foreground">PNG, JPG up to 5MB</span>
            </button>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-4">Weight & Dimensions</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              type="number"
              step="0.01"
              {...register('weight', { valueAsNumber: true })}
              placeholder="0.00"
              onFocus={(e) => e.target.select()}
            />
            {errors.weight && <p className="text-sm text-destructive">{errors.weight.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="weight_unit">Weight Unit</Label>
            <Select value={weightUnit ?? ''} onValueChange={(value) => setValue('weight_unit', value as 'kg' | 'lb' | 'oz' | 'g')}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="lb">lb</SelectItem>
                <SelectItem value="oz">oz</SelectItem>
                <SelectItem value="g">g</SelectItem>
              </SelectContent>
            </Select>
            {errors.weight_unit && <p className="text-sm text-destructive">{errors.weight_unit.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dimension_unit">Dimension Unit</Label>
            <Select value={dimensionUnit ?? ''} onValueChange={(value) => setValue('dimension_unit', value as 'cm' | 'in' | 'mm')}>
              <SelectTrigger>
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cm">cm</SelectItem>
                <SelectItem value="in">in</SelectItem>
                <SelectItem value="mm">mm</SelectItem>
              </SelectContent>
            </Select>
            {errors.dimension_unit && <p className="text-sm text-destructive">{errors.dimension_unit.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="length">Length</Label>
            <Input
              id="length"
              type="number"
              step="0.01"
              {...register('length', { valueAsNumber: true })}
              placeholder="0.00"
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="width">Width</Label>
            <Input
              id="width"
              type="number"
              step="0.01"
              {...register('width', { valueAsNumber: true })}
              placeholder="0.00"
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="height">Height</Label>
            <Input
              id="height"
              type="number"
              step="0.01"
              {...register('height', { valueAsNumber: true })}
              placeholder="0.00"
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : defaultValues ? 'Update Product' : 'Create Product'}
        </Button>
      </div>
    </form>
  )
}
