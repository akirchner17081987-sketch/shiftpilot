// SchichtFunk – integrierter QR-Kamera-Scanner im Mitarbeiterportal V1
(function(){
  const B=window.SFBackend=window.SFBackend||{};
  if(B.__employeeQrScannerV1)return;B.__employeeQrScannerV1=true;

  const JSQR_LIB='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  let stream=null,scanTimer=null,decoderPromise=null,scanning=false;
  const demo=()=>sessionStorage.getItem('sf_demo_session_v1')==='active';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function css(){
    if(document.getElementById('sfEmployeeQrScannerCss'))return;
    const s=document.createElement('style');s.id='sfEmployeeQrScannerCss';s.textContent=`
      #sfEmployeePortal .sf-qr-scan-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}
      #sfEmployeePortal .sf-qr-scan-btn{min-height:44px;border:1px solid #36a98e;border-radius:11px;padding:10px 15px;background:linear-gradient(180deg,#167866,#10594d);color:#effffb;font-weight:900;cursor:pointer;box-shadow:0 8px 20px #04110f55}
      #sfEmployeePortal .sf-qr-scan-btn:hover{border-color:#6ce5ca;background:linear-gradient(180deg,#1a8b76,#126456)}
      #sfEmployeePortal .sf-qr-scan-inline{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 16px;padding:14px 15px;border:1px solid #28594c;border-radius:13px;background:linear-gradient(145deg,#0e2824,#0b1c28)}
      #sfEmployeePortal .sf-qr-scan-inline-copy{min-width:0}.sf-qr-scan-inline-copy b{display:block;color:#eef7ff;font-size:13px}.sf-qr-scan-inline-copy small{display:block;margin-top:4px;color:#91a8bb;font-size:10px;line-height:1.45}
      .sf-qr-scan-backdrop{position:fixed;inset:0;z-index:52000;display:grid;place-items:center;padding:16px;background:rgba(2,7,13,.92);backdrop-filter:blur(8px)}
      .sf-qr-scan-modal{width:min(520px,96vw);max-height:94dvh;overflow:auto;border:1px solid #31536a;border-radius:20px;background:linear-gradient(180deg,#101f2d,#07131f);box-shadow:0 30px 100px #000b;color:#eef7ff}
      .sf-qr-scan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 20px 14px;border-bottom:1px solid #20384b}.sf-qr-scan-head h2{margin:4px 0 4px;font-size:21px}.sf-qr-scan-head p{margin:0;color:#8fa7ba;font-size:11px;line-height:1.45}.sf-qr-scan-close{width:42px;height:42px;flex:0 0 42px;border:1px solid #31536a;border-radius:11px;background:#0b1c2a;color:#dcecf8;font-size:20px;cursor:pointer}
      .sf-qr-scan-body{padding:18px 20px 20px}.sf-qr-scan-camera{position:relative;overflow:hidden;aspect-ratio:3/4;max-height:58dvh;border:1px solid #2b5660;border-radius:16px;background:#02070c;display:grid;place-items:center}.sf-qr-scan-camera video{width:100%;height:100%;object-fit:cover}.sf-qr-scan-frame{position:absolute;inset:15%;border:2px solid #69e4cb;border-radius:18px;box-shadow:0 0 0 999px #0003,0 0 24px #55d9bd55;pointer-events:none}.sf-qr-scan-frame:before,.sf-qr-scan-frame:after{content:'';position:absolute;left:12%;right:12%;height:1px;background:#69e4cb55}.sf-qr-scan-frame:before{top:33%}.sf-qr-scan-frame:after{bottom:33%}
      .sf-qr-scan-status{margin-top:13px;padding:11px 12px;border:1px solid #29485d;border-radius:10px;background:#0b1d2b;color:#a8becf;font-size:11px;line-height:1.5}.sf-qr-scan-status.good{border-color:#286b59;background:#0e3028;color:#96ead4}.sf-qr-scan-status.bad{border-color:#763443;background:#321821;color:#ffb0bb}.sf-qr-scan-status.warn{border-color:#6f5529;background:#2b2114;color:#ffd08a}
      .sf-qr-scan-privacy{margin-top:10px;color:#71899c;font-size:9px;line-height:1.5}.sf-qr-scan-demo{margin-top:10px;padding:9px 10px;border:1px solid #5b4d86;border-radius:9px;background:#211c37;color:#c9bdff;font-size:10px;line-height:1.45}
      @media(max-width:600px){.sf-qr-scan-backdrop{padding:0}.sf-qr-scan-modal{width:100%;height:100dvh;max-height:none;border-radius:0;border:0}.sf-qr-scan-camera{max-height:none;aspect-ratio:3/4}.sf-qr-scan-inline{align-items:flex-start;flex-direction:column}.sf-qr-scan-inline .sf-qr-scan-btn{width:100%}}
    `;document.head.appendChild(s);
  }

  function validTarget(raw){
    try{
      const url=new URL(String(raw||'').trim(),location.origin);
      if(url.origin!==location.origin)return null;
      const path=url.pathname.replace(/\/+$/,'')||'/';
      if(path!=='/qr-time'&&path!=='/qr-time.html')return null;
      const token=(url.searchParams.get('t')||'').trim();
      if(!/^[0-9a-f]{64}$/i.test(token))return null;
      return '/qr-time?t='+encodeURIComponent(token);
    }catch{return null}
  }

  function injectButtons(){
    if(B.role!=='EMPLOYEE')return;
    css();
    const status=document.getElementById('sfEmployeeQrStatus');
    if(status&&!status.querySelector('[data-sf-qr-scan]')){
      const a=document.createElement('div');a.className='sf-qr-scan-actions';a.innerHTML='<button type="button" class="sf-qr-scan-btn" data-sf-qr-scan>📷 QR-Code scannen</button>';status.appendChild(a);
    }
    const time=document.querySelector('#sfEmployeePortal .sf-portal-card[data-sf-portal-section="time"]');
    if(time&&!time.querySelector('.sf-qr-scan-inline')){
      const box=document.createElement('section');box.className='sf-qr-scan-inline';box.innerHTML='<div class="sf-qr-scan-inline-copy"><b>📷 QR-Zeiterfassung</b><small>Kommen und Gehen direkt mit der Smartphone-Kamera am Objekt/Einsatzort erfassen.</small></div><button type="button" class="sf-qr-scan-btn" data-sf-qr-scan>QR-Code scannen</button>';time.insertBefore(box,time.firstChild);
    }
  }

  function stopCamera(){
    scanning=false;
    if(scanTimer){clearTimeout(scanTimer);scanTimer=null}
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    const video=document.querySelector('#sfQrScannerModal video');if(video)video.srcObject=null;
  }

  function closeModal(){stopCamera();document.getElementById('sfQrScannerModal')?.remove()}
  function setStatus(text,type=''){const n=document.querySelector('#sfQrScannerModal .sf-qr-scan-status');if(n){n.className='sf-qr-scan-status '+type;n.textContent=text}}

  async function loadJsQr(){
    if(typeof window.jsQR==='function')return window.jsQR;
    if(decoderPromise)return decoderPromise;
    decoderPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=JSQR_LIB;s.async=true;s.crossOrigin='anonymous';s.dataset.sfJsQr='1';
      s.onload=()=>typeof window.jsQR==='function'?resolve(window.jsQR):reject(new Error('QR-Erkennung konnte nicht initialisiert werden.'));
      s.onerror=()=>reject(new Error('QR-Erkennung konnte nicht geladen werden.'));
      document.head.appendChild(s);
    }).catch(e=>{decoderPromise=null;throw e});
    return decoderPromise;
  }

  async function handleResult(raw){
    const target=validTarget(raw);
    if(!target){setStatus('Dieser QR-Code gehört nicht zu einer gültigen SchichtFunk-Zeiterfassung. Bitte den QR-Code am Einsatzort scannen.','bad');return false}
    stopCamera();
    if(demo()){
      setStatus('QR-Code erkannt. Demo-Modus: Es wird keine echte Zeitbuchung geöffnet oder gespeichert.','good');
      return true;
    }
    setStatus('SchichtFunk-QR erkannt. Sichere Buchungsprüfung wird geöffnet …','good');
    setTimeout(()=>location.assign(target),350);
    return true;
  }

  async function scanWithBarcodeDetector(video){
    let detector;
    try{
      const formats=typeof BarcodeDetector.getSupportedFormats==='function'?await BarcodeDetector.getSupportedFormats():[];
      detector=new BarcodeDetector(formats.includes('qr_code')?{formats:['qr_code']}:undefined);
    }catch{return false}
    const tick=async()=>{
      if(!scanning)return;
      try{
        if(video.readyState>=2){
          const codes=await detector.detect(video);
          if(codes?.length&&await handleResult(codes[0].rawValue))return;
        }
      }catch(e){console.debug('[SchichtFunk QR Scanner]',e?.message||e)}
      scanTimer=setTimeout(tick,140);
    };
    tick();return true;
  }

  async function scanWithCanvas(video){
    const jsQR=await loadJsQr();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('QR-Erkennung wird von diesem Browser nicht unterstützt.');
    const tick=async()=>{
      if(!scanning)return;
      try{
        if(video.readyState>=2&&video.videoWidth>0){
          const max=720,scale=Math.min(1,max/video.videoWidth);canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const image=ctx.getImageData(0,0,canvas.width,canvas.height);const code=jsQR(image.data,image.width,image.height,{inversionAttempts:'attemptBoth'});
          if(code?.data&&await handleResult(code.data))return;
        }
      }catch(e){console.debug('[SchichtFunk QR Scanner]',e?.message||e)}
      scanTimer=setTimeout(tick,180);
    };
    tick();
  }

  async function startCamera(){
    const video=document.querySelector('#sfQrScannerModal video');if(!video)return;
    if(!navigator.mediaDevices?.getUserMedia){setStatus('Dieser Browser unterstützt keinen direkten Kamerazugriff. Bitte den QR-Code mit der normalen Smartphone-Kamera öffnen.','bad');return}
    try{
      setStatus('Kamera wird gestartet … Bitte Zugriff erlauben.');
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}}});
      video.srcObject=stream;video.setAttribute('playsinline','');video.muted=true;await video.play();scanning=true;
      setStatus('Kamera aktiv · QR-Code innerhalb des Rahmens halten.');
      if('BarcodeDetector' in window){const native=await scanWithBarcodeDetector(video);if(native)return}
      await scanWithCanvas(video);
    }catch(e){
      stopCamera();
      const name=String(e?.name||''),msg=/NotAllowed|Permission/i.test(name)?'Kamerazugriff wurde nicht erlaubt. Bitte Kamera für SchichtFunk freigeben oder den QR-Code mit der normalen Smartphone-Kamera scannen.':/NotFound|DevicesNotFound/i.test(name)?'Keine Kamera gefunden. Bitte den QR-Code mit einem Smartphone scannen.':'Kamera konnte nicht gestartet werden. Bitte Browser-Berechtigung prüfen oder die normale Smartphone-Kamera verwenden.';
      setStatus(msg,'bad');console.debug('[SchichtFunk QR Scanner]',e?.message||e);
    }
  }

  function openModal(){
    if(B.role!=='EMPLOYEE')return;css();closeModal();
    const back=document.createElement('div');back.id='sfQrScannerModal';back.className='sf-qr-scan-backdrop';back.innerHTML=`<section class="sf-qr-scan-modal" role="dialog" aria-modal="true" aria-labelledby="sfQrScanTitle"><header class="sf-qr-scan-head"><div><div style="font-size:9px;font-weight:900;letter-spacing:.14em;color:#6edfc7">MITARBEITER · ZEITERFASSUNG</div><h2 id="sfQrScanTitle">QR-Code scannen</h2><p>Kamera auf den SchichtFunk-QR-Code am Objekt/Einsatzort richten.</p></div><button type="button" class="sf-qr-scan-close" aria-label="Scanner schließen">×</button></header><div class="sf-qr-scan-body"><div class="sf-qr-scan-camera"><video autoplay muted playsinline></video><div class="sf-qr-scan-frame" aria-hidden="true"></div></div><div class="sf-qr-scan-status">Scanner wird vorbereitet …</div>${demo()?'<div class="sf-qr-scan-demo"><b>Demo-Modus:</b> Die Kamera darf den QR-Code erkennen, aber es wird keine echte Zeitbuchung geöffnet oder gespeichert.</div>':''}<div class="sf-qr-scan-privacy">🔒 Die Kamerabilder werden nur lokal im Browser zur QR-Erkennung verarbeitet und nicht gespeichert oder hochgeladen.</div></div></section>`;
    document.body.appendChild(back);back.querySelector('.sf-qr-scan-close').onclick=closeModal;back.addEventListener('click',e=>{if(e.target===back)closeModal()});
    back.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});back.querySelector('.sf-qr-scan-close').focus();startCamera();
  }

  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-sf-qr-scan]');if(b){e.preventDefault();openModal()}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&document.getElementById('sfQrScannerModal'))closeModal()});
  const observer=new MutationObserver(()=>injectButtons());observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(injectButtons,2500);setTimeout(injectButtons,700);
})();
