// SchichtFunk manager portal – persistent light/dark appearance toggle
(function(){
  if(window.__sfManagerThemeV1)return;window.__sfManagerThemeV1=true;
  const KEY='schichtfunk-manager-theme';
  const root=document.documentElement;

  function storedTheme(){
    try{return localStorage.getItem(KEY)==='light'?'light':'dark'}catch(e){return 'dark'}
  }
  function updateButton(theme){
    const button=document.getElementById('sfThemeToggle');
    if(!button)return;
    const light=theme==='light';
    const label=light?'Zum dunklen Modus wechseln':'Zum hellen Modus wechseln';
    button.type='button';
    button.classList.remove('sp-legacy-action');
    button.removeAttribute('aria-hidden');
    button.tabIndex=0;
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed',String(light));
    button.title=label;
    button.innerHTML=`<span aria-hidden="true">${light?'☾':'☀'}</span>`;
  }
  function apply(theme,persist){
    const value=theme==='light'?'light':'dark';
    root.dataset.sfTheme=value;
    root.style.colorScheme=value;
    if(persist){try{localStorage.setItem(KEY,value)}catch(e){}}
    updateButton(value);
    window.dispatchEvent(new CustomEvent('schichtfunk:themechange',{detail:{theme:value}}));
  }
  function bind(){
    const button=document.getElementById('sfThemeToggle');
    if(!button)return;
    updateButton(root.dataset.sfTheme||storedTheme());
    if(button.dataset.sfThemeBound)return;
    button.dataset.sfThemeBound='true';
    button.addEventListener('click',()=>apply(root.dataset.sfTheme==='light'?'dark':'light',true));
  }

  apply(root.dataset.sfTheme||storedTheme(),false);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
  setTimeout(bind,300);
  window.SFManagerTheme={apply,theme:()=>root.dataset.sfTheme||'dark'};
})();
