-- Runs on every startup, so every statement must be safe to re-run.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS shelters (
  id serial PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS registrants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id integer NOT NULL REFERENCES shelters(id),
  known_as text NOT NULL CHECK (btrim(known_as) <> ''),
  age_range text CHECK (age_range IN ('0-4', '5-12', '13-17', '18-64', '65+')),
  description text,
  -- No default: a Volunteer must ask.
  visibility text NOT NULL CHECK (visibility IN ('findable', 'not_findable')),
  departed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registrants_known_as_trgm
  ON registrants USING gin (known_as gin_trgm_ops);

CREATE TABLE IF NOT EXISTS contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registrant_id uuid NOT NULL REFERENCES registrants(id),
  request_code text NOT NULL UNIQUE,
  seeker_name text NOT NULL,
  relationship text,
  message text,
  seeker_contact text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'yes', 'no')),
  reply_message text,
  reply_contact text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

INSERT INTO shelters (name, code) VALUES
  ('Riverside High School Gym', 'HERON-4821'),
  ('Community Center North', 'MAPLE-3907'),
  ('Grace Church Hall', 'CEDAR-5164')
ON CONFLICT (code) DO NOTHING;
