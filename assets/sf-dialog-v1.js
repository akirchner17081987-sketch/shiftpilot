(function(){
 'use strict';
 if(window.SFDialog)return;
 let pending=false,noticeQueue=Promise.resolve(),idle=Promise.resolve(),releaseIdle=null;
 const identity=()=>{const b=window.SFBackend;return b&&b.ready?{company:b.companyId,user:b.user?.id||'',role:b.role}:null};
 const sameIdentity=old=>{if(!old)return true;const now=identity();return !!now&&old.company===now.company&&old.user===now.user&&old.role===now.role&&!window.SFBackend.companySwitching};
 async function open(options={}){
  const {title='Bitte bestätigen',message='',confirmLabel='Bestätigen',danger=false,mode='confirm',defaultValue='',secondaryLabel=''}=options;
  if(pending)return mode==='prompt'||mode==='choice'?null:false;
  pending=true;idle=new Promise(resolve=>{releaseIdle=resolve});const who=identity(),previous=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='sf-dialog';dialog.setAttribute('aria-labelledby','sfDialogTitle');dialog.setAttribute('aria-describedby','sfDialogMessage');
  dialog.innerHTML='<div class="sf-dialog-top"><span class="sf-dialog-mark" aria-hidden="true">S</span><span>SCHICHTFUNK <b>·</b> <span data-dialog-kind></span></span></div><div class="sf-dialog-body"><div class="sf-dialog-icon" aria-hidden="true">!</div><div><h2 id="sfDialogTitle"></h2><p id="sfDialogMessage"></p><input class="sf-dialog-input" data-sf-dialog-input hidden></div></div><div class="sf-dialog-actions"><button type="button" class="sf-dialog-cancel" data-sf-dialog-cancel>Abbrechen</button><button type="button" class="sf-dialog-secondary" data-sf-dialog-secondary hidden></button><button type="button" class="sf-dialog-confirm" data-sf-dialog-confirm></button></div>';
  const cancel=dialog.querySelector('[data-sf-dialog-cancel]'),yes=dialog.querySelector('[data-sf-dialog-confirm]'),secondary=dialog.querySelector('[data-sf-dialog-secondary]'),input=dialog.querySelector('[data-sf-dialog-input]');
  dialog.querySelector('[data-dialog-kind]').textContent=mode==='alert'?'HINWEIS':mode==='prompt'?'EINGABE':'BESTÄTIGUNG';
  dialog.querySelector('#sfDialogTitle').textContent=String(title);dialog.querySelector('#sfDialogMessage').textContent=String(message);
  yes.textContent=confirmLabel;if(danger)yes.classList.add('danger');
  if(mode==='alert')cancel.hidden=true;
  if(mode==='choice'){secondary.hidden=false;secondary.textContent=secondaryLabel;}
  if(mode==='prompt'){input.hidden=false;input.value=String(defaultValue??'');input.setAttribute('aria-label',String(title))}
  document.body.append(dialog);
  try{return await new Promise((resolve,reject)=>{let done=false;const finish=value=>{if(done)return;done=true;resolve(value)};
   cancel.addEventListener('click',()=>finish(mode==='prompt'||mode==='choice'?null:false));
   secondary.addEventListener('click',()=>finish(sameIdentity(who)?false:null));
   yes.addEventListener('click',()=>finish(!sameIdentity(who)?(mode==='prompt'||mode==='choice'?null:false):mode==='prompt'?input.value:true));
   dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();if(mode==='prompt'&&e.key==='Enter'){e.preventDefault();yes.click()}});
   dialog.addEventListener('cancel',e=>{e.preventDefault();finish(mode==='prompt'||mode==='choice'?null:false)});
   try{dialog.showModal();(mode==='alert'?yes:mode==='prompt'?input:cancel).focus();if(mode==='prompt')input.select()}catch(e){reject(e)}
  })}finally{if(dialog.open)dialog.close();dialog.remove();pending=false;releaseIdle?.();releaseIdle=null;if(previous?.isConnected)previous.focus()}
 }
 function confirmAction(options){if(typeof options==='string'){const deletes=/\blöschen\b/i.test(options);options={message:options,danger:deletes,confirmLabel:deletes?'Löschen':'Bestätigen'}}return open(options)}
 function alertAction(message){noticeQueue=noticeQueue.catch(()=>{}).then(async()=>{while(pending)await idle;await open({mode:'alert',title:'Hinweis',message:String(message),confirmLabel:'Verstanden'})});return noticeQueue}
 function promptAction(message,value=''){return open({mode:'prompt',title:'Eingabe',message:String(message),defaultValue:value,confirmLabel:'Übernehmen'})}
 function choiceAction(options){return open({...options,mode:'choice'})}
 window.SFDialog={confirm:confirmAction,alert:alertAction,prompt:promptAction,choice:choiceAction};
})();
