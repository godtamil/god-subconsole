ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_at timestamptz;
CREATE TABLE IF NOT EXISTS profile_images (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  body text NOT NULL
);
