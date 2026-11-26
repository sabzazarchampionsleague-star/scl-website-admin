ALTER TABLE matches ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 70;
ALTER TABLE matches ADD COLUMN clock_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN clock_started_at INTEGER;
UPDATE matches SET clock_seconds=minute*60;
