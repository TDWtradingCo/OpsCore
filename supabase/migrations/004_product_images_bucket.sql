-- Create public storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users only
CREATE POLICY "product_images_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Read: anyone (public bucket)
CREATE POLICY "product_images_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Delete: authenticated users only
CREATE POLICY "product_images_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');
