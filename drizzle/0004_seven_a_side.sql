ALTER TABLE teams ADD COLUMN previous_formation TEXT;
UPDATE teams SET previous_formation=formation,formation='{"shape":"2-3-1","players":[null,null,null,null,null,null,null]}' WHERE json_extract(formation,'$.shape') NOT IN ('2-3-1','3-2-1','2-2-2','3-1-2');
CREATE TRIGGER teams_seven_default AFTER INSERT ON teams WHEN json_extract(NEW.formation,'$.shape') NOT IN ('2-3-1','3-2-1','2-2-2','3-1-2') BEGIN UPDATE teams SET formation='{"shape":"2-3-1","players":[null,null,null,null,null,null,null]}' WHERE id=NEW.id; END;
