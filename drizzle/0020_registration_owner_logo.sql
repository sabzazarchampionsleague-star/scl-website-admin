ALTER TABLE club_registrations ADD COLUMN logo TEXT NOT NULL DEFAULT '';
ALTER TABLE club_registrations ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS club_registration_user ON club_registrations(user_id) WHERE user_id IS NOT NULL;
