-- One-time data fix: apply the correct super admin name and company email.
-- Safe to re-run — only touches these two specific values.
UPDATE "users" SET "name" = 'Karthik P' WHERE "username" = 'superadmin';

UPDATE "settings"
SET "value" = jsonb_set(value::jsonb, '{email}', '"karthikp@tagcorporation.net"')
WHERE "key" = 'company_profile';
