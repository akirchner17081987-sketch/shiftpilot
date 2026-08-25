from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
# Landingpage logo: wrap common logo image occurrence in clickable home action
for src in ['assets/shiftpilot-logo.svg','assets/shiftpilot-logo.png','assets/shiftpilot-logo.webp']:
    needle=f'<img src="{src}"'
    i=s.find(needle)
    if i>=0:
        j=s.find('>',i)+1
        tag=s[i:j]
        if '<a ' not in s[max(0,i-120):i]:
            s=s[:i]+f'<a href="#" onclick="showLanding();return false" aria-label="Zur ShiftPilot Startseite" style="display:inline-flex;align-items:center;text-decoration:none">'+tag+'</a>'+s[j:]
        break
# App sidebar brand should also return to landing page
needle='<div class="brand">'
if needle in s and 'brand home-link' not in s:
    s=s.replace(needle,'<div class="brand home-link" onclick="showLanding()" title="Zur Startseite" style="cursor:pointer">',1)
# ensure showLanding exists alongside landing/app switch
if 'function showLanding()' not in s:
    insert='''\nfunction showLanding(){\n  const landing=document.getElementById('landingPage')||document.querySelector('.landing-page')||document.querySelector('.landing');\n  const app=document.querySelector('.app');\n  if(landing) landing.style.display='block';\n  if(app) app.style.display='none';\n  window.scrollTo({top:0,behavior:'smooth'});\n  try{history.replaceState(null,'',location.pathname)}catch(e){}\n}\n'''
    s=s.replace('</script>',insert+'</script>',1)
p.write_text(s,encoding='utf-8')
print('Logo mit Startseite verlinkt')
