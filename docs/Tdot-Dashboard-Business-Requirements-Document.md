# Business Requirements Document

## Tdot Dashboard / OpsCore

**Document version:** 1.0  
**Prepared date:** 2026-06-10  
**Prepared for:** Tdot Dashboard project stakeholders  
**Prepared by:** GitHub Copilot  
**System type:** Internal inventory, purchasing, pricing, shipment tracking, order management, and profitability dashboard

---

## 1. Executive Summary

Tdot Dashboard, branded in the application shell as OpsCore, is an internal operational platform for managing product master data, supplier purchasing, warehouse inventory, sales channel pricing, shipment tracking, customer orders, activity auditing, and profitability analysis.

The platform consolidates operational data that would otherwise be spread across spreadsheets, supplier invoices, marketplace portals, warehouse records, and ad hoc calculations. Its core business value is to provide a single authenticated workspace where users can maintain accurate product and inventory records, calculate landed costs from purchases, manage pricing across sales channels, and evaluate projected profitability by product and channel.

The system is implemented as a React, TypeScript, Vite frontend backed by Supabase PostgreSQL, Supabase Auth, Supabase Storage, and Row Level Security policies.

## 2. Business Objectives

1. Centralize product, supplier, inventory, purchase, sales channel, order, and shipment information in one operational dashboard.
2. Reduce manual spreadsheet work for importing, updating, filtering, and exporting operational records.
3. Maintain reliable inventory quantities across multiple warehouse and fulfillment locations.
4. Calculate landed unit costs when purchases are completed, using product quantities and additional purchase costs.
5. Support channel-specific pricing and fulfillment costs so the business can compare projected gross profit and margin.
6. Improve operational traceability through activity logs and inventory movement history.
7. Support secure access through authenticated user accounts and role-aware administration settings.

## 3. Project Scope

### In Scope

- User authentication and protected dashboard access.
- Product catalog management, including SKU, business product code, UPC/GTIN, brand, dimensions, weight, status, and product images.
- Supplier management, including contact information, status, notes, and geographic shipment metadata.
- Warehouse location management.
- Inventory summary, inventory by location, adjustments, transfers, movement history, tax paid visibility, and bulk inventory updates.
- Purchase invoice management, including line items, tax values, additional costs, warehouse allocations, landed cost calculation, completion, and inventory posting.
- Shipment tracking for purchase orders, including status pipeline, ETA, carrier/tracking data, shipment events, and delay indicators.
- Sales channel management, including commission percentage and status.
- Channel pricing management, including retail, offer, promo, fulfillment mode, seller shipping cost, and marketplace fulfillment cost.
- Profitability analysis by product and sales channel.
- Customer order management, including order items, status, channel, customer information, import, export, and database/local fallback behavior.
- Dashboard summary metrics and charts.
- CSV import/export workflows for major operational entities.
- Dashboard-wide activity logging.

### Out of Scope For Current Version

- Direct integrations with marketplace APIs such as Amazon, Walmart, Best Buy, Shopify, or carrier tracking APIs.
- Automated purchase order generation from reorder points.
- Automated inventory reservation or deduction from customer orders.
- Accounting system integration.
- Multi-currency landed cost handling.
- Advanced role-based permission matrices beyond admin and standard roles.
- Native mobile applications.

## 4. Stakeholders And Users

| Stakeholder / User Group | Primary Needs |
| --- | --- |
| Operations team | Maintain product, supplier, purchase, shipment, and inventory records. |
| Inventory managers | View quantities by product and location, make adjustments, transfer stock, and audit movement history. |
| Purchasing team | Record supplier invoices, allocate purchased stock, track inbound shipments, and complete purchases. |
| Pricing / marketplace team | Maintain channel pricing, commissions, fulfillment cost assumptions, and compare margins. |
| Finance / management | Review landed costs, gross profit, margins, purchase history, and operational activity. |
| Administrators | Manage users, roles, warehouse locations, sales channels, and system configuration. |

## 5. Current Business Problems

1. Product, purchase, supplier, inventory, pricing, and profitability data are difficult to manage consistently when spread across disconnected tools.
2. Landed cost calculations require repeatable allocation rules and reliable links to purchase line items.
3. Inventory changes need an auditable history to reduce errors and support reconciliation.
4. Channel pricing decisions require visibility into commissions, fulfillment costs, landed costs, and margin outcomes.
5. Manual data entry needs CSV import/export support for migration, correction, reporting, and offline analysis.

## 6. Target Future State

The target state is a secure, browser-based operations command center where authenticated users can manage the full flow from product setup to supplier purchase, inbound shipment tracking, inventory posting, channel pricing, customer order tracking, and margin analysis.

The intended flow is:

1. Create or import product and supplier records.
2. Create purchase invoices with line items, taxes, additional costs, and warehouse allocations.
3. Track inbound shipments against purchases.
4. Complete purchases to calculate landed unit costs and post inventory to the appropriate locations.
5. Manage prices and fulfillment assumptions by sales channel.
6. Analyze projected gross profit and margin using latest landed costs.
7. Monitor activity logs, inventory movements, dashboard metrics, and exceptions such as low stock or delayed shipments.

## 7. Functional Requirements

### 7.1 Authentication And Access

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-AUTH-001 | The system shall require users to authenticate before accessing dashboard modules. | Must | Unauthenticated users are redirected to the login page. |
| FR-AUTH-002 | The system shall support user sign-in, sign-up, sign-out, session loading, and profile retrieval. | Must | A signed-in user can access protected routes and see profile/role information in the navigation shell. |
| FR-AUTH-003 | The system shall support at least admin and standard user roles. | Must | Admin-only settings such as user role management are visible only to admin users. |
| FR-AUTH-004 | The system shall use database-level Row Level Security for authenticated access to application tables. | Must | Supabase RLS policies allow authenticated users to perform supported operations. |

### 7.2 Dashboard And Navigation

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-DASH-001 | The system shall provide a dashboard landing page with summary metrics for products, inventory, purchases, suppliers, channels, and warehouses. | Must | Users can view active counts and recent operational activity after login. |
| FR-DASH-002 | The system shall show visual summaries such as inventory by location, purchase status, low-stock products, recent purchases, recent movements, and top products by inventory value. | Should | Dashboard widgets and charts populate from Supabase data. |
| FR-DASH-003 | The system shall allow users to reorder dashboard stat cards locally. | Could | Stat card order persists in browser local storage. |
| FR-DASH-004 | The system shall provide responsive navigation for desktop and mobile layouts. | Must | Sidebar navigation works on desktop and collapses into a mobile menu. |

### 7.3 Product Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-PROD-001 | The system shall allow users to create, view, search, filter, sort, edit, archive/status, and delete product records where allowed. | Must | Product records can be managed from the Products module. |
| FR-PROD-002 | The system shall store product name, SKU, generated product code, status, UPC/GTIN, brand, image URL, weight, weight unit, dimensions, and dimension unit. | Must | Required fields are validated and optional attributes can be saved. |
| FR-PROD-003 | The system shall enforce SKU uniqueness and product code uniqueness. | Must | Duplicate SKU/product code records are rejected by the database. |
| FR-PROD-004 | The system shall support product image upload through a public Supabase Storage bucket. | Should | Uploaded product images receive public URLs and are associated with products. |
| FR-PROD-005 | The system shall support product CSV export, product template download, and product CSV import. | Should | Users can export current products, download a template, and import valid CSV rows. |
| FR-PROD-006 | The system shall prevent deletion of products that have inventory or purchase history, except for supported cleanup scenarios. | Must | Attempting to delete protected products returns a clear error or follows defined cleanup logic. |
| FR-PROD-007 | The system shall write activity log entries for product create and delete actions. | Should | Product changes appear in the activity log with user and description. |

### 7.4 Supplier Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-SUP-001 | The system shall allow users to create, view, search, filter, sort, edit, and delete supplier records where allowed. | Must | Supplier records can be managed from the Suppliers module. |
| FR-SUP-002 | The system shall store supplier name, short name, email, phone, notes, status, country, city, latitude, and longitude as supported by the schema. | Should | Supplier records support operational and shipment-origin metadata. |
| FR-SUP-003 | The system shall prevent deletion of suppliers with associated purchase records. | Must | Users receive an error if a supplier is referenced by purchases. |
| FR-SUP-004 | The system shall support supplier export and bulk supplier import/template workflows. | Should | Users can export supplier data and load supplier records from CSV templates. |
| FR-SUP-005 | The system shall log supplier delete actions in the activity log. | Should | Supplier deletion appears with user, entity, and description. |

### 7.5 Warehouse Location And Inventory Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-INV-001 | The system shall maintain inventory by product and warehouse location. | Must | Each product/location combination has a unique inventory record. |
| FR-INV-002 | The system shall prevent negative inventory quantities. | Must | Database checks and application validation prevent quantity values below zero. |
| FR-INV-003 | The system shall provide inventory summary, by-location view, and movement history tabs. | Must | Users can view total product quantity, location-specific quantities, and recent movement records. |
| FR-INV-004 | The system shall allow users to search inventory and filter by warehouse location. | Must | Results update according to product, SKU, location, and selected warehouse criteria. |
| FR-INV-005 | The system shall allow manual inventory increases and decreases with a required reason. | Must | Adjustments update inventory and create movement records of adjustment_increase or adjustment_decrease. |
| FR-INV-006 | The system shall allow inventory transfers between two different warehouse locations. | Must | Source quantity is reduced, destination quantity is increased or created, and a transfer movement is recorded. |
| FR-INV-007 | The system shall prevent transfer or decrease actions that exceed available quantity. | Must | The user receives a clear error and inventory remains unchanged. |
| FR-INV-008 | The system shall support bulk inventory update templates and import workflow. | Should | Users can download a template and upload valid updates. |
| FR-INV-009 | The system shall support CSV export for inventory records and movement history. | Should | Users can export visible inventory and movement data. |
| FR-INV-010 | The system shall expose tax paid by product/location where purchase allocations contain tax amounts. | Could | Inventory summary includes tax paid values derived from purchase allocation data. |

### 7.6 Purchase Management And Landed Costing

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-PUR-001 | The system shall allow users to create, search, filter, sort, edit, delete, import, and export purchase invoices. | Must | Purchases can be managed from the Purchases module using invoice, supplier, status, date, and sort filters. |
| FR-PUR-002 | The system shall maintain purchase statuses of draft and completed. | Must | New purchases are created as draft and can be completed after validation. |
| FR-PUR-003 | The system shall support purchase line items with product, quantity, unit cost, tax percent, tax amount, tax recoverability, and landed unit cost. | Must | Line item data is stored and validated against positive quantity and non-negative cost/tax rules. |
| FR-PUR-004 | The system shall support additional purchase costs such as shipping, customs duties, and other costs. | Must | Additional costs can be added, updated, deleted, and included in landed cost calculations. |
| FR-PUR-005 | The system shall require warehouse allocations before completing purchase line items. | Must | Completion fails if a line item has no allocation. |
| FR-PUR-006 | The system shall calculate landed unit cost at purchase completion. | Must | Additional costs are distributed proportionally by line item quantity and stored on each line item. |
| FR-PUR-007 | The system shall post allocated quantities to inventory when a purchase is completed. | Must | Inventory is inserted or incremented per product/location allocation. |
| FR-PUR-008 | The system shall create inventory movement records for completed purchase allocations. | Must | Each allocation creates a purchase_allocation movement tied to the purchase reference. |
| FR-PUR-009 | The system shall allow completed purchase deletion to revert inventory quantities according to allocations. | Should | Deleted completed purchases reduce or remove associated inventory records without negative results. |
| FR-PUR-010 | The system shall write activity log entries for purchase, line item, additional cost, allocation, and completion actions. | Should | Relevant purchase events appear in the activity log with user and change details where available. |
| FR-PUR-011 | The system shall support CSV import of purchase invoices grouped by invoice and mapped to suppliers, products, and warehouses. | Should | Valid CSV rows create invoices, line items, costs, and allocations according to template fields. |

### 7.7 Shipment Tracking

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-SHIP-001 | The system shall allow users to track shipments against purchase invoices. | Must | A shipment can be created for a purchase with carrier, tracking number, ETA, origin, destination, and notes. |
| FR-SHIP-002 | The system shall support shipment statuses of ordered, shipped, in_transit, customs, delivered, and received. | Must | Shipments appear in the correct pipeline status column and list view. |
| FR-SHIP-003 | The system shall display active shipment, delayed shipment, origin country, and received shipment summary metrics. | Should | Metrics update based on shipment status and estimated arrival dates. |
| FR-SHIP-004 | The system shall maintain shipment event history. | Should | Status changes create timeline events with status, location, notes, date, and user where available. |
| FR-SHIP-005 | The system shall identify delayed shipments. | Should | Shipments with ETA before the current date and not received are marked delayed. |

### 7.8 Sales Channels And Pricing

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-CH-001 | The system shall allow users to create, view, search, edit, delete, and export sales channels. | Must | Sales channels can be managed from Sales Channels and Settings modules. |
| FR-CH-002 | The system shall store channel name, commission percentage, and status. | Must | Commission percent is validated between 0 and 100. |
| FR-CH-003 | The system shall prevent deletion of sales channels that have pricing rules. | Must | Users receive an error when attempting to delete a referenced channel. |
| FR-PRICE-001 | The system shall support channel-specific pricing per product. | Must | Each product/channel combination can have one pricing record. |
| FR-PRICE-002 | The system shall support retail price, offer price, promo price, fulfillment mode, seller shipping cost, and marketplace fulfillment cost. | Must | Users can add and inline-edit pricing and fulfillment assumptions. |
| FR-PRICE-003 | The system shall calculate active price using promo price first, then offer price, then retail price. | Should | Pricing tables and profitability use the expected active price hierarchy. |
| FR-PRICE-004 | The system shall allow filtering pricing by product search and selected sales channel. | Should | Pricing list updates when search or channel filter changes. |

### 7.9 Profitability Analysis

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-PROFIT-001 | The system shall calculate projected profitability by product and sales channel. | Must | Profitability rows display price, landed cost, commission, fulfillment, gross profit, and margin. |
| FR-PROFIT-002 | The system shall use the most recent landed unit cost per product from completed purchase line items. | Must | Landed cost values are derived from purchase line items with stored landed_unit_cost. |
| FR-PROFIT-003 | The system shall allow profitability analysis by price basis: active, retail, offer, or promo. | Should | Users can switch price basis and see recalculated margin results. |
| FR-PROFIT-004 | The system shall summarize average margin, profitable count, and unprofitable count. | Should | Summary cards update based on filtered analysis data. |

### 7.10 Order Management

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-ORD-001 | The system shall allow users to create, view, search, filter, edit, delete, import, and export customer orders. | Should | Orders can be managed by status, channel, date range, customer, order number, and product search. |
| FR-ORD-002 | The system shall support order statuses of pending, processing, shipped, delivered, and cancelled. | Should | Orders display and filter by supported status values. |
| FR-ORD-003 | The system shall store order number, customer name, customer email, order date, status, total amount, sales channel, notes, and order items. | Should | Orders and line items persist to Supabase where the orders schema exists. |
| FR-ORD-004 | The system shall support a local storage fallback when the orders database tables are unavailable. | Could | The Orders module can operate with clearly indicated local/demo storage and offers a retry connection action. |
| FR-ORD-005 | The system shall log order create, update, and delete activity where implemented. | Could | Order events appear in the activity log or equivalent audit trail. |

### 7.11 Activity Log And Auditability

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-AUD-001 | The system shall maintain a dashboard activity log for key entity actions. | Must | Activity records include entity type, action, entity ID, description, metadata, user, and created timestamp. |
| FR-AUD-002 | The system shall allow users to filter activity by entity type, action, user, date range, and sort direction. | Should | Activity table updates based on selected filters. |
| FR-AUD-003 | The system shall support activity log CSV export. | Should | Filtered log rows can be exported with date, entity, action, description, user, and metadata. |
| FR-AUD-004 | The system shall maintain immutable inventory movement history. | Must | Inventory movement records are append-only from the application type model. |

### 7.12 Data Import And Export

| ID | Requirement | Priority | Acceptance Criteria |
| --- | --- | --- | --- |
| FR-DATA-001 | The system shall provide CSV exports for products, suppliers, sales channels, purchases, inventory, inventory movements, orders, and activity logs. | Should | Each export downloads a CSV with defined columns. |
| FR-DATA-002 | The system shall provide CSV templates for supported bulk import workflows. | Should | Users can download templates for products, purchases, suppliers, orders, and inventory updates. |
| FR-DATA-003 | The system shall normalize imported CSV headers into expected field names. | Should | Headers containing spaces, asterisks, and parenthetical helper text are parsed correctly. |
| FR-DATA-004 | The system shall validate imported references such as supplier, product, warehouse, and channel identifiers. | Must | Invalid references fail with actionable error messages before incomplete data is saved. |

## 8. Data Requirements

### 8.1 Core Entities

| Entity | Purpose | Key Fields |
| --- | --- | --- |
| Users | Application profile and role data linked to Supabase Auth. | id, email, full_name, role. |
| Products | Product master records. | id, product_code, name, sku, status, UPC/GTIN, brand, image_url, weight, dimensions. |
| Warehouse Locations | Inventory storage and fulfillment locations. | id, name, status, address/geographic fields. |
| Inventory | Current quantity per product/location. | product_id, warehouse_location_id, quantity. |
| Inventory Movements | Audit history for inventory changes. | product_id, source, destination, quantity, movement_type, reference, reason, user. |
| Suppliers | Supplier master data. | name, short_name, email, phone, notes, status, location metadata. |
| Purchases | Supplier invoice headers. | invoice_number, supplier_id, status, invoice_date, created_by, completed_at. |
| Purchase Line Items | Products and costs on purchase invoices. | product_id, quantity, unit_cost, tax fields, landed_unit_cost. |
| Purchase Additional Costs | Shipping, customs, and other landed cost inputs. | cost_type, amount, notes. |
| Purchase Allocations | Allocation of purchased units to warehouse locations. | purchase_line_item_id, warehouse_location_id, quantity. |
| Shipment Tracking | Inbound shipment records tied to purchases. | purchase_id, status, carrier, tracking_number, ETA, arrival, origin, destination. |
| Shipment Events | Shipment status history. | shipment_id, status, location, notes, event_date, created_by. |
| Sales Channels | Marketplace/channel configuration. | name, commission_percent, status. |
| Channel Pricing | Product pricing by channel. | product_id, channel_id, retail, offer, promo, fulfillment mode and costs. |
| Orders | Customer order headers. | order_number, customer, status, date, total, sales_channel, notes. |
| Order Items | Products and quantities on customer orders. | order_id, product_id, quantity, unit_price. |
| Dashboard Activity Log | Operational audit log. | entity_type, action, entity_id, description, metadata, user_id, created_at. |

### 8.2 Data Integrity Rules

1. UUIDs are used for primary relationships rather than mutable business names.
2. Product SKU values are unique.
3. Product codes are generated and unique.
4. Inventory quantity cannot be negative.
5. Purchase line item quantity must be positive.
6. Purchase unit cost, tax amount, additional cost, pricing, fulfillment cost, and order totals cannot be negative.
7. Channel commission percentage must be between 0 and 100.
8. Product weight requires a weight unit when weight is provided.
9. Product dimensions require a dimension unit when length, width, or height is provided.
10. A product/location inventory record must be unique.
11. A product/channel pricing record must be unique.
12. Purchase completion requires at least one line item and warehouse allocation coverage.

## 9. Key Business Workflows

### 9.1 Product Setup Workflow

1. User creates a product manually or imports products from CSV.
2. System validates required values and units.
3. System stores the product, generates or preserves product code, and optionally stores image URL/upload.
4. User can search, filter, edit, export, or archive/inactivate the product.

### 9.2 Purchase To Inventory Workflow

1. User creates a draft purchase invoice for a supplier.
2. User adds purchase line items with quantity, unit cost, tax percent, tax amount, and tax recoverability.
3. User adds additional costs such as shipping or customs duties.
4. User allocates each line item quantity to one or more warehouse locations.
5. User completes the purchase.
6. System allocates additional costs proportionally by line item quantity.
7. System stores landed unit cost on line items.
8. System increases inventory per allocation.
9. System creates inventory movement records.
10. System marks the purchase completed and logs activity.

### 9.3 Inventory Adjustment And Transfer Workflow

1. User selects product and warehouse location.
2. User chooses increase, decrease, or transfer action.
3. System validates quantity and location constraints.
4. System updates inventory quantities.
5. System records movement history and activity log details.

### 9.4 Pricing And Profitability Workflow

1. User creates sales channels and commission percentages.
2. User creates or edits product pricing by channel.
3. User defines fulfillment mode and cost assumptions.
4. System selects price basis using active, retail, offer, or promo logic.
5. System retrieves latest landed cost per product.
6. System calculates commission, fulfillment cost, gross profit, and margin.
7. User filters and reviews profitability outcomes.

### 9.5 Shipment Tracking Workflow

1. User creates tracking record against a purchase.
2. User enters carrier, tracking number, origin, destination, ETA, and notes.
3. System displays shipment in status pipeline and list view.
4. User updates status as the shipment progresses.
5. System records shipment events and highlights delayed shipments.

### 9.6 Order Management Workflow

1. User creates or imports customer orders.
2. System stores order header and order line items.
3. User filters by status, channel, date, order/customer details, or product details.
4. User edits, exports, or deletes orders as needed.
5. If order tables are unavailable, the system can operate in local/demo storage mode.

## 10. Reporting And Analytics Requirements

| Report / View | Business Purpose |
| --- | --- |
| Dashboard summary | Quick operational health view across products, inventory, purchases, suppliers, channels, and warehouses. |
| Inventory by location | Identify where stock is held and support transfer/replenishment decisions. |
| Low-stock products | Highlight products at or below low-stock threshold. |
| Recent purchases | Monitor current procurement activity. |
| Movement history | Audit inventory changes and support reconciliation. |
| Shipment pipeline | Track inbound purchase orders and delayed shipments. |
| Channel pricing table | Maintain marketplace pricing and fulfillment assumptions. |
| Profitability analysis | Compare projected product/channel profitability using landed costs. |
| Activity log | Review system changes by user, entity, action, and date. |
| CSV exports | Support offline analysis, reconciliation, and stakeholder reporting. |

## 11. Non-Functional Requirements

| Category | Requirement | Priority |
| --- | --- | --- |
| Security | All operational pages shall require authentication. | Must |
| Security | Supabase RLS shall be enabled on application tables. | Must |
| Security | Secrets shall be stored in environment variables, not committed source. | Must |
| Usability | The interface shall support search, filters, pagination, and clear empty/error states for operational tables. | Must |
| Usability | The dashboard shall be responsive for desktop and mobile navigation. | Should |
| Performance | Common dashboard and table queries shall complete within acceptable interactive latency for normal operational data volumes. | Should |
| Reliability | Inventory updates shall preserve non-negative quantities. | Must |
| Reliability | Purchase completion shall fail clearly if required line items or allocations are missing. | Must |
| Auditability | Key operational mutations shall create activity records or movement history. | Must |
| Maintainability | The frontend shall use TypeScript types, validation schemas, and shared utilities where practical. | Should |
| Importability | Bulk imports shall validate required references and provide actionable errors. | Must |

## 12. Business Rules

1. Only authenticated users can access dashboard data.
2. Admin users can access user role management in Settings.
3. Products may be active or inactive.
4. Suppliers may be active or inactive.
5. Warehouse locations may be active or inactive.
6. Sales channels may be active or inactive.
7. Purchases start as draft and become completed when the completion workflow succeeds.
8. Landed unit cost is calculated at completion using line item quantity as the proportional allocation basis for additional costs.
9. Inventory changes must create movement records for purchase allocations, transfers, and adjustments.
10. Inventory cannot go negative.
11. A product cannot normally be deleted if it has inventory or purchase history.
12. A supplier cannot be deleted if it has associated purchases.
13. A sales channel cannot be deleted if it has pricing records.
14. Active price is promo price when available, otherwise offer price, otherwise retail price.
15. Profitability gross profit equals selected price minus landed cost, channel commission, and fulfillment cost.
16. Profitability margin equals gross profit divided by selected price.
17. Shipments are delayed when estimated arrival is before the current date and status is not received.

## 13. Integrations And External Dependencies

| Dependency | Purpose |
| --- | --- |
| Supabase Auth | User authentication and session management. |
| Supabase PostgreSQL | Application database for operational entities. |
| Supabase Row Level Security | Database-level access control. |
| Supabase Storage | Product image storage through product-images bucket. |
| React Query | Client-side data fetching and cache invalidation. |
| React Hook Form and Zod | Form validation and typed data handling. |
| Recharts | Dashboard and analytical visualizations. |
| Browser localStorage | Dashboard card order persistence and fallback order storage where needed. |

## 14. Assumptions

1. Users are internal team members with authorized access to company operational data.
2. Supabase is the system of record for production data.
3. Purchase line item quantity is an acceptable allocation basis for additional landed costs in the current version.
4. Marketplace commissions and fulfillment costs are entered manually and maintained by users.
5. Product/channel profitability is projected, not a finalized accounting statement.
6. Orders currently do not automatically decrement inventory unless a future workflow is added.
7. Carrier tracking status is manually maintained unless future external integrations are implemented.

## 15. Constraints

1. The application depends on valid Supabase environment variables for production use.
2. RLS policies must remain aligned with the frontend workflows.
3. Large imports depend on valid CSV formatting and reference data setup.
4. The current schema supports two roles: admin and standard.
5. Local storage order fallback is not a production-grade data store and should be treated as temporary/demo behavior.

## 16. Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Manual pricing and fulfillment cost inputs become outdated. | Profitability analysis may be inaccurate. | Add review cadence, timestamps, and future marketplace integrations. |
| Purchase completion partially updates records if a client-side sequence fails. | Inventory and landed costs may become inconsistent. | Move completion into a database transaction/RPC in a future hardening phase. |
| CSV imports contain ambiguous product or supplier references. | Incorrect records may be created or import may fail. | Require templates, validate references, and provide row-level error messages. |
| Orders local storage fallback is used unintentionally. | Orders may not be shared across users or devices. | Make database connection status prominent and prioritize Supabase table deployment. |
| Broad authenticated RLS policies allow more access than desired. | Users may mutate data outside intended role boundaries. | Define a detailed role/permission matrix and tighten RLS policies. |
| Product deletion cleanup exceptions could remove related data unexpectedly. | Historical integrity risk. | Prefer inactive/archive status and restrict permanent delete to admins or maintenance tools. |

## 17. Open Questions

1. Should order creation reserve or deduct inventory, and at what order status should that occur?
2. Should purchase completion be executed in a Supabase database function to guarantee atomicity?
3. Should landed cost allocation use quantity, weight, value, or configurable allocation basis?
4. Should tax recoverability affect landed cost or profitability calculations?
5. What are the exact permission boundaries between admin and standard users?
6. Are marketplace and carrier API integrations planned for automatic price, order, fulfillment, or shipment sync?
7. What low-stock thresholds should be configurable per product or location?
8. Should deleted operational records be soft-deleted instead of permanently deleted?

## 18. Success Metrics

| Metric | Target Outcome |
| --- | --- |
| Product data completeness | High percentage of active products with SKU, product code, brand, and dimensional data where applicable. |
| Purchase processing accuracy | Completed purchases consistently create landed costs and correct inventory movements. |
| Inventory reconciliation | Fewer manual corrections and clear movement history for adjustments/transfers. |
| Pricing visibility | All active sales channels have maintained commission and pricing records for key products. |
| Profitability visibility | Pricing team can identify profitable and unprofitable product/channel combinations quickly. |
| Import/export efficiency | Reduced manual spreadsheet re-entry for products, purchases, suppliers, orders, and inventory updates. |
| Audit coverage | Key operational changes are attributable to a user and timestamp. |

## 19. Release Acceptance Criteria

1. Authenticated users can access all intended modules through the dashboard navigation.
2. Product, supplier, warehouse, sales channel, and pricing master data can be created, updated, searched, filtered, and exported.
3. Purchase invoices can be created with line items, additional costs, allocations, and completion workflow.
4. Completed purchases calculate landed unit costs and update inventory with movement records.
5. Inventory adjustments and transfers preserve quantity integrity and write movement history.
6. Profitability analysis displays accurate gross profit and margin based on selected price, latest landed cost, commission, and fulfillment cost.
7. Shipment tracking supports pipeline and list views with delay indicators and event history.
8. Orders can be managed with database persistence where tables are deployed.
9. Activity log records and filters key operational actions.
10. CSV import/export workflows work for supported templates and fail clearly for invalid references.
11. `npm run build` completes successfully for the application.

## 20. Appendix: Source Areas Reviewed

| Area | Source |
| --- | --- |
| Application routes and protected access | `src/App.tsx` |
| Navigation shell | `src/components/layout/DashboardLayout.tsx` |
| Project overview | `README.md` |
| Dashboard | `src/pages/DashboardPage.tsx` |
| Products | `src/pages/ProductsPage.tsx`, `src/components/products/ProductForm.tsx` |
| Inventory | `src/pages/InventoryPage.tsx` |
| Purchases and landed costing | `src/pages/PurchasesPage.tsx`, `src/pages/PurchaseDetailPage.tsx` |
| Shipment tracking | `src/pages/ShipmentTrackingPage.tsx`, `supabase/migrations/003_shipment_tracking.sql` |
| Pricing and profitability | `src/pages/PricingPage.tsx`, `src/pages/ProfitabilityPage.tsx` |
| Suppliers and sales channels | `src/pages/SuppliersPage.tsx`, `src/pages/SalesChannelsPage.tsx` |
| Settings and roles | `src/pages/SettingsPage.tsx`, `src/contexts/AuthContext.tsx` |
| Orders | `src/pages/OrdersPage.tsx`, `supabase/migrations/008_create_orders_table.sql` |
| Audit logging | `src/pages/ActivityLogPage.tsx`, `src/lib/audit.ts`, `supabase/migrations/005_product_code_and_activity_log.sql` |
| Validation and CSV utilities | `src/lib/validations.ts`, `src/lib/csv.ts` |
| Database schema | `supabase/migrations/*.sql`, `src/types/database.ts` |
