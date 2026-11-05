-- AI analytics: the read-only role, by hand. Prefer
--   node scripts/ai-readonly-role.mjs create --apply
-- which runs exactly these statements with a random password and prints
-- AI_READONLY_DATABASE_URL. Use this file only when DATABASE_URL's user
-- can't create roles. As a user that can (and after the ai_views migration):
--   cp server/scripts/ai-readonly-role.sql /tmp/ai-role.sql
--   # replace CHANGE-ME (hex is safest in a URL) and APP_DB_ROLE (DATABASE_URL's user)
--   psql "$SUPERUSER_DATABASE_URL" -f /tmp/ai-role.sql
-- then set on the Hadafi server, redeploy, and run `ai-readonly-role.mjs check`:
--   AI_READONLY_DATABASE_URL=postgres://hadafi_ai_readonly:<password>@<host>:5432/<db>

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hadafi_ai_readonly') THEN
    CREATE ROLE hadafi_ai_readonly LOGIN PASSWORD 'CHANGE-ME';
  END IF;
END $$;

ALTER ROLE hadafi_ai_readonly NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- The app role owns `ai`, so its migrations can drop and recreate the views.
CREATE SCHEMA IF NOT EXISTS ai AUTHORIZATION APP_DB_ROLE;
ALTER SCHEMA ai OWNER TO APP_DB_ROLE;

-- Nothing in public: not the tables, not the sequences, not the schema.
REVOKE ALL ON SCHEMA public FROM hadafi_ai_readonly;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hadafi_ai_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM hadafi_ai_readonly;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM hadafi_ai_readonly;
-- Postgres before 15 lets every role create in `public`. Safe to remove when
-- APP_DB_ROLE owns `public` or is a superuser (the server refuses to query
-- while the read-only role can create there).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Only the `ai` views (plain views run with their owner's rights).
GRANT USAGE ON SCHEMA ai TO hadafi_ai_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA ai TO hadafi_ai_readonly;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai TO hadafi_ai_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE APP_DB_ROLE IN SCHEMA ai GRANT SELECT ON TABLES TO hadafi_ai_readonly;

ALTER ROLE hadafi_ai_readonly SET statement_timeout = '15s';
ALTER ROLE hadafi_ai_readonly SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE hadafi_ai_readonly SET default_transaction_read_only = on;
ALTER ROLE hadafi_ai_readonly SET search_path = ai;
