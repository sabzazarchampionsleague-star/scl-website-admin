ALTER TABLE match_goals ADD COLUMN affects_score INTEGER NOT NULL DEFAULT 1;
DROP TRIGGER goal_score_add;
DROP TRIGGER goal_score_remove;
CREATE TRIGGER goal_score_add AFTER INSERT ON match_goals WHEN NEW.affects_score=1 BEGIN
 UPDATE matches SET home_score=home_score+CASE WHEN home_team_id=NEW.team_id THEN 1 ELSE 0 END,away_score=away_score+CASE WHEN away_team_id=NEW.team_id THEN 1 ELSE 0 END WHERE id=NEW.match_id;
END;
CREATE TRIGGER goal_score_remove AFTER DELETE ON match_goals WHEN OLD.affects_score=1 BEGIN
 UPDATE matches SET home_score=MAX(0,home_score-CASE WHEN home_team_id=OLD.team_id THEN 1 ELSE 0 END),away_score=MAX(0,away_score-CASE WHEN away_team_id=OLD.team_id THEN 1 ELSE 0 END) WHERE id=OLD.match_id AND status='live';
END;
