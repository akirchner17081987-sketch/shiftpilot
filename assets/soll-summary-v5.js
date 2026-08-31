// SchichtFunk SOLL/IST Summary V5
(function(){
  function esc(s){return String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
  function line(t,date){
    const so=getSoll(date,t.id),is=assignmentsFor(date,t.id).length,miss=Math.max(0,so-is),ok=is>=so;
    return {id:t.id,so,is,miss,ok,html:`<button type="button" class="sp-soll-line ${ok?'good':''} sp-soll-click" data-date="${esc(date)}" data-type="${esc(t.id)}"><b>${esc(t.id)}</b><span>SOLL ${so} · IST ${is}${miss?' · FEHLT '+miss:' · OK'}</span></button>`};
  }
  function bind(){
    document.querySelectorAll('#view-schedule .sp-soll-click').forEach(b=>b.addEventListener('click',()=>openAssign(b.dataset.type,b.dataset.date)));
    document.querySelectorAll('#view-schedule .sp-soll-toggle').forEach(b=>b.addEventListener('click',()=>{
      const day=b.closest('.soll-day');
      const expanded=day.classList.toggle('sp-soll-expanded');
      b.textContent=expanded?'Weniger anzeigen':'Alle anzeigen';
      b.setAttribute('aria-expanded',String(expanded));
    }));
    document.querySelectorAll('#view-schedule .sp-soll-click').forEach(p=>{
      p.addEventListener('dragover',e=>{e.preventDefault();p.classList.add('drop-ready')});
      p.addEventListener('dragleave',()=>p.classList.remove('drop-ready'));
      p.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();p.classList.remove('drop-ready');const data=e.dataTransfer.getData('text/plain');if(data.startsWith('employee:'))assignEmployeeByDrop(data.slice(9),p.dataset.type,p.dataset.date)});
    });
  }
  window.renderSoll=function(ds){
    let html='<div></div>';
    for(const d of ds){
      const date=iso(d),rows=TYPES.map(t=>line(t,date)),missing=rows.filter(r=>!r.ok),good=rows.filter(r=>r.ok);
      const compact=missing.length
        ? `${missing.map(r=>r.html).join('')}${good.length?`<div class="sp-soll-ok-summary"><b>Erfüllt</b><span>${good.length} Schicht${good.length===1?'':'en'}</span></div>`:''}`
        : `<div class="sp-soll-empty">✓ Alle Schichten erfüllen die SOLL-Stärke.</div>`;
      html+=`<div class="soll-day"><div class="sp-soll-head"><small>SOLL / IST</small><button type="button" class="sp-soll-toggle" aria-expanded="false">Alle anzeigen</button></div><div class="sp-soll-compact sp-soll-list">${compact}</div><div class="sp-soll-all">${rows.map(r=>r.html).join('')}</div></div>`;
    }
    document.getElementById('sollList').innerHTML=html;bind();
  };
})();
