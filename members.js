async function sendPlayerWelcome(env,user,returning=false){
 if(!env.RESEND_API_KEY||!env.WELCOME_EMAIL_FROM)return;
 let club=null;try{club=await database(env).first("SELECT club,logo FROM club_registrations WHERE user_id=? AND status<>'cancelled' ORDER BY id DESC LIMIT 1",user.id);}catch{}
 const clubImage=club&&/^data:image\/jpeg;base64,/.test(club.logo||'')?club.logo.split(',')[1]:null;
 const name=String(user.name||'Player').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':returning?`player-login-${user.id}-${crypto.randomUUID()}`:`player-welcome-${user.id}`},signal:AbortSignal.timeout(8000),body:JSON.stringify({from:env.WELCOME_EMAIL_FROM,to:[user.email],attachments:[{filename:'ssl-logo.jpg',content:assets['/assets/ssl-logo.jpg'].data,content_type:'image/jpeg',content_id:'scl-logo'},...(clubImage?[{filename:'club-logo.jpg',content:clubImage,content_type:'image/jpeg',content_id:'club-logo'}]:[])],reply_to:'sabzazarchampionsleague@gmail.com',subject:returning?'Welcome back to SSL!':'Welcome to Sabzazar Super League!',text:`${returning?'Welcome back':'Congratulations'}, ${user.name}! ${returning?'You have successfully signed in to SSL.':'Your SSL player account is ready.'} Sign in to watch live broadcasts and follow match scores, results and league standings. Explore SSL: https://sabzazarchampionsleague.club/ — The SSL Team`,html:`<div style="background:#f4f1fa;padding:32px;font-family:Arial,sans-serif;color:#24153c"><div style="max-width:560px;margin:auto;background:white;border-radius:16px;overflow:hidden"><div style="background:#123a65;color:white;padding:28px;font-weight:bold"><img src="cid:scl-logo" alt="SSL logo" width="76" height="76" style="display:block;width:76px;height:76px;object-fit:contain;background:white;border-radius:12px;margin:0 0 16px">SSL | SABZAZAR SUPER LEAGUE</div><div style="padding:28px">${clubImage?'<img src="cid:club-logo" alt="Your club logo" width="90" height="90" style="display:block;object-fit:contain;margin-bottom:18px">':''}<h1 style="font-size:26px">${returning?'Welcome back to the game.':'Welcome to the game.'}</h1><p>${returning?'Welcome back':'Congratulations'}, ${name}!</p><p>${returning?'You have successfully signed in. Your next matchday moment is waiting.':'Your SSL player account is ready. You are now part of our football community.'}</p><p>Sign in to watch live broadcasts and follow the latest scores, results and league standings.</p><p style="margin:30px 0"><a href="https://sabzazarchampionsleague.club/" style="background:#176bc0;color:white;padding:14px 22px;border-radius:8px;text-decoration:none">Explore SSL</a></p><p>See you on matchday,<br>The SSL Team</p><hr style="border:0;border-top:1px solid #eee"><p style="font-size:12px;color:#777">${returning?'This email confirms a successful sign-in to your SSL account. If this was not you, contact us immediately.':'This email confirms your SSL account registration.'} Need help? Reply to this email.</p></div></div></div>`})});if(!r.ok)console.warn('Welcome email not accepted:',r.status);}catch{console.warn('Welcome email unavailable');}
}
const MEMBER_COOKIE='__Host-scl-member';
function namedCookie(request,name){return (request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';}
function memberCookie(token){return `${MEMBER_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${token?2592000:0}`;}
async function member(request,db){const t=namedCookie(request,MEMBER_COOKIE);if(!/^[a-f0-9]{64}$/.test(t))return null;return db.first('SELECT u.id,u.name,u.email,u.google_sub,s.token_hash,s.expires FROM users u JOIN user_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>?',await digest(t),Date.now());}
async function memberSession(db,user){const t=randomToken();await db.batch([['DELETE FROM user_sessions WHERE expires<=?',Date.now()],['INSERT INTO user_sessions(token_hash,user_id,expires) VALUES(?,?,?)',await digest(t),user.id,Date.now()+2592000000]]);return memberCookie(t);}
async function memberLimit(request,db,kind,max=10){const w=Math.floor(Date.now()/900000),key=await digest(kind+':'+(request.headers.get('CF-Connecting-IP')||'local')+':'+w);const r=await db.first('INSERT INTO login_limits(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,(w+1)*900000);if(r.attempts>max)fail('Too many attempts. Try again in 15 minutes.',429);}
function emailValue(v){const e=text(v,'email',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail('Enter a valid email address');return e;}
function redirect(url,cookies=[]){const h=new Headers({...securityHeaders,Location:url,'Cache-Control':'no-store'});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h});}
function b64url(data){return btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function googleStart(request,env,db){
 const loginOrigin='https://sabzazarchampionsleague.club';if(new URL(request.url).origin!==loginOrigin)return redirect(loginOrigin+'/auth/google');
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return redirect('/login?error=google_unavailable');
 await memberLimit(request,db,'oauth',30);
 const state=randomToken(),nonce=randomToken(),verifier=randomToken();
 await db.batch([['DELETE FROM oauth_states WHERE expires<=?',Date.now()],['INSERT INTO oauth_states(state_hash,nonce,verifier,expires) VALUES(?,?,?,?)',await digest(state),nonce,verifier,Date.now()+600000]]);
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 u.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:new URL('/auth/google/callback',request.url).href,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:b64url(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))),code_challenge_method:'S256',prompt:'select_account'});
 return redirect(u.href,[`__Host-scl-oauth=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`]);
}
async function googleCallback(request,env,db){
 const clear='__Host-scl-oauth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
 try{
  const p=new URL(request.url).searchParams,state=p.get('state');
  if(!state||state!==namedCookie(request,'__Host-scl-oauth'))throw Error('state');
  const row=await db.first('DELETE FROM oauth_states WHERE state_hash=? AND expires>? RETURNING nonce,verifier',await digest(state),Date.now());
  if(!row||!p.get('code')||p.has('error'))throw Error('cancelled');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:p.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:new URL('/auth/google/callback',request.url).href,grant_type:'authorization_code',code_verifier:row.verifier})});
  if(!response.ok)throw Error('exchange');const tokens=await response.json();
  const parts=tokens.id_token?.split('.');if(parts?.length!==3)throw Error('token');
  const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(head.alg!=='RS256')throw Error('algorithm');
  const keys=await (await fetch('https://www.googleapis.com/oauth2/v3/certs')).json();const jwk=keys.keys.find(k=>k.kid===head.kid);if(!jwk)throw Error('key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw Error('signature');
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==env.GOOGLE_CLIENT_ID||claims.exp<=Date.now()/1000||claims.nonce!==row.nonce||claims.email_verified!==true||!claims.sub)throw Error('claims');
  let isNew=false;let user=await db.first('SELECT * FROM users WHERE google_sub=?',claims.sub);
  if(!user){const email=emailValue(claims.email);const existing=await db.first('SELECT id,google_sub FROM users WHERE email=?',email);if(existing){if(existing.google_sub||!email.endsWith('@gmail.com'))return redirect('/login?error=use_password',[clear]);await db.batch([['UPDATE users SET google_sub=? WHERE id=? AND google_sub IS NULL',claims.sub,existing.id],['DELETE FROM user_sessions WHERE user_id=?',existing.id]]);}else{isNew=true;await db.run('INSERT INTO users(name,email,google_sub) VALUES(?,?,?)',text(claims.name||email.split('@')[0],'name',100,true),email,claims.sub);}user=await db.first('SELECT * FROM users WHERE google_sub=?',claims.sub);if(!user)throw Error('link');}
  await sendPlayerWelcome(env,user,!isNew);
  return redirect('/account',[await memberSession(db,user),clear]);
 }catch{return redirect('/login?error=google_failed',[clear]);}
}
async function memberApi(request,env){
 const db=database(env),path=new URL(request.url).pathname,method=request.method;
 if(path==='/auth/google')return googleStart(request,env,db);
 if(path==='/auth/google/callback')return googleCallback(request,env,db);
 if(path==='/api/account/config')return json({google:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)});
 const input=method==='GET'?{}:await body(request);
 if(path==='/api/account/signup'&&method==='POST'){
  await memberLimit(request,db,'signup',5);const email=emailValue(input.email),name=text(input.name,'name',100,true);
  if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)fail('Use a password between 12 and 128 characters');
  if(await db.first('SELECT id FROM users WHERE email=?',email))fail('An account already uses this email. Please log in.',409);
  try{await db.run('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)',name,email,await passwordHash(input.password));}catch{fail('Unable to create account. Try logging in instead.',409);}
  const user=await db.first('SELECT id FROM users WHERE email=?',email);await sendPlayerWelcome(env,{...user,name,email});return json({ok:true},201,{'Set-Cookie':await memberSession(db,user)});
 }
 if(path==='/api/account/login'&&method==='POST'){
  await memberLimit(request,db,'member-login');const email=emailValue(input.email),user=await db.first('SELECT * FROM users WHERE email=?',email);
  const valid=await verifyPassword(input.password,user?.password_hash||env.ADMIN_PASSWORD_HASH);if(!user?.password_hash||!valid)fail('Invalid email or password. If you joined with Google, use Google sign-in.',401);
  await sendPlayerWelcome(env,user,true);
  return json({ok:true},200,{'Set-Cookie':await memberSession(db,user)});
 }
 const user=await member(request,db);
 if(path==='/api/account/me'){const headers={};if(user&&user.expires<Date.now()+2505600000){await db.run('UPDATE user_sessions SET expires=? WHERE token_hash=?',Date.now()+2592000000,user.token_hash);headers['Set-Cookie']=memberCookie(namedCookie(request,MEMBER_COOKIE));}return json({user:user?{id:user.id,name:user.name,email:user.email,google:!!user.google_sub}:null},200,headers);}
 if(!user)fail('Please log in first',401);
 if(path==='/api/account/applications'||path.startsWith('/api/account/owner/applications'))fail('Club joining is disabled. Player rosters are managed by the admin.',403);

 if(path==='/api/account/name'&&method==='PUT'){await db.run('UPDATE users SET name=? WHERE id=?',text(input.name,'name',100,true),user.id);return json({ok:true});}
 if(/^\/api\/account\/(profile|events|teams|owner)(?:\/|$)/.test(path))fail('Player accounts are for profiles and watching broadcasts',403);
 const extra=await leagueMember(request,env,db,user,input);if(extra)return extra;
 if(path==='/api/account/logout'&&method==='POST'){await db.run('DELETE FROM user_sessions WHERE token_hash=?',user.token_hash);return json({ok:true},200,{'Set-Cookie':memberCookie('')});}
 if(path==='/api/account/dashboard'&&method==='GET')return json({owned:await db.all('SELECT id,name,logo_url FROM teams WHERE owner_user_id=?',user.id),applications:await db.all('SELECT a.*,t.name team_name FROM applications a JOIN teams t ON t.id=a.team_id WHERE a.user_id=? ORDER BY a.id DESC',user.id),membership:await db.first('SELECT p.id,t.name team_name FROM players p JOIN teams t ON t.id=p.team_id WHERE p.user_id=?',user.id)});
 if(path==='/api/account/applications'&&method==='POST'){
  await memberLimit(request,db,'applications',20);const team=integer(input.team_id,'team',1);const club=await db.first('SELECT id,owner_user_id FROM teams WHERE id=?',team);if(!club)fail('Team not found',404);if(!club.owner_user_id)fail('This club needs an owner assigned by the league before it can accept requests.',409);
  if(await db.first('SELECT id FROM players WHERE user_id=?',user.id))fail('You are already on a team');
  const pos=text(input.position,'position',80,true),message=text(input.message,'message',2000);
  if(await db.first('SELECT id FROM applications WHERE user_id=? AND team_id=?',user.id,team))fail('You have already applied to this team',409);
  const result=await db.run('INSERT INTO applications(user_id,team_id,position,message) VALUES(?,?,?,?)',user.id,team,pos,message);return json({ok:true},201);
 }
 if(path==='/api/account/owner/applications'&&method==='GET')return json(await db.all('SELECT a.*,u.name,u.email,t.name team_name FROM applications a JOIN users u ON u.id=a.user_id JOIN teams t ON t.id=a.team_id WHERE t.owner_user_id=? ORDER BY a.id DESC',user.id));
 const decision=path.match(/^\/api\/account\/owner\/applications\/(\d+)$/);
 if(decision&&method==='PUT'){
  const a=await db.first('SELECT a.*,u.name FROM applications a JOIN teams t ON t.id=a.team_id JOIN users u ON u.id=a.user_id WHERE a.id=? AND t.owner_user_id=?',Number(decision[1]),user.id);if(!a)fail('Application not found',404);
  if(a.status!=='pending')fail('This application has already been reviewed',409);
  if(!['approved','rejected'].includes(input.status))fail('Invalid decision');
  if(input.status==='approved'){
   try{await db.batch([['INSERT INTO players(team_id,user_id,name,position) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM applications WHERE id=? AND status=\'pending\')',a.team_id,a.user_id,a.name,a.position,a.id],['UPDATE applications SET status=\'approved\' WHERE id=? AND status=\'pending\'',a.id],['UPDATE applications SET status=\'rejected\' WHERE user_id=? AND id<>? AND status=\'pending\'',a.user_id,a.id]]);}catch{fail('This player is already on a team. Refresh to see current applications.',409);}
  }else await db.run("UPDATE applications SET status='rejected' WHERE id=? AND status='pending'",a.id);
  return json({ok:true});
 }
 return json({error:'Not found'},404);
}
