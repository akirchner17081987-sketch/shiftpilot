/* SchichtFunk original Earth. Surface authored offline from our procedural colors
 * and the included public-domain Natural Earth geometry; no satellite imagery.
 * Mipmapped sampling, fixed render dimensions and one pass keep movement stable.
 * Relief/clouds are decorative, not measured terrain or current weather.
 */
(function () {
  'use strict';
  if (window.SFGlobeSurface) return;
  const source=(document.currentScript?.src?new URL('earth-surface-original-v2.webp',document.currentScript.src).href:'assets/earth-surface-original-v2.webp')+'?v=20261018-smooth1';
  let bitmap=null,loading=null;
  function prepare(){
    if(!loading)loading=new Promise(resolve=>{
      const image=new Image();image.decoding='async';
      image.onload=()=>{bitmap=image;resolve(true);};image.onerror=()=>resolve(false);image.src=source;
    });
    return loading;
  }
  const vertex='attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}';
  const fragment=`precision highp float;
    uniform vec2 uSize,uCenter;
    uniform float uRadius,uLongitude,uLatitude,uRoll;
    uniform sampler2D uSurface;
    const float PI=3.14159265359;
    void main(){
      vec2 pixel=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);
      vec2 q=(pixel-uCenter)/uRadius;q.y=-q.y;
      float distance=length(q),edgeWidth=1.25/uRadius;
      if(distance>1.+edgeWidth)discard;
      float z=sqrt(max(0.,1.-min(dot(q,q),1.)));
      q=mat2(cos(uRoll),-sin(uRoll),sin(uRoll),cos(uRoll))*q;
      float sl=sin(uLongitude),cl=cos(uLongitude),sp=sin(uLatitude),cp=cos(uLatitude);
      vec3 east=vec3(-sl,cl,0),north=vec3(-sp*cl,-sp*sl,cp),front=vec3(cp*cl,cp*sl,sp);
      vec3 world=normalize(q.x*east+q.y*north+z*front);
      vec2 uv=vec2(atan(world.y,world.x)/(2.*PI)+.5,asin(clamp(world.z,-1.,1.))/PI+.5);
      vec3 color;
      #ifdef SF_TEXTURE_GRAD
      vec2 dx=dFdx(uv),dy=dFdy(uv);
      dx.x=fract(dx.x+.5)-.5;dy.x=fract(dy.x+.5)-.5;
      color=texture2DGradEXT(uSurface,uv,dx,dy).rgb;
      #else
      color=texture2D(uSurface,uv,abs(uv.x-.5)>.49?-10.:0.).rgb;
      #endif
      vec3 sun=normalize(vec3(.55,.55,.85));float diffuse=dot(vec3(q,z),sun);
      float day=smoothstep(-.12,.24,diffuse);
      color*=.16+max(0.,diffuse)*1.22;
      color=mix(color*.72,color,day);
      color+=vec3(.045,.23,.35)*pow(1.-z,3.5)*(.25+day*.7);
      float alpha=1.-smoothstep(1.-edgeWidth,1.+edgeWidth,distance);
      gl_FragColor=vec4(color,alpha);
    }`;
  function create(engine,options={}){
    if(!engine?.d3||!engine?.countries)return null;
    const canvas=document.createElement('canvas');
    let gl,program,buffer,texture,disposed=false,lost=false,uploaded=false;
    try{
      gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
      if(!gl)return null;
      const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){gl.deleteShader(shader);throw Error('Globe shader unavailable');}return shader;};
      const filtered=!!gl.getExtension('OES_standard_derivatives')&&!!gl.getExtension('EXT_shader_texture_lod');
      const shaderSource=filtered?'#extension GL_OES_standard_derivatives : enable\n#extension GL_EXT_shader_texture_lod : enable\n#define SF_TEXTURE_GRAD\n'+fragment:fragment;
      program=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,shaderSource);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Globe renderer unavailable');
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      texture=gl.createTexture();
    }catch{if(buffer)gl?.deleteBuffer(buffer);if(program)gl?.deleteProgram(program);gl?.getExtension('WEBGL_lose_context')?.loseContext();return null;}
    const onLost=e=>{e.preventDefault();lost=true;};canvas.addEventListener('webglcontextlost',onLost);
    const uniforms=Object.fromEntries(['Size','Center','Radius','Longitude','Latitude','Roll','Surface'].map(n=>[n,gl.getUniformLocation(program,'u'+n)]));
    const position=gl.getAttribLocation(program,'aPosition');
    prepare().then(ok=>{if(ok&&!disposed&&!lost)options.onReady?.();});
    function upload(){
      if(uploaded)return true;if(!bitmap)return false;
      try{
      let image=bitmap;
      const limit=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),options.maxPixels&&options.maxPixels<600000?2048:4096);
      if(bitmap.width>limit){image=document.createElement('canvas');image.width=limit;image.height=limit/2;const c=image.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(bitmap,0,0,image.width,image.height);}
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
      const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      uploaded=true;return true;
      }catch{lost=true;return false;}
    }
    return{
      render(ctx,projection,width,height){
        if(disposed||lost||gl.isContextLost()||!width||!height||!upload())return false;
        // Fixed dimensions for a given viewport: never reduce resolution between frames.
        const scale=Math.min(1,Math.sqrt((options.maxPixels||900000)/(width*height)));
        const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
        if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
        const[cx,cy]=projection.translate(),radius=projection.scale(),rotation=projection.rotate(),rad=Math.PI/180;
        gl.viewport(0,0,w,h);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniforms.Surface,0);
        gl.uniform2f(uniforms.Size,w,h);gl.uniform2f(uniforms.Center,cx*scale,cy*scale);gl.uniform1f(uniforms.Radius,radius*scale);
        gl.uniform1f(uniforms.Longitude,-rotation[0]*rad);gl.uniform1f(uniforms.Latitude,-rotation[1]*rad);gl.uniform1f(uniforms.Roll,(rotation[2]||0)*rad);
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
        ctx.save();const halo=ctx.createRadialGradient(cx,cy,radius*.988,cx,cy,radius*1.045);
        halo.addColorStop(0,'#6bcfff00');halo.addColorStop(.2,'#52bff744');halo.addColorStop(.55,'#218bc914');halo.addColorStop(1,'#218bc900');
        ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,radius*1.045,0,Math.PI*2);ctx.fill();
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(canvas,0,0,width,height);ctx.restore();return true;
      },
      dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=1;}
    };
  }
  window.SFGlobeSurface={create,prepare};prepare();
})();
