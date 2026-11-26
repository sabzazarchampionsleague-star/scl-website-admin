function stoppageClock(seconds,total,extra,first=0,phase=''){
 const base=total-extra,half=base/2,second=extra-first;
 let boundary,elapsed,added;
 if(first&&phase!=='2nd half'&&seconds>=half*60&&seconds<=(half+first)*60){boundary=half;elapsed=seconds-half*60;added=first;}
 else {const played=Math.max(0,seconds-((phase==='2nd half'||seconds>(half+first)*60)?first*60:0));if(second&&played>=base*60){boundary=base;elapsed=played-base*60;added=second;}}
 if(boundary===undefined)return clockText(seconds,total,extra,first,phase);
 return boundary+'+'+added+'′';
}
let previousMatchLimit=3,latestMatchRows=[],clubMap=new Map();
function matchDateText(value){if(typeof value!=='string'||!value.trim())return '';const raw=value.trim(),d=new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw)?raw+'+05:00':raw);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{timeZone:'Asia/Karachi',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true})+' PKT':'';}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function get(url){ const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)}); if(!r.ok)throw new Error('League information is temporarily unavailable. Please refresh to try again.'); return r.json(); }

async function load(){
  const [matches, standings, teams, players, news] = await Promise.all([
    get('/api/public/matches').then(rows=>{renderMatches(rows);syncReady=true;lastMatches=JSON.stringify(rows);return rows;}),get('/api/public/standings'),get('/api/public/teams'),
    get('/api/public/top-players'),get('/api/public/news')
  ]);

  clubMap=new Map(teams.map(t=>[t.id,t]));
  renderLeagueIdentity(teams,matches);
  renderMatches(matches);
  renderStandings(standings);


  $('#teamsGrid').innerHTML = teams.filter(t=>t.id!==25).map(t=>`<div class="card">${t.logo_url?`<img src="${esc(t.logo_url)}" alt="${esc(t.name)} logo" class="club-logo" width="72" height="72">`:''}<h3>${esc(t.name)}</h3><a class="cta" href="/team?id=${t.id}">View players</a></div>`).join('') || '<div class="card">Teams will be announced soon.</div>';

  renderTopPlayers(players);

  $('#newsGrid').innerHTML = (news.map(n=>`<article class="card news">${n.poster_url?`<a href="${esc(n.poster_url)}" target="_blank" rel="noopener"><img class="news-poster" src="${esc(n.poster_url)}" alt="${esc(n.title)} poster" loading="lazy"></a>`:''}<h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="meta">${new Date(n.published_at).toLocaleDateString()}</div></article>`).join('')) || '<div class="card">No news yet.</div>';
}
load().catch(()=>{}).finally(()=>{syncReady=true;syncMatches();});

async function loadEvents(){const rows=await get('/api/public/events');$('#eventsGrid').innerHTML=rows.map(e=>`<article class="card"><span class="badge">${esc(e.status)}</span><h3>${esc(e.title)}</h3><p>${esc(e.description)}</p><p>${new Date(e.event_date).toLocaleString()} · ${esc(e.venue)}</p></article>`).join('')||'<p>No events announced yet.</p>'; }
loadEvents().catch(()=>{});
let syncReady=false,syncBusy=false,lastMatches='';
// Keep live scores fast; standings and leaders have their own slower refresh.
async function syncMatches(){if(!syncReady||syncBusy||document.hidden)return;syncBusy=true;try{const matches=await get('/api/public/matches'),signature=JSON.stringify(matches);if(signature!==lastMatches){renderMatches(matches);lastMatches=signature;}$('#scoreUpdated').textContent='Updated '+new Date().toLocaleTimeString()+' · Auto-sync · checks every 2 seconds';}catch{ $('#scoreUpdated').textContent='Connection interrupted · reconnecting automatically…';}finally{syncBusy=false;}}
let summaryBusy=false,lastSummaryRefresh=Date.now();
async function syncSummaries(){if(!syncReady||summaryBusy||document.hidden||Date.now()-lastSummaryRefresh<60000)return;summaryBusy=true;try{const [standings,leaders]=await Promise.all([get('/api/public/standings'),get('/api/public/top-players')]);renderStandings(standings);renderTopPlayers(leaders);lastSummaryRefresh=Date.now();}catch{}finally{summaryBusy=false;}}
setInterval(syncSummaries,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSummaries();});
setInterval(syncMatches,2000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncMatches();});
window.addEventListener('online',syncMatches);
window.addEventListener('focus',syncMatches);
window.addEventListener('pageshow',syncMatches);
if('BroadcastChannel' in window){const updates=new BroadcastChannel('scl-match-updates');updates.onmessage=()=>syncMatches();}


function renderMatchClocks(){document.querySelectorAll('[data-clock]').forEach(el=>{const start=Number(el.dataset.start),seconds=Math.min(Number(el.dataset.duration)*60,Number(el.dataset.seconds)+(start?Math.max(0,Math.floor((Date.now()-start)/1000)):0));el.innerHTML=stoppageClock(seconds,Number(el.dataset.duration),Number(el.dataset.extra||0),Number(el.dataset.first||0),el.dataset.phase);const badge=el.closest('.card')?.querySelector('[data-live-badge]');if(badge?.dataset.status==='live')badge.textContent=(badge.dataset.phase==='Half-time'?'HALF-TIME':'LIVE')+(badge.dataset.leg?' · '+badge.dataset.leg:'');});}
setInterval(renderMatchClocks,1000);

function teamCards(m,teamId){return '<div class="match-cards">'+(m.cards||[]).filter(c=>Number(c.team_id)===Number(teamId)).map(c=>'<p><span aria-label="'+(c.card_type==='red'?'Red':'Yellow')+' card">'+(c.card_type==='red'?'🟥':'🟨')+'</span> '+esc(c.player_name)+' <strong>'+esc(c.minute_label||c.minute)+'′</strong></p>').join('')+'</div>';}
function teamScorers(m,teamId){
 const groups=new Map();
 const minuteValue=g=>{const parts=String(g.minute_label||g.minute||0).split('+');return Number(parts[0])+Number(parts[1]||0)/1000;};
 for(const g of (m.goals||[]).filter(g=>Number(g.team_id)===Number(teamId)).slice().sort((a,b)=>minuteValue(a)-minuteValue(b))){
  const name=String(g.scorer||'').trim(),key=name.toLocaleLowerCase();
  if(!groups.has(key))groups.set(key,{name,goals:[]});
  groups.get(key).goals.push(g);
 }
 return '<div class="team-scorers">'+[...groups.values()].map(group=>'<p>⚽ '+esc(group.name)+' '+group.goals.map(g=>'<span>'+esc(g.minute_label||g.minute)+'′</span>'+(g.note?' <small>'+esc(g.note)+'</small>':'')).join(' ')+'</p>').join('')+'</div>';
}
function fixtureTime(m){const value=m.match_date||'';const time=Date.parse(value&& !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)?value+'+05:00':value);return Number.isFinite(time)?time:Infinity;}
function renderMatches(matches){
  const firstLegIds=new Set(matches.filter(m=>Number(m.leg_number)===2&&m.first_leg_id).map(m=>Number(m.first_leg_id)));
  matches=matches.map(m=>firstLegIds.has(Number(m.id))&&Number(m.leg_number)!==2?{...m,leg_number:1}:m);
  latestMatchRows=matches;
  renderFeaturedMatch(matches);
  const cardHTML = matches => (matches.map(m=>`
    <div class="card" data-match-id="${m.id}" style="position:relative">
      ${m.stage?`<p class="match-stage" style="text-align:center;font-weight:800;color:#6736a1">${esc(m.stage)}</p>`:''}<span class="badge" data-live-badge data-leg="${m.leg_number===2?'2nd leg':m.leg_number===1?'1st leg':''}" data-status="${esc(m.status)}" data-phase="${esc(m.phase||'')}">${esc(m.status==='finished'?'FULL TIME':m.status.toUpperCase()+(m.phase&&!/^[12](st|nd) leg$/i.test(m.phase)?' · '+m.phase:''))+(m.leg_number?' · '+(m.leg_number===2?'2nd leg':'1st leg'):'')}</span>
      <div class="match result-teams" style="margin-top:14px"><div class="result-team">${clubCrest(m.home_team_id)}<strong>${esc(m.home_team)}</strong>${teamScorers(m,m.home_team_id)}${teamCards(m,m.home_team_id)}</div>
      <div class="score">${m.status==='finished'&&m.first_leg_score ? '<small class="aggregate-inline">AGG</small> '+(Number(m.home_score)+Number(m.first_leg_score.home))+' - '+(Number(m.away_score)+Number(m.first_leg_score.away)) : m.first_leg_score ? '<small class="aggregate-inline">('+m.first_leg_score.home+')</small> '+esc(m.home_score)+' - '+esc(m.away_score)+' <small class="aggregate-inline">('+m.first_leg_score.away+')</small>' : m.status!=='scheduled' ? esc(m.home_score)+' - '+esc(m.away_score) : 'VS'}</div>
      <div class="result-team">${clubCrest(m.away_team_id)}<strong>${esc(m.away_team)}</strong>${teamScorers(m,m.away_team_id)}${teamCards(m,m.away_team_id)}</div></div>
      ${m.status==='scheduled'?'':`<div class="meta"><span data-clock data-seconds="${m.clock_seconds||0}" data-start="${m.clock_started_at||0}" data-duration="${m.duration_minutes||70}" data-extra="${addedMinutes(m)}" data-first="${m.first_half_extra||0}" data-phase="${esc(m.phase||'')}"></span> / ${durationText(m)} min</div>`}<div class="meta">${matchDateText(m.match_date)}${m.venue?' • '+esc(m.venue):''}</div>
      ${m.status==='live'?`<a class="cta match-open" href="/watch?id=${m.id}">Open live match ↗</a>`:''}
    </div>`).join('')) || '<div class="card">No matches added yet.</div>';
  $('#matches').innerHTML=cardHTML(matches.filter(m=>m.status!=='finished').sort((a,b)=>fixtureTime(a)-fixtureTime(b)||a.id-b.id));
  const previous=matches.filter(m=>m.status==='finished').sort((a,b)=>{const ad=Date.parse(a.match_date),bd=Date.parse(b.match_date);return (Number.isFinite(bd)?bd:0)-(Number.isFinite(ad)?ad:0)||b.id-a.id;});
  $('#previousMatches').innerHTML=cardHTML(previous.slice(0,previousMatchLimit));
  const more=$('#morePrevious');more.hidden=previous.length<=3;const expanded=previousMatchLimit===Infinity;more.textContent=expanded?'See less':'See more';more.setAttribute('aria-expanded',String(expanded));more.onclick=()=>{const collapse=previousMatchLimit===Infinity;previousMatchLimit=collapse?3:Infinity;renderMatches(latestMatchRows);if(collapse)$('#previous-matches').scrollIntoView({block:'start'});};
  $('#previousCount').textContent=previous.length?'Showing '+Math.min(previousMatchLimit,previous.length)+' of '+previous.length+' matches':'';

  document.querySelectorAll('#matches .card,#previousMatches .card').forEach(card=>{const score=card.querySelector('.score'),badge=card.querySelector('.badge'),clock=card.querySelector('[data-clock]');if(!score)return;const stack=document.createElement('div');stack.className='score-stack';score.before(stack);if(badge)stack.append(badge);const mid=Number(card.dataset.matchId),row=matches.find(m=>m.id===mid);if(clock){const meta=clock.parentElement;stack.append(clock);meta.remove();}stack.append(score);});
  window.SCLMotionMatchUpdate?.(matches);
  renderMatchClocks();
  $('#scoreUpdated').textContent='Updated '+new Date().toLocaleTimeString()+' · Auto-sync · checks every 2 seconds';
}
function renderStandings(standings){
  $('#standings').innerHTML = standings.map((r,i)=>`<tr><td><strong>${i+1}. ${esc(r.name)}</strong></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd}</td><td><strong>${r.pts}</strong></td></tr>`).join('');
}

function renderTopPlayers(players){
  $('#playersGrid').innerHTML = (players.slice(0,6).map((p,i)=>`<div class="card player-rank"><span class="rank-no">${String(i+1).padStart(2,'0')}</span><h3>${esc(p.name)}</h3><div class="meta">${esc(p.team_name)}${p.position?' • '+esc(p.position):''}</div><p><strong>${p.goals}</strong> goals &nbsp; <strong>${p.assists}</strong> assists</p></div>`).join('')) || '<div class="card">No goals recorded yet.</div>';
}


function addedMinutes(m){return Number(m.first_half_extra||0)+Number(m.second_half_extra||0);}
function durationText(m){const first=Number(m.first_half_extra||0),second=Number(m.second_half_extra||0),base=Number(m.duration_minutes||70)-first-second,elapsed=Number(m.clock_seconds||0)+(m.clock_started_at?Math.max(0,(Date.now()-m.clock_started_at)/1000):0);if(first&&m.status!=='finished'&&m.phase!=='2nd half'&&elapsed<=(base/2+first)*60)return (base/2)+'+'+first;return second?base+'+'+second:String(base);}
function clockText(seconds,total,extra,first=0,phase=''){const base=total-extra,half=base/2,second=extra-first;if(first&&phase!=='2nd half'&&seconds>=half*60&&seconds<=(half+first)*60)return half+'+'+Math.floor((seconds-half*60)/60)+'′';const played=Math.max(0,seconds-((phase==='2nd half'||seconds>(half+first)*60)?first*60:0)),mins=Math.floor(played/60),secs=String(Math.floor(played%60)).padStart(2,'0');return second&&played>=base*60?base+'+'+(mins-base)+'′':mins+'′';}

function clubCrest(id){const t=clubMap.get(id);return t?.logo_url?`<img class="match-crest" src="${esc(t.logo_url)}" alt="" width="46" height="46" loading="eager">`:'';}
function renderLeagueIdentity(teams,matches){teams=teams.filter(t=>t.id!==25);const strip=$('#clubStrip');if(strip)strip.innerHTML=teams.map(t=>`<a href="/team?id=${t.id}" title="${esc(t.name)}">${clubCrest(t.id)}<span>${esc(t.name)}</span></a>`).join('');const facts=$('#leagueFacts');if(facts)facts.innerHTML=`<div><b>${teams.length}</b><span>CLUBS</span></div><div><b>${matches.length}</b><span>MATCHES</span></div><div><b>SSL</b><span>ONE COMMUNITY</span></div>`;}
function renderFeaturedMatch(matches){const el=$('#featuredMatch');if(!el)return;const m=matches.find(x=>x.status==='live')||[...matches].filter(x=>x.status==='scheduled').sort((a,b)=>a.match_date.localeCompare(b.match_date))[0]||[...matches].filter(x=>x.status==='finished').sort((a,b)=>(Date.parse(b.match_date)||0)-(Date.parse(a.match_date)||0)||b.id-a.id)[0];if(!m)return;el.innerHTML=`<span class="feature-label">${m.status==='live'?'LIVE NOW':m.status==='scheduled'?'NEXT UP':'LATEST RESULT'}</span><div class="feature-teams"><span>${clubCrest(m.home_team_id)}${esc(m.home_team)}</span><b>${m.status==='finished'&&m.first_leg_score?'AGG '+(Number(m.home_score)+Number(m.first_leg_score.home))+' : '+(Number(m.away_score)+Number(m.first_leg_score.away)):m.first_leg_score?'('+m.first_leg_score.home+') '+m.home_score+' : '+m.away_score+' ('+m.first_leg_score.away+')':m.status==='scheduled'?'VS':m.home_score+' : '+m.away_score}</b><span>${clubCrest(m.away_team_id)}${esc(m.away_team)}</span></div><a href="${m.status==='live'?'/watch?id='+m.id:m.status==='scheduled'?'#fixtures':'#previous-matches'}">${m.status==='scheduled'?esc(matchDateText(m.match_date)):m.status==='live'?'Open live match':'View match result'} ↗</a>`;}

