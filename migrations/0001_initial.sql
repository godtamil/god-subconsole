CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password text NOT NULL, role text NOT NULL, permissions jsonb NOT NULL, servers jsonb NOT NULL, suspended boolean NOT NULL DEFAULT false, totp text, pending_totp text, recovery jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf text NOT NULL, expires timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS invitations (id text PRIMARY KEY, email text NOT NULL, role text NOT NULL, permissions jsonb NOT NULL, servers jsonb NOT NULL, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id text PRIMARY KEY, actor text NOT NULL, action text NOT NULL, server text, result text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit(created_at);
CREATE TABLE IF NOT EXISTS settings (id text PRIMARY KEY, value jsonb NOT NULL);
