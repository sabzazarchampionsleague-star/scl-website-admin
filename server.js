
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { rateLimit } = require('express-rate-limit');

const app = express();
const production = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters');
}
const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'scl.db'));
db.pragma('journal_mode = WAL');
if (production) app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!req.is('application/json') || req.get('Sec-Fetch-Site') === 'cross-site') {
      return res.status(403).json({ error: 'Same-site JSON requests required' });
    }
    if (req.get('Origin') && req.get('Origin') !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'Invalid request origin' });
    }
  }
  next();
});
app.use(session({
  store: new SQLiteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teams(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      logo_url TEXT DEFAULT '',
      coach TEXT DEFAULT '',
      captain TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      jersey_no INTEGER,
      position TEXT DEFAULT '',
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      yellow_cards INTEGER NOT NULL DEFAULT 0,
      red_cards INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      home_team_id INTEGER NOT NULL,
      away_team_id INTEGER NOT NULL,
      match_date TEXT NOT NULL,
      venue TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      home_score INTEGER DEFAULT 0,
      away_score INTEGER DEFAULT 0,
      motm TEXT DEFAULT '',
      FOREIGN KEY(home_team_id) REFERENCES teams(id),
      FOREIGN KEY(away_team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS news(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const count = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (!count) {
    const email = process.env.ADMIN_EMAIL || 'admin@scl.local';
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 20 || Buffer.byteLength(password) > 72) {
      throw new Error('Set ADMIN_PASSWORD to a random 20-72 byte password before first startup');
    }
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('INSERT INTO admins(email,password_hash,role) VALUES(?,?,?)')
      .run(email, hash, 'super_admin');
    console.log(`Initial admin created: ${email}`);
  }

  const teamCount = db.prepare('SELECT COUNT(*) c FROM teams').get().c;
  if (!teamCount && process.env.SEED_DEMO_DATA === 'true') {
    const insert = db.prepare('INSERT INTO teams(name, short_name, coach, captain) VALUES(?,?,?,?)');
    const demoTeams = [
      ['Sabzazar United','SU','Coach Ali','Ahmed'],
      ['Royal Strikers','RS','Coach Hamza','Bilal'],
      ['Falcon FC','FFC','Coach Usman','Saad'],
      ['Lions XI','LXI','Coach Zain','Hassan']
    ];
    const txn = db.transaction((rows)=>rows.forEach(r=>insert.run(...r)));
    txn(demoTeams);
  }
}

initDb();

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({error:'Unauthorized'});
  next();
}

app.get('/api/public/teams', (req,res)=>{
  res.json(db.prepare('SELECT * FROM teams ORDER BY name').all());
});

app.get('/api/public/players', (req,res)=>{
  res.json(db.prepare(`
    SELECT p.*, t.name team_name, t.short_name
    FROM players p JOIN teams t ON t.id=p.team_id
    ORDER BY goals DESC, assists DESC, p.name
  `).all());
});

app.get('/api/public/matches', (req,res)=>{
  res.json(db.prepare(`
    SELECT m.*, h.name home_team, h.short_name home_short,
           a.name away_team, a.short_name away_short
    FROM matches m
    JOIN teams h ON h.id=m.home_team_id
    JOIN teams a ON a.id=m.away_team_id
    ORDER BY datetime(m.match_date) DESC
  `).all());
});

app.get('/api/public/news', (req,res)=>{
  res.json(db.prepare('SELECT * FROM news ORDER BY datetime(published_at) DESC LIMIT 20').all());
});

app.get('/api/public/standings', (req,res)=>{
  const teams = db.prepare('SELECT id,name,short_name FROM teams').all();
  const finished = db.prepare(`SELECT * FROM matches WHERE status='finished'`).all();
  const table = new Map(teams.map(t => [t.id, {team_id:t.id, name:t.name, short_name:t.short_name, p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0}]));
  for (const m of finished) {
    const h = table.get(m.home_team_id), a = table.get(m.away_team_id);
    if (!h || !a) continue;
    h.p++; a.p++;
    h.gf += m.home_score; h.ga += m.away_score;
    a.gf += m.away_score; a.ga += m.home_score;
    if (m.home_score > m.away_score) { h.w++; h.pts += 3; a.l++; }
    else if (m.home_score < m.away_score) { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  const rows = [...table.values()].map(r=>({...r, gd:r.gf-r.ga}))
    .sort((x,y)=> y.pts-x.pts || y.gd-x.gd || y.gf-x.gf || x.name.localeCompare(y.name));
  res.json(rows);
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
app.post('/api/admin/login', loginLimiter, (req,res,next)=>{
  const {email,password} = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || Buffer.byteLength(password) > 72) {
    return res.status(401).json({error:'Invalid email or password'});
  }
  const admin = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({error:'Invalid email or password'});
  }
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.admin = {id:admin.id,email:admin.email,role:admin.role};
    req.session.save(err => err ? next(err) : res.json({ok:true, admin:req.session.admin}));
  });
});

app.post('/api/admin/logout', requireAdmin, (req,res)=>{
  req.session.destroy(()=>res.json({ok:true}));
});

app.get('/api/admin/me', (req,res)=>{
  res.json({admin:req.session.admin || null});
});

app.get('/api/admin/dashboard', requireAdmin, (req,res)=>{
  const counts = {
    teams: db.prepare('SELECT COUNT(*) c FROM teams').get().c,
    players: db.prepare('SELECT COUNT(*) c FROM players').get().c,
    matches: db.prepare('SELECT COUNT(*) c FROM matches').get().c,
    news: db.prepare('SELECT COUNT(*) c FROM news').get().c
  };
  res.json(counts);
});

app.get('/api/admin/teams', requireAdmin, (req,res)=>res.json(db.prepare('SELECT * FROM teams ORDER BY id DESC').all()));
app.post('/api/admin/teams', requireAdmin, (req,res)=>{
  const {name,short_name,logo_url='',coach='',captain=''} = req.body;
  if (!name || !short_name) return res.status(400).json({error:'Name and short name required'});
  const info = db.prepare('INSERT INTO teams(name,short_name,logo_url,coach,captain) VALUES(?,?,?,?,?)')
    .run(name,short_name,logo_url,coach,captain);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/teams/:id', requireAdmin, (req,res)=>{
  const {name,short_name,logo_url='',coach='',captain=''} = req.body;
  db.prepare('UPDATE teams SET name=?, short_name=?, logo_url=?, coach=?, captain=? WHERE id=?')
    .run(name,short_name,logo_url,coach,captain,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/teams/:id', requireAdmin, (req,res)=>{
  db.prepare('DELETE FROM players WHERE team_id=?').run(req.params.id);
  db.prepare('DELETE FROM teams WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/admin/players', requireAdmin, (req,res)=>res.json(db.prepare(`
  SELECT p.*, t.name team_name FROM players p JOIN teams t ON t.id=p.team_id ORDER BY p.id DESC
`).all()));
app.post('/api/admin/players', requireAdmin, (req,res)=>{
  const {team_id,name,jersey_no=null,position=''} = req.body;
  const info = db.prepare('INSERT INTO players(team_id,name,jersey_no,position) VALUES(?,?,?,?)')
    .run(team_id,name,jersey_no,position);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/players/:id', requireAdmin, (req,res)=>{
  const {team_id,name,jersey_no=null,position='',goals=0,assists=0,yellow_cards=0,red_cards=0} = req.body;
  db.prepare(`UPDATE players SET team_id=?,name=?,jersey_no=?,position=?,goals=?,assists=?,yellow_cards=?,red_cards=? WHERE id=?`)
    .run(team_id,name,jersey_no,position,goals,assists,yellow_cards,red_cards,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/players/:id', requireAdmin, (req,res)=>{
  db.prepare('DELETE FROM players WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/admin/matches', requireAdmin, (req,res)=>res.json(db.prepare(`
  SELECT m.*, h.name home_team, a.name away_team
  FROM matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id
  ORDER BY datetime(m.match_date) DESC
`).all()));
app.post('/api/admin/matches', requireAdmin, (req,res)=>{
  const {home_team_id,away_team_id,match_date,venue='',status='scheduled',home_score=0,away_score=0,motm=''} = req.body;
  if (String(home_team_id) === String(away_team_id)) return res.status(400).json({error:'Teams must be different'});
  const info = db.prepare(`INSERT INTO matches(home_team_id,away_team_id,match_date,venue,status,home_score,away_score,motm)
    VALUES(?,?,?,?,?,?,?,?)`).run(home_team_id,away_team_id,match_date,venue,status,home_score,away_score,motm);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/matches/:id', requireAdmin, (req,res)=>{
  const {home_team_id,away_team_id,match_date,venue='',status='scheduled',home_score=0,away_score=0,motm=''} = req.body;
  db.prepare(`UPDATE matches SET home_team_id=?,away_team_id=?,match_date=?,venue=?,status=?,home_score=?,away_score=?,motm=? WHERE id=?`)
    .run(home_team_id,away_team_id,match_date,venue,status,home_score,away_score,motm,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/matches/:id', requireAdmin, (req,res)=>{
  db.prepare('DELETE FROM matches WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/admin/news', requireAdmin, (req,res)=>res.json(db.prepare('SELECT * FROM news ORDER BY id DESC').all()));
app.post('/api/admin/news', requireAdmin, (req,res)=>{
  const {title,body} = req.body;
  const info = db.prepare('INSERT INTO news(title,body) VALUES(?,?)').run(title,body);
  res.json({id:info.lastInsertRowid});
});
app.delete('/api/admin/news/:id', requireAdmin, (req,res)=>{
  db.prepare('DELETE FROM news WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.put('/api/admin/password', requireAdmin, (req,res)=>{
  const {current_password,new_password} = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id=?').get(req.session.admin.id);
  if (!bcrypt.compareSync(current_password || '', admin.password_hash)) {
    return res.status(400).json({error:'Current password is incorrect'});
  }
  if (typeof new_password !== 'string' || new_password.length < 20 || Buffer.byteLength(new_password) > 72) return res.status(400).json({error:'New password must be 20-72 bytes (at least 20 characters)'});
  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hash, admin.id);
  res.json({ok:true});
});

app.get('/admin', (req,res)=>res.sendFile(path.join(__dirname,'public','admin','index.html')));
app.get('/healthz', (req,res)=>{ db.prepare('SELECT 1').get(); res.json({ok:true}); });
app.use((err,req,res,next)=>{
  console.error('Request failed:', err.code || err.name);
  res.status(500).json({error:'Request failed. Please check the submitted values.'});
});

app.listen(PORT, ()=>console.log(`SCL running on http://localhost:${PORT}`));
