// Keep focused week controls fully visible inside the horizontal scroll area.
(function(){
  if(window.__sfManagerScheduleTimeLayoutV1)return;
  window.__sfManagerScheduleTimeLayoutV1=true;
  document.addEventListener('focusin',e=>{
    const wrap=e.target.closest?.('#sfWeekBoardV2');if(!wrap)return;
    const item=e.target.getBoundingClientRect(),box=wrap.getBoundingClientRect(),style=getComputedStyle(wrap);
    const left=box.left+wrap.clientLeft+parseFloat(style.paddingLeft),right=box.left+wrap.clientLeft+wrap.clientWidth-parseFloat(style.paddingRight);
    if(item.left<left)wrap.scrollLeft+=item.left-left;
    else if(item.right>right)wrap.scrollLeft+=item.right-right;
  });
})();
