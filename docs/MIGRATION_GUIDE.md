# JewelX Migration Guide

## Overview
This guide explains how to migrate JewelX from Lovable Cloud to a self-hosted environment.

---

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ database
- Supabase CLI installed (optional but recommended)
- Git access to your codebase

---

## Migration Steps

### 1. Export Code from Lovable

JewelX code is automatically synced to GitHub (if configured). Otherwise:

```bash
# Download latest code export from Lovable
# Navigate to Settings → Export Code → Download ZIP
```

### 2. Set Up Local Development

```bash
# Clone repository
git clone <your-repo-url>
cd jewelx

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3. Configure Environment Variables

Update `.env` with your values:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id

# Additional configuration
VITE_APP_URL=https://your-domain.com
```

### 4. Database Migration

#### Option A: Export from Lovable Cloud Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Lovable Cloud Supabase
supabase login

# Link to your Lovable Cloud project
supabase link --project-ref <lovable-project-id>

# Export database schema
supabase db dump -f schema.sql

# Export data
supabase db dump --data-only -f data.sql
```

#### Option B: Manual Database Setup

1. Create new PostgreSQL database:
```sql
CREATE DATABASE jewelx;
```

2. Run migrations from `supabase/migrations/` folder in order:
```bash
for file in supabase/migrations/*.sql; do
  psql -d jewelx -f "$file"
done
```

3. Import data using `pg_dump` or manual SQL exports

### 5. Storage Migration

#### Export Files from Lovable Cloud

```bash
# Download storage bucket contents
supabase storage download product-assets --project-ref <project-id>
```

#### Upload to New Storage

**Option A: Self-hosted Supabase**
```bash
supabase storage upload product-assets ./product-assets
```

**Option B: Cloudflare R2**
```bash
# Install Wrangler CLI
npm install -g wrangler

# Configure R2 bucket
wrangler r2 bucket create jewelx-assets

# Upload files
aws s3 sync ./product-assets s3://jewelx-assets --endpoint-url https://<account>.r2.cloudflarestorage.com
```

**Option C: AWS S3**
```bash
aws s3 sync ./product-assets s3://jewelx-assets
```

Update storage URLs in code (`src/lib/storage-utils.ts`)

### 6. Edge Functions Migration

Edge functions are in `supabase/functions/`. Deploy options:

#### Option A: Supabase (Self-hosted or Cloud)

```bash
# Deploy all functions
supabase functions deploy

# Or deploy specific function
supabase functions deploy database-backup
```

#### Option B: Cloudflare Workers

Convert Deno edge functions to Cloudflare Workers:

```bash
# Install Wrangler
npm install -g wrangler

# Initialize Worker
wrangler init jewelx-functions

# Deploy
wrangler publish
```

Update function URLs in environment variables.

#### Option C: AWS Lambda

Package functions for Lambda:
```bash
# Build for Node.js runtime
npm run build:functions

# Deploy via AWS CLI or Console
```

### 7. Frontend Deployment

#### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Configuration (`vercel.json`):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "env": {
    "VITE_SUPABASE_URL": "@supabase-url",
    "VITE_SUPABASE_ANON_KEY": "@supabase-anon-key"
  }
}
```

#### Option B: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

Configuration (`netlify.toml`):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### Option C: Self-hosted (Nginx)

Build production bundle:
```bash
npm run build
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name jewelx.com;

    root /var/www/jewelx/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy (if needed)
    location /api/ {
        proxy_pass https://your-backend.com/;
    }
}
```

### 8. DNS & Domain Configuration

Update DNS records:
```
A     @           Your-Server-IP
CNAME www         your-domain.com
CNAME api         your-backend.supabase.co
```

### 9. SSL/TLS Certificates

#### Vercel/Netlify
Automatic SSL via Let's Encrypt

#### Self-hosted
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d jewelx.com -d www.jewelx.com
```

### 10. Post-Migration Checklist

- [ ] Test authentication (login/signup)
- [ ] Test ring configurator
- [ ] Test Shopify integration
- [ ] Test order creation
- [ ] Test AI chat assistant
- [ ] Verify email notifications work
- [ ] Test GDPR workflows
- [ ] Run backup job manually
- [ ] Monitor performance logs
- [ ] Check security events dashboard

---

## Rollback Plan

If migration fails:

1. **DNS Rollback:** Point domain back to Lovable
2. **Database Rollback:** Restore from Lovable Cloud backup
3. **Code Rollback:** Revert to last known working commit

---

## Performance Optimization

After migration, optimize:

### CDN Setup (Cloudflare)
```bash
# Add site to Cloudflare
# Configure caching rules for /assets/*
# Enable Rocket Loader for JS
```

### Database Indexing
```sql
-- Already implemented in migrations
-- Verify with:
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public';
```

### Caching Strategy
- Static assets: 1 year cache
- API responses: 5 minutes cache
- User-specific data: No cache

---

## Cost Comparison

| Service | Lovable Cloud | Self-hosted (Vercel + Supabase) |
|---------|---------------|----------------------------------|
| Hosting | $0 | $20/month (Vercel Pro) |
| Database | $0 | $25/month (Supabase Pro) |
| Storage | $0 | $5/month (Cloudflare R2) |
| Functions | $0 | $0 (Vercel Serverless) |
| **Total** | **$0** | **$50/month** |

---

## Scaling Considerations

### Database Scaling
- Enable read replicas (Supabase Pro+)
- Implement connection pooling (PgBouncer)
- Optimize indexes based on query patterns

### Frontend Scaling
- Use CDN for all static assets
- Implement service worker for offline support
- Enable HTTP/2 and Brotli compression

### Function Scaling
- Monitor cold start times
- Implement warming strategy for critical functions
- Use edge caching where applicable

---

## Monitoring Setup

### Application Monitoring
```bash
# Install Sentry
npm install @sentry/react

# Configure in main.tsx
Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production",
});
```

### Database Monitoring
- Enable Supabase database insights
- Set up alerts for slow queries
- Monitor connection pool usage

### Uptime Monitoring
- Pingdom
- StatusCake

---

## Security Hardening

### Firewall Rules
```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

### Database Security
```sql
-- Restrict network access
-- Set strong passwords
-- Enable SSL connections only
```

### Environment Variables
- Use secret management (Vercel secrets, AWS Secrets Manager)
- Never commit `.env` files
- Rotate API keys quarterly

---

## Troubleshooting

### Issue: Database connection fails
```
Error: Connection refused
```
**Solution:**
- Verify SUPABASE_URL is correct
- Check firewall allows connections
- Verify API key has correct permissions

### Issue: Storage files not loading
```
403 Forbidden
```
**Solution:**
- Verify signed URL generation works
- Check storage RLS policies
- Ensure bucket is private (not public)

### Issue: Edge functions timeout
```
504 Gateway Timeout
```
**Solution:**
- Check function logs
- Increase timeout limit (default 10s)
- Optimize slow database queries

---

## Support Resources

- [Supabase Migration Docs](https://supabase.com/docs/guides/platform/migrating-and-upgrading-projects)
- [Vercel Deployment Guide](https://vercel.com/docs/deployments/overview)
- [PostgreSQL Migration Tools](https://wiki.postgresql.org/wiki/Converting_from_other_Databases_to_PostgreSQL)

---

## Emergency Contacts

- **Database Issues:** Supabase Support
- **Hosting Issues:** Vercel Support
- **DNS Issues:** Domain registrar support
- **Critical Bugs:** Create GitHub issue with `[URGENT]` tag
