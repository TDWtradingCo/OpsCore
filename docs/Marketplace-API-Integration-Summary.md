# Marketplace API Integration Summary

## Purpose

This document summarizes the marketplace information the dashboard can pull from Amazon, Walmart, and Best Buy, and how the proposed NestJS backend architecture should connect those integrations to the existing Tdot Dashboard.

The main goal is to move the product from manual CSV uploads toward automated marketplace syncs for orders, products, pricing, inventory, shipments, and profitability.

## Recommended Architecture

The recommended architecture is:

**React/Vite dashboard -> NestJS backend -> Supabase Postgres database**

Supabase should continue to be used as the main database and authentication/storage platform. NestJS should become the backend service that handles marketplace API communication, business rules, syncing, token refresh, retry logic, and scheduled jobs.

### Dashboard Responsibilities

- Show orders, products, inventory, purchases, shipments, pricing, profitability, suppliers, and activity logs.
- Let users connect marketplace accounts.
- Let users review synced marketplace data.
- Let users approve sensitive actions before inventory or purchase records are changed.
- Display sync status, errors, and last successful update times.

### NestJS Backend Responsibilities

- Connect securely to Amazon, Walmart, and Best Buy APIs.
- Store and refresh marketplace API tokens securely.
- Run scheduled sync jobs for orders, listings, pricing, inventory, fulfillment, and reports.
- Receive marketplace webhooks where supported.
- Normalize marketplace data into one shared internal format.
- Match marketplace SKUs to internal products.
- Prevent duplicate orders and duplicate sync records.
- Write clean data into Supabase.
- Track sync logs, errors, retries, and failed records.
- Apply business rules before updating inventory, purchases, or profitability.

### Supabase Responsibilities

- Store products, suppliers, inventory, purchases, orders, shipments, pricing, and profitability data.
- Store marketplace connection records and sync history.
- Store marketplace SKU mappings.
- Store imported marketplace orders and financial data.
- Support dashboard queries and reporting.
- Continue handling authentication and row-level access rules if desired.

## Information We Can Pull By Marketplace

## Amazon

Amazon should be integrated through Amazon Selling Partner API, also called SP-API.

### Data Amazon Can Provide

- Marketplace orders.
- Order line items.
- Order status and fulfillment status.
- Shipment confirmation and shipment status information.
- Seller listings.
- Product/listing details by SKU or ASIN.
- Product pricing and competitive offer data.
- Amazon fees and financial events.
- Settlement and finance-related reports.
- FBA inventory and fulfillment data, depending on permissions.
- Business reports and sales reports.
- Returns/refunds data where available through reports or relevant API access.

### Dashboard Pages Amazon Can Support

- **Orders:** sync Amazon orders and order items.
- **Products:** connect internal products to Amazon SKUs/ASINs.
- **Inventory:** show Amazon/FBA inventory where available and optionally deduct internal inventory from orders.
- **Pricing:** compare internal price assumptions with Amazon offer/pricing data.
- **Profitability:** combine Amazon order revenue, fees, fulfillment cost, and landed cost.
- **Dashboard:** show Amazon sales, top products, channel revenue, and sync health.
- **Activity Log:** record Amazon sync events and sync failures.

### Amazon Limits And Notes

- Amazon access requires seller authorization and SP-API approval.
- Some customer/order fields require restricted data permissions.
- API rate limits must be handled carefully.
- Amazon marketplace data does not automatically provide invoices from external suppliers.

## Walmart

Walmart should be integrated through Walmart Marketplace APIs.

### Data Walmart Can Provide

- Marketplace orders.
- Order line items.
- Order lifecycle status.
- Shipping updates, cancellations, and refunds.
- Walmart item/listing data.
- Seller SKU information.
- Inventory by SKU and ship node.
- Bulk inventory updates.
- Pricing and promotional pricing.
- Walmart Fulfillment Services inventory data.
- Walmart Fulfillment Services inbound shipment data.
- Settlement, reconciliation, and payment reports.
- Performance reports and marketplace health data.
- Notifications/webhooks for selected marketplace events.

### Dashboard Pages Walmart Can Support

- **Orders:** sync Walmart orders, line items, statuses, cancellations, and refunds.
- **Products:** connect internal products to Walmart SKUs/listings.
- **Inventory:** sync marketplace inventory and ship-node inventory.
- **Pricing:** sync regular and promotional Walmart pricing.
- **Shipment Tracking:** show Walmart fulfillment and WFS inbound shipment information.
- **Profitability:** calculate channel margin using Walmart order revenue, fees, settlement data, and landed cost.
- **Dashboard:** show Walmart sales, open orders, inventory issues, and channel performance.
- **Activity Log:** record Walmart sync events and failures.

### Walmart Limits And Notes

- Walmart requires seller or approved solution provider access.
- OAuth/token handling must be built into the backend.
- Walmart is strong for marketplace operations, inventory, and pricing.
- Walmart marketplace APIs do not automatically provide invoices from unrelated suppliers.

## Best Buy

Best Buy has two different levels of possible integration: public API access and partner Commerce API access.

### Data Best Buy Public APIs Can Provide

- Product catalog data.
- Product name, SKU, UPC, brand/manufacturer, dimensions, and descriptions where available.
- Product pricing.
- Product availability.
- Store information.
- Category information.
- Recommendations and popular product signals.
- Open-box/buying option data where available.

### Data Best Buy Commerce API May Provide With Partner Access

- Order lookup.
- Order creation.
- Order modification or cancellation.
- Fulfillment options.
- Delivery or pickup options.

### Dashboard Pages Best Buy Can Support

- **Products:** enrich products with Best Buy catalog, UPC, image, category, and pricing data.
- **Pricing:** compare Best Buy public pricing or partner pricing where allowed.
- **Orders:** possible only if partner/vendor/Commerce API order access is approved.
- **Inventory:** public availability can be shown, but seller inventory sync depends on partner access.
- **Dashboard:** show Best Buy pricing/availability insights or order data if approved.

### Best Buy Limits And Notes

- Best Buy public APIs are mostly catalog, price, availability, store, and recommendation APIs.
- Seller/order/invoice workflows are not guaranteed through public API access.
- Serious order integration likely requires Best Buy partner, vendor, marketplace, or Commerce API access.

## Supplier Invoice And Purchase Automation

Marketplace APIs are strong for sales-channel data, but they do not automatically solve supplier invoice automation.

Supplier purchase invoices usually need a separate integration source, such as:

- Supplier APIs.
- Supplier portals.
- Accounting systems such as QuickBooks, Xero, or Zoho Books.
- EDI feeds.
- Email inbox parsing for invoice attachments.
- PDF invoice extraction.
- CSV or spreadsheet feeds from suppliers.

The safest first version should be semi-automated:

1. Backend receives or pulls supplier invoice data.
2. System creates a draft purchase record.
3. Products and supplier SKUs are matched to internal products.
4. User reviews quantities, costs, tax, shipping, duties, and warehouse allocation.
5. User approves the draft purchase.
6. Inventory and landed cost update only after approval.

This avoids bad supplier data accidentally changing inventory or landed cost.

## Suggested Internal Data Models To Add Later

The current dashboard already has many of the required business tables. For marketplace integration, the system will likely also need these records:

- Marketplace connections.
- Marketplace access tokens and refresh tokens.
- Marketplace sync jobs.
- Marketplace sync logs.
- Marketplace raw payload history.
- Marketplace order mappings.
- Marketplace SKU mappings.
- Marketplace listing snapshots.
- Marketplace price snapshots.
- Marketplace fee/settlement records.
- Marketplace inventory snapshots.
- Supplier invoice import records.
- Supplier SKU mappings.

## Recommended Build Phases

### Phase 1: Backend Foundation

- Add NestJS backend service.
- Connect NestJS to Supabase Postgres.
- Add marketplace connection and sync log tables.
- Add secure token storage.
- Add backend health/status endpoints.

### Phase 2: Walmart First

- Pull Walmart orders.
- Pull Walmart order items.
- Map Walmart SKUs to internal products.
- Write orders into Supabase.
- Show Walmart sync status in the dashboard.

Walmart is a good first integration because its Marketplace APIs are clearly built around orders, items, inventory, pricing, reports, and fulfillment workflows.

### Phase 3: Amazon

- Pull Amazon orders and order items.
- Pull listing/SKU data.
- Pull pricing and financial events where approved.
- Map Amazon SKUs/ASINs to internal products.
- Add Amazon profitability calculations.

### Phase 4: Inventory And Pricing Sync

- Pull marketplace inventory snapshots.
- Pull marketplace pricing snapshots.
- Compare marketplace stock/pricing to internal records.
- Decide whether dashboard is read-only first or allowed to push inventory/pricing updates back to marketplaces.

### Phase 5: Supplier Invoice Automation

- Start with one supplier or one accounting source.
- Auto-create draft purchases.
- Require user approval before inventory changes.
- Update landed cost and profitability after approval.

### Phase 6: Best Buy

- Start with public catalog, pricing, and availability data.
- Add order/commerce workflow only after partner access is confirmed.

## Final Recommendation

The architecture is realistic and strong:

**NestJS should handle marketplace integrations and business logic. Supabase should remain the database and auth/storage layer. The dashboard should display clean synced data and let users review important changes.**

The strongest initial value is not full automation of everything. The strongest initial value is reliable marketplace order sync, SKU mapping, inventory visibility, and profitability by sales channel.
