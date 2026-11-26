CREATE TABLE IF NOT EXISTS registration_settings(id INTEGER PRIMARY KEY CHECK(id=1),is_open INTEGER NOT NULL DEFAULT 0 CHECK(is_open IN(0,1)));
INSERT OR IGNORE INTO registration_settings(id,is_open) VALUES(1,0);
