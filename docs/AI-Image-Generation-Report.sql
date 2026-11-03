-- =====================================================================
-- JewlX: AI IMAGE GENERATION REPORT
-- Lifetime, per client, per model, per month: how many images, which model,
-- what it cost, and how much came from free credits vs the client's own money.
--
-- WHERE THE DATA COMES FROM
--   wallet_transactions is the source of truth. It is never archived.
--   Every AI request writes ONE debit row, or TWO rows that share the same
--   reference_id when the charge was split (free-credit part + purchased part).
--   So a "generation" = one distinct reference_id, not one row.
--
--   amount           = CLIENT PRICE charged (base cost x multiplier at that time)
--   "(free credits)" = that part came from the monthly free allowance (JewlX's cost)
--   "(purchased)" or no suffix = that part came from the client's own wallet
--   metadata.model   = the AI model used (older rows: parsed from the description)
--
--   Supplier cost is NOT stored per request. est_supplier_cost below is
--   charged / current image_multiplier, an estimate only.
--
-- HOW TO RUN
--   Supabase SQL editor on the JewlX project. All months are UTC.
--   Each numbered query is self-contained: copy the whole block (the WITH part
--   plus the SELECT) and run it.
--   To include AI chat and cost estimates as well, change the feature list in
--   every "IN ('ring_preview','grillz_preview','enquiry_preview')" line.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Current pricing settings (for context on the numbers below)
-- ---------------------------------------------------------------------
SELECT image_base_cost,
       image_multiplier,
       ROUND(image_base_cost * image_multiplier, 4)  AS image_client_price_now,
       chat_base_cost,
       chat_multiplier,
       ROUND(chat_base_cost * chat_multiplier, 4)    AS chat_client_price_now,
       monthly_free_credits_dollars                  AS free_credits_per_client_per_month,
       updated_at
FROM platform_ai_config;


-- ---------------------------------------------------------------------
-- 1. PER CLIENT, LIFETIME
--    images, how many were fully free / fully paid / split, money split,
--    estimated supplier cost, first and last image date
-- ---------------------------------------------------------------------
WITH cfg AS (SELECT image_multiplier FROM platform_ai_config LIMIT 1),
tx AS (
  SELECT wt.id, wt.client_id, wt.created_at, wt.reference_id,
         COALESCE(wt.metadata->>'model', substring(wt.description from '^[a-z_]+ \(([^)]+)\)')) AS model,
         ABS(wt.amount) AS charged,
         (wt.description ILIKE '% (free credits)') AS is_free
  FROM wallet_transactions wt
  WHERE wt.type = 'debit'
    AND COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
),
gen AS (
  SELECT client_id, COALESCE(reference_id, id::text) AS gen_id,
         MIN(created_at) AS created_at, MIN(model) AS model,
         SUM(charged) AS charged,
         COALESCE(SUM(charged) FILTER (WHERE is_free), 0)     AS free_part,
         COALESCE(SUM(charged) FILTER (WHERE NOT is_free), 0) AS paid_part,
         CASE WHEN BOOL_AND(is_free) THEN 'free'
              WHEN BOOL_OR(is_free)  THEN 'split'
              ELSE 'paid' END AS funding
  FROM tx GROUP BY client_id, COALESCE(reference_id, id::text)
)
SELECT c.company_name,
       COALESCE(c.exclude_from_admin_revenue, false)            AS internal_account,
       COUNT(*)                                                 AS images_total,
       COUNT(*) FILTER (WHERE g.funding = 'free')               AS images_fully_free,
       COUNT(*) FILTER (WHERE g.funding = 'paid')               AS images_fully_paid,
       COUNT(*) FILTER (WHERE g.funding = 'split')              AS images_split,
       ROUND(SUM(g.charged), 2)                                 AS charged_total_usd,
       ROUND(SUM(g.free_part), 2)                               AS from_free_credits_usd,
       ROUND(SUM(g.paid_part), 2)                               AS from_client_wallet_usd,
       ROUND(SUM(g.charged) / NULLIF(MAX(cfg.image_multiplier), 0), 2) AS est_supplier_cost_usd,
       MIN(g.created_at)::date                                  AS first_image,
       MAX(g.created_at)::date                                  AS last_image
FROM gen g
JOIN clients c ON c.id = g.client_id
CROSS JOIN cfg
GROUP BY c.company_name, c.exclude_from_admin_revenue
ORDER BY images_total DESC;


-- ---------------------------------------------------------------------
-- 2. PER CLIENT, PER MODEL, LIFETIME
-- ---------------------------------------------------------------------
WITH cfg AS (SELECT image_multiplier FROM platform_ai_config LIMIT 1),
tx AS (
  SELECT wt.id, wt.client_id, wt.created_at, wt.reference_id,
         COALESCE(wt.metadata->>'model', substring(wt.description from '^[a-z_]+ \(([^)]+)\)')) AS model,
         ABS(wt.amount) AS charged,
         (wt.description ILIKE '% (free credits)') AS is_free
  FROM wallet_transactions wt
  WHERE wt.type = 'debit'
    AND COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
),
gen AS (
  SELECT client_id, COALESCE(reference_id, id::text) AS gen_id,
         MIN(created_at) AS created_at, MIN(model) AS model,
         SUM(charged) AS charged,
         COALESCE(SUM(charged) FILTER (WHERE is_free), 0)     AS free_part,
         COALESCE(SUM(charged) FILTER (WHERE NOT is_free), 0) AS paid_part
  FROM tx GROUP BY client_id, COALESCE(reference_id, id::text)
)
SELECT c.company_name,
       COALESCE(g.model, '(unknown)')                           AS model,
       COUNT(*)                                                 AS images,
       ROUND(SUM(g.charged), 2)                                 AS charged_usd,
       ROUND(SUM(g.free_part), 2)                               AS from_free_credits_usd,
       ROUND(SUM(g.paid_part), 2)                               AS from_client_wallet_usd,
       ROUND(AVG(g.charged), 4)                                 AS avg_price_per_image_usd,
       ROUND(SUM(g.charged) / NULLIF(MAX(cfg.image_multiplier), 0), 2) AS est_supplier_cost_usd,
       MIN(g.created_at)::date                                  AS first_used,
       MAX(g.created_at)::date                                  AS last_used
FROM gen g
JOIN clients c ON c.id = g.client_id
CROSS JOIN cfg
GROUP BY c.company_name, g.model
ORDER BY c.company_name, images DESC;


-- ---------------------------------------------------------------------
-- 3. PER CLIENT, PER MONTH  (the main month-by-month record)
-- ---------------------------------------------------------------------
WITH cfg AS (SELECT image_multiplier FROM platform_ai_config LIMIT 1),
tx AS (
  SELECT wt.id, wt.client_id, wt.created_at, wt.reference_id,
         ABS(wt.amount) AS charged,
         (wt.description ILIKE '% (free credits)') AS is_free
  FROM wallet_transactions wt
  WHERE wt.type = 'debit'
    AND COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
),
gen AS (
  SELECT client_id, COALESCE(reference_id, id::text) AS gen_id,
         MIN(created_at) AS created_at,
         SUM(charged) AS charged,
         COALESCE(SUM(charged) FILTER (WHERE is_free), 0)     AS free_part,
         COALESCE(SUM(charged) FILTER (WHERE NOT is_free), 0) AS paid_part,
         CASE WHEN BOOL_AND(is_free) THEN 'free'
              WHEN BOOL_OR(is_free)  THEN 'split'
              ELSE 'paid' END AS funding
  FROM tx GROUP BY client_id, COALESCE(reference_id, id::text)
)
SELECT c.company_name,
       to_char(date_trunc('month', g.created_at), 'YYYY-MM')   AS month,
       COUNT(*)                                                 AS images,
       COUNT(*) FILTER (WHERE g.funding = 'free')               AS images_fully_free,
       COUNT(*) FILTER (WHERE g.funding = 'paid')               AS images_fully_paid,
       COUNT(*) FILTER (WHERE g.funding = 'split')              AS images_split,
       ROUND(SUM(g.charged), 2)                                 AS charged_usd,
       ROUND(SUM(g.free_part), 2)                               AS from_free_credits_usd,
       ROUND(SUM(g.paid_part), 2)                               AS from_client_wallet_usd,
       ROUND(SUM(g.charged) / NULLIF(MAX(cfg.image_multiplier), 0), 2) AS est_supplier_cost_usd
FROM gen g
JOIN clients c ON c.id = g.client_id
CROSS JOIN cfg
GROUP BY c.company_name, date_trunc('month', g.created_at)
ORDER BY c.company_name, month;


-- ---------------------------------------------------------------------
-- 4. PER CLIENT, PER MONTH, PER MODEL  (full detail)
-- ---------------------------------------------------------------------
WITH tx AS (
  SELECT wt.id, wt.client_id, wt.created_at, wt.reference_id,
         COALESCE(wt.metadata->>'model', substring(wt.description from '^[a-z_]+ \(([^)]+)\)')) AS model,
         ABS(wt.amount) AS charged,
         (wt.description ILIKE '% (free credits)') AS is_free
  FROM wallet_transactions wt
  WHERE wt.type = 'debit'
    AND COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
),
gen AS (
  SELECT client_id, COALESCE(reference_id, id::text) AS gen_id,
         MIN(created_at) AS created_at, MIN(model) AS model,
         SUM(charged) AS charged,
         COALESCE(SUM(charged) FILTER (WHERE is_free), 0)     AS free_part,
         COALESCE(SUM(charged) FILTER (WHERE NOT is_free), 0) AS paid_part
  FROM tx GROUP BY client_id, COALESCE(reference_id, id::text)
)
SELECT c.company_name,
       to_char(date_trunc('month', g.created_at), 'YYYY-MM')   AS month,
       COALESCE(g.model, '(unknown)')                           AS model,
       COUNT(*)                                                 AS images,
       ROUND(SUM(g.charged), 2)                                 AS charged_usd,
       ROUND(SUM(g.free_part), 2)                               AS from_free_credits_usd,
       ROUND(SUM(g.paid_part), 2)                               AS from_client_wallet_usd,
       ROUND(AVG(g.charged), 4)                                 AS avg_price_per_image_usd
FROM gen g
JOIN clients c ON c.id = g.client_id
GROUP BY c.company_name, date_trunc('month', g.created_at), g.model
ORDER BY c.company_name, month, images DESC;


-- ---------------------------------------------------------------------
-- 5. PLATFORM TOTALS PER MONTH  (all clients; internal accounts shown separately)
-- ---------------------------------------------------------------------
WITH cfg AS (SELECT image_multiplier FROM platform_ai_config LIMIT 1),
tx AS (
  SELECT wt.id, wt.client_id, wt.created_at, wt.reference_id,
         ABS(wt.amount) AS charged,
         (wt.description ILIKE '% (free credits)') AS is_free
  FROM wallet_transactions wt
  WHERE wt.type = 'debit'
    AND COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
),
gen AS (
  SELECT client_id, COALESCE(reference_id, id::text) AS gen_id,
         MIN(created_at) AS created_at,
         SUM(charged) AS charged,
         COALESCE(SUM(charged) FILTER (WHERE is_free), 0)     AS free_part,
         COALESCE(SUM(charged) FILTER (WHERE NOT is_free), 0) AS paid_part
  FROM tx GROUP BY client_id, COALESCE(reference_id, id::text)
)
SELECT to_char(date_trunc('month', g.created_at), 'YYYY-MM')   AS month,
       COALESCE(c.exclude_from_admin_revenue, false)            AS internal_account,
       COUNT(DISTINCT g.client_id)                              AS clients_active,
       COUNT(*)                                                 AS images,
       ROUND(SUM(g.charged), 2)                                 AS charged_usd,
       ROUND(SUM(g.free_part), 2)                               AS from_free_credits_usd,
       ROUND(SUM(g.paid_part), 2)                               AS from_client_wallet_usd,
       ROUND(SUM(g.charged) / NULLIF(MAX(cfg.image_multiplier), 0), 2) AS est_supplier_cost_usd
FROM gen g
JOIN clients c ON c.id = g.client_id
CROSS JOIN cfg
GROUP BY date_trunc('month', g.created_at), c.exclude_from_admin_revenue
ORDER BY month, internal_account;


-- ---------------------------------------------------------------------
-- 6. IMAGES THAT WERE GENERATED BUT NEVER CHARGED
--    (request succeeded, wallet was empty at charge time, so no debit row).
--    Only possible for the last ~90 days, while the detailed log still exists.
-- ---------------------------------------------------------------------
SELECT c.company_name, l.feature, l.model, l.created_at
FROM ai_usage_logs l
JOIN clients c ON c.id = l.client_id
LEFT JOIN wallet_transactions wt ON wt.reference_id = l.id::text
WHERE l.feature IN ('ring_preview','grillz_preview','enquiry_preview')
  AND wt.id IS NULL
ORDER BY l.created_at DESC;


-- ---------------------------------------------------------------------
-- 7. CROSS-CHECK: image counts from the usage log (live + monthly archive)
--    vs image counts from wallet charges, per client per month.
--    diff should be 0 or a small positive number (= uncharged images from query 6).
-- ---------------------------------------------------------------------
WITH log_counts AS (
  SELECT client_id, date_trunc('month', created_at)::date AS month, COUNT(*) AS n
  FROM ai_usage_logs
  WHERE feature IN ('ring_preview','grillz_preview','enquiry_preview')
  GROUP BY client_id, date_trunc('month', created_at)::date
  UNION ALL
  SELECT client_id, month, total_requests
  FROM ai_usage_monthly_summary
  WHERE feature IN ('ring_preview','grillz_preview','enquiry_preview')
),
logs AS (
  SELECT client_id, month, SUM(n) AS images_logged FROM log_counts GROUP BY client_id, month
),
charges AS (
  SELECT client_id,
         date_trunc('month', MIN(created_at))::date AS month,
         COALESCE(reference_id, id::text) AS gen_id
  FROM wallet_transactions
  WHERE type = 'debit'
    AND COALESCE(metadata->>'feature', split_part(description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
  GROUP BY client_id, COALESCE(reference_id, id::text)
),
charged AS (
  SELECT client_id, month, COUNT(*) AS images_charged FROM charges GROUP BY client_id, month
)
SELECT c.company_name,
       to_char(COALESCE(l.month, ch.month), 'YYYY-MM') AS month,
       COALESCE(l.images_logged, 0)                    AS images_logged,
       COALESCE(ch.images_charged, 0)                  AS images_charged,
       COALESCE(l.images_logged, 0) - COALESCE(ch.images_charged, 0) AS diff
FROM logs l
FULL OUTER JOIN charged ch ON ch.client_id = l.client_id AND ch.month = l.month
JOIN clients c ON c.id = COALESCE(l.client_id, ch.client_id)
ORDER BY c.company_name, month;


-- ---------------------------------------------------------------------
-- 8. ONE CLIENT, EVERY SINGLE IMAGE  (drill-down; replace the name)
-- ---------------------------------------------------------------------
WITH tx AS (
  SELECT wt.id, wt.client_id, wt.created_at, wt.reference_id,
         COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1)) AS feature,
         COALESCE(wt.metadata->>'model', substring(wt.description from '^[a-z_]+ \(([^)]+)\)')) AS model,
         ABS(wt.amount) AS charged,
         (wt.description ILIKE '% (free credits)') AS is_free
  FROM wallet_transactions wt
  JOIN clients c ON c.id = wt.client_id
  WHERE wt.type = 'debit'
    AND c.company_name = 'IRIS FINE JEWELS LTD.'          -- <<< change
    AND COALESCE(wt.metadata->>'feature', split_part(wt.description,' ',1))
        IN ('ring_preview','grillz_preview','enquiry_preview')
)
SELECT MIN(created_at)                                        AS generated_at,
       MIN(feature)                                           AS feature,
       MIN(model)                                             AS model,
       ROUND(SUM(charged), 4)                                 AS charged_usd,
       ROUND(COALESCE(SUM(charged) FILTER (WHERE is_free), 0), 4)     AS from_free_credits_usd,
       ROUND(COALESCE(SUM(charged) FILTER (WHERE NOT is_free), 0), 4) AS from_client_wallet_usd,
       CASE WHEN BOOL_AND(is_free) THEN 'free'
            WHEN BOOL_OR(is_free)  THEN 'split'
            ELSE 'paid' END                                   AS funding
FROM tx
GROUP BY COALESCE(reference_id, id::text)
ORDER BY generated_at DESC;
