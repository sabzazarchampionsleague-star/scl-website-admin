const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadTeam(){
 if(new URLSearchParams(location.search).has('registration'))return loadRegisteredClub();
 const id=new URLSearchParams(location.search).get('id');if(!/^\d+$/.test(id||''))throw Error('Choose a team from the league home page.');
 const r=await fetch('/api/public/teams/'+id);if(!r.ok)throw Error('Team not found');
 const {team,players}=await r.json();document.title=team.name+' | SSL';
 const total=key=>players.reduce((sum,p)=>sum+(Number(p[key])||0),0);
 document.querySelector('#team').innerHTML=`<section class="squad-profile">${team.logo_url?`<img class="squad-crest" src="${esc(team.logo_url)}" alt="${esc(team.name)} logo">`:''}<p class="squad-eyebrow">SABZAZAR SUPER LEAGUE</p><h1>${esc(team.name)}</h1>${team.description?`<p class="squad-description">${esc(team.description)}</p>`:''}<div class="squad-summary"><div><strong>${players.length}</strong><span>Players</span></div><div><strong>${total('goals')}</strong><span>Goals</span></div><div><strong>${total('assists')}</strong><span>Assists</span></div></div></section><div class="squad-heading"><div><p class="squad-eyebrow">THE TEAM BEHIND THE BADGE</p><h2>Club squad</h2></div><span>${players.length}</span></div><ul class="squad-roster">${players.map(p=>{
 const vice=/\(\s*V\.?\s*C\.?\s*\)/i.test(p.name),captain=!vice&&/\(\s*C\s*\)/i.test(p.name);
 const name=p.name.replace(/\(\s*(?:V\.?\s*)?C\.?\s*\)/ig,'').trim();
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
 const keeper=/goal\s*keeper|\bGK\b|\bkeeper\b/i.test(p.position||'');
 const goals=Number(p.goals)||0,assists=Number(p.assists)||0;
 return `<li class="squad-player"><div class="player-monogram${keeper?' keeper':''}" aria-hidden="true">${esc(initials)}</div><div class="player-info"><h3>${esc(name)}</h3><div class="player-labels">${captain?'<span class="captain-label">Captain</span>':vice?'<span class="captain-label">Vice captain</span>':''}${p.position?`<span class="${keeper?'keeper-label':'position-label'}">${esc(p.position)}</span>`:!captain&&!vice?'<span class="position-label">Squad player</span>':''}</div>${goals||assists?`<p class="player-contributions">${goals?`${goals} goal${goals===1?'':'s'}`:''}${goals&&assists?' · ':''}${assists?`${assists} assist${assists===1?'':'s'}`:''}</p>`:''}</div>${p.jersey_no!=null?`<span class="player-shirt" aria-label="Shirt number ${Number(p.jersey_no)}">${Number(p.jersey_no)}</span>`:''}</li>`;
 }).join('')||'<li class="squad-empty">The squad will appear here once announced.</li>'}</ul>`;
}
loadTeam().catch(e=>document.querySelector('#team').textContent=e.message);
