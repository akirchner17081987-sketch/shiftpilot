// SchichtFunk – einheitliche Scrollbars im Designsystem
(function(){
  if(window.__sfScrollbarDesignV1)return;window.__sfScrollbarDesignV1=true;
  const style=document.createElement('style');style.id='sfScrollbarDesignV1Css';style.textContent=`
    :root{--sf-scroll-track:#081522;--sf-scroll-track-hover:#0b1b2a;--sf-scroll-thumb:#314d63;--sf-scroll-thumb-hover:#3c6c78;--sf-scroll-thumb-active:#39a995}
    html{scrollbar-color:var(--sf-scroll-thumb) var(--sf-scroll-track);scrollbar-width:thin}
    body *{scrollbar-color:var(--sf-scroll-thumb) var(--sf-scroll-track);scrollbar-width:thin}
    ::-webkit-scrollbar{width:9px;height:9px}
    ::-webkit-scrollbar-track{background:var(--sf-scroll-track);border-radius:999px}
    ::-webkit-scrollbar-track:hover{background:var(--sf-scroll-track-hover)}
    ::-webkit-scrollbar-thumb{min-height:34px;border:2px solid var(--sf-scroll-track);border-radius:999px;background:var(--sf-scroll-thumb);background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{border-color:var(--sf-scroll-track-hover);background:var(--sf-scroll-thumb-hover);background-clip:padding-box}
    ::-webkit-scrollbar-thumb:active{background:var(--sf-scroll-thumb-active);background-clip:padding-box}
    ::-webkit-scrollbar-corner{background:var(--sf-scroll-track)}
    ::-webkit-scrollbar-button{width:0;height:0;display:none}
    .main::-webkit-scrollbar{width:10px}.main::-webkit-scrollbar-thumb{border-width:2px}
    .sf-db-card-body,.sp-emp-list,.sf-help-body,.sp-assign-body,.abs-modal,.absence-modal,.tpl-modal{scrollbar-gutter:stable}
    @media(max-width:700px){::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-thumb{border-width:1px}}
  `;document.head.appendChild(style);
})();
