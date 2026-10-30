// Bounded language helpers. No network, model, or automatic plan writes.
(function(root){
'use strict';
const normalize=v=>String(v||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
const topics={open:'Offene Dienste',replacement:'Ersatz suchen',workload:'Geplante Stunden prüfen',absence:'Abwesenheiten',loadCheck:'Belastungscheck starten'};
const fixes={schicten:'schichten',schichtenplan:'dienstplan',dienstplann:'dienstplan',ersatzt:'ersatz',mitarbeieter:'mitarbeiter',mitarbieter:'mitarbeiter',stundenuebersicht:'geplante stunden',besetzungsluecke:'offene dienste',personalluecken:'offene dienste',unterdeckung:'unterbesetzung',vertretungskraft:'ersatz',kollegen:'mitarbeiter',we:'wochenende'};
function clean(q){return normalize(q).replace(/\b[a-z]+\b/g,w=>fixes[w]||w);}
function entries(value,shifts){return (Array.isArray(value)?value:[]).filter(x=>x&&typeof x.term==='string'&&/^[a-z0-9][a-z0-9 -]{1,39}$/.test(x.term)&&typeof x.target==='string'&&(topics[x.target.slice(6)]&&x.target.startsWith('topic:')||shifts.some(s=>s.id===x.target))).slice(0,50);}
function expand(q,rows,shifts){q=clean(q);const hits=entries(rows,shifts).filter(x=>new RegExp('(?:^|[^a-z0-9])'+x.term+'(?:$|[^a-z0-9])').test(q));return {q,hits};}
const api={normalize,clean,topics,entries,expand};if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningVocabulary=api;
})(typeof window==='undefined'?globalThis:window);
