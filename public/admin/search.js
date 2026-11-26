const adminSearchTerms={};
function adminSearchBar(key,label,placeholder,onFilter){
 const box=document.createElement('section');box.className='admin-search';
 box.innerHTML=`<label for="search-${key}">${esc(label)}</label><div class="admin-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="search-${key}" type="search" placeholder="${esc(placeholder)}" autocomplete="off"><button type="button" aria-label="Clear search">×</button></div><p role="status" aria-live="polite"></p>`;
 page.prepend(box);const input=box.querySelector('input'),clear=box.querySelector('button'),status=box.querySelector('p');input.value=adminSearchTerms[key]||'';
 const apply=()=>{adminSearchTerms[key]=input.value;const q=input.value.trim().toLocaleLowerCase();clear.hidden=!input.value;status.textContent=onFilter(q);};input.addEventListener('input',apply);clear.onclick=()=>{input.value='';apply();input.focus();};apply();return box;
}
function squadSearch(teams,players){
 const sections=teams.map(t=>({team:t,section:page.querySelector(`.squad-team[data-id="${t.id}"]`)?.closest('section')})).filter(x=>x.section);
 adminSearchBar('squads','Find teams & players','Search team, player, position or shirt number…',q=>{let visible=0;for(const {team,section} of sections){const teamMatch=team.name.toLowerCase().includes(q);let found=false;for(const f of section.querySelectorAll('.squad-player[data-id]')){const p=players.find(x=>x.id===Number(f.dataset.id));const match=teamMatch||`${p.name} ${p.position||''} ${p.jersey_no??''}`.toLowerCase().includes(q);f.closest('details').hidden=!match;if(match)found=true;}section.hidden=!!q&&!teamMatch&&!found;if(!section.hidden)visible++;}return visible?`${visible} team${visible===1?'':'s'} found`:'No teams or players match your search.';});
}
function matchSearch(rows,history){
 const select=page.querySelector('#manageMatch');
 adminSearchBar(history?'results':'matches',history?'Find previous matches':'Find a match','Search club, date or match status…',q=>{const filtered=rows.filter(m=>`${m.home_team} ${m.away_team} ${m.match_date||''} ${m.status} ${m.phase||''}`.toLowerCase().includes(q));const ids=new Set(filtered.map(m=>m.id));if(select){select.innerHTML=filtered.map(m=>`<option value="${m.id}">${esc(m.home_team)} vs ${esc(m.away_team)} · ${esc(m.match_date||'')} · ${esc(m.status)}</option>`).join('');select.disabled=!filtered.length;if(!ids.has(activeScoreMatch)&&filtered.length)activeScoreMatch=filtered[0].id;select.value=String(activeScoreMatch);page.querySelectorAll('[data-score-match]').forEach(s=>s.hidden=!ids.has(Number(s.dataset.scoreMatch))||Number(s.dataset.scoreMatch)!==activeScoreMatch);}else{page.querySelectorAll('.match-editor[data-id]').forEach(f=>f.closest('section').hidden=!ids.has(Number(f.dataset.id)));}return filtered.length?`${filtered.length} match${filtered.length===1?'':'es'} found`:'No matches found. Try another club or date.';});
}
