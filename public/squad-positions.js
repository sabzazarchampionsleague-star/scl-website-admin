const SQUAD_POSITIONS={GK:'Goalkeeper',CB:'Centre-back',LB:'Left-back',RB:'Right-back',CDM:'Defensive midfielder',CM:'Central midfielder',CAM:'Attacking midfielder',LM:'Left midfielder',RM:'Right midfielder',LW:'Left winger',RW:'Right winger',ST:'Striker',CF:'Centre-forward'};
const SQUAD_FORMATIONS={'3-3-1':['GK','LB','CB','RB','LM','CM','RM','ST'],'2-3-2':['GK','CB','CB','LM','CM','RM','ST','ST'],'3-2-2':['GK','LB','CB','RB','CM','CM','ST','ST'],'2-4-1':['GK','CB','CB','LM','CM','CM','RM','ST'],'3-1-2-1':['GK','LB','CB','RB','CDM','CAM','CAM','ST']};

const SQUAD_FORMATION_LABELS={};
function addNumericFormation(parts,left){if(left===0){const key=parts.join('-');if(!SQUAD_FORMATIONS[key]){const roles=parts.length===1?['CM']:parts.length===2?['CB','ST']:parts.length===3?['CB','CM','ST']:parts.length===4?['CB','CDM','CAM','ST']:['CB','CDM','CM','CAM','ST'];SQUAD_FORMATIONS[key]=['GK',...parts.flatMap((n,i)=>Array(n).fill(roles[i]))];}SQUAD_FORMATION_LABELS[key]=key;return;}if(parts.length>=5)return;for(let n=1;n<=left;n++)addNumericFormation([...parts,n],left-n);}
addNumericFormation([],7);
