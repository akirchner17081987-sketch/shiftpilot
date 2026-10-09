Warning: truncated output (original token count: 6146)
Total output lines: 58

// SchichtFunk - zentrale Einstellungen V2
(function(){
  if(window.__sfSettingsV2)return;window.__sfSettingsV2=true;
  const KEY='sp_settings_v2';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}};
  const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
  const companyKey=()=>`${KEY}:company:${window.SFBackend?.companyId||'local'}`;
  const readCompany=()=>{try{return JSON.parse(localStorage.getItem(companyKey())||'{}')}catch{return{}}};
  let active='planning',companyCache=null;

  function css(){if(document.getElementById('sfSettingsV2Css'))return;const s=document.createElement('style');s.id='sfSettingsV2Css';s.textContent=`
  #view-settings>.card,#view-settings>.panel-grid{display:none!important}.sf-set-shell{display:grid!important;grid-template-columns:220px minmax(0,1fr);gap:16px}.sf-set-nav,.sf-set-panel{border:1px solid #20364d;border-radius:14px;background:#0d1928}.sf-set-nav{align-self:start;padding:10px;position:sticky;top:82px}.sf-set-nav button{width:100%;display:flex;align-items:center;gap:10px;border:0;border-radius:9px;background:transparent;color:#9db1c5;padding:11px 12px;text-align:left;font-size:13px}.sf-set-nav button.active{background:#16322f;color:#65e8ce}.sf-set-panel{padding:18px;min-width:0}.sf-set-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;padding-bottom:15px;border-bottom:1px solid #20364d;margin-bottom:15px}.sf-set-head h2{margin:3px 0 5px;font-size:21px}.sf-set-head p{margin:0;color:#91a7bc;font-size:12px}.sf-set-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sf-set-card{border:1px solid #21394f;border-radius:11px;background:#0a1624;padding:14px}.sf-set-card.full{grid-column:1/-1}.sf-set-card h3{margin:0 0 5px;font-size:14px}.sf-set-card>p{margin:0 0 13px;color:#8fa5ba;font-size:12px;line-height:1.5}.sf-set-field…5146 tokens truncated…'Der Sitzungswiderruf wird gerade geladen.')};
  }
  function hookAccount(){const B=window.SFBackend;if(!B||B.account===openAccountSettings)return;if(typeof B.account==='function'){B.account=openAccountSettings;return}setTimeout(hookAccount,120)}
  function account(b){const B=window.SFBackend,email=B?.user?.email||'Noch nicht angemeldet',role=roleName(B?.role);b.innerHTML=`<div class="sf-set-grid"><section class="sf-set-card full"><div class="sf-set-account"><div class="sf-set-avatar">${esc((email[0]||'S').toUpperCase())}</div><div><b>${esc(email)}</b><small>${esc(role)}</small></div></div><div class="sf-set-actions"><button class="ghost" id="sfAccountAction">Kontoeinstellungen</button><button class="danger" id="sfSettingsLogout" ${B?.ready?'':'disabled'}>Abmelden</button></div></section><div class="sf-set-note">Benutzerrollen werden aus der gesch�tzten Unternehmenszuordnung gelesen und hier nicht lokal �berschrieben.</div></div>`;b.querySelector('#sfAccountAction').onclick=openAccountSettings;b.querySelector('#sfSettingsLogout').onclick=()=>{const top=document.getElementById('spTopbarLogout');if(top)top.click();else B?.client?.auth?.signOut()}}

  const old=window.renderSettings;window.renderSettings=function(){try{old?.apply(this,arguments)}catch(e){console.warn(e)}render()};
  window.SFSettingsV2={refreshPlanning(){if(active==='planning'){const b=document.getElementById('sfSettingBody');if(b)planning(b)}}};
  function init(){css();applyDisplay();hookAccount();const view=document.getElementById('view-settings'),head=view?.querySelector('.page-head');if(head)head.innerHTML='<div><div class="eyebrow">EINSTELLUNGEN</div><h1>Zentrale Einstellungen</h1><p>Planung, Unternehmen, Darstellung, Audit und Konto an einem Ort verwalten.</p></div>';shell();render();document.querySelector('[data-view="settings"]')?.addEventListener('click',()=>setTimeout(render,0))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();


