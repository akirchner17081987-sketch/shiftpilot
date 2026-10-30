// Bounded language helpers. No network, model, or automatic plan writes.
(function(root){
'use strict';
const normalize=v=>String(v||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
const topics={open:'Offene Dienste',replacement:'Ersatz suchen',workload:'Geplante Stunden prüfen',absence:'Abwesenheiten',loadCheck:'Belastungscheck starten'};
const fixes={schicten:'schichten',schichtenplan:'dienstplan',dienstplann:'dienstplan',ersatzt:'ersatz',mitarbeieter:'mitarbeiter',mitarbieter:'mitarbeiter',stundenuebersicht:'geplante stunden',besetzungsluecke:'offene dienste',personalluecken:'offene dienste',unterdeckung:'unterbesetzung',vertretungskraft:'ersatz',kollegen:'mitarbeiter',we:'wochenende'};
function clean(q){return normalize(q).replace(/\b[a-z]+\b/g,w=>fixes[w]||w);}
function entries(value,shifts){return (Array.isArray(value)?value:[]).filter(x=>x&&typeof x.term==='string'&&/^[a-z0-9][a-z0-9 -]{1,39}$/.test(x.term)&&typeof x.target==='string'&&(topics[x.target.slice(6)]&&x.target.startsWith('topic:')||/^[A-Z][A-Z0-9-]{0,11}$/.test(x.target))).slice(0,700);}
function replaceTerm(q,term,value){return q.replace(new RegExp('(^|[^a-z0-9-])'+term+'(?=$|[^a-z0-9-])','g'),(_,prefix)=>prefix+value);}
function expand(q,rows,shifts){q=clean(q);const hits=entries(rows,shifts).filter(x=>new RegExp('(?:^|[^a-z0-9-])'+x.term+'(?:$|[^a-z0-9-])').test(q));return {q,hits};}
// Variants apply to words and phrases, never to identifiers or numbers.
function wordKey(v){return normalize(v).replace(/[- ]+/g,' ').trim().split(' ').map(w=>w.length>5?w.replace(/(?:en|e|n)$/,''):w).join(' ');}
function corpus(s){const rows=Object.entries(topics).map(([k,label])=>({term:label,question:label,target:'topic:'+k,source:'Funktion'}));for(const t of s.shifts||[])if(t.name&&t.name!==t.id)rows.push({term:t.name,question:'Ersatz für '+t.id,target:t.id,source:'Aktuelle Schicht'});for(const items of Object.values(s.publicHelpArticles||{}))for(const [title] of items)rows.push({term:title,question:title,source:'Hilfe-Center'});return rows;}
function distance(a,b){if(Math.abs(a.length-b.length)>1)return 2;let n=0,i=0,j=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++n>1)return 2;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return n+(i<a.length||j<b.length?1:0);}
function suggest(q,s){const key=wordKey(q.replace(/[?.!]+$/,''));if(!/^[a-z -]{6,100}$/.test(key))return [];const people=(s.employees||[]).flatMap(e=>[e.first,e.last]).filter(Boolean).map(normalize);if(people.some(n=>key.split(' ').includes(n)))return [];const rows=corpus(s),exact=rows.filter(r=>wordKey(r.term.replace(/[?.!]+$/,''))===key);if(exact.length)return exact.slice(0,5);return rows.filter(r=>r.source!=='Aktuelle Schicht'&&(distance(key,wordKey(r.term.replace(/[?.!]+$/,'')))===1||distance(normalize(q).replace(/[?.!]+$/,''),normalize(r.term).replace(/[?.!]+$/,''))===1)).slice(0,3);}
function learnable(q,s){const term=normalize(q).replace(/[?.!]+$/,'').trim();if(!/^[a-z]{6,32}$/.test(term)||!/(?:bedarf|besetzung|luecke|stunden|vertretung|auslastung|abwesenheit|dienste|planung|belastung)$/.test(term))return null;if((s.employees||[]).some(e=>[e.first,e.last].filter(Boolean).some(n=>normalize(n)===term)))return null;return term;}
const api={normalize,clean,topics,entries,expand,replaceTerm,wordKey,corpus,suggest,learnable};if(typeof module==='object'&&module.exports)module.exports=api;else root.SFPlanningVocabulary=api;
})(typeof window==='undefined'?globalThis:window);
