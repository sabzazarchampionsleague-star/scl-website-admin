CREATE TABLE match_cards (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 team_id INTEGER NOT NULL REFERENCES teams(id),
 player_name TEXT NOT NULL,
 card_type TEXT NOT NULL CHECK(card_type IN ('yellow','red')),
 elapsed_seconds INTEGER NOT NULL,
 minute INTEGER NOT NULL,
 request_key TEXT NOT NULL UNIQUE
);
