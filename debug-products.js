import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siprplhdenznrzfuecvx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcHJwbGhkZW56bnJ6ZnVlY3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI5MTAsImV4cCI6MjA5NDA2ODkxMH0.HJP9e_Dy0PsWxH1ay80ekMgQmVdhdFgkLLPPxJyBASM';
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, sku')
      .like('sku', 'MISC-%');
    
    if (error) throw error;
    
    if (products && products.length > 0) {
      console.log(`Found ${products.length} products with MISC- SKU:\n`);
      products.slice(0, 10).forEach(p => {
        console.log(`  ID: ${p.id}`);
        console.log(`  Name: ${p.name}`);
        console.log(`  SKU: ${p.sku}\n`);
      });
    } else {
      console.log('No products with MISC- SKU found');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
