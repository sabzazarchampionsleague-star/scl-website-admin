ALTER TABLE matches ADD COLUMN half_time_done INTEGER NOT NULL DEFAULT 0;
UPDATE matches SET half_time_done=1 WHERE status='finished' OR phase='2nd half' OR (status='live' AND clock_seconds>((duration_minutes-first_half_extra-second_half_extra)/2.0+first_half_extra)*60);
