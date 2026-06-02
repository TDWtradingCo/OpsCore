import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siprplhdenznrzfuecvx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcHJwbGhkZW56bnJ6ZnVlY3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI5MTAsImV4cCI6MjA5NDA2ODkxMH0.HJP9e_Dy0PsWxH1ay80ekMgQmVdhdFgkLLPPxJyBASM';
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data: count } = await supabase
    .from('products')
    .select('*', { count: 'exact' });
  console.log(`Total products: ${count?.length || 0}`);
})();
