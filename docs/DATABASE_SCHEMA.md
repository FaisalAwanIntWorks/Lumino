# JewelX Database Schema Documentation

## Overview
JewelX uses PostgreSQL (via Supabase) for all data storage. The database is designed for a multi-tenant B2B SaaS platform serving jewelry retailers and their customers.

## Entity Relationship Diagram

```
agencies (1) ──< (many) clients
clients (1) ──< (many) orders
clients (1) ──< (many) saved_designs
clients (1) ──< (many) client_products
products (1) ──< (many) product_variations
products (1) ──< (many) client_products
```

## Core Tables

### agencies
**Purpose:** White-label agencies that manage multiple clients

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Agency name |
| logo_url | TEXT | Agency branding logo |
| primary_color | TEXT | Brand color (hex) |
| secondary_color | TEXT | Secondary brand color |
| created_at | TIMESTAMPTZ | Record creation timestamp |

**RLS Policies:**
- Anyone can view agencies
- Only admins can modify agencies

---

### clients
**Purpose:** Jewelry retailers using the platform

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| agency_id | UUID | Reference to agencies table |
| user_id | UUID | Reference to auth.users |
| company_name | TEXT | Business name |
| email | TEXT | Contact email |
| logo_url | TEXT | Client branding logo |
| status | TEXT | trial, active, suspended |
| plan_id | UUID | Subscription plan reference |
| shopify_store_url | TEXT | Shopify integration URL |
| shopify_access_token_encrypted | BYTEA | Encrypted Shopify API token |
| branding_config | JSONB | Custom branding settings |
| custom_commission_rate | NUMERIC | Override commission rate |
| subscription_ends_at | TIMESTAMPTZ | Trial/subscription end date |

**RLS Policies:**
- Admins can view all clients
- Clients can view/update their own record
- Only admins can modify clients

**Encryption:** Shopify access tokens are encrypted using `pgcrypto` with AES-256.

---

### products
**Purpose:** Base jewelry products (rings, necklaces, etc.)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| agency_id | UUID | Owning agency |
| name | TEXT | Product name |
| description | TEXT | Product description |
| category | TEXT | ring, necklace, bracelet, etc. |
| base_cost | NUMERIC | Manufacturing base cost |
| manufacturing_cost | NUMERIC | Additional manufacturing costs |
| image_urls | TEXT[] | Array of product image URLs |
| model_3d_url | TEXT | Path to 3D model file |
| cad_file_url | TEXT | CAD file for manufacturing |
| status | TEXT | active, draft, archived |
| created_by_admin_id | UUID | Admin who created product |

**RLS Policies:**
- Admins can manage all products
- Clients can view active products
- Public can view products (for embed configurator)

**Indexes:**
- `idx_products_status` (status) WHERE status = 'active'
- `idx_products_agency` (agency_id, status)

---

### product_variations
**Purpose:** Product customization options (metal, stone, etc.)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | Parent product reference |
| style | TEXT | solitaire, halo, vintage, etc. |
| metal | TEXT | yellow_gold, white_gold, platinum, etc. |
| stone_type | TEXT | diamond, sapphire, ruby, etc. |
| shape | TEXT | round, princess, emerald, etc. |
| carat | NUMERIC | Stone carat size |
| shank | TEXT | plain, pave, channel, etc. |
| image_url | TEXT | Variation-specific image |
| additional_cost | NUMERIC | Price modifier |
| is_active | BOOLEAN | Availability status |

**RLS Policies:**
- Admins can manage variations
- Public/clients can view active variations

**Indexes:**
- `idx_variations_product` (product_id, is_active)

---

### client_products
**Purpose:** Maps products to clients with pricing overrides

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Client reference |
| product_id | UUID | Product reference |
| is_enabled | BOOLEAN | Whether client offers this product |
| markup_percentage | NUMERIC | Pricing markup (default 100%) |
| custom_retail_price | NUMERIC | Override pricing |
| allow_jewelx_manufacturing | BOOLEAN | JewelX manufactures orders |
| allow_self_manufacturing | BOOLEAN | Client manufactures orders |

**RLS Policies:**
- Admins can manage all client products
- Clients can manage their own products

**Indexes:**
- `idx_client_products_enabled` (client_id, is_enabled) WHERE is_enabled = true

---

### orders
**Purpose:** Customer jewelry orders

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Retailer who received order |
| product_id | UUID | Ordered product |
| variation_id | UUID | Selected variation |
| configuration | JSONB | Complete customization details |
| customer_email | TEXT | End customer email |
| customer_name | TEXT | End customer name |
| customer_shipping | JSONB | Shipping address |
| total_amount | NUMERIC | Order total |
| commission_deducted | NUMERIC | JewelX commission amount |
| commission_collected | BOOLEAN | Payment status |
| status | TEXT | pending, confirmed, processing, shipped |
| manufacturing_status | TEXT | new_request, in_progress, completed |
| manufacturing_cad_files | TEXT[] | CAD file URLs |
| manufacturing_notes | TEXT | Production notes |
| shopify_order_id | TEXT | Shopify integration reference |
| tracking_number | TEXT | Shipment tracking |
| shipping_carrier | TEXT | UPS, FedEx, etc. |
| estimated_delivery_date | DATE | Expected delivery |
| delivered_at | TIMESTAMPTZ | Actual delivery timestamp |

**RLS Policies:**
- Admins can view/manage all orders
- Clients can view their own orders

**Indexes:**
- `idx_orders_client_id` (client_id)
- `idx_orders_client_status` (client_id, status)
- `idx_orders_customer_email` (customer_email)

---

### saved_designs
**Purpose:** Customer-saved jewelry configurations

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Retailer reference |
| product_id | UUID | Base product |
| configuration | JSONB | Design configuration |
| customer_name | TEXT | Customer who saved design |
| customer_email | TEXT | Customer email |
| customer_phone | TEXT | Optional phone |
| notes | TEXT | Customer notes |
| follow_up_status | TEXT | new, contacted, converted, abandoned |

**RLS Policies:**
- Admins can view all saved designs
- Clients can view/update their saved designs
- Authenticated users can create saved designs

**Indexes:**
- `idx_saved_designs_customer` (customer_email)
- `idx_saved_designs_client` (client_id)

---

## Security Tables

### audit_logs
**Purpose:** Comprehensive audit trail for all actions

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| timestamp | TIMESTAMPTZ | Event timestamp |
| user_id | UUID | User who performed action |
| user_email | TEXT | User email |
| user_role | TEXT | agency_admin, client |
| action_type | TEXT | create, update, delete, login, etc. |
| resource_type | TEXT | Table or resource affected |
| resource_id | UUID | Specific record ID |
| changes | JSONB | Before/after values |
| ip_address | INET | Request IP |
| user_agent | TEXT | Browser info |
| severity | TEXT | info, warning, error |
| metadata | JSONB | Additional context |

**RLS Policies:**
- Admins can view all logs
- System can insert logs

**Indexes:**
- `idx_audit_logs_timestamp` (timestamp DESC)
- `idx_audit_logs_user` (user_id, timestamp DESC)
- `idx_audit_logs_action` (action_type, timestamp DESC)

---

### security_events
**Purpose:** Security-specific event tracking

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| timestamp | TIMESTAMPTZ | Event timestamp |
| event_type | TEXT | failed_login, suspicious_activity, etc. |
| user_id | UUID | Associated user |
| email_attempted | TEXT | Email used in login attempt |
| ip_address | INET | Request IP |
| user_agent | TEXT | Browser info |
| details | JSONB | Event details |
| severity | TEXT | low, medium, high, critical |
| resolved | BOOLEAN | Whether issue is resolved |
| resolved_by | UUID | Admin who resolved |
| resolved_at | TIMESTAMPTZ | Resolution timestamp |

**RLS Policies:**
- Admins can view/update all security events
- System can insert events

**Indexes:**
- `idx_security_events_unresolved` (resolved, timestamp DESC) WHERE resolved = false
- `idx_security_events_type` (event_type, timestamp DESC)

---

### rate_limits
**Purpose:** API rate limiting and abuse prevention

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| identifier | TEXT | IP address or user ID |
| endpoint | TEXT | API endpoint |
| request_count | INTEGER | Requests in window |
| window_start | TIMESTAMPTZ | Rate limit window start |

**RLS Policies:**
- System can manage all rate limits

**Cleanup:** Old records cleaned via `cleanup_old_rate_limits()` function

---

## Compliance Tables

### gdpr_requests
**Purpose:** Track GDPR data access/deletion requests

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Associated client |
| customer_email | TEXT | Requester email |
| request_type | TEXT | data_export, data_deletion |
| status | TEXT | pending, in_progress, completed |
| requested_at | TIMESTAMPTZ | Request timestamp |
| completed_at | TIMESTAMPTZ | Completion timestamp |
| data_exported_url | TEXT | Signed URL for export download |
| notes | TEXT | Processing notes |

**RLS Policies:**
- Admins can manage all GDPR requests

---

### retention_policies
**Purpose:** Data retention rules per table/client

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Client-specific policy (null = global) |
| table_name | TEXT | Target table |
| retention_days | INTEGER | Days to retain data |
| auto_cleanup | BOOLEAN | Enable automatic cleanup |
| last_cleanup_at | TIMESTAMPTZ | Last cleanup execution |

**RLS Policies:**
- Admins can manage all retention policies
- Clients can manage their own policies

---

### data_cleanup_logs
**Purpose:** Audit trail for data cleanup operations

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| table_name | TEXT | Table cleaned |
| client_id | UUID | Client scope |
| retention_days | INTEGER | Policy applied |
| records_deleted | INTEGER | Number of records removed |
| execution_time_ms | INTEGER | Operation duration |
| status | TEXT | completed, failed |
| error_message | TEXT | Failure details |
| executed_at | TIMESTAMPTZ | Execution timestamp |

**RLS Policies:**
- Admins can view cleanup logs
- System can create logs

---

### backup_logs
**Purpose:** Track database backup operations

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| backup_date | TIMESTAMPTZ | Backup timestamp |
| backup_type | TEXT | daily, weekly, manual |
| status | TEXT | success, failed, in_progress |
| file_path | TEXT | Storage path |
| file_size_mb | NUMERIC | Backup size |
| tables_backed_up | TEXT[] | List of tables |
| error_message | TEXT | Failure details |
| metadata | JSONB | Additional info |

**RLS Policies:**
- Admins can view all backup logs
- System can create logs

**Indexes:**
- Backups are stored in `product-assets` storage bucket under `backups/` folder

---

## Performance Tables

### performance_logs
**Purpose:** Track API and page performance metrics

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| timestamp | TIMESTAMPTZ | Measurement time |
| endpoint | TEXT | API endpoint or page |
| method | TEXT | GET, POST, PAGE_LOAD |
| duration_ms | INTEGER | Execution time |
| client_id | UUID | Associated client |
| status_code | INTEGER | HTTP status |
| user_agent | TEXT | Browser info |
| metadata | JSONB | Additional context |

**RLS Policies:**
- Admins can view all performance logs
- System can create logs

**Indexes:**
- `idx_perf_endpoint_time` (endpoint, timestamp DESC)
- `idx_perf_slow_queries` (duration_ms DESC) WHERE duration_ms > 1000

---

## Usage Monitoring

### usage_snapshots
**Purpose:** Daily usage metrics per client

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Client reference |
| snapshot_date | DATE | Snapshot day |
| storage_size_mb | NUMERIC | Storage usage |
| storage_files_count | INTEGER | Number of files |
| database_size_mb | NUMERIC | Database size |
| database_rows | INTEGER | Total row count |
| bandwidth_mb | NUMERIC | Bandwidth used |
| function_invocations | INTEGER | Edge function calls |
| ai_tokens_used | INTEGER | AI API tokens |
| analytics_events_count | INTEGER | Tracked events |

**Indexes:**
- `idx_usage_snapshots_client_date` (client_id, snapshot_date DESC)

---

### usage_alerts
**Purpose:** Threshold-based usage notifications

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| client_id | UUID | Client reference |
| alert_type | TEXT | storage, bandwidth, orders, etc. |
| current_usage | NUMERIC | Current value |
| limit_value | NUMERIC | Threshold |
| threshold_percentage | INTEGER | % of limit reached |
| severity | TEXT | info, warning, critical |
| message | TEXT | Alert message |
| acknowledged | BOOLEAN | User acknowledged |
| acknowledged_at | TIMESTAMPTZ | Acknowledgment time |
| triggered_at | TIMESTAMPTZ | Alert creation time |

**RLS Policies:**
- Admins can view all alerts
- Clients can view/acknowledge their alerts

---

## Database Functions

### has_role(user_id UUID, role app_role) → BOOLEAN
Check if a user has a specific role (agency_admin or client)

### get_user_client_id(user_id UUID) → UUID
Get the client ID for a given user

### encrypt_shopify_token(client_user_id UUID, token TEXT)
Encrypt and store Shopify access token

### decrypt_shopify_token(client_user_id UUID) → TEXT
Decrypt Shopify access token for use

### encrypt_crm_api_key(integration_id UUID, key TEXT)
Encrypt and store CRM API key

### decrypt_crm_api_key(integration_id UUID) → TEXT
Decrypt CRM API key for use

### cleanup_old_rate_limits()
Remove rate limit records older than 1 hour

---

## Data Retention Policies

| Table | Default Retention | Notes |
|-------|-------------------|-------|
| orders | 7 years | Legal/tax requirement |
| audit_logs | 1 year | Security compliance |
| analytics_events | 90 days | Anonymized after 30 days |
| ai_chat_messages | 30 days | Privacy-focused |
| performance_logs | 30 days | Operational metrics |
| rate_limits | 1 hour | Auto-cleanup |

---

## Backup Strategy

- **Daily backups:** Automated at 2 AM UTC
- **Weekly full backups:** Sunday 3 AM UTC
- **Manual backups:** Via admin dashboard
- **Retention:** 30 days for daily, 90 days for weekly
- **Storage:** Encrypted in `product-assets/backups/` bucket

---

## Migration History

All migrations are tracked in `supabase/migrations/` folder with timestamps.

## Security Best Practices

1. **All tables have RLS enabled**
2. **Sensitive data is encrypted** (Shopify tokens, CRM keys)
3. **Audit logs track all modifications**
4. **Rate limiting prevents abuse**
5. **GDPR compliance workflows** (delete/export)
6. **Regular automated backups**
7. **Performance monitoring** for bottlenecks

---

## References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html)
- [GDPR Compliance Guide](https://gdpr.eu/)
