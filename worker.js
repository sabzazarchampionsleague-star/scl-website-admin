const assets = /* ASSET_MAP */ {};
const encoder = new TextEncoder();
const COOKIE='__Host-scl';
const securityHeaders={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
 'X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000; includeSubDomains',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud https://*.livekit.io wss://*.livekit.io; media-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...securityHeaders,'Content-Type':'application/json','Cache-Control':'no-store',...extra}});}
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function toHex(bytes){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function fromHex(s){return Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));}
async function digest(s){return toHex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
function randomToken(){return toHex(crypto.getRandomValues(new Uint8Array(32)));}
async function passwordHash(password,salt=toHex(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(salt),iterations:100000},key,256);
 return `pbkdf2:100000:${salt}:${toHex(bits)}`;
}
async function verifyPassword(password,stored){
 if(typeof password!=='string'||password.length>256||!/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored||''))return false;
 const computed=await passwordHash(password,stored.split(':')[2]);
 let difference=0;for(let i=0;i<computed.length;i++)difference|=computed.charCodeAt(i)^stored.charCodeAt(i);
 return difference===0;
}
function database(env){if(!env.DB)fail('Database unavailable',503);return {
 first:(sql,...args)=>env.DB.prepare(sql).bind(...args).first(),
 all:async(sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results,
 run:(sql,...args)=>env.DB.prepare(sql).bind(...args).run(),
 batch:statements=>env.DB.batch(statements.map(([sql,...args])=>env.DB.prepare(sql).bind(...args)))
};}
function text(value,name,max=200,required=false){if(value==null)value='';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Invalid ${name}`);return value.trim();}
function integer(value,name,min=0,max=1000000){if(value===''||value==null)value=0;const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)fail(`Invalid ${name}`);return n;}
function cookie(value,maxAge=28800){return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;}
function sessionToken(request){const values=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));const token=values.length===1?values[0].slice(COOKIE.length+1):'';return /^[0-9a-f]{64}$/.test(token)?token:null;}
async function getSession(request,db){const token=sessionToken(request);if(!token)return null;const tokenHash=await digest(token);const row=await db.first('SELECT a.id,a.email,a.role,a.permissions,s.token_hash FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires>?',tokenHash,Date.now());return row;}
async function body(request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))fail('JSON required',415);
 const origin=request.headers.get('Origin');
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==new URL(request.url).origin))fail('Invalid request origin',403);
 const limit=new URL(request.url).pathname==='/api/registration'?850000:new URL(request.url).pathname==='/api/admin/winner'?650000:/^\/api\/admin\/news\/\d+\/poster$/.test(new URL(request.url).pathname)?750000:/^\/api\/(?:admin|account)\/teams\/\d+\/logo$/.test(new URL(request.url).pathname)?210000:65536;
 if(Number(request.headers.get('Content-Length'))>limit)fail('Request too large',413);
 const raw=await request.text();if(encoder.encode(raw).length>limit)fail('Request too large',413);
 try{const data=JSON.parse(raw||'{}');if(!data||typeof data!=='object'||Array.isArray(data))fail('Invalid JSON');return data;}catch{fail('Invalid JSON');}
}
async function initialAdmin(db,env){
 if(!env.ADMIN_EMAIL||!/^pbkdf2:100000:[0-9a-f]{32}:[0-9a-f]{64}$/.test(env.ADMIN_PASSWORD_HASH||''))fail('Admin setup unavailable',503);
 await db.run('INSERT INTO admins(id,email,password_hash,role) VALUES(1,?,?,?) ON CONFLICT(id) DO NOTHING',env.ADMIN_EMAIL,env.ADMIN_PASSWORD_HASH,'super_admin');
}
async function login(request,db,env,input){
 const address=request.headers.get('CF-Connecting-IP')||'unknown';
 const window=Math.floor(Date.now()/900000);
 const key=await digest(`${address}:${window}`);
 const limits=await db.first('INSERT INTO login_limits(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(window+1)*900000);
 if(limits.attempts>10)return json({error:'Too many login attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'});
 await initialAdmin(db,env);
 const admin=await db.first('SELECT * FROM admins WHERE email=?',typeof input.email==='string'?input.email:'');
 const valid=await verifyPassword(input.password,admin?.password_hash||env.ADMIN_PASSWORD_HASH);
 if(!admin||!valid)return json({error:'Invalid email or password'},401);
 const token=randomToken();const old=sessionToken(request);
 const operations=[['DELETE FROM sessions WHERE expires<=?',Date.now()],['DELETE FROM login_limits WHERE expires<=?',Date.now()]];
 if(old)operations.push(['DELETE FROM sessions WHERE token_hash=?',await digest(old)]);
 operations.push(['INSERT INTO sessions(token_hash,admin_id,expires) VALUES(?,?,?)',await digest(token),admin.id,Date.now()+28800000]);
 await db.batch(operations);
 return json({ok:true,admin:{id:admin.id,email:admin.email,role:admin.role,permissions:staffPermissions(admin)}},200,{'Set-Cookie':cookie(token)});
}
const playerQuery='SELECT p.*,t.name team_name,t.short_name FROM players p JOIN teams t ON t.id=p.team_id';
const matchQuery='SELECT m.*,h.name home_team,h.short_name home_short,a.name away_team,a.short_name away_short FROM matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id';
async function standings(db){
 const teams=await db.all('SELECT id,name,short_name FROM teams');
 const matches=await db.all("SELECT * FROM matches WHERE status='finished'");
 const table=new Map(teams.map(t=>[t.id,{team_id:t.id,name:t.name,short_name:t.short_name,p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0}]));
 for(const m of matches){const h=table.get(m.home_team_id),a=table.get(m.away_team_id);if(!h||!a)continue;h.p++;a.p++;h.gf+=m.home_score;h.ga+=m.away_score;a.gf+=m.away_score;a.ga+=m.home_score;if(m.home_score>m.away_score){h.w++;h.pts+=3;a.l++;}else if(m.home_score<m.away_score){a.w++;a.pts+=3;h.l++;}else{h.d++;a.d++;h.pts++;a.pts++;}}
 const adjustments=await db.all('SELECT team_id,SUM(points) points,SUM(played) played,SUM(wins) wins,SUM(draws) draws,SUM(losses) losses,SUM(goals_for) goals_for,SUM(goals_against) goals_against FROM standings_adjustments GROUP BY team_id');
 for(const adjustment of adjustments){const row=table.get(adjustment.team_id);if(row){row.pts+=Number(adjustment.points);row.p+=Number(adjustment.played);row.w+=Number(adjustment.wins);row.d+=Number(adjustment.draws);row.l+=Number(adjustment.losses);row.gf+=Number(adjustment.goals_for);row.ga+=Number(adjustment.goals_against);}}
 return [...table.values()].map(t=>({...t,gd:t.gf-t.ga})).sort((x,y)=>y.pts-x.pts||y.gd-x.gd||y.gf-x.gf||x.name.localeCompare(y.name));
}
async function valuesFor(table,b,db){
 if(table==='teams'){
  const name=teamName(b.name);let owner=null;
  if(b.owner_email){owner=await db.first('SELECT id FROM users WHERE email=?',emailValue(b.owner_email));if(!owner)fail('The owner must create an account first');}
  return {name,name_key:teamKey(name),short_name:name.slice(0,20),owner_user_id:owner?.id||null};
 }
 if(table==='players'){
  const team=integer(b.team_id,'team',1);if(!await db.first('SELECT id FROM teams WHERE id=?',team))fail('Team not found');
  return {team_id:team,name:text(b.name,'player name',150,true),jersey_no:b.jersey_no==null||b.jersey_no===''?null:integer(b.jersey_no,'jersey number',0,999),position:text(b.position,'position',80),goals:integer(b.goals,'goals'),assists:integer(b.assists,'assists'),yellow_cards:integer(b.yellow_cards,'yellow cards'),red_cards:integer(b.red_cards,'red cards')};
 }
 if(table==='matches'){
  const home=integer(b.home_team_id,'home team',1),away=integer(b.away_team_id,'away team',1);
  if(home===away)fail('Teams must be different');
  if((await db.all('SELECT id FROM teams WHERE id IN (?,?)',home,away)).length!==2)fail('Team not found');
  const date=text(b.match_date,'match date',80);if((!date&&b.status!=='finished')||(date&&!Number.isFinite(Date.parse(date))))fail('Enter a valid date (optional for Full time matches)');
  const status=b.status||'scheduled';if(!['scheduled','live','finished'].includes(status))fail('Invalid match status');
  const leg=integer(b.leg_number??0,'leg',0,2),firstId=leg===2?integer(b.first_leg_id,'first leg',1):null;
  if(firstId){const first=await db.first('SELECT * FROM matches WHERE id=?',firstId);if(!first||first.status!=='finished'||first.first_leg_id||![first.home_team_id,first.away_team_id].includes(home)||![first.home_team_id,first.away_team_id].includes(away))fail('Choose a completed first match between these same two teams');}
  const stage=text(b.stage,'match stage',20);if(!['','Semi-final','Final'].includes(stage))fail('Choose a valid match stage');
  return {stage,leg_number:leg,first_leg_id:firstId,home_team_id:home,away_team_id:away,match_date:date,venue:text(b.venue,'venue'),status,home_score:integer(b.home_score,'home score',0,999),away_score:integer(b.away_score,'away score',0,999),duration_minutes:integer(b.duration_minutes??70,'duration',1,240),minute:integer(b.minute,'minute',0,240),phase:text(b.phase,'match phase',40),motm:text(b.motm,'player of the match')};
 }
 return {title:text(b.title,'news title',250,true),body:text(b.body,'news text',20000,true)};
}
const staffPermissionKeys=['scoring','broadcast','matches','teams','news','events'];
function staffPermissions(admin){try{const p=JSON.parse(admin.permissions||'[]');return Array.isArray(p)?p.filter(x=>staffPermissionKeys.includes(x)):[];}catch{return [];}}
function hasPermission(admin,key){return admin.role==='super_admin'||(admin.role==='scorekeeper_broadcaster'&&staffPermissions(admin).includes(key));}
function validatePermissions(value){if(!Array.isArray(value)||value.some(x=>!staffPermissionKeys.includes(x)))fail('Choose valid staff permissions');return JSON.stringify([...new Set(value)]);}
function authorizeAdmin(session,path,method){
 if(session.role==='super_admin')return;
 if(session.role!=='scorekeeper_broadcaster')fail('Access denied',403);
 const has=k=>hasPermission(session,k),score=has('scoring')||has('matches');
 const allowed=(method==='POST'&&path==='/api/admin/logout')||
 (method==='GET'&&['/api/admin/matches','/api/admin/teams','/api/admin/players'].includes(path)&&(score||has('teams')||has('broadcast')))||
 (score&&((method==='PUT'&&/^\/api\/admin\/matches\/\d+(?:\/clock)?$/.test(path))||(method==='POST'&&/^\/api\/admin\/matches\/\d+\/(goals|cards)$/.test(path))||(method==='DELETE'&&/^\/api\/admin\/matches\/\d+\/(goals|cards)\/\d+$/.test(path))))||
 (has('matches')&&((method==='POST'&&path==='/api/admin/matches')||(method==='DELETE'&&/^\/api\/admin\/matches\/\d+$/.test(path))))||
 (has('broadcast')&&((method==='GET'&&path==='/api/admin/broadcasts')||(method==='POST'&&/^\/api\/admin\/broadcasts\/\d+\/(start|stop|heartbeat)$/.test(path))))||
 (has('teams')&&/^\/api\/admin\/(teams|players)(?:\/\d+(?:\/(logo|formation))?)?$/.test(path)&&['GET','POST','PUT','DELETE'].includes(method))||
 (has('news')&&/^\/api\/admin\/news(?:\/\d+(?:\/poster)?)?$/.test(path)&&['GET','POST','PUT','DELETE'].includes(method))||
 (has('events')&&/^\/api\/admin\/(events|event-entries)(?:\/\d+(?:\/notify)?)?$/.test(path)&&['GET','POST','PUT','DELETE'].includes(method));
 if(!allowed)fail('Your account does not have access to this action',403);
}
async function staffAccounts(path,method,input,db,session){
 if(!/^\/api\/admin\/staff(?:\/\d+(?:\/logout)?)?$/.test(path))return null;
 if(session.role!=='super_admin')fail('Access denied',403);
 if(path==='/api/admin/staff'&&method==='GET')return json(await db.all("SELECT id,email,role,permissions FROM admins WHERE role='scorekeeper_broadcaster' ORDER BY id"));
 if(path==='/api/admin/staff'&&method==='POST'){
 const email=emailValue(input.email);
 if(typeof input.password!=='string'||input.password.length<8||input.password.length>12)fail('Use a password of 8-12 characters');
 if(await db.first('SELECT id FROM admins WHERE lower(email)=?',email))fail('This email already has portal access',409);
 const result=await db.run('INSERT INTO admins(email,password_hash,role,permissions) VALUES(?,?,?,?)',email,await passwordHash(input.password),'scorekeeper_broadcaster',validatePermissions(input.permissions??['scoring','broadcast']));
 return json({ok:true,id:result.meta.last_row_id});
 }
 if(method==='PUT'&&/\/\d+$/.test(path)){
 const id=Number(path.split('/').pop());
 if(!await db.first("SELECT id FROM admins WHERE id=? AND role='scorekeeper_broadcaster'",id))fail('Staff account not found',404);
 await db.run('UPDATE admins SET permissions=? WHERE id=?',validatePermissions(input.permissions),id);
 return json({ok:true});
 }
 if(method==='POST'&&/\/\d+\/logout$/.test(path)){
 const id=Number(path.split('/').at(-2));
 const target=await db.first("SELECT id FROM admins WHERE id=? AND role='scorekeeper_broadcaster'",id);
 if(!target)fail('Staff account not found',404);
 await db.run('DELETE FROM sessions WHERE admin_id=?',id);return json({ok:true});
 }
 if(method==='DELETE'&&/\/\d+$/.test(path)){
 const id=Number(path.split('/').pop()),target=await db.first('SELECT role FROM admins WHERE id=?',id);
 if(!target||target.role!=='scorekeeper_broadcaster'||id===session.id)fail('Staff account not found',404);
 await db.batch([['DELETE FROM sessions WHERE admin_id=?',id],['DELETE FROM admins WHERE id=?',id]]);return json({ok:true});
 }
 fail('Method not allowed',405);
}
async function api(request,env){
 const path=new URL(request.url).pathname;const method=request.method;const db=database(env);
 if(/^\/api\/(?:public\/(?:matches|standings|top-players|players)|admin\/matches)(?:\/|$)/.test(path))await finishElapsedMatches(db);
 if(path==='/healthz'){await db.first('SELECT 1');return json({ok:true});}
 if(path.startsWith('/api/public/')&&method==='GET'){
  const extra=await leaguePublic(path,db);if(extra)return extra;
  const name=path.slice('/api/public/'.length);
  if(name==='teams')return json(await db.all('SELECT * FROM teams ORDER BY name'));
  if(name==='players')return json((await playerStatistics(db)).sort((a,b)=>b.goals-a.goals||b.assists-a.assists||a.name.localeCompare(b.name)));
  if(name==='matches')return json(await matchesWithGoals(db));
  if(name==='news')return json(await db.all('SELECT * FROM news ORDER BY datetime(published_at) DESC,id DESC LIMIT 20'));
  if(name==='standings')return json(await standings(db));
 }
 if(!path.startsWith('/api/admin/'))return json({error:'Not found'},404);
 let input=!['GET','HEAD','OPTIONS'].includes(method)?await body(request):{};
 if(path==='/api/admin/login'&&method==='POST')return login(request,db,env,input);
 const session=await getSession(request,db);
 if(path==='/api/admin/me'&&method==='GET')return json({admin:session?{id:session.id,email:session.email,role:session.role,permissions:staffPermissions(session)}:null});
 if(!session)return json({error:'Unauthorized'},401);
 authorizeAdmin(session,path,method);
 const staff=await staffAccounts(path,method,input,db,session);if(staff)return staff;
 if(session.role==='scorekeeper_broadcaster'){
 if(!hasPermission(session,'teams')&&method==='GET'&&path==='/api/admin/teams')return json(await db.all('SELECT id,name,short_name,logo_url FROM teams ORDER BY name'));
 if(!hasPermission(session,'matches')&&method==='PUT'&&/^\/api\/admin\/matches\/\d+$/.test(path)){
 const old=await db.first('SELECT * FROM matches WHERE id=?',Number(path.split('/').pop()));if(!old)fail('Match not found',404);
 const editable=['status','home_score','away_score','minute','phase','motm'];
 for(const key of Object.keys(input))if(!editable.includes(key)&&String(input[key]??'')!==String(old[key]??''))fail('You cannot change match details',403);
 input={...old,...Object.fromEntries(Object.entries(input).filter(([k])=>editable.includes(k)))};
 }
 }
 const extra=await leagueAdmin(path,method,input,db,env);if(extra)return extra;
 const poster=path.match(/^\/api\/admin\/news\/(\d+)\/poster$/);
 if(poster&&method==='PUT'){const id=Number(poster[1]);if(!await db.first('SELECT id FROM news WHERE id=?',id))fail('News not found',404);const image=input.image;if(typeof image!=='string'||image.length>700000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image))fail('Upload a JPG poster under 500 KB');let raw;try{raw=atob(image.split(',')[1]);}catch{fail('Invalid image');}if(raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216||raw.charCodeAt(2)!==255)fail('Invalid JPEG');await db.batch([['INSERT INTO news_posters(news_id,data) VALUES(?,?) ON CONFLICT(news_id) DO UPDATE SET data=excluded.data',id,image],['UPDATE news SET poster_url=? WHERE id=?','/news-poster/'+id+'?v='+Date.now(),id]]);return json({ok:true});}
 const logoMatch=path.match(/^\/api\/admin\/teams\/(\d+)\/logo$/);
 if(logoMatch&&method==='PUT'){
  const id=Number(logoMatch[1]);if(!await db.first('SELECT id FROM teams WHERE id=?',id))fail('Team not found',404);
  const image=input.image;if(typeof image!=='string'||image.length>200000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image))fail('Upload a PNG logo under 140 KB');
  let raw;try{raw=atob(image.split(',')[1]);}catch{fail('Invalid image');}
  if(!raw.startsWith('\x89PNG\r\n\x1a\n'))fail('Invalid PNG image');
  await db.batch([['INSERT INTO team_logos(team_id,data) VALUES(?,?) ON CONFLICT(team_id) DO UPDATE SET data=excluded.data',id,image],['UPDATE teams SET logo_url=? WHERE id=?','/team-logo/'+id+'?v='+Date.now(),id]]);return json({ok:true});
 }
 if(path==='/api/admin/logout'&&method==='POST'){
  await db.run('DELETE FROM sessions WHERE token_hash=?',session.token_hash);
  return json({ok:true},200,{'Set-Cookie':cookie('',0)});
 }
 if(path==='/api/admin/password'&&method==='PUT'){
  const admin=await db.first('SELECT password_hash FROM admins WHERE id=?',session.id);
  if(!await verifyPassword(input.current_password,admin.password_hash))fail('Current password is incorrect');
  if(typeof input.new_password!=='string'||input.new_password.length<20||input.new_password.length>128)fail('New password must be 20–128 characters');
  const hash=await passwordHash(input.new_password);const newToken=randomToken();
  await db.batch([['UPDATE admins SET password_hash=? WHERE id=?',hash,session.id],['DELETE FROM sessions WHERE admin_id=?',session.id],['INSERT INTO sessions(token_hash,admin_id,expires) VALUES(?,?,?)',await digest(newToken),session.id,Date.now()+28800000]]);
  return json({ok:true},200,{'Set-Cookie':cookie(newToken)});
 }
 if(path==='/api/admin/dashboard'&&method==='GET'){
  const counts={};for(const name of ['teams','players','matches','news'])counts[name]=(await db.first(`SELECT COUNT(*) c FROM ${name}`)).c;
  return json(counts);
 }
 const match=path.match(/^\/api\/admin\/(teams|players|matches|news)(?:\/(\d+))?$/);
 if(!match)return json({error:'Not found'},404);
 
 const table=match[1],id=match[2]?integer(match[2],'record ID',1):null;
 if(method==='GET'&&!id){
  const query=table==='teams'?'SELECT t.*,u.email owner_email FROM teams t LEFT JOIN users u ON u.id=t.owner_user_id ORDER BY t.id DESC':table==='players'?playerQuery+' ORDER BY p.id DESC':table==='matches'?matchQuery+' ORDER BY datetime(m.match_date) DESC':`SELECT * FROM ${table} ORDER BY id DESC`;
  if(table==='players')return json(await playerStatistics(db));
  if(table==='matches')return json(await matchesWithGoals(db));
  return json(await db.all(query));
 }
 if(id&&!await db.first(`SELECT id FROM ${table} WHERE id=?`,id))fail('Record not found',404);
 if(method==='DELETE'&&id){
  if(table==='matches'){const stream=await db.first('SELECT * FROM broadcasts WHERE match_id=?',id);if(stream&&stream.updated>Date.now()-90000)fail('Stop the broadcast before deleting this match.',409);}
  if(table==='teams'&&await db.first('SELECT id FROM matches WHERE home_team_id=? OR away_team_id=?',id,id))fail('Remove this team’s matches before deleting the team',409);
  if(table==='matches'&&await db.first('SELECT id FROM matches WHERE first_leg_id=?',id))fail('Unlink the second leg before deleting its first leg',409);
  await db.run(`DELETE FROM ${table} WHERE id=?`,id);return json({ok:true});
 }
 if((method==='POST'&&!id)||(method==='PUT'&&id)){
  const fields=await valuesFor(table,input,db);
  if(table==='matches'){if(id&&fields.first_leg_id===id)fail('A match cannot be its own first leg');if(id&&await db.first('SELECT id FROM matches WHERE first_leg_id=?',id)){const current=await db.first('SELECT * FROM matches WHERE id=?',id);if(fields.first_leg_id||fields.status!=='finished'||fields.home_team_id!==current.home_team_id||fields.away_team_id!==current.away_team_id)fail('Unlink the second leg before changing these first-leg details');}const old=id?await db.first('SELECT * FROM matches WHERE id=?',id):null;const elapsed=old?old.clock_seconds+(old.clock_started_at?Math.max(0,Math.floor((Date.now()-old.clock_started_at)/1000)):0):0;
   if(fields.minute>fields.duration_minutes)fail('Minute cannot exceed match duration');
   fields.clock_seconds=Math.min(fields.duration_minutes*60,old&&fields.minute===old.minute?elapsed:fields.minute*60);
   if(fields.status==='live'&&fields.clock_seconds>=fields.duration_minutes*60)fields.status='finished';
   fields.clock_started_at=old?.clock_started_at&&fields.status==='live'&&fields.clock_seconds<fields.duration_minutes*60?Date.now():null;
  }
  const names=Object.keys(fields),values=Object.values(fields);
  if(table==='teams'&&await db.first('SELECT id FROM teams WHERE name_key=? AND id<>?',fields.name_key,id||0))fail('This team name is already registered. Choose another name.',409);
  if(method==='POST'){const result=await db.run(`INSERT INTO ${table}(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`,...values);return json({id:result.meta.last_row_id});}
  await db.run(`UPDATE ${table} SET ${names.map(n=>n+'=?').join(',')} WHERE id=?`,...values,id);return json({ok:true});
 }
 return json({error:'Method not allowed'},405);
}
async function winnerApi(request,env){
 const db=database(env),isPublic=new URL(request.url).pathname==='/api/public/winner';
 if(isPublic){if(request.method!=='GET')return json({error:'Method not allowed'},405);const row=await db.first('SELECT * FROM winner_announcement WHERE id=1 AND enabled=1');return json(row||{enabled:0});}
 const session=await getSession(request,db);if(!session)return json({error:'Unauthorized'},401);if(session.role!=='super_admin')return json({error:'Forbidden'},403);
 if(request.method==='GET')return json(await db.first('SELECT * FROM winner_announcement WHERE id=1')||{enabled:0,team_id:'',message:'',image:''});
 if(request.method==='DELETE'){await body(request);await db.run('DELETE FROM winner_announcement WHERE id=1');return json({ok:true});}
 if(request.method!=='PUT')return json({error:'Method not allowed'},405);
 const input=await body(request),enabled=input.enabled===true?1:0,team=await db.first('SELECT id,name FROM teams WHERE id=?',Number(input.team_id));
 if(!team)fail('Select a team');const message=String(input.message||'').trim();if(message.length>300)fail('Message must be under 300 characters');
 const image=String(input.image||'');if(image.length>600000||image&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image))fail('Upload a JPG image under 450 KB');
 if(image){const raw=atob(image.split(',')[1]);if(raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216)fail('Invalid JPG');}
 await db.run('INSERT INTO winner_announcement(id,enabled,team_id,team_name,message,image) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,team_id=excluded.team_id,team_name=excluded.team_name,message=excluded.message,image=excluded.image',enabled,team.id,team.name,message,image);return json({ok:true});
}
export default {async fetch(request,env){
 try{
  const path=new URL(request.url).pathname;
  // Clubs and squads are managed directly by league administrators.
  if(path==='/register-club'||path==='/register-club.html')return new Response(null,{status:302,headers:{...securityHeaders,Location:'/#teams','Cache-Control':'no-store'}});
  if(path==='/api/registration/config'&&request.method==='GET')return json({open:false,enabled:false,fixtures_visible:true,league:'Sabzazar Super League'});
  if(path==='/api/registration'||path.startsWith('/api/registration/')||path.startsWith('/api/admin/registrations'))return json({error:'Online club registration has been retired. Clubs are managed by the league admin.'},410);
  if(path==='/api/public/winner'||path==='/api/admin/winner')return await winnerApi(request,env);
  if(path.startsWith('/api/watch/')||path.startsWith('/api/admin/broadcasts'))return await broadcastApi(request,env);
  if(path.startsWith('/api/account/')||path.startsWith('/auth/google'))return await memberApi(request,env);
  const poster=path.match(/^\/news-poster\/(\d+)$/);if(poster){const row=await database(env).first('SELECT data FROM news_posters WHERE news_id=?',Number(poster[1]));if(!row)return json({error:'Not found'},404);return new Response(Uint8Array.from(atob(row.data.split(',')[1]),c=>c.charCodeAt(0)),{headers:{...securityHeaders,'Content-Type':'image/jpeg','Cache-Control':'public, max-age=3600'}});}
 const logo=path.match(/^\/team-logo\/(\d+)$/);if(logo){const row=await database(env).first('SELECT data FROM team_logos WHERE team_id=?',Number(logo[1]));if(!row)return json({error:'Not found'},404);return new Response(Uint8Array.from(atob(row.data.split(',')[1]),c=>c.charCodeAt(0)),{headers:{...securityHeaders,'Content-Type':'image/png','Cache-Control':'public, max-age=3600'}});}
  if(path.startsWith('/api/')||path==='/healthz')return await api(request,env);
  if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
  const adminHost=new URL(request.url).hostname==='admin.sabzazarchampionsleague.club';
  const adminAlias=['/admin.html','/admin/login','/admin/login/','/admin-portal','/admin-portal/','/adminportal'].includes(path)||(adminHost&&['/login','/login/','/index.html'].includes(path));
  if(adminAlias)return new Response(null,{status:302,headers:{...securityHeaders,Location:adminHost?'/':'/admin','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
  const assetPath=path==='/register-club'?'/register-club.html':path==='/watch'?'/watch.html':path==='/privacy'?'/privacy.html':path==='/team'?'/team.html':path==='/'?(new URL(request.url).hostname==='admin.sabzazarchampionsleague.club'?'/admin/index.html':'/index.html'):['/login','/signup','/account'].includes(path)?'/account.html':['/admin','/admin/'].includes(path)?'/admin/index.html':path;
  const asset=assets[assetPath];if(!asset)return json({error:'Not found'},404);
  const bytes=Uint8Array.from(atob(asset.data),x=>x.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:bytes,{headers:{...securityHeaders,'Content-Type':asset.type,'Cache-Control':(/\.(html|js)$/.test(assetPath))?'no-store':'public, max-age=3600',...((path.startsWith('/admin')||new URL(request.url).hostname==='admin.sabzazarchampionsleague.club')?{'X-Robots-Tag':'noindex, nofollow'}:{})}});
 }catch(error){if(String(error.message).includes('teams.name_key'))return json({error:'This team name is already registered. Choose another name.'},409);if(error.status)return json({error:error.message},error.status);console.error('SCL request failed',error.name);return json({error:'Service unavailable. Please try again.'},503);}
}};
export {passwordHash};
