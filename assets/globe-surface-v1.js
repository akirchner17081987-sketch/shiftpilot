/* SchichtFunk original procedural Earth. No photographs, textures, tiles or network calls.
 * Land/coastlines: the existing public-domain Natural Earth geometry.
 * Relief, vegetation and clouds are decorative synthesis, not measured terrain/weather.
 */
(function () {
  'use strict';
  if (window.SFGlobeSurface) return;
  const vertex = `attribute vec2 aPosition;
    void main(){gl_Position=vec4(aPosition,0.,1.);}`;
  const fragment = `precision highp float;
    uniform vec2 uSize, uCenter;
    uniform float uRadius, uLongitude, uLatitude, uRoll, uTime, uLayer;
    const float PI=3.14159265359;
    float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.71,.37));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float n=0.;n+=noise(p)*.53;p=p*2.03+7.1;n+=noise(p)*.27;p=p*2.01+3.7;n+=noise(p)*.13;p=p*2.07+5.3;n+=noise(p)*.07;return n;}
    float belt(vec2 geo,vec2 center,vec2 spread){vec2 d=(geo-center)/spread;return exp(-dot(d,d)*2.);}
    float mountains(vec2 geo){return clamp(
      belt(geo,vec2(10.,46.7),vec2(8.,1.4)) + belt(geo,vec2(14.,65.),vec2(5.,10.))*.65 +
      belt(geo,vec2(24.,47.),vec2(3.,2.5))*.7 + belt(geo,vec2(22.,42.),vec2(3.,4.))*.6 +
      belt(geo,vec2(43.,42.),vec2(8.,2.)) + belt(geo,vec2(85.,30.),vec2(22.,6.)) +
      belt(geo,vec2(-112.,44.),vec2(7.,20.)) + belt(geo,vec2(-71.,-22.),vec2(4.,35.)) +
      belt(geo,vec2(-4.,31.),vec2(12.,3.))*.65,0.,1.);}
    void main(){
      vec2 pixel=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);
      vec2 q=(pixel-uCenter)/uRadius;q.y=-q.y;
      float rr=dot(q,q);if(rr>1.)discard;
      float z=sqrt(max(0.,1.-rr));
      q=mat2(cos(uRoll),-sin(uRoll),sin(uRoll),cos(uRoll))*q;
      float sl=sin(uLongitude),cl=cos(uLongitude),sp=sin(uLatitude),cp=cos(uLatitude);
      vec3 east=vec3(-sl,cl,0),north=vec3(-sp*cl,-sp*sl,cp),front=vec3(cp*cl,cp*sl,sp);
      vec3 world=normalize(q.x*east+q.y*north+z*front);
      vec2 geo=vec2(atan(world.y,world.x),asin(clamp(world.z,-1.,1.)))*180./PI;
      vec3 normal=vec3(q,z),sun=normalize(vec3(.55,.55,.85));
      float diffuse=dot(normal,sun),day=smoothstep(-.12,.24,diffuse);
      float grain=fbm(world*185.),broad=fbm(world*11.);
      vec3 color;
      if(uLayer<.5){
        color=mix(vec3(.018,.075,.15),vec3(.035,.20,.29),broad*.65+grain*.12);
        float spec=pow(max(0.,dot(reflect(-sun,normal),vec3(0,0,1))),55.);
        color+=vec3(.16,.24,.27)*spec*.35;
      }else if(uLayer<1.5){
        float lat=abs(geo.y),ridge=mountains(geo);
        float desert=smoothstep(10.,20.,geo.y)*(1.-smoothstep(29.,37.,geo.y))*smoothstep(-25.,-14.,geo.x)*(1.-smoothstep(55.,75.,geo.x));
        desert=max(desert,belt(geo,vec2(133.,-25.),vec2(23.,12.)));
        float ice=smoothstep(66.,83.,lat)+belt(geo,vec2(-41.,74.),vec2(18.,14.));
        color=mix(vec3(.055,.15,.105),vec3(.25,.36,.19),broad*.8+grain*.2);
        color=mix(color,mix(vec3(.49,.34,.18),vec3(.73,.59,.36),grain),desert*.94);
        float crag=1.-abs(fbm(world*240.)*2.-1.);
        color=mix(color,vec3(.34,.34,.29)*( .65+grain*.65),ridge*.85);
        float snow=smoothstep(.69,.87,crag)*ridge;
        color=mix(color,vec3(.80,.86,.85),clamp(ice+snow*.9,0.,1.));
        // Fine synthesis is anchored to world coordinates, so it never swims with the camera.
        float dx=fbm((world+east*.0007)*185.)-grain;
        float dy=fbm((world+north*.0007)*185.)-grain;
        float relief=clamp(1.+(dx+dy)*4.5*(.3+ridge),.62,1.35);
        color*=relief;
      }else{
        vec3 drift=world+vec3(uTime*.000002,0,0);
        float cloud=fbm(drift*8.+fbm(drift*20.)*1.7);
        float wisps=fbm(drift*45.);
        float alpha=smoothstep(.59,.76,cloud)*(.34+wisps*.32);
        // Keep the selected European workplace region readable under the cloud veil.
        alpha*=1.-belt(geo,vec2(11.,51.),vec2(13.,8.))*.83;
        gl_FragColor=vec4(vec3(.75,.85,.91)*(.15+max(0.,diffuse)*.85),alpha*day);return;
      }
      color*=.13+max(0.,diffuse)*1.32;
      color=mix(color*.65,color,day);
      float rim=pow(1.-z,3.5);
      color+=vec3(.055,.28,.43)*rim*(.25+day*.7);
      gl_FragColor=vec4(color,1.);
    }`;
  function create(engine, options = {}) {
    if (!engine?.d3 || !engine?.countries) return null;
    const canvas = document.createElement('canvas');
    let gl, program, buffer, disposed = false, lost = false;
    try {
      gl = canvas.getContext('webgl', {alpha:true, antialias:false, depth:false,
        stencil:false, premultipliedAlpha:false, preserveDrawingBuffer:true, powerPreference:'low-power'});
      if (!gl) return null;
      const compile = (type, source) => {
        const shader = gl.createShader(type);gl.shaderSource(shader, source);gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {gl.deleteShader(shader);throw Error('Globe shader unavailable');}
        return shader;
      };
      program = gl.createProgram();
      const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error('Globe renderer unavailable');
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    } catch { if(buffer)gl?.deleteBuffer(buffer);if(program)gl?.deleteProgram(program);gl?.getExtension('WEBGL_lose_context')?.loseContext();return null; }
    const onLost = event => {event.preventDefault();lost=true;};
    canvas.addEventListener('webglcontextlost',onLost);
    const uniforms = Object.fromEntries(['Size','Center','Radius','Longitude','Latitude','Roll','Time','Layer'].map(name=>[name,gl.getUniformLocation(program,'u'+name)]));
    const position=gl.getAttribLocation(program,'aPosition');
    let pixelBudget=options.maxPixels||900000,paints=0;
    return {
      render(ctx, projection, width, height, time=0) {
        if(disposed||lost||gl.isContextLost()||!width||!height)return false;
        // Bound GPU work independently of DPR. The map's vector borders and pins stay full resolution.
        const started=performance.now();
        const scale=Math.min(1,Math.sqrt(pixelBudget/(width*height)));
        const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
        if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
        const [cx,cy]=projection.translate(),radius=projection.scale(),rotation=projection.rotate(),rad=Math.PI/180;
        gl.viewport(0,0,w,h);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        gl.uniform2f(uniforms.Size,w,h);gl.uniform2f(uniforms.Center,cx*scale,cy*scale);
        gl.uniform1f(uniforms.Radius,radius*scale);gl.uniform1f(uniforms.Longitude,-rotation[0]*rad);
        gl.uniform1f(uniforms.Latitude,-rotation[1]*rad);gl.uniform1f(uniforms.Roll,(rotation[2]||0)*rad);gl.uniform1f(uniforms.Time,time);
        const layer=value=>{gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(uniforms.Layer,value);gl.drawArrays(gl.TRIANGLES,0,6);ctx.drawImage(canvas,0,0,width,height);};
        ctx.save();
        // Atmospheric halo is painted beyond the sphere; every geographic layer uses the same projection.
        const halo=ctx.createRadialGradient(cx,cy,radius*.985,cx,cy,radius*1.065);
        halo.addColorStop(0,'#6bcfff00');halo.addColorStop(.18,'#52bff75c');halo.addColorStop(.5,'#218bc91b');halo.addColorStop(1,'#218bc900');
        ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,radius*1.065,0,Math.PI*2);ctx.fill();
        layer(0);
        ctx.save();ctx.beginPath();engine.d3.geoPath(projection,ctx)(engine.countries);ctx.clip();layer(1);ctx.restore();
        layer(2);
        ctx.restore();
        if(options.adaptive&&++paints>1&&performance.now()-started>70)pixelBudget=Math.max(50000,pixelBudget*.6);
        return true;
      },
      dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',onLost);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=1;}
    };
  }
  window.SFGlobeSurface={create};
})();
