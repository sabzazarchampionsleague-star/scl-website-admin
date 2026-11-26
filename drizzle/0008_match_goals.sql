CREATE TABLE match_goals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
 team_id INTEGER NOT NULL REFERENCES teams(id),
 scorer TEXT NOT NULL,
 elapsed_seconds INTEGER NOT NULL,
 minute INTEGER NOT NULL,
 request_key TEXT NOT NULL UNIQUE
);
CREATE TRIGGER goal_score_add AFTER INSERT ON match_goals BEGIN
 UPDATE matches SET home_score=home_score+CASE WHEN home_team_id=NEW.team_id THEN 1 ELSE 0 END,
 away_score=away_score+CASE WHEN away_team_id=NEW.team_id THEN 1 ELSE 0 END WHERE id=NEW.match_id;
END;
CREATE TRIGGER goal_score_remove AFTER DELETE ON match_goals BEGIN
 UPDATE matches SET home_score=MAX(0,home_score-CASE WHEN home_team_id=OLD.team_id THEN 1 ELSE 0 END),
 away_score=MAX(0,away_score-CASE WHEN away_team_id=OLD.team_id THEN 1 ELSE 0 END) WHERE id=OLD.match_id;
END;
