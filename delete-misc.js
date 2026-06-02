import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://siprplhdenznrzfuecvx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcHJwbGhkZW56bnJ6ZnVlY3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI5MTAsImV4cCI6MjA5NDA2ODkxMH0.HJP9e_Dy0PsWxH1ay80ekMgQmVdhdFgkLLPPxJyBASM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteAllMiscItems() {
  try {
    // Get all products with "Misc" in name
    const { data: allProducts, error: queryError } = await supabase
      .from('products')
      .select('id, name');

    if (queryError) throw queryError;

    // Filter for Misc Item products
    const miscItems = allProducts?.filter(p => p.name && p.name.includes('Misc Item')) ?? [];

    if (miscItems.length === 0) {
      console.log('✓ No Misc Item products found');
      return;
    }

    console.log(`Found ${miscItems.length} Misc Item product(s) to delete:`);
    miscItems.forEach(p => console.log(`  - ${p.name}`));

    const productIds = miscItems.map(p => p.id);

    // Delete in cascading order to handle all dependencies
    console.log('\nDeleting associated records...');

    // 1. Get all line items for these products
    console.log('  - Finding purchase line items...');
    const { data: lineItems } = await supabase
      .from('purchase_line_items')
      .select('id, purchase_id')
      .in('product_id', productIds);

    if (lineItems && lineItems.length > 0) {
      const lineItemIds = lineItems.map(li => li.id);
      const purchaseIds = [...new Set(lineItems.map(li => li.purchase_id))];

      // 2. Delete purchase allocations
      console.log(`  - Deleting ${lineItemIds.length} purchase allocations...`);
      const { error: allocError } = await supabase
        .from('purchase_allocations')
        .delete()
        .in('purchase_line_item_id', lineItemIds);
      if (allocError) throw allocError;

      // 3. Delete line items
      console.log(`  - Deleting ${lineItemIds.length} purchase line items...`);
      const { error: liError } = await supabase
        .from('purchase_line_items')
        .delete()
        .in('id', lineItemIds);
      if (liError) throw liError;

      // 4. Delete empty purchases (those that had no other line items)
      console.log(`  - Cleaning up purchases with only misc items...`);
      for (const purchaseId of purchaseIds) {
        const { data: remainingItems } = await supabase
          .from('purchase_line_items')
          .select('id')
          .eq('purchase_id', purchaseId);

        if (!remainingItems || remainingItems.length === 0) {
          await supabase.from('purchases').delete().eq('id', purchaseId);
        }
      }
    }

    // 5. Delete inventory
    console.log('  - Deleting inventory records...');
    const { error: invError } = await supabase
      .from('inventory')
      .delete()
      .in('product_id', productIds);
    if (invError) throw invError;

    // 6. Delete the products
    console.log('  - Deleting products...');
    const { error: prodError } = await supabase
      .from('products')
      .delete()
      .in('id', productIds);
    if (prodError) throw prodError;

    console.log(`\n✓ Successfully deleted ${productIds.length} Misc Item product(s) and all associated records`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteAllMiscItems();
