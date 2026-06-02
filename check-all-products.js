import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siprplhdenznrzfuecvx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcHJwbGhkZW56bnJ6ZnVlY3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI5MTAsImV4cCI6MjA5NDA2ODkxMH0.HJP9e_Dy0PsWxH1ay80ekMgQmVdhdFgkLLPPxJyBASM';
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, sku');
    
    if (error) throw error;
    
    console.log(`Total products in database: ${products?.length || 0}\n`);
    
    if (products && products.length > 0) {
      console.log('First 5 products:');
      products.slice(0, 5).forEach(p => {
        console.log(`  - Name: "${p.name}", SKU: "${p.sku}"`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
