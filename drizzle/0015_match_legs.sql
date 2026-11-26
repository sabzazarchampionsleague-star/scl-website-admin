ALTER TABLE matches ADD COLUMN leg_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN first_leg_id INTEGER REFERENCES matches(id) ON DELETE RESTRICT;
UPDATE matches SET leg_number=1 WHERE lower(phase)='1st leg';
