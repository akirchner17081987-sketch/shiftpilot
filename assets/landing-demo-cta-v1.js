// SchichtFunk – öffentlicher Demo-CTA V1
(function(){
  if(window.__sfLandingDemoCtaV1)return;window.__sfLandingDemoCtaV1=true;

  const DEMO_URL='/demo';
  function goDemo(){window.location.assign(DEMO_URL)}

  function ensureCss(){
    if(document.getElementById('sfLandingDemoCtaCss'))return;
    const s=document.createElement('style');s.id='sfLandingDemoCtaCss';s.textContent=`
      .sf-demo-trust{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:-13px 0 24px;color:#86a2b7;font-size:11px;font-weight:700}.sf-demo-trust span{display:inline-flex;gap:6px;align-items:center}.sf-demo-trust i{font-style:normal;color:#42dbc5}
      .sf-demo-public{position:relative;overflow:hidden;background:linear-gradient(135deg,#071927,#0b2232 55%,#0a1b2b);color:#fff;padding:58px 4vw;border-top:1px solid #17364a;border-bottom:1px solid #17364a}.sf-demo-public:before{content:'';position:absolute;width:520px;height:520px;border-radius:50%;right:-120px;top:-260px;background:radial-gradient(circle,rgba(37,218,198,.16),transparent 68%);pointer-events:none}.sf-demo-public-inner{position:relative;max-width:1450px;margin:0 auto;display:grid;grid-template-columns:1.15fr .85fr;gap:46px;align-items:center}.sf-demo-public-kicker{color:#4be5d2;font-size:11px;font-weight:900;letter-spacing:.14em}.sf-demo-public h2{font-size:clamp(31px,3vw,47px);line-height:1.08;margin:9px 0 13px;letter-spacing:-.03em}.sf-demo-public h2 span{color:#3ce0cf}.sf-demo-public p{max-width:760px;margin:0;color:#a7bacb;font-size:15px;line-height:1.7}.sf-demo-public-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:23px}.sf-demo-public-chip{padding:8px 10px;border:1px solid #285065;border-radius:999px;background:#0c2734;color:#c8e9e4;font-size:11px;font-weight:750}.sf-demo-public-action{border:1px solid #23495b;border-radius:16px;background:rgba(5,16,25,.72);padding:24px;box-shadow:0 20px 55px rgba(0,0,0,.22)}.sf-demo-public-action strong{display:block;font-size:17px}.sf-demo-public-action p{font-size:12px;line-height:1.55;margin:7px 0 18px}.sf-demo-public-action .landing-btn{width:100%;min-height:50px}.sf-demo-public-fine{display:flex;justify-content:center;gap:8px;margin-top:12px;color:#718da2;font-size:10px}
      .landing-btn.sf-demo-top{border-color:#2b7f70;background:#11352e;color:#8ff0d8}.landing-btn.sf-demo-top:hover{background:#18483d}
      @media(max-width:900px){.sf-demo-public-inner{grid-template-columns:1fr}.sf-demo-public{padding:44px 20px}}
      @media(max-width:700px){.sf-demo-trust{margin-top:-8px}.landing-actions .sf-demo-top{display:inline-flex}.landing-actions{gap:7px}.landing-actions .landing-btn{padding:10px 12px;font-size:12px}}
    `;document.head.appendChild(s);
  }

  function button(label,cls='landing-btn primary'){
    const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.addEventListener('click',goDemo);return b;
  }

  function enhanceHeader(){
    const actions=document.querySelector('#landingPage .landing-actions');if(!actions)return;
    const existing=[...actions.querySelectorAll('button')];
    const login=existing.find(b=>/anmelden/i.test(b.textContent||''));
    if(login){login.textContent='Anmelden';login.title='Zum bestehenden SchichtFunk-Konto anmelden'}
    let demo=actions.querySelector('.sf-demo-top');
    if(!demo){demo=button('Demo testen →','landing-btn sf-demo-top');actions.appendChild(demo)}
    const dashboard=existing.find(b=>/dashboard öffnen/i.test(b.textContent||''));if(dashboard)dashboard.remove();
  }

  function enhanceHero(){
    const hero=document.querySelector('#landingPage .hero-copy'),buttons=hero?.querySelector('.hero-buttons');if(!hero||!buttons)return;
    const primary=buttons.querySelector('.landing-btn.primary');
    if(primary&&!primary.dataset.sfDemoCta){
      primary.textContent='Demo kostenlos testen →';primary.dataset.sfDemoCta='1';primary.onclick=null;primary.addEventListener('click',goDemo);
    }
    if(!hero.querySelector('.sf-demo-trust')){
      const trust=document.createElement('div');trust.className='sf-demo-trust';trust.innerHTML='<span><i>✓</i>Keine Registrierung</span><span><i>✓</i>Keine echten Daten</span><span><i>✓</i>Jederzeit zurücksetzbar</span>';
      buttons.insertAdjacentElement('afterend',trust);
    }
  }

  function addDemoSection(){
    const landing=document.getElementById('landingPage'),features=document.getElementById('features');if(!landing||!features||document.getElementById('sfPublicDemoSection'))return;
    const section=document.createElement('section');section.id='sfPublicDemoSection';section.className='sf-demo-public';
    section.innerHTML=`<div class="sf-demo-public-inner"><div><div class="sf-demo-public-kicker">SCHICHTFUNK LIVE AUSPROBIEREN</div><h2>Erleben Sie SchichtFunk mit <span>vorbereiteten Beispieldaten.</span></h2><p>Öffnen Sie eine geschützte Präsentationsumgebung und testen Sie die wichtigsten Abläufe selbst – vom Dienstplan über Zeiterfassung und Schicht-Marktplatz bis zum DATEV-LODAS-Export.</p><div class="sf-demo-public-list"><span class="sf-demo-public-chip">Dienstplan Woche & Monat</span><span class="sf-demo-public-chip">O1S & QA</span><span class="sf-demo-public-chip">SOLL / IST</span><span class="sf-demo-public-chip">Zeiterfassung</span><span class="sf-demo-public-chip">Schicht-Marktplatz</span><span class="sf-demo-public-chip">DATEV-LODAS</span></div></div><aside class="sf-demo-public-action"><strong>Unverbindlich direkt starten</strong><p>Die Demo läuft vollständig getrennt von echten Kunden- und Mitarbeiterdaten und kann jederzeit auf den vorbereiteten Ausgangsstand zurückgesetzt werden.</p><button type="button" class="landing-btn primary" id="sfPublicDemoStart">▶ Demo jetzt starten</button><div class="sf-demo-public-fine"><span>Keine Registrierung</span><span>·</span><span>Beispieldaten</span><span>·</span><span>Sandbox</span></div></aside></div>`;
    features.parentNode.insertBefore(section,features);
    section.querySelector('#sfPublicDemoStart').addEventListener('click',goDemo);
  }

  function enhanceFeatureFooter(){
    const b=document.querySelector('#landingPage .features-finish .landing-btn.primary');if(!b||b.dataset.sfDemoCta)return;
    b.textContent='Demo testen →';b.dataset.sfDemoCta='1';b.onclick=null;b.addEventListener('click',goDemo);
  }

  function boot(){
    // Der Demo-Einstieg gehört immer auf die öffentliche Hauptseite – auch wenn
    // derselbe Browser zuvor bereits eine Demo-Sitzung gestartet hatte.
    ensureCss();enhanceHeader();enhanceHero();addDemoSection();enhanceFeatureFooter();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  [100,300,800].forEach(ms=>setTimeout(boot,ms));
  window.sfOpenPublicDemo=goDemo;
})();
