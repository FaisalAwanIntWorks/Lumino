
-- Drop tables (order matters for foreign key dependencies)
DROP TABLE IF EXISTS ai_document_chunks CASCADE;
DROP TABLE IF EXISTS ai_documents CASCADE;
DROP TABLE IF EXISTS ai_configurations CASCADE;
DROP TABLE IF EXISTS backup_my_master_db_data CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS client_health_metrics CASCADE;
DROP TABLE IF EXISTS client_diamond_step_overrides CASCADE;
DROP TABLE IF EXISTS client_stone_inventory CASCADE;
DROP TABLE IF EXISTS comparison_sets CASCADE;
DROP TABLE IF EXISTS custom_alert_rules CASCADE;
DROP TABLE IF EXISTS customer_addresses CASCADE;
DROP TABLE IF EXISTS favorite_designs CASCADE;
DROP TABLE IF EXISTS gdpr_requests CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS metal_price_history CASCADE;
DROP TABLE IF EXISTS performance_logs CASCADE;
DROP TABLE IF EXISTS product_reviews CASCADE;
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS usage_alerts CASCADE;
