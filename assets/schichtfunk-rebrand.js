// SchichtFunk Rebranding Layer
(function(){
  const OLD='ShiftPilot';
  const NEW='SchichtFunk';
  const SLOGAN='Klar geplant. Stark besetzt.';

  function replaceText(root=document.body){
    if(!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const p=node.parentElement;
      if(!p || ['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.includes(OLD) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }});
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n=>n.nodeValue=n.nodeValue.split(OLD).join(NEW));
  }

  function replaceAttributes(root=document){
    root.querySelectorAll('[title],[aria-label],[placeholder],[alt]').forEach(el=>{
      ['title','aria-label','placeholder','alt'].forEach(a=>{
        const v=el.getAttribute(a); if(v && v.includes(OLD)) el.setAttribute(a,v.split(OLD).join(NEW));
      });
    });
  }

  function replaceLogos(){
    document.querySelectorAll('img').forEach(img=>{
      const src=img.getAttribute('src')||'';
      if(/shiftpilot-logo\.svg/i.test(src) || /shiftpilot/i.test(img.alt||'')){
        img.src='assets/schichtfunk-logo.svg';
        img.alt='SchichtFunk – '+SLOGAN;
        img.classList.add('schichtfunk-brand-logo');
      }
    });
  }

  function ensureBranding(){
    document.title='SchichtFunk – Dienstplanung';
    replaceText();
    replaceAttributes();
    replaceLogos();

    const footer=[...document.querySelectorAll('footer,.landing-footer')].find(x=>/©\s*2026/i.test(x.textContent||''));
    if(footer && !footer.textContent.includes(NEW)) footer.textContent='© 2026 SchichtFunk – '+SLOGAN;
  }

  function migrateStorageKeys(){
    try{
      const pairs=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i); if(k && /shiftpilot/i.test(k)) pairs.push(k);
      }
      pairs.forEach(k=>{
        const nk=k.replace(/shiftpilot/ig,'schichtfunk');
        if(localStorage.getItem(nk)==null) localStorage.setItem(nk,localStorage.getItem(k));
      });
    }catch(e){}
  }

  function init(){migrateStorageKeys();ensureBranding();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();

  const observer=new MutationObserver(()=>ensureBranding());
  if(document.documentElement) observer.observe(document.documentElement,{subtree:true,childList:true});
})();
