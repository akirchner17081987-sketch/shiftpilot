// Durable background previews: browser polling observes a server job; it never drives it.
(function(){
 'use strict';if(window.SFBackgroundPlanning)return;
 const B=window.SFBackend=window.SFBackend||{},el=id=>document.getElementById(id),roles=['OWNER','ADMIN','PLANNER','DISPATCHER'];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const available=()=>!!(B.ready&&B.client?.rpc&&B.user?.id&&B.companyId&&roles.includes(B.role)&&window.SFCompliance?.policy?.solidPlanningRules&&!B.client.__sfDemoLocalClientV1&&sessionStorage.getItem('sf_demo_session_v1')!=='active');
 const identity=()=>available()?B.companyId+'|'+B.user.id:'';
 let owner='',job=null,timer=null,watch=null,loading=false,sequence=0,seen='';
 const running=j=>['QUEUED','RUNNING'].includes(j?.status);
 async function rpc(name,args){const who=identity();if(!who)throw Error('Bitte zuerst mit Planungsrechten anmelden.');const r=await B.client.rpc(name,args);if(who!==identity())throw Error('Der Unternehmenszugang wurde gewechselt. Der gespeicherte Auftrag läuft weiter.');if(r.error)throw r.error;return r.data;}
 function host(){let node=el('sfBackgroundPlanStatus');if(node)return node;const anchor=el('sfAutoProgress')||document.querySelector('#view-auto .sf-auto-start');if(!anchor)return null;node=document.createElement('section');node.id='sfBackgroundPlanStatus';node.className='sf-auto-status sf-background-plan';anchor.after(node);return node;}
 function render(){
  const node=host();if(!node)return;const activeRun=window.SFAutonomousPlanning?.getState?.()?.runs?.find(r=>['QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING'].includes(r.status)&&String(r.first_month).slice(0,7)===String(job?.first_month||'').slice(0,7));node.hidden=!job||!available()||!!activeRun&&activeRun.background_job_id!==job.id;if(node.hidden)return;
  const first=String(job.first_month||'').slice(0,7),period=job.month_count>1?first+' · '+job.month_count+' Monate':first;
  node.innerHTML=running(job)?`<b>Hintergrundplanung · ${esc(period)}</b><p>Die Berechnung läuft auch weiter, wenn du andere Programme nutzt oder den Browser schließt. Bei deiner Rückkehr wird der gespeicherte Fortschritt geladen.</p><button type="button" class="ghost" data-background-cancel>Hintergrundplanung abbrechen</button>`:job.status==='SUCCEEDED'?`<b>Planung bereit · ${esc(period)}</b><p>Der Vorschlag ist gespeichert. Prüfe die Besetzung und Stunden; übernommen wird er erst nach deiner Bestätigung.</p><button type="button" class="ghost" data-background-open>Gespeichertes Ergebnis ansehen</button>`:job.status==='FAILED'?`<b>Hintergrundplanung nicht abgeschlossen</b><p>${esc(job.error||'Bitte den Auftrag prüfen und erneut starten.')}</p>`:'';
  node.querySelector('[data-background-cancel]')?.addEventListener('click',cancel);
  node.querySelector('[data-background-open]')?.addEventListener('click',()=>window.SFMonthOptimizer?.restoreBackground?.(job));
  // The cancel control remains usable while the planning form is locked.
  node.querySelectorAll('button').forEach(b=>b.disabled=false);
 }
 function progress(j){job=j;render();const p=window.SFAutoPlanProgress;if(running(j)){if(!p?.isBusy())p?.start();p?.setStartedAt?.(j.created_at);p?.update({completed:j.progress||0,total:100,label:j.label||'Hintergrundplanung läuft',detail:j.detail||'Der Fortschritt ist auf dem Server gespeichert.'});}}
 function stopWatch(error){clearTimeout(timer);timer=null;const old=watch;watch=null;if(old)old.reject(error||Error('Die Anzeige wurde getrennt. Der gespeicherte Auftrag läuft weiter.'));}
 function schedule(delay=1500){clearTimeout(timer);timer=null;if(watch&&!document.hidden)timer=setTimeout(poll,delay);}
 async function poll(){
  const current=watch;if(!current)return;
  if(current.owner!==identity()){stopWatch(Error('Der Unternehmenszugang wurde gewechselt. Der Auftrag läuft weiter.'));return;}
  try{const data=await rpc('get_background_auto_plan',{p_company_id:B.companyId,p_job_id:current.id});if(watch!==current)return;if(!data)throw Error('Planungsauftrag nicht gefunden.');progress(data);
   if(data.status==='SUCCEEDED'){watch=null;current.resolve(data);return;}
   if(['FAILED','CANCELLED','APPLIED'].includes(data.status)){watch=null;current.reject(Error(data.error||'Der Planungsauftrag wurde beendet.'));return;}
  }catch(e){if(watch!==current)return;if(current.owner!==identity()){stopWatch(e);return;}window.SFAutoPlanProgress?.message('Verbindung zum Fortschritt unterbrochen','Die Berechnung läuft auf dem Server weiter. Die Anzeige verbindet sich erneut.');}
  schedule();
 }
 function wait(current){if(watch)stopWatch();job=current;progress(current);return new Promise((resolve,reject)=>{watch={owner:identity(),id:current.id,resolve,reject};schedule(0);});}
 async function start(payload){const data=await rpc('start_background_auto_plan',{p_company_id:B.companyId,p_request_id:crypto.randomUUID(),p_payload:payload});seen=data.id;job=data;progress(data);return data;}
 async function cancel(){const current=job;if(!current)return;try{job=await rpc('cancel_background_auto_plan',{p_company_id:B.companyId,p_job_id:current.id});seen=current.id;stopWatch(Error('Die Hintergrundplanung wurde abgebrochen. Der Dienstplan bleibt unverändert.'));window.SFAutoPlanProgress?.finish('Die Hintergrundplanung wurde abgebrochen.');render();}catch(e){window.showSaveToast?.('Auftrag nicht abgebrochen',e.message||String(e));}}
 async function applied(id){if(!id)return;await rpc('mark_background_auto_plan_applied',{p_company_id:B.companyId,p_job_id:id});seen=id;job=null;render();}
 async function discard(id){if(!id)return;await rpc('cancel_background_auto_plan',{p_company_id:B.companyId,p_job_id:id});seen=id;if(job?.id===id)job=null;render();}
 async function discover(){
  if(loading||!available()||watch)return;const who=identity(),token=++sequence;loading=true;
  try{const found=await rpc('get_background_auto_plan',{p_company_id:B.companyId,p_job_id:null});if(who!==identity()||token!==sequence)return;job=found;render();if(found&&found.id!==seen){seen=found.id;const activeRun=window.SFAutonomousPlanning?.getState?.()?.runs?.find(r=>['QUEUED','PREPARING','CALCULATING','ASSESS_QUEUED','ASSESSING'].includes(r.status)&&String(r.first_month).slice(0,7)===String(found.first_month).slice(0,7));if(activeRun&&activeRun.background_job_id!==found.id)return;if(running(found))void window.SFMonthOptimizer?.resumeBackground?.(found);else if(found.status==='SUCCEEDED'&&el('view-auto')?.classList.contains('active'))void window.SFMonthOptimizer?.restoreBackground?.(found);}}
  catch(e){if(who===identity())console.warn('Hintergrundauftrag konnte nicht angezeigt werden',e.message||String(e));}
  finally{if(token===sequence)loading=false;}
 }
 function accessChanged(){const next=identity();if(next===owner){render();return;}owner=next;sequence++;loading=false;seen='';job=null;if(watch){window.SFAutoPlanProgress?.finish('Die Anzeige wurde getrennt. Der Auftrag läuft weiter.');window.SFAutoPlanProgress?.reset?.();}stopWatch();render();if(next)setTimeout(discover,0);}
 function install(){for(const name of ['updateState','hydrate']){const old=B[name];if(typeof old!=='function'||old.__backgroundPlan)continue;const fn=name==='hydrate'?async function(){const r=await old.apply(this,arguments);accessChanged();return r}:function(){const r=old.apply(this,arguments);accessChanged();return r};fn.__backgroundPlan=true;B[name]=fn;}accessChanged();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(watch)schedule(0);else void discover();});
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="auto"]'))setTimeout(()=>{render();if(job?.status==='SUCCEEDED'&&!el('sfBackgroundPlanStatus')?.hidden&&!window.SFMonthOptimizer?.getResult?.())void window.SFMonthOptimizer?.restoreBackground?.(job);else void discover();},0);});
 window.SFBackgroundPlanning={available,start,wait,cancel,applied,discard,render,discover,getJob:()=>job};
 install();setInterval(install,2000);
})();
