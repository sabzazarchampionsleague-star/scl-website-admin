function teamName(value){return text(value,'team name',150,true).normalize('NFKC').replace(/\s+/gu,' ').trim();}
function teamKey(value){return teamName(value).toLowerCase();}
async function saveTeam(db,id,name,owner,description){
 name=teamName(name);const key=teamKey(name);
 if(await db.first('SELECT id FROM teams WHERE name_key=? AND id<>?',key,id||0))fail('This team name is already registered. Choose another name.',409);
 try{if(id){await db.run('UPDATE teams SET name=?,name_key=?,short_name=?,description=? WHERE id=?',name,key,name.slice(0,20),description,id);return id;}
 const r=await db.run('INSERT INTO teams(name,name_key,short_name,owner_user_id,description) VALUES(?,?,?,?,?)',name,key,name.slice(0,20),owner,description);return r.meta.last_row_id;
 }catch(e){if(String(e.message).includes('UNIQUE'))fail('This team name is already registered. Choose another name.',409);throw e;}
}
async function saveLogo(db,id,image){
 if(typeof image!=='string'||image.length>200000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image))fail('Choose a valid PNG logo');
 let raw;try{raw=atob(image.split(',')[1]);}catch{fail('Invalid image');}if(!raw.startsWith('\x89PNG\r\n\x1a\n'))fail('Invalid PNG image');
 await db.batch([['INSERT INTO team_logos(team_id,data) VALUES(?,?) ON CONFLICT(team_id) DO UPDATE SET data=excluded.data',id,image],['UPDATE teams SET logo_url=? WHERE id=?','/team-logo/'+id+'?v='+Date.now(),id]]);
}
const FORMATIONS=['2-3-1','3-2-1','2-2-2','3-1-2'];
async function notifyEntry(db,env,id){
 const entry=await db.first('SELECT a.*,e.title,u.name,u.email,t.name team_name FROM event_entries a JOIN events e ON e.id=a.event_id JOIN users u ON u.id=a.user_id LEFT JOIN teams t ON t.id=a.team_id WHERE a.id=?',id);
 if(!entry||entry.email_status==='sent')return entry?.email_status||'pending';
 if(!env.RESEND_API_KEY||!env.EVENT_EMAIL_FROM)return 'pending';
 try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'scl-event-entry-'+id},body:JSON.stringify({from:env.EVENT_EMAIL_FROM,to:['sabzazarchampionsleague@gmail.com'],subject:'SCL event application: '+entry.title,text:`Event: ${entry.title}\nApplicant: ${entry.name}\nEmail: ${entry.email}\nEntry: ${entry.team_name||'Individual player'}\nMessage: ${entry.message}\n\nReview in your SCL admin portal.`})});
 const state=r.ok?'sent':'failed';await db.run('UPDATE event_entries SET email_status=? WHERE id=?',state,id);return state;
 }catch{await db.run("UPDATE event_entries SET email_status='failed' WHERE id=?",id);return 'failed';}
}
async function leagueMember(request,env,db,user,input){
 const path=new URL(request.url).pathname,method=request.method;
 if(path==='/api/account/profile'){
  if(method==='GET')return json(await db.first('SELECT position,bio FROM player_profiles WHERE user_id=?',user.id));
  if(method==='PUT'){const position=text(input.position,'position',80,true),bio=text(input.bio,'bio',1000);await db.run('INSERT INTO player_profiles(user_id,position,bio) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET position=excluded.position,bio=excluded.bio',user.id,position,bio);return json({ok:true});}
 }
 if(path==='/api/account/teams'&&method==='POST'){
  fail('Only the league admin can create teams.',403);await memberLimit(request,db,'create-team',5);const id=await saveTeam(db,null,input.name,user.id,text(input.description,'description',2000));return json({id},201);
 }
 const own=path.match(/^\/api\/account\/teams\/(\d+)(?:\/(logo|formation))?$/);
 if(own){const id=Number(own[1]),team=await db.first('SELECT * FROM teams WHERE id=? AND owner_user_id=?',id,user.id);if(!team)fail('Team not found',404);
  if(method==='GET')return json({team,players:await db.all('SELECT id,name,position,jersey_no FROM players WHERE team_id=?',id)});
  if(method==='PUT'){
   if(own[2]==='logo')await saveLogo(db,id,input.image);
   else if(own[2]==='formation'){
    await saveFormation(db,id,input);
   }else await saveTeam(db,id,input.name,user.id,text(input.description,'description',2000));
   return json({ok:true});
  }
 }
 if(path==='/api/account/events'&&method==='GET')return json(await db.all('SELECT a.*,e.title,t.name team_name FROM event_entries a JOIN events e ON e.id=a.event_id LEFT JOIN teams t ON t.id=a.team_id WHERE a.user_id=? ORDER BY a.id DESC',user.id));
 if(path==='/api/account/events'&&method==='POST'){
  await memberLimit(request,db,'event-entry',20);const eventId=integer(input.event_id,'event',1),event=await db.first('SELECT * FROM events WHERE id=?',eventId);if(!event||event.status!=='open')fail('This event is not accepting applications',409);
  const teamId=input.team_id?integer(input.team_id,'team',1):null;
  if(teamId){if(event.entry_type==='player')fail('This event accepts players only');if(!await db.first('SELECT id FROM teams WHERE id=? AND owner_user_id=?',teamId,user.id))fail('Only the team owner can enter this team',403);}
  else {if(event.entry_type==='team')fail('This event accepts teams only');if(!await db.first('SELECT user_id FROM player_profiles WHERE user_id=?',user.id))fail('Create your player profile first');}
  const key=teamId?'team:'+teamId:'player:'+user.id;let id;
  try{const r=await db.run("INSERT INTO event_entries(event_id,user_id,team_id,entry_key,message) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND status='open')",eventId,user.id,teamId,key,text(input.message,'message',2000),eventId);if(!r.meta.changes)fail('This event has closed',409);id=r.meta.last_row_id;}catch(e){if(String(e.message).includes('UNIQUE'))fail('This entry has already been submitted',409);throw e;}
  await notifyEntry(db,env,id);return json({ok:true,id},201);
 }
 return null;
}
async function leaguePublic(path,db){
 if(path==='/api/public/top-players')return json(await topPlayers(db));
 if(path==='/api/public/events')return json(await db.all('SELECT * FROM events ORDER BY event_date DESC,id DESC'));
 const m=path.match(/^\/api\/public\/teams\/(\d+)$/);if(m){const team=await db.first('SELECT id,name,logo_url,description,formation FROM teams WHERE id=?',Number(m[1]));if(!team)fail('Team not found',404);return json({team,players:(await playerStatistics(db)).filter(p=>p.team_id===team.id)});}
 return null;
}
async function leagueAdmin(path,method,input,db,env){
 const card=path.match(/^\/api\/admin\/matches\/(\d+)\/cards(?:\/(\d+))?$/);
 if(card){const id=Number(card[1]),m=await db.first('SELECT * FROM matches WHERE id=?',id);if(!m)fail('Match not found',404);
 if(method==='POST'&&!card[2]){const key=text(input.request_key,'request key',80,true);if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))fail('Invalid request key');const old=await db.first('SELECT * FROM match_cards WHERE request_key=?',key);if(old){if(old.match_id!==id)fail('Request already used',409);return json(old);}
 if(m.status!=='live')fail('Set the match to live before adding a card',409);
 const team=integer(input.team_id,'team',1);if(![m.home_team_id,m.away_team_id].includes(team))fail('Choose a team playing in this match');if(!['yellow','red'].includes(input.card_type))fail('Choose yellow or red card');const name=text(input.player_name,'player name',150,true);
 const seconds=Math.min(m.duration_minutes*60,m.clock_seconds+(m.clock_started_at?Math.max(0,Math.floor((Date.now()-m.clock_started_at)/1000)):0));
 await db.run('INSERT INTO match_cards(match_id,team_id,player_name,card_type,elapsed_seconds,minute,request_key) VALUES(?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING',id,team,name,input.card_type,seconds,Math.floor(seconds/60),key);return json(await db.first('SELECT * FROM match_cards WHERE request_key=?',key));}
 if(method==='DELETE'&&card[2]){await db.run('DELETE FROM match_cards WHERE id=? AND match_id=?',Number(card[2]),id);return json({ok:true});}
 }

 const goal=path.match(/^\/api\/admin\/matches\/(\d+)\/goals(?:\/(\d+))?$/);
 if(goal){const id=Number(goal[1]),m=await db.first('SELECT * FROM matches WHERE id=?',id);if(!m)fail('Match not found',404);
 if(method==='POST'&&!goal[2]){const key=text(input.request_key,'request key',80,true);if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))fail('Invalid request key');const old=await db.first('SELECT * FROM match_goals WHERE request_key=?',key);if(old){if(old.match_id!==id)fail('Request already used',409);return json(old);}
 if(!['live','finished'].includes(m.status))fail('Scorers can be added to live or Full time matches',409);
 const team=integer(input.team_id,'team',1);if(![m.home_team_id,m.away_team_id].includes(team))fail('Choose a team playing in this match');const scorer=text(input.scorer,'scorer name',150,true);if(input.own_goal==='yes'&&input.penalty==='yes')fail('Choose either penalty or own goal');
 const historical=m.status==='finished';const minuteLabel=historical&&/^\d{1,3}\+\d{1,2}$/.test(String(input.minute))?String(input.minute):'';const goalMinute=minuteLabel?minuteLabel.split('+').reduce((a,n)=>a+Number(n),0):input.minute;
 const seconds=historical?integer(goalMinute,'goal minute',0,240)*60:Math.min(m.duration_minutes*60,m.clock_seconds+(m.clock_started_at?Math.max(0,Math.floor((Date.now()-m.clock_started_at)/1000)):0));
 if(historical){if(input.minute===undefined||input.minute==='')fail('Enter the goal minute');const count=await db.first('SELECT COUNT(*) c FROM match_goals WHERE match_id=? AND team_id=?',id,team);if(count.c>=(team===m.home_team_id?m.home_score:m.away_score))fail('All goals for this team already have scorers. Correct the final score first if needed.',409);}
 await db.run('INSERT INTO match_goals(match_id,team_id,scorer,elapsed_seconds,minute,request_key,affects_score,note,minute_label) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING',id,team,scorer,seconds,Math.floor(seconds/60),key,historical?0:1,text((input.own_goal==='yes'?'Own goal'+(input.note?' · ':''):'')+(input.penalty==='yes'?'Penalty ':'')+(input.note||''),'goal note',200),minuteLabel);return json(await db.first('SELECT * FROM match_goals WHERE request_key=?',key));}
 if(method==='DELETE'&&goal[2]){await db.run('DELETE FROM match_goals WHERE id=? AND match_id=?',Number(goal[2]),id);return json({ok:true});}
 }

 const formation=path.match(/^\/api\/admin\/teams\/(\d+)\/formation$/);
 if(formation&&method==='PUT'){const team=await db.first('SELECT owner_user_id FROM teams WHERE id=?',Number(formation[1]));if(!team)fail('Team not found',404);
 return saveFormation(db,Number(formation[1]),input);}
 const clock=path.match(/^\/api\/admin\/matches\/(\d+)\/clock$/);
 if(clock&&method==='PUT'){const m=await db.first('SELECT * FROM matches WHERE id=?',Number(clock[1]));if(!m)fail('Match not found',404);
 if(input.action==='added_time'){
  if(m.status==='finished')fail('Add stoppage time before Full time');
  const first=integer(input.first_half_extra,'first-half added minutes',0,30),second=integer(input.second_half_extra,'second-half added minutes',0,30);
  const duration=m.duration_minutes-m.first_half_extra-m.second_half_extra+first+second;
  if(duration<1||duration>240)fail('Total duration must be between 1 and 240 minutes');
  const elapsed=m.clock_seconds+(m.clock_started_at?Math.max(0,(Date.now()-m.clock_started_at)/1000):0);
  if(duration*60<=elapsed)fail('Total duration must be longer than the current clock');
  await db.run('UPDATE matches SET duration_minutes=?,first_half_extra=?,second_half_extra=? WHERE id=?',duration,first,second,m.id);return json({ok:true});
 }
 if(!['start','pause','reset','half_time','second_half'].includes(input.action))fail('Invalid timer action');if(['start','second_half','half_time'].includes(input.action)&&m.status==='finished')fail('Change status before restarting a Full time match');
 const seconds=input.action==='reset'?0:Math.min(m.duration_minutes*60,m.clock_seconds+(m.clock_started_at?Math.max(0,Math.floor((Date.now()-m.clock_started_at)/1000)):0));
 const running=['start','second_half'].includes(input.action);
 if(running&&seconds>=m.duration_minutes*60)fail('Timer has reached the match duration. Reset it or increase the duration.');
 const phase=input.action==='half_time'?'Half-time':(input.action==='second_half'||(input.action==='start'&&m.phase==='Half-time'))?'2nd half':input.action==='reset'?'':m.phase;
 await db.run('UPDATE matches SET clock_seconds=?,clock_started_at=?,minute=?,status=?,phase=?,half_time_done=? WHERE id=?',seconds,running?Date.now():null,Math.floor(seconds/60),running?'live':m.status,phase,input.action==='reset'?0:['half_time','second_half'].includes(input.action)?1:m.half_time_done,m.id);return json({ok:true});}

 if(path==='/api/admin/event-entries'&&method==='GET')return json({emailConfigured:!!(env.RESEND_API_KEY&&env.EVENT_EMAIL_FROM),entries:await db.all('SELECT a.*,e.title,u.name,u.email,t.name team_name FROM event_entries a JOIN events e ON e.id=a.event_id JOIN users u ON u.id=a.user_id LEFT JOIN teams t ON t.id=a.team_id ORDER BY a.id DESC')});
 const entry=path.match(/^\/api\/admin\/event-entries\/(\d+)(?:\/(notify))?$/);
 if(entry&&method==='PUT'){
  const id=Number(entry[1]);if(!await db.first('SELECT id FROM event_entries WHERE id=?',id))fail('Entry not found',404);
  if(entry[2])return json({email_status:await notifyEntry(db,env,id)});
  if(!['approved','rejected','pending'].includes(input.status))fail('Invalid decision');await db.run('UPDATE event_entries SET status=? WHERE id=?',input.status,id);return json({ok:true});
 }
 const event=path.match(/^\/api\/admin\/events(?:\/(\d+))?$/);if(event){
  const id=event[1]?Number(event[1]):null;
  if(method==='GET'&&!id)return json(await db.all('SELECT * FROM events ORDER BY id DESC'));
  if(id&&!await db.first('SELECT id FROM events WHERE id=?',id))fail('Event not found',404);
  if((method==='POST'&&!id)||(method==='PUT'&&id)){
   const title=text(input.title,'title',250,true),description=text(input.description,'description',10000,true),date=text(input.event_date,'date',80,true),venue=text(input.venue,'venue',200);if(!Number.isFinite(Date.parse(date)))fail('Invalid date');if(!['open','closed'].includes(input.status)||!['both','player','team'].includes(input.entry_type))fail('Invalid event settings');
   if(id)await db.run('UPDATE events SET title=?,description=?,event_date=?,venue=?,status=?,entry_type=? WHERE id=?',title,description,date,venue,input.status,input.entry_type,id);
   else await db.run('INSERT INTO events(title,description,event_date,venue,status,entry_type) VALUES(?,?,?,?,?,?)',title,description,date,venue,input.status,input.entry_type);return json({ok:true});
  }
 }
 return null;
}

async function saveFormation(db,id,input){
    if(typeof input.shape!=='string'||!/^[1-6](?:-[1-6]){0,5}$/.test(input.shape)||input.shape.split('-').reduce((a,n)=>a+Number(n),0)!==6||!Array.isArray(input.players)||input.players.length!==7)fail('Choose a formation and 7 lineup slots');
    const chosen=input.players.filter(x=>x!==null);if(chosen.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(chosen).size!==chosen.length)fail('Each player can appear only once');
    const roster=await db.all('SELECT id FROM players WHERE team_id=?',id);if(chosen.some(x=>!roster.some(p=>p.id===x)))fail('Select players from your team roster');
    await db.run('UPDATE teams SET formation=? WHERE id=?',JSON.stringify({shape:input.shape,players:input.players}),id);
return json({ok:true});}

async function matchesWithGoals(db){const results=await db.batch([[matchQuery+' ORDER BY datetime(m.match_date) DESC'],['SELECT id,match_id,team_id,scorer,minute,elapsed_seconds,note,minute_label,affects_score FROM match_goals ORDER BY elapsed_seconds,id'],['SELECT id,match_id,team_id,player_name,card_type,minute,elapsed_seconds FROM match_cards ORDER BY elapsed_seconds,id']]);const [rows,goals,cards]=results.map(r=>r.results);return rows.map(m=>({...m,...aggregateScore(m,rows.find(x=>x.id===m.first_leg_id)),goals:goals.filter(g=>g.match_id===m.id).map(g=>matchEventTime(m,g,g.affects_score===0)),cards:cards.filter(c=>c.match_id===m.id).map(c=>matchEventTime(m,c))}));}

function scheduledKickoff(value){
 if(typeof value!=='string'||!value.trim())return NaN;
 const date=value.trim();return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(date)?date+'+05:00':date);
}
async function finishElapsedMatches(db){
 const operations=[];
 const scheduled=await db.all("SELECT id,match_date FROM matches WHERE status='scheduled'");
 for(const match of scheduled){const kickoff=scheduledKickoff(match.match_date);if(Number.isFinite(kickoff)&&kickoff<=Date.now())operations.push(["UPDATE matches SET status='live',clock_seconds=0,minute=0,clock_started_at=? WHERE id=? AND status='scheduled' AND match_date=?",kickoff,match.id,match.match_date]);}
 const now=Date.now();
 operations.push(["UPDATE matches SET clock_seconds=((duration_minutes-first_half_extra-second_half_extra)/2.0+first_half_extra)*60,clock_started_at=NULL,minute=CAST((duration_minutes-first_half_extra-second_half_extra)/2.0 AS INTEGER),phase='Half-time',half_time_done=1 WHERE status='live' AND half_time_done=0 AND clock_started_at IS NOT NULL AND clock_seconds+MAX(0,(?-clock_started_at)/1000)>=((duration_minutes-first_half_extra-second_half_extra)/2.0+first_half_extra)*60",now]);
 operations.push(["UPDATE matches SET status='finished',minute=duration_minutes,clock_seconds=duration_minutes*60,clock_started_at=NULL,phase='' WHERE status='live' AND (clock_seconds>=duration_minutes*60 OR (clock_started_at IS NOT NULL AND clock_seconds+MAX(0,(?-clock_started_at)/1000)>=duration_minutes*60))",now]);
 await db.batch(operations);
}

async function topPlayers(db){
 const goals=await db.all("SELECT g.*,t.name team_name FROM match_goals g JOIN matches m ON m.id=g.match_id JOIN teams t ON t.id=g.team_id WHERE m.status IN ('live','finished')"),roster=await db.all('SELECT p.id,p.team_id,p.name,p.position,p.assists,t.name team_name FROM players p JOIN teams t ON t.id=p.team_id');
 const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
 const aliases={ehtisham:'ihtisham',salaar:'salar',shazaib:'shahzaib',hasssan:'hassan',suklain:'saqlain',siddique:'saddique',khuram:'khurram',oubaid:'obaid',obuaid:'obaid',mohammed:'muhammad',tayyab:'tayyabbutt',nadeeali:'nadaali'};
 const table=new Map();function entry(g,name){const raw=norm(name),key=aliases[raw]||raw;const candidates=roster.filter(p=>p.team_id===g.team_id&&(norm(p.name)===key||norm(p.name)===raw));const player=candidates.length===1?candidates[0]:null;const id=g.team_id+':'+(player?norm(player.name):key);if(!table.has(id))table.set(id,{player_id:player?.id||null,name:player?.name||name,team_name:g.team_name,team_id:g.team_id,position:player?.position||'',goals:0,assists:0});return table.get(id);}
 for(const g of goals){if(/own goal/i.test(g.note||''))continue;entry(g,g.scorer).goals++;const assist=(g.note||'').match(/Assist:\s*([^·]+)/i);if(assist)entry(g,assist[1].trim()).assists++;}
 for(const p of roster){if(p.assists>0)entry(p,p.name).assists=p.assists;}
 return [...table.values()].sort((a,b)=>b.goals-a.goals||b.assists-a.assists||a.name.localeCompare(b.name));
}

function matchEventTime(m,event,historical=false){
 if(historical)return event;
 const first=Number(m.first_half_extra||0),second=Number(m.second_half_extra||0),base=m.duration_minutes-first-second,half=base/2,s=event.elapsed_seconds;
 if(first&&s>=half*60&&s<=(half+first)*60)return {...event,minute:Math.floor(s/60),minute_label:half+'+'+Math.floor((s-half*60)/60)};
 const played=Math.max(0,s-(s>(half+first)*60?first*60:0)),minute=Math.floor(played/60);
 return {...event,minute,minute_label:second&&played>=base*60?base+'+'+(minute-base):''};
}

function aggregateScore(m,first){if(!first)return {aggregate:null,first_leg_score:null};const same=m.home_team_id===first.home_team_id;return {first_leg_score:{home:same?first.home_score:first.away_score,away:same?first.away_score:first.home_score},aggregate:{home:(same?first.home_score:first.away_score)+(m.status==='scheduled'?0:m.home_score),away:(same?first.away_score:first.home_score)+(m.status==='scheduled'?0:m.away_score)}};}

async function playerStatistics(db){const [roster,stats]=await Promise.all([db.all(playerQuery+' ORDER BY p.name'),topPlayers(db)]);const byId=new Map(stats.filter(p=>p.player_id).map(p=>[p.player_id,p]));return roster.map(p=>({...p,goals:byId.get(p.id)?.goals||0,assists:byId.get(p.id)?.assists||0}));}
