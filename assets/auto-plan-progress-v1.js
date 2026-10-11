// Real planning work counts; network/preparation phases remain indeterminate.
(function(){
  if(window.SFAutoPlanProgress)return;
  const el=id=>document.getElementById(id);
  let active=false,timer=null,started=0,percent=null;
  function host(){
    let node=el('sfAutoProgress');if(node)return node;
    const anchor=document.querySelector('#view-auto .sf-auto-start');if(!anchor)return null;
    node=document.createElement('section');node.id='sfAutoProgress';node.className='sf-auto-progress';node.hidden=true;
    node.innerHTML='<div class="sf-auto-progress-head"><b id="sfAutoProgressLabel" role="status" aria-live="polite"></b><span id="sfAutoProgressPercent"></span></div><div id="sfAutoProgressBar" class="sf-auto-progress-track" role="progressbar" aria-labelledby="sfAutoProgressLabel" aria-valuemin="0" aria-valuemax="100"><i></i></div><p id="sfAutoProgressDetail"></p><small id="sfAutoProgressTime"></small>';
    anchor.after(node);return node;
  }
  function elapsed(){const node=el('sfAutoProgressTime');if(node){const seconds=Math.max(0,Math.floor((Date.now()-started)/1000));node.textContent='Vergangen: '+(seconds<60?seconds+' s':Math.floor(seconds/60)+' min '+seconds%60+' s');}}
  function draw(label,detail,value){
    const node=host();if(!node)return;node.hidden=false;
    if(label!==undefined&&el('sfAutoProgressLabel').textContent!==label)el('sfAutoProgressLabel').textContent=label;
    if(detail!==undefined)el('sfAutoProgressDetail').textContent=detail;
    if(value!==undefined)percent=value;
    const bar=el('sfAutoProgressBar');node.classList.toggle('is-indeterminate',percent===null);
    el('sfAutoProgressPercent').textContent=percent===null?'In Arbeit':percent+' %';
    if(percent===null)bar.removeAttribute('aria-valuenow');else bar.setAttribute('aria-valuenow',String(percent));
    bar.setAttribute('aria-valuetext',percent===null?'Fortschritt noch nicht messbar':percent+' Prozent');bar.firstElementChild.style.width=percent===null?'35%':percent+'%';elapsed();
  }
  function start(){if(active)return false;active=true;started=Date.now();percent=null;clearInterval(timer);host()?.classList.remove('is-error','is-done');el('view-auto')?.setAttribute('aria-busy','true');draw('Auto-Planung wird vorbereitet','Daten, Wünsche und geschützte Dienste werden geprüft.',null);timer=setInterval(elapsed,1000);return true;}
  function phase(label,detail=''){draw(label,detail,null);}
  function update({completed,total,label,detail}){const valid=Number.isFinite(completed)&&Number.isFinite(total)&&total>0;draw(label,detail,valid?Math.min(99,Math.max(percent||0,Math.floor(completed/total*100))):null);}
  function message(label,detail=''){draw(label,detail);}
  function finish(error){active=false;clearInterval(timer);timer=null;el('view-auto')?.removeAttribute('aria-busy');host()?.classList.toggle('is-error',!!error);host()?.classList.toggle('is-done',!error);draw(error?'Planung konnte nicht abgeschlossen werden':'Planung abgeschlossen',error||'Die Vorschläge sind bereit zur Prüfung. Eine Übernahme erfolgt erst nach deiner Bestätigung.',error?null:100);}
  function reset(){if(active)return;const node=el('sfAutoProgress');if(node)node.hidden=true;}
  // Let the browser show feedback before the synchronous day/week planner starts.
  const paint=()=>new Promise(resolve=>{if(typeof requestAnimationFrame==='function'&&!document.hidden)requestAnimationFrame(()=>setTimeout(resolve,0));else setTimeout(resolve,0)});
  const generate=window.generateAutoPlanPreview;
  if(generate)window.generateAutoPlanPreview=async function(){
    if(active||window.SFMonthOptimizer?.isBusy?.()||typeof autoPlanApplying!=='undefined'&&autoPlanApplying)return;
    const company=window.SFBackend?.companyId,controls=[...document.querySelectorAll('#view-auto button,#view-auto input,#view-auto select')].map(node=>({node,disabled:node.disabled}));
    start();controls.forEach(x=>x.node.disabled=true);
    try{await paint();if(window.SFBackend?.companyId!==company)throw Error('Das Unternehmen wurde gewechselt. Bitte erneut starten.');phase('Besetzungen werden berechnet','Schichtfreigaben, feste Vorgaben, Arbeitsblöcke und Stundenlimits werden geprüft.');const value=await generate.apply(this,arguments);finish();return value;}
    catch(error){finish(error.message||String(error));window.showSaveToast?.('Auto-Planung fehlgeschlagen',error.message||String(error));}
    finally{controls.forEach(x=>x.node.disabled=x.disabled);window.renderAutoPlanning?.();}
  };
  for(const name of ['changeAutoPlanPeriod','clearAutoPlanPreview']){const old=window[name];if(old)window[name]=function(){if(active)return;reset();return old.apply(this,arguments)};}
  window.SFAutoPlanProgress={start,phase,update,message,finish,reset,paint,isBusy:()=>active};
})();
