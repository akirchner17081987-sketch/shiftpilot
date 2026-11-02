(function(){
 if(window.SFDialog)return;let pending=false;
 async function confirmAction({title='Bitte bestätigen',message='',confirmLabel='Bestätigen',danger=false}={}){
  if(pending)return false;pending=true;
  const previous=document.activeElement,dialog=document.createElement('dialog');
  dialog.className='sf-dialog';dialog.setAttribute('aria-labelledby','sfDialogTitle');dialog.setAttribute('aria-describedby','sfDialogMessage');
  dialog.innerHTML='<div class="sf-dialog-top"><span class="sf-dialog-mark" aria-hidden="true">S</span><span>SCHICHTFUNK <b>·</b> BESTÄTIGUNG</span></div><div class="sf-dialog-body"><div class="sf-dialog-icon" aria-hidden="true">!</div><div><h2 id="sfDialogTitle"></h2><p id="sfDialogMessage"></p></div></div><div class="sf-dialog-actions"><button type="button" class="sf-dialog-cancel" data-sf-dialog-cancel>Abbrechen</button><button type="button" class="sf-dialog-confirm" data-sf-dialog-confirm></button></div>';
  dialog.querySelector('#sfDialogTitle').textContent=title;dialog.querySelector('#sfDialogMessage').textContent=message;
  const yes=dialog.querySelector('[data-sf-dialog-confirm]');yes.textContent=confirmLabel;if(danger)yes.classList.add('danger');document.body.append(dialog);
  try{return await new Promise((resolve,reject)=>{let done=false;const finish=value=>{if(done)return;done=true;resolve(value)};
   dialog.querySelector('[data-sf-dialog-cancel]').addEventListener('click',()=>finish(false));yes.addEventListener('click',()=>finish(true));
   dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
   try{dialog.showModal();dialog.querySelector('[data-sf-dialog-cancel]').focus()}catch(e){reject(e)}
  })}finally{if(dialog.open)dialog.close();dialog.remove();pending=false;if(previous?.isConnected)previous.focus()}
 }window.SFDialog={confirm:confirmAction};
})();