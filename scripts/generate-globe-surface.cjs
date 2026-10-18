// Offline authoring tool. Uses only our procedural colors and the included Natural Earth geometry.
// Run: node scripts/generate-globe-surface.cjs (requires the project's Playwright Chromium).
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const functions="    const float PI=3.14159265359;\n    float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.71,.37));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}\n    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);\n      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),\n        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}\n    float fbm(vec3 p){float n=0.;n+=noise(p)*.53;p=p*2.03+7.1;n+=noise(p)*.27;p=p*2.01+3.7;n+=noise(p)*.13;p=p*2.07+5.3;n+=noise(p)*.07;return n;}\n    float belt(vec2 geo,vec2 center,vec2 spread){vec2 d=(geo-center)/spread;return exp(-dot(d,d)*2.);}\n    float mountains(vec2 geo){return clamp(\n      belt(geo,vec2(10.,46.7),vec2(8.,1.4)) + belt(geo,vec2(14.,65.),vec2(5.,10.))*.65 +\n      belt(geo,vec2(24.,47.),vec2(3.,2.5))*.7 + belt(geo,vec2(22.,42.),vec2(3.,4.))*.6 +\n      belt(geo,vec2(43.,42.),vec2(8.,2.)) + belt(geo,vec2(85.,30.),vec2(22.,6.)) +\n      belt(geo,vec2(-112.,44.),vec2(7.,20.)) + belt(geo,vec2(-71.,-22.),vec2(4.,35.)) +\n      belt(geo,vec2(-4.,31.),vec2(12.,3.))*.65,0.,1.);}\n";
const fragment='precision highp float; uniform float uLayer;'+functions+`
void main(){
 vec2 geo=vec2(gl_FragCoord.x/4096.*360.-180.,gl_FragCoord.y/2048.*180.-90.);
 float lon=geo.x*PI/180.,lat=geo.y*PI/180.;
 vec3 world=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
 float broad=fbm(world*8.),detail=fbm(world*28.);
 vec3 color;
 if(uLayer<.5){
  color=mix(vec3(.018,.075,.15),vec3(.035,.20,.29),broad*.65+detail*.06);
 }else if(uLayer<1.5){
  float ridge=mountains(geo);
  float desert=smoothstep(10.,20.,geo.y)*(1.-smoothstep(29.,37.,geo.y))*smoothstep(-25.,-14.,geo.x)*(1.-smoothstep(55.,75.,geo.x));
  desert=max(desert,belt(geo,vec2(133.,-25.),vec2(23.,12.)));
  float ice=smoothstep(66.,83.,abs(geo.y))+belt(geo,vec2(-41.,74.),vec2(18.,14.));
  color=mix(vec3(.075,.18,.12),vec3(.24,.34,.19),broad*.85+detail*.1);
  color=mix(color,mix(vec3(.49,.34,.18),vec3(.72,.58,.37),broad*.7+detail*.15),desert*.94);
  color=mix(color,vec3(.35,.35,.30)*(.83+detail*.25),ridge*.72);
  float snow=smoothstep(.54,.76,detail)*ridge*.8;
  color=mix(color,vec3(.80,.85,.84),clamp(ice+snow,0.,1.));
 }else{
  float cloud=fbm(world*8.+fbm(world*15.)*1.5);
  float alpha=smoothstep(.59,.77,cloud)*.42;
  alpha*=1.-belt(geo,vec2(11.,51.),vec2(13.,8.))*.83;
  gl_FragColor=vec4(.78,.85,.90,alpha);return;
 }
 gl_FragColor=vec4(color,1.);
}`;
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage();await page.setContent('<canvas></canvas>');
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'assets/location-map-engine-v1.js'),'utf8')});
 const data=await page.evaluate(fragment=>{
  const atlas=document.querySelector('canvas');atlas.width=4096;atlas.height=2048;
  const ctx=atlas.getContext('2d'),gpu=document.createElement('canvas');gpu.width=4096;gpu.height=2048;
  const gl=gpu.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
  const compile=(type,source)=>{let s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}'));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
  let b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  let a=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);gl.viewport(0,0,4096,2048);
  let u=gl.getUniformLocation(p,'uLayer');
  const layer=n=>{gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(u,n);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(gpu,0,0);};
  layer(0);ctx.save();ctx.beginPath();
  const d3=SFLocationMapEngine.d3,projection=d3.geoEquirectangular().scale(4096/(2*Math.PI)).translate([2048,1024]).precision(.05);
  d3.geoPath(projection,ctx)(SFLocationMapEngine.countries);ctx.clip();layer(1);ctx.restore();layer(2);
  return atlas.toDataURL('image/webp',.97).split(',')[1];
 },fragment);
 const file=path.join(root,'assets/earth-surface-original-v2.webp');fs.writeFileSync(file,Buffer.from(data,'base64'));console.log(JSON.stringify({file,bytes:fs.statSync(file).size}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

