// SchichtFunk Rebranding Layer – safe mode
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
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n=>{ n.nodeValue=n.nodeValue.split(OLD).join(NEW); });
  }

  function replaceAttributes(root=document){
    if(!root?.querySelectorAll) return;
    root.querySelectorAll('[title],[aria-label],[placeholder],[alt]').forEach(el=>{
      ['title','aria-label','placeholder','alt'].forEach(a=>{
        const v=el.getAttribute(a);
        if(v && v.includes(OLD)) el.setAttribute(a,v.split(OLD).join(NEW));
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

  function init(){
    document.title='SchichtFunk – Dienstplanung';
    replaceText(document.body);
    replaceAttributes(document);
    replaceLogos();
  }

  // Nur einmal nach vollständigem DOM-Aufbau ausführen.
  // Keine MutationObserver, keine Storage-Migration, keine strukturellen DOM-Änderungen.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
