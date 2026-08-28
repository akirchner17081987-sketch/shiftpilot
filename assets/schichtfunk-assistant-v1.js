// SchichtFunk – KI Assistent UI V1 (read-only)
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  const state={open:false,busy:false,messages:[]};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureCss(){
    if(document.getElementById('sfAssistantCss'))return;
    const s=document.createElement('style');
    s.id='sfAssistantCss';
    s.textContent=`
      .sf-ai-fab{position:fixed;right:22px;bottom:82px;z-index:12000;border:1px solid #2e776d;background:linear-gradient(135deg,#27d8bf,#14bda9);color:#03201c;border-radius:999px;padding:12px 16px;font-weight:900;box-shadow:0 16px 44px rgba(0,0,0,.35);display:none;align-items:center;gap:8px;cursor:pointer}
      .sf-ai-fab.show{display:flex}.sf-ai-fab:hover{transform:translateY(-1px)}
      .sf-ai-panel{position:fixed;right:22px;bottom:138px;width:min(430px,calc(100vw - 28px));height:min(650px,calc(100vh - 175px));z-index:12001;background:linear-gradient(180deg,#0d1b2a,#07131f);border:1px solid #29465f;border-radius:18px;box-shadow:0 28px 90px rgba(0,0,0,.6);overflow:hidden;display:none;grid-template-rows:auto auto 1fr auto}
      .sf-ai-panel.open{display:grid}.sf-ai-head{display:flex;align-items:center;justify-content:space-between;padding:16px 17px;border-bottom:1px solid #20384c}.sf-ai-title{display:flex;align-items:center;gap:10px}.sf-ai-mark{width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,#27d8bf,#12a893);display:grid;place-items:center;color:#05211d;font-weight:1000}.sf-ai-title b{display:block;font-size:14px}.sf-ai-title small{display:block;color:#89a5bb;font-size:10px;margin-top:2px}.sf-ai-close{border:0;background:transparent;color:#8ea7ba;font-size:22px;cursor:pointer;padding:4px 8px}
      .sf-ai-quick{display:flex;gap:7px;overflow:auto;padding:10px 12px;border-bottom:1px solid #1d3346}.sf-ai-chip{white-space:nowrap;border:1px solid #2b4a62;background:#0a1927;color:#bcd0df;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer}.sf-ai-chip:hover{border-color:#2bcdb6;color:#8af1df}
      .sf-ai-messages{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}.sf-ai-bubble{max-width:88%;padding:10px 12px;border-radius:13px;font-size:12px;line-height:1.48;white-space:pre-wrap;word-break:break-word}.sf-ai-bubble.user{align-self:flex-end;background:#153d42;border:1px solid #25776f;color:#e9fffb;border-bottom-right-radius:5px}.sf-ai-bubble.assistant{align-self:flex-start;background:#102233;border:1px solid #29465f;color:#e6eef5;border-bottom-left-radius:5px}.sf-ai-bubble.system{align-self:stretch;max-width:none;background:#152314;border:1px solid #536725;color:#d7eab5;font-size:11px}.sf-ai-bubble.error{background:#321922;border-color:#7b3343;color:#ffabb6}.sf-ai-dots{display:inline-flex;gap:4px}.sf-ai-dots i{width:5px;height:5px;background:#86a2b7;border-radius:50%;animation:sfAiDot 1.2s infinite}.sf-ai-dots i:nth-child(2){animation-delay:.18s}.sf-ai-dots i:nth-child(3){animation-delay:.36s}@keyframes sfAiDot{0%,70%,100%{opacity:.25}35%{opacity:1}}
      .sf-ai-foot{border-top:1px solid #20384c;padding:11px}.sf-ai-compose{display:flex;align-items:flex-end;gap:8px}.sf-ai-input{flex:1;min-height:42px;max-height:110px;resize:none;background:#071522;border:1px solid #2a465d;border-radius:11px;color:#eef7ff;padding:10px 11px;font:inherit;font-size:12px;outline:none}.sf-ai-input:focus{border-color:#2bcdb6}.sf-ai-send{height:42px;min-width:44px;border:0;border-radius:11px;background:#27d8bf;color:#05201c;font-size:18px;font-weight:900;cursor:pointer}.sf-ai-send:disabled{opacity:.45;cursor:not-allowed}.sf-ai-note{display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#6f899d;font-size:9px}.sf-ai-readonly{color:#68dbc6;font-weight:900}
      @media(max-width:640px){.sf-ai-fab{right:14px;bottom:76px}.sf-ai-panel{right:14px;bottom:130px;height:calc(100vh - 150px)}}
    `;
    document.head.appendChild(s);
  }

  function ensureUi(){
    ensureCss();
    if(document.getElementById('sfAssistantFab'))return;
    const fab=document.createElement('button');
    fab.id='sfAssistantFab';fab.className='sf-ai-fab';fab.innerHTML='<span>✦</span><span>SchichtFunk Assistent</span>';
    fab.onclick=toggle;
    document.body.appendChild(fab);

    const panel=document.createElement('div');
    panel.id='sfAssistantPanel';panel.className='sf-ai-panel';
    panel.innerHTML=`
      <div class="sf-ai-head">
        <div class="sf-ai-title"><div class="sf-ai-mark">✦</div><div><b>SchichtFunk Assistent</b><small>Planung analysieren · Vorschläge erhalten</small></div></div>
        <button class="sf-ai-close" id="sfAiClose" aria-label="Schließen">×</button>
      </div>
      <div class="sf-ai-quick">
        <button class="sf-ai-chip" data-q="Prüfe die aktuelle und nächste Woche auf Unterbesetzung.">Unterbesetzung prüfen</button>
        <button class="sf-ai-chip" data-q="Welche Mitarbeiter haben in den nächsten 7 Tagen noch gute Einsatzmöglichkeiten? Berücksichtige Ruhezeiten und Schichtfreigaben.">Freie Mitarbeiter</button>
        <button class="sf-ai-chip" data-q="Analysiere den Dienstplan der nächsten Woche und nenne die wichtigsten Auffälligkeiten.">Dienstplan analysieren</button>
        <button class="sf-ai-chip" data-q="Prüfe die nächsten 14 Tage auf erkennbare Standard-Compliance-Risiken bei Ruhezeit, Überschneidung und Schichtdauer.">Compliance prüfen</button>
      </div>
      <div class="sf-ai-messages" id="sfAiMessages"></div>
      <div class="sf-ai-foot">
        <div class="sf-ai-compose"><textarea class="sf-ai-input" id="sfAiInput" rows="1" maxlength="1800" placeholder="z. B. Wer könnte Samstag O2 übernehmen?"></textarea><button class="sf-ai-send" id="sfAiSend" aria-label="Senden">➤</button></div>
        <div class="sf-ai-note"><span class="sf-ai-readonly">● Nur lesen</span><span>Keine automatische Dienstplanänderung</span></div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('#sfAiClose').onclick=()=>setOpen(false);
    panel.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>send(b.dataset.q));
    const input=panel.querySelector('#sfAiInput');
    panel.querySelector('#sfAiSend').onclick=()=>send(input.value);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input.value)}});
    render();
  }

  function syncVisibility(){
    ensureUi();
    const fab=document.getElementById('sfAssistantFab');
    fab?.classList.toggle('show',!!B.ready);
    if(!B.ready)setOpen(false);
  }

  function setOpen(v){
    ensureUi();state.open=!!v;
    document.getElementById('sfAssistantPanel')?.classList.toggle('open',state.open);
    if(state.open){
      if(!state.messages.length){
        state.messages.push({role:'assistant',content:'Hallo! Ich kann deinen SchichtFunk-Dienstplan auswerten, Unterbesetzung erkennen, geeignete Mitarbeiter vorschlagen und Standard-Compliance-Risiken erklären. Ich ändere in dieser Version noch keine Daten.'});
        render();
      }
      setTimeout(()=>document.getElementById('sfAiInput')?.focus(),30);
    }
  }
  function toggle(){setOpen(!state.open)}

  function render(){
    const box=document.getElementById('sfAiMessages');if(!box)return;
    box.innerHTML='';
    state.messages.forEach(m=>{
      const d=document.createElement('div');d.className='sf-ai-bubble '+(m.kind||m.role);d.textContent=m.content;box.appendChild(d);
    });
    if(state.busy){const d=document.createElement('div');d.className='sf-ai-bubble assistant';d.innerHTML='<span class="sf-ai-dots"><i></i><i></i><i></i></span>';box.appendChild(d)}
    box.scrollTop=box.scrollHeight;
    const btn=document.getElementById('sfAiSend');if(btn)btn.disabled=state.busy;
  }

  async function send(raw){
    const text=String(raw||'').trim();
    if(!text||state.busy)return;
    if(!B.ready||!B.client){state.messages.push({role:'assistant',kind:'error',content:'Bitte zuerst mit SchichtFunk Cloud verbinden.'});render();return}
    const prior=state.messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-8);
    state.messages.push({role:'user',content:text});
    const input=document.getElementById('sfAiInput');if(input)input.value='';
    state.busy=true;render();
    try{
      const {data}=await B.client.auth.getSession();
      const token=data?.session?.access_token;
      if(!token)throw new Error('Deine SchichtFunk-Anmeldung ist abgelaufen.');
      const r=await fetch('/api/schichtfunk-assistant',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({message:text,history:prior.map(x=>({role:x.role,content:x.content}))})
      });
      const out=await r.json().catch(()=>({}));
      if(!r.ok){
        if(out.setupRequired)throw new Error('Der KI-Assistent ist bereits eingebaut, aber der OpenAI API-Schlüssel muss noch auf Vercel aktiviert werden.');
        throw new Error(out.error||`Assistentenfehler ${r.status}`);
      }
      state.messages.push({role:'assistant',content:out.answer||'Keine Antwort erhalten.'});
    }catch(e){
      state.messages.push({role:'assistant',kind:'error',content:e.message||String(e)});
    }finally{state.busy=false;render()}
  }

  ensureUi();
  const oldUpdate=B.updateState;
  B.updateState=function(){const r=typeof oldUpdate==='function'?oldUpdate.apply(this,arguments):undefined;syncVisibility();return r};
  syncVisibility();
  window.SFAssistant={open:()=>setOpen(true),close:()=>setOpen(false),ask:send};
})();
