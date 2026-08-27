// SchichtFunk – finaler Branding-Cleanup V2
(function(){
  const OLD=/ShiftPilot/g;
  const NEW='SchichtFunk';
  function replaceText(root){
    if(!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n=>{ if(n.nodeValue && OLD.test(n.nodeValue)){ OLD.lastIndex=0; n.nodeValue=n.nodeValue.replace(OLD,NEW); } else OLD.lastIndex=0; });
    if(root.querySelectorAll){
      root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el=>{
        ['title','aria-label','placeholder'].forEach(a=>{
          const v=el.getAttribute(a); if(v&&v.includes('ShiftPilot')) el.setAttribute(a,v.replace(/ShiftPilot/g,NEW));
        });
      });
    }
  }
  function run(){
    if(document.title.includes('ShiftPilot')) document.title=document.title.replace(/ShiftPilot/g,NEW);
    replaceText(document.body);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
  const obs=new MutationObserver(muts=>{
    muts.forEach(m=>m.addedNodes.forEach(n=>{ if(n.nodeType===1||n.nodeType===3) replaceText(n.nodeType===1?n:n.parentNode); }));
  });
  if(document.body) obs.observe(document.body,{childList:true,subtree:true});
})();
