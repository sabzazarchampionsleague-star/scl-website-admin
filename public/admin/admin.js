
const $=s=>document.querySelector(s), page=$('#page');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opt});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Request failed');return data}
async function boot(){const me=await api('/api/admin/me'); if(me.admin){showApp();nav('dashboard')}}
function showApp(){$('#loginScreen').classList.add('hidden');$('#app').classList.remove('hidden')}
$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMsg').textContent='';try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})});showApp();nav('dashboard')}catch(err){$('#loginMsg').textContent=err.message}}
$('#logout').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});location.reload()}
document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>nav(b.dataset.page));
async function nav(name){
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  $('#pageTitle').textContent=name[0].toUpperCase()+name.slice(1);
  if(name==='dashboard')return dashboard();
  if(name==='teams')return teams();
  if(name==='players')return players();
  if(name==='matches')return matches();
  if(name==='news')return news();
  if(name==='security')return security();
}
async function dashboard(){const d=await api('/api/admin/dashboard');page.innerHTML=`<div class="cards">${[['Teams',d.teams],['Players',d.players],['Matches',d.matches],['News',d.news]].map(x=>`<div class="stat"><span class="muted">${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div><div class="panel"><h3>Admin Portal</h3><p class="muted">Manage league data here. Public website is view-only and updates automatically.</p></div>`}

async function teams(){
 const rows=await api('/api/admin/teams');
 page.innerHTML=`<div class="panel"><h3>Add Team</h3><form id="tf"><div class="row"><div><label>Name</label><input name="name" required></div><div><label>Short Name</label><input name="short_name" required></div><div><label>Coach</label><input name="coach"></div><div><label>Captain</label><input name="captain"></div></div><button style="margin-top:12px">Add Team</button></form></div>
 <div class="panel tablewrap"><table><tr><th>Team</th><th>Code</th><th>Coach</th><th>Captain</th><th></th></tr>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.short_name)}</td><td>${esc(r.coach)}</td><td>${esc(r.captain)}</td><td><button class="danger" onclick="delTeam(${r.id})">Delete</button></td></tr>`).join('')}</table></div>`;
 $('#tf').onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));await api('/api/admin/teams',{method:'POST',body:JSON.stringify(o)});teams()}
}
window.delTeam=async id=>{if(confirm('Delete this team and its players?')){await api('/api/admin/teams/'+id,{method:'DELETE'});teams()}}

async function players(){
 const [rows,ts]=await Promise.all([api('/api/admin/players'),api('/api/admin/teams')]);
 const opts=ts.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
 page.innerHTML=`<div class="panel"><h3>Add Player</h3><form id="pf"><div class="row"><div><label>Team</label><select name="team_id">${opts}</select></div><div><label>Name</label><input name="name" required></div><div><label>Jersey No.</label><input name="jersey_no" type="number"></div><div><label>Position</label><select name="position"><option>Goalkeeper</option><option>Defender</option><option>Midfielder</option><option>Forward</option></select></div></div><button style="margin-top:12px">Add Player</button></form></div>
 <div class="panel tablewrap"><table><tr><th>Name</th><th>Team</th><th>#</th><th>Position</th><th>G</th><th>A</th><th></th></tr>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.team_name)}</td><td>${esc(r.jersey_no)}</td><td>${esc(r.position)}</td><td>${r.goals}</td><td>${r.assists}</td><td><button class="danger" onclick="delPlayer(${r.id})">Delete</button></td></tr>`).join('')}</table></div>`;
 $('#pf').onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));await api('/api/admin/players',{method:'POST',body:JSON.stringify(o)});players()}
}
window.delPlayer=async id=>{if(confirm('Delete player?')){await api('/api/admin/players/'+id,{method:'DELETE'});players()}}

async function matches(){
 const [rows,ts]=await Promise.all([api('/api/admin/matches'),api('/api/admin/teams')]);
 const opts=ts.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
 page.innerHTML=`<div class="panel"><h3>Add Match / Result</h3><form id="mf"><div class="row">
 <div><label>Home Team</label><select name="home_team_id">${opts}</select></div><div><label>Away Team</label><select name="away_team_id">${opts}</select></div>
 <div><label>Date & Time</label><input name="match_date" type="datetime-local" required></div><div><label>Venue</label><input name="venue"></div>
 <div><label>Status</label><select name="status"><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="finished">Finished</option></select></div>
 <div><label>Man of the Match</label><input name="motm"></div><div><label>Home Score</label><input name="home_score" type="number" value="0"></div><div><label>Away Score</label><input name="away_score" type="number" value="0"></div>
 </div><button style="margin-top:12px">Save Match</button></form></div>
 <div class="panel tablewrap"><table><tr><th>Match</th><th>Date</th><th>Status</th><th>Score</th><th></th></tr>${rows.map(r=>`<tr><td>${esc(r.home_team)} vs ${esc(r.away_team)}</td><td>${new Date(r.match_date).toLocaleString()}</td><td>${esc(r.status)}</td><td>${r.home_score}-${r.away_score}</td><td><button class="danger" onclick="delMatch(${r.id})">Delete</button></td></tr>`).join('')}</table></div>`;
 $('#mf').onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));await api('/api/admin/matches',{method:'POST',body:JSON.stringify(o)});matches()}
}
window.delMatch=async id=>{if(confirm('Delete match?')){await api('/api/admin/matches/'+id,{method:'DELETE'});matches()}}

async function news(){
 const rows=await api('/api/admin/news');
 page.innerHTML=`<div class="panel"><h3>Publish News</h3><form id="nf"><label>Title</label><input name="title" required><label>Body</label><textarea name="body" rows="5" required></textarea><button style="margin-top:12px">Publish</button></form></div>
 <div class="panel">${rows.map(r=>`<div style="padding:12px 0;border-bottom:1px solid var(--line)"><b>${esc(r.title)}</b><p class="muted">${esc(r.body)}</p><button class="danger" onclick="delNews(${r.id})">Delete</button></div>`).join('')||'<p class="muted">No news yet.</p>'}</div>`;
 $('#nf').onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));await api('/api/admin/news',{method:'POST',body:JSON.stringify(o)});news()}
}
window.delNews=async id=>{if(confirm('Delete news?')){await api('/api/admin/news/'+id,{method:'DELETE'});news()}}

function security(){
 page.innerHTML=`<div class="panel"><h3>Change Admin Password</h3><form id="sf"><label>Current Password</label><input name="current_password" type="password" required><label>New Password</label><input name="new_password" type="password" minlength="20" required><button style="margin-top:12px">Update Password</button><div class="msg" id="sm"></div></form></div>`;
 $('#sf').onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));try{await api('/api/admin/password',{method:'PUT',body:JSON.stringify(o)});$('#sm').textContent='Password updated successfully.';e.target.reset()}catch(err){$('#sm').textContent=err.message}}
}
boot();
