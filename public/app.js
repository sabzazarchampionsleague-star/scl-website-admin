
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function get(url){ const r=await fetch(url); return r.json(); }

async function load(){
  const [matches, standings, teams, players, news] = await Promise.all([
    get('/api/public/matches'),get('/api/public/standings'),get('/api/public/teams'),
    get('/api/public/players'),get('/api/public/news')
  ]);

  $('#matches').innerHTML = (matches.slice(0,6).map(m=>`
    <div class="card">
      <span class="badge">${esc(m.status.toUpperCase())}</span>
      <div class="match" style="margin-top:14px"><strong>${esc(m.home_short)}</strong>
      <div class="score">${m.status==='finished' ? esc(m.home_score)+' - '+esc(m.away_score) : 'VS'}</div>
      <strong>${esc(m.away_short)}</strong></div>
      <div class="meta">${new Date(m.match_date).toLocaleString()}${m.venue?' • '+esc(m.venue):''}</div>
    </div>`).join('')) || '<div class="card">No matches added yet.</div>';

  $('#standings').innerHTML = standings.map((r,i)=>`<tr><td><strong>${i+1}. ${esc(r.name)}</strong></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd}</td><td><strong>${r.pts}</strong></td></tr>`).join('');

  $('#teamsGrid').innerHTML = teams.map(t=>`<div class="card"><h3>${esc(t.name)}</h3><div class="meta">${esc(t.short_name)} • Captain: ${esc(t.captain||'TBA')}</div><div class="meta">Coach: ${esc(t.coach||'TBA')}</div></div>`).join('');

  $('#playersGrid').innerHTML = (players.slice(0,6).map(p=>`<div class="card"><h3>${esc(p.name)}</h3><div class="meta">${esc(p.team_name)} • ${esc(p.position||'Player')}</div><p><strong>${p.goals}</strong> goals &nbsp; <strong>${p.assists}</strong> assists</p></div>`).join('')) || '<div class="card">No players added yet.</div>';

  $('#newsGrid').innerHTML = (news.map(n=>`<article class="card news"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="meta">${new Date(n.published_at).toLocaleDateString()}</div></article>`).join('')) || '<div class="card">No news yet.</div>';
}
$('#year').textContent = new Date().getFullYear();
load();
