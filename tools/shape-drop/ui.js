
(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var cv=$('cv'),ctx=cv.getContext('2d');
function say(m){$('status').textContent=m}
if(!window.Matter||!window.StarCore||!window.StarExport||!window.VideoExport){say('The physics engine failed to load.');return}

var P={W:750,H:1000,gravity:1.8,bounce:0.12,friction:0.5,gap:2,shake:0,seq:'1,3,5,10',mode:'total',stepDur:2.4,hold:2.5};
var bgStyle={mode:'solid',color:'#000000',stops:[{c:'#2a2a2a',p:0},{c:'#000000',p:1}],angle:0};
var fillStyle={mode:'solid',color:'#ffffff',stops:[{c:'#ececec',p:0},{c:'#818181',p:1}],angle:0};   // default: the solid color of the cover star
var shape=StarCore.starShape(),custom=null,playing=true,busy=false,dl=null,liveG=null;
/* ---- ajustes persistentes: se guardan en el navegador del usuario y se restauran al abrir ---- */
var STORE_KEY='sns-shape-drop-v1',NUM_KEYS=['gravity','bounce','friction','gap','shake','stepDur','hold'];
try{var saved=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
  if(saved){
    NUM_KEYS.forEach(function(k){if(saved.P&&saved.P[k]!=null){P[k]=+saved.P[k];$(k).value=saved.P[k]}});
    if(saved.P&&saved.P.seq!=null){P.seq=saved.P.seq;$('seq').value=saved.P.seq}
    if(saved.P&&saved.P.mode){P.mode=saved.P.mode;$('mode').value=saved.P.mode}
    if(saved.fill&&saved.fillv===3)fillStyle=saved.fill;   // fills saved before the new default (no fillv) are dropped once
    if(saved.alpha!=null)$('alpha').checked=!!saved.alpha;
  }
}catch(e){}
function bgCss(st){
  if(st.mode==='solid')return st.color;
  return 'linear-gradient('+st.angle+'deg,'+st.stops.map(function(s){return s.c+' '+Math.round(s.p*100)+'%'}).join(',')+')';
}
function saveSettings(){
  if(window.setFrameBg)window.setFrameBg(bgCss(bgStyle));
  try{localStorage.setItem(STORE_KEY,JSON.stringify({
    P:{gravity:$('gravity').value,bounce:$('bounce').value,friction:$('friction').value,gap:$('gap').value,shake:$('shake').value,stepDur:$('stepDur').value,hold:$('hold').value,seq:$('seq').value,mode:$('mode').value},
    bg:bgStyle,fill:fillStyle,fillv:3,alpha:$('alpha').checked}))}catch(e){}
}

var sim=StarCore.createSim(Matter,shape,P);

/* Uploaded pictures are painted with the Shape fill (solid or gradient) when the box is ticked; otherwise they keep their colors. */
function tintOn(){return !!(custom&&$('tint').checked)}
function tintKey(){return tintOn()?JSON.stringify(fillStyle)+'|'+shape.cx+'|'+shape.cy+'|'+shape.bw+'|'+shape.bh:''}
function tintCanvas(c){
  var o=document.createElement('canvas');o.width=c.width;o.height=c.height;var x=o.getContext('2d'),g=fillStyle,sh=shape;
  x.drawImage(c,0,0);x.globalCompositeOperation='source-in';
  if(g.mode==='solid')x.fillStyle=g.color;
  else{
    var a=g.angle*Math.PI/180,dx=Math.sin(a),dy=Math.cos(a),w=sh.bw*sh.u,h=sh.bh*sh.u,L=0.5*(Math.abs(dx)*w+Math.abs(dy)*h);
    var gr=x.createLinearGradient(sh.cx-dx*L,sh.cy-dy*L,sh.cx+dx*L,sh.cy+dy*L);
    g.stops.forEach(function(s){gr.addColorStop(Math.min(1,Math.max(0,s.p)),s.c)});x.fillStyle=gr;
  }
  x.fillRect(0,0,o.width,o.height);return o;
}
function curImages(){   // {bitmap, bitmaps} as they are drawn / exported (tinted or original)
  if(!custom)return {bitmap:null,bitmaps:null};
  if(!tintOn())return {bitmap:custom.bitmap,bitmaps:custom.bitmaps};
  var k=tintKey();if(!custom.tint||custom.tint.k!==k)custom.tint={k:k,bitmap:tintCanvas(custom.bitmap),bitmaps:custom.bitmaps?custom.bitmaps.map(tintCanvas):null};
  return custom.tint;
}
function mkG(){var sh=shape,im=curImages();return {W:P.W,H:P.H,bg:bgStyle,fill:fillStyle,_tk:tintKey(),shape:{outer:sh.outer,outers:sh.outers,inner:sh.inner,bw:sh.bw,bh:sh.bh,cx:sh.cx,cy:sh.cy,u:sh.u},img:im.bitmap,imgs:im.bitmaps}}
function G(){if(liveG&&liveG._tk!==tintKey())liveG=null;if(!liveG)liveG=mkG();liveG.bg=bgStyle;liveG.fill=fillStyle;return liveG}
function exportG(transparent){var g=Object.assign({},mkG());g.bg=transparent?null:bgStyle;return g}

/* ---------- fill editors (solid or gradient) ---------- */
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function cssGrad(st){return 'linear-gradient(90deg,'+st.stops.map(function(s){return s.c+' '+Math.round(s.p*100)+'%'}).join(',')+')'}
function makeEditor(root,title,st,note){
  // Solid: title, then one row with the color (hex on top) and the type menu, so two editors fit side by side.
  // Gradient: the editor takes the whole row (stops need the width).
  var box=el('div','style-ed'),head=el('div','t',title),ctl=el('div','ctl'),sel=el('select');
  [['solid','Solid'],['gradient','Gradient']].forEach(function(o){var op=el('option','',o[1]);op.value=o[0];sel.appendChild(op)});
  sel.value=st.mode;sel.setAttribute('aria-label',title+' type');box.appendChild(head);
  var solid=el('span','swatch'),sc=el('input'),hx=el('span','swatch__hex');sc.type='color';sc.value=st.color;sc.setAttribute('aria-label',title+' color');hx.setAttribute('aria-hidden','true');
  solid.appendChild(sc);solid.appendChild(hx);ctl.appendChild(solid);ctl.appendChild(sel);box.appendChild(ctl);
  function paintHex(){var v=sc.value,r=parseInt(v.substr(1,2),16),g=parseInt(v.substr(3,2),16),b=parseInt(v.substr(5,2),16);hx.textContent=v;hx.style.color=(r*299+g*587+b*114)/1000>150?'#000':'#fff'}
  var grad=el('div'),bar=el('div','gbar'),list=el('div'),add=el('button','', '+ Add stop'),angRow=el('label'),angLbl=el('span','','Angle'),ang=el('input'),angV=el('span','v');
  grad.style.display='flex';grad.style.flexDirection='column';grad.style.gap='8px';
  ang.type='range';ang.min=0;ang.max=360;ang.step=5;ang.value=st.angle;ang.setAttribute('aria-label',title+' gradient angle');
  angRow.appendChild(angLbl);angRow.appendChild(ang);angRow.appendChild(angV);
  list.style.display='flex';list.style.flexDirection='column';list.style.gap='6px';
  grad.appendChild(bar);grad.appendChild(list);grad.appendChild(add);grad.appendChild(angRow);box.appendChild(grad);
  root.appendChild(box);
  function paintList(){
    list.innerHTML='';
    st.stops.sort(function(a,b){return a.p-b.p});
    st.stops.forEach(function(s,i){
      var r=el('div','stop'),c=el('input'),p=el('input'),pc=el('span','pct',Math.round(s.p*100)+'%'),x=el('button','', '×');
      c.type='color';c.value=s.c;c.setAttribute('aria-label','Stop '+(i+1)+' color');
      p.type='range';p.min=0;p.max=100;p.step=1;p.value=Math.round(s.p*100);p.setAttribute('aria-label','Stop '+(i+1)+' position');
      x.setAttribute('aria-label','Remove stop '+(i+1));x.disabled=st.stops.length<=2;
      c.addEventListener('input',function(){s.c=c.value;bar.style.background=cssGrad(st)});
      p.addEventListener('input',function(){s.p=p.value/100;pc.textContent=p.value+'%';bar.style.background=cssGrad(st)});
      p.addEventListener('change',paintList);
      x.addEventListener('click',function(){if(st.stops.length>2){st.stops.splice(i,1);paintList()}});
      r.appendChild(c);r.appendChild(p);r.appendChild(pc);r.appendChild(x);list.appendChild(r);
    });
    add.disabled=st.stops.length>=6;bar.style.background=cssGrad(st);
  }
  add.addEventListener('click',function(){
    var s=st.stops.slice().sort(function(a,b){return a.p-b.p}),bi=0,bg=-1;
    for(var i=0;i<s.length-1;i++){var g=s[i+1].p-s[i].p;if(g>bg){bg=g;bi=i}}
    st.stops.push({c:s[bi].c,p:(s[bi].p+s[bi+1].p)/2});paintList();
  });
  function show(){var g=st.mode==='gradient';solid.classList.toggle('hidden',g);grad.classList.toggle('hidden',!g);box.classList.toggle('is-grad',g);root.classList.toggle('full',g);angV.textContent=st.angle+'°';
    if(window.ctBalance)window.ctBalance();if(window.onEditorMode)window.onEditorMode()}
  sel.addEventListener('change',function(){st.mode=sel.value;show()});
  sc.addEventListener('input',function(){st.color=sc.value;paintHex()});paintHex();
  ang.addEventListener('input',function(){st.angle=+ang.value;angV.textContent=st.angle+'°'});
  paintList();show();
}
makeEditor($('bgEd'),'Background',bgStyle);
makeEditor($('fillEd'),'Shape fill',fillStyle);
/* the gradient hint only matters when a gradient is in use */
window.onEditorMode=function(){$('fillnote').hidden=!(bgStyle.mode==='gradient'||fillStyle.mode==='gradient')};window.onEditorMode();

document.querySelector('.menu').addEventListener('input',saveSettings);
document.querySelector('.menu').addEventListener('change',saveSettings);

/* ---------- loop ---------- */
var last=performance.now(),fc=0;
function frame(now){
  var dt=(now-last)/1000;last=now;
  if(!busy){if(playing||!sim.ready)sim.update(dt);StarExport.drawScene(ctx,G(),sim.poses(),1);if(++fc%10===0){var n=Math.round(sim.stars.length/(shape.pieces?shape.pieces.length:1));if(!sim.ready){$('fillread').textContent='Calculating the tightest layouts… '+Math.round(sim.progress*100)+'%'}else $('fillread').textContent=n?('Current fill: '+Math.round(sim.fill*100)+'% of the frame area with '+n+' cop'+(n===1?'y':'ies')+' ('+Math.round(sim.scale/P.H*100)+'% of the frame height per shape).'):''}}
  requestAnimationFrame(frame);
}

/* ---------- controls ---------- */
var fmt={stepDur:function(v){return (+v).toFixed(2)+' s'},hold:function(v){return (+v).toFixed(1)+' s'},gravity:function(v){return '×'+(+v).toFixed(1)},
  shake:function(v){return (+v).toFixed(1)},bounce:function(v){return (+v).toFixed(2)},friction:function(v){return (+v).toFixed(2)},
  gap:function(v){return (+v).toFixed(1)+' px'}};
var restartKeys=['bounce','friction'],resetKeys=['gap'];
Object.keys(fmt).forEach(function(k){
  var e=$(k),o=$(k+'v');
  function upd(){P[k]=+e.value;o.textContent=fmt[k](e.value)}
  upd();
  e.addEventListener('input',function(){upd();if(k==='gravity')sim.setParams()});
  if(restartKeys.indexOf(k)>=0)e.addEventListener('change',function(){sim.restart()});
  if(resetKeys.indexOf(k)>=0)e.addEventListener('change',function(){sim.reset()});
});
function maxCopies(){var m=0;String($('seq').value).split(/[^0-9]+/).forEach(function(x){if(+x>m)m=+x});return m}
function updWarn(){$('perfwarn').hidden=maxCopies()<=60}
updWarn();
$('seq').addEventListener('input',updWarn);
$('seq').addEventListener('change',function(){updWarn();P.seq=$('seq').value;sim.reset()});
$('mode').addEventListener('change',function(){P.mode=$('mode').value;sim.reset()});
function resState(){var f=$('fmt').value;$('res').disabled=$('ratio').value==='custom'||!(f==='video'||f==='png')}   // quality only applies to video and PNG
function evn(v,d){v=Math.round(+v||d);return Math.min(4096,Math.max(64,v-v%2))}
function applyRatio(){
  var cu=$('ratio').value==='custom';$('customSize').hidden=!cu;resState();
  var ab=cu?[evn($('cw').value,1080),evn($('ch').value,1350)]:$('ratio').value.split(':').map(Number),L=1000,a=ab[0],b=ab[1];
  var w=a>=b?L:Math.round(L*a/b),h=a>=b?Math.round(L*b/a):L;
  P.W=w;P.H=h;cv.width=w;cv.height=h;$('art').style.setProperty('--ar',w/h);liveG=null;sim.setSize(w,h);
}
$('ratio').addEventListener('change',applyRatio);
['cw','ch'].forEach(function(id){$(id).addEventListener('change',function(){$(id).value=evn($(id).value,id==='cw'?1080:1350);if($('ratio').value==='custom')applyRatio()})});
$('play').onclick=function(){playing=!playing;$('play').textContent=playing?'Pause':'Play'};
$('reset').onclick=function(){sim.restart()};

/* ---------- custom shape: trace the alpha silhouette, split into convex pieces ---------- */
$('pick').onclick=function(){$('file').click()};
/* One file -> {bm (canvas, <=1024px), w, h}. SVGs are given a real size first (many only have a viewBox). */
function readPicture(f){
  return new Promise(function(res,rej){
    var isSVG=/svg/i.test(f.type)||/\.svg$/i.test(f.name),fr=new FileReader();
    fr.onload=function(){
      var src=fr.result;
      if(isSVG){
        try{
          var doc=new DOMParser().parseFromString(src,'image/svg+xml'),sv=doc.documentElement;
          if(!sv||sv.nodeName.toLowerCase()!=='svg'||doc.getElementsByTagName('parsererror').length)return rej(new Error('Could not read that SVG.'));
          var num=function(v){return v&&!/%/.test(v)?parseFloat(v):NaN},vb=(sv.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
          var sw=num(sv.getAttribute('width')),sh2=num(sv.getAttribute('height'));
          if(vb.length===4&&vb[2]>0&&vb[3]>0){if(!(sw>0&&sh2>0)){sw=vb[2];sh2=vb[3]}}
          else{if(!(sw>0&&sh2>0)){sw=sh2=512}sv.setAttribute('viewBox','0 0 '+sw+' '+sh2)}
          var kk=1024/Math.max(sw,sh2);sv.setAttribute('width',Math.round(sw*kk));sv.setAttribute('height',Math.round(sh2*kk));
          if(!sv.getAttribute('xmlns'))sv.setAttribute('xmlns','http://www.w3.org/2000/svg');
          src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(sv));
        }catch(err){return rej(new Error('Could not read that SVG.'))}
      }
      var im=new Image();
      im.onload=function(){
        var w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;if(!w||!h){w=h=512}
        var k=Math.min(1,1024/Math.max(w,h));w=Math.round(w*k);h=Math.round(h*k);
        var bm=document.createElement('canvas');bm.width=w;bm.height=h;bm.getContext('2d').drawImage(im,0,0,w,h);
        res({bm:bm,w:w,h:h});
      };
      im.onerror=function(){rej(new Error('Could not read that image.'))};
      im.src=src;
    };
    fr.onerror=function(){rej(new Error('Could not read that file.'))};
    if(isSVG)fr.readAsText(f);else fr.readAsDataURL(f);
  });
}
/* Trace the alpha silhouette of a canvas into a collision shape. Collision outline: the picture is always drawn exactly,
   but the invisible shape it collides with is kept to at most maxp convex pieces (every piece of every copy is tested
   against every other, so detail costs speed). frame (optional) makes several pieces share one coordinate frame. */
function traceBitmap(bm,w,h,maxp,frame,hull){
  var sc=512/Math.max(w,h),gw=Math.max(3,Math.round(w*sc)),gh=Math.max(3,Math.round(h*sc));
  var gc=document.createElement('canvas');gc.width=gw;gc.height=gh;var gx=gc.getContext('2d');gx.drawImage(bm,0,0,gw,gh);
  var d=gx.getImageData(0,0,gw,gh).data,g=new Uint8Array(gw*gh),n=0;
  for(var i=0;i<gw*gh;i++){if(d[i*4+3]>40){g[i]=1;n++}}
  if(!n)return null;
  if(hull){   // each piece collides as its convex hull: hooks cannot nest inside each other
    var oh=StarCore.outlinesFromGrid(g,gw,gh,w/gw,400,null);
    if(!oh||!oh.length)return {err:1};
    return {sh:StarCore.buildShape(oh,null,[StarCore.convexHull([].concat.apply([],oh))],null,frame),simple:true,opaque:n/(gw*gh)>0.985};
  }
  var sh=null,simple=false;
  [110,70,45,28,18,12].some(function(mv){
    var o=StarCore.outlinesFromGrid(g,gw,gh,w/gw,mv,window.decomp);if(!o||!o.length)return true;
    sh=StarCore.buildShape(o,window.decomp,null,null,frame);if(mv<110)simple=true;return sh.parts.length<=maxp;
  });
  if(!sh)return {err:1};
  if(sh.parts.length>maxp){   // still too many: each loose piece by its outer contour, or the whole by one
    var o2=StarCore.outlinesFromGrid(g,gw,gh,w/gw,400,null),hulls=o2.map(StarCore.convexHull);
    sh=StarCore.buildShape(o2,null,hulls.length<=maxp?hulls:[StarCore.convexHull([].concat.apply([],o2))],null,frame);simple=true;
  }
  return {sh:sh,simple:simple,opaque:n/(gw*gh)>0.985};
}
function useShape(sh,bitmap,bitmaps){custom={bitmap:bitmap,bitmaps:bitmaps||null};shape=sh;liveG=null;sim.setShape(sh)}
function fileNote(sh,r,pieces){
  var np=sh.outers.length,t;
  if(pieces>1)t='Using '+pieces+' pieces. Each one falls and collides on its own; every copy is the whole group.';
  else if(lastOne&&lastParts)t='Using the picture as one shape: its '+lastParts.length+' elements move together.';
  else t='Silhouette traced'+(np>1?': '+np+' separate pieces, they move as one shape.':'.');
  $('shapenote').textContent=t+(r.opaque?' An image is opaque (no transparency), so it collides as a rectangle.':'')+(r.simple||sh.hull?' Fine details are simplified for the collisions to keep the motion smooth; the picture itself is unchanged.':'')+(tintOn()?'':' The picture keeps its own colors.');
}
/* Several files = several pieces of one group. */
function composeLogo(items){   // same-size files are overlaid (keeps a logo exported as layers); different sizes go side by side
  var same=items.every(function(it){return it.w===items[0].w&&it.h===items[0].h}),W,H,pos;
  if(same){W=items[0].w;H=items[0].h;pos=items.map(function(){return {x:0,y:0,k:1}})}
  else{
    var mh=Math.max.apply(null,items.map(function(it){return it.h})),gap=Math.round(mh*.06),tw=items.reduce(function(a,it){return a+it.w},0)+gap*(items.length-1);
    var k=Math.min(1,1024/Math.max(tw,mh)),x=0;W=Math.round(tw*k);H=Math.round(mh*k);
    pos=items.map(function(it){var o={x:x*k,y:(mh-it.h)/2*k,k:k};x+=it.w+gap;return o});
  }
  return items.map(function(it,i){
    var c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').drawImage(it.bm,pos[i].x,pos[i].y,it.w*pos[i].k,it.h*pos[i].k);
    return c;
  });
}
function composePieces(items){
  // Each piece is trimmed to its visible pixels and the pieces are re-arranged into the most compact block (rows x columns
  // with the smallest area), so every copy of the group takes little room and the frame can be filled.
  var trimmed=items.map(function(it){
    var d=it.bm.getContext('2d').getImageData(0,0,it.w,it.h).data,x0=it.w,y0=it.h,x1=-1,y1=-1;
    for(var y=0;y<it.h;y++)for(var x=0;x<it.w;x++)if(d[(y*it.w+x)*4+3]>40){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
    if(x1<0)return {bm:it.bm,sx:0,sy:0,w:it.w,h:it.h};
    return {bm:it.bm,sx:x0,sy:y0,w:x1-x0+1,h:y1-y0+1};
  });
  var mx=Math.max.apply(null,trimmed.map(function(t){return Math.max(t.w,t.h)})),gap=Math.round(mx*.06),n=trimmed.length,best=null;
  for(var cols=1;cols<=n;cols++){
    var rows=Math.ceil(n/cols),colW=[],rowH=[];
    for(var i=0;i<n;i++){var c=i%cols,r=Math.floor(i/cols);colW[c]=Math.max(colW[c]||0,trimmed[i].w);rowH[r]=Math.max(rowH[r]||0,trimmed[i].h)}
    var tw=colW.reduce(function(a,v){return a+v},0)+gap*(cols-1),th=rowH.reduce(function(a,v){return a+v},0)+gap*(rows-1);
    var score=tw*th*(1+0.15*Math.abs(Math.log(tw/th)));
    if(!best||score<best.score)best={score:score,cols:cols,colW:colW,rowH:rowH,tw:tw,th:th};
  }
  var k=Math.min(1,1024/Math.max(best.tw,best.th)),W=Math.max(8,Math.round(best.tw*k)),H=Math.max(8,Math.round(best.th*k));
  return trimmed.map(function(t,i){
    var c=i%best.cols,r=Math.floor(i/best.cols),x=0,y=0;
    for(var a=0;a<c;a++)x+=best.colW[a]+gap;for(var b2=0;b2<r;b2++)y+=best.rowH[b2]+gap;
    x+=(best.colW[c]-t.w)/2;y+=(best.rowH[r]-t.h)/2;
    var cv=document.createElement('canvas');cv.width=W;cv.height=H;
    cv.getContext('2d').drawImage(t.bm,t.sx,t.sy,t.w,t.h,x*k,y*k,t.w*k,t.h*k);
    return cv;
  });
}
var lastItems=null,lastOne=null,lastParts=null;
/* Split one picture into its loose elements (8-connected blobs of visible pixels); returns same-size canvases, one per element. */
function splitElements(it,MAXE){
  var w=it.w,h=it.h,sc=256/Math.max(w,h),gw=Math.max(3,Math.round(w*sc)),gh=Math.max(3,Math.round(h*sc));
  var gc=document.createElement('canvas');gc.width=gw;gc.height=gh;var gx=gc.getContext('2d');gx.drawImage(it.bm,0,0,gw,gh);
  var d=gx.getImageData(0,0,gw,gh).data,lab=new Int32Array(gw*gh),n=0,areas=[],cen=[];
  for(var s=0;s<gw*gh;s++){
    if(lab[s]||d[s*4+3]<=40)continue;
    n++;var st=[s],a=0,sx=0,sy=0;lab[s]=n;
    while(st.length){var c=st.pop(),cx=c%gw,cy=(c/gw)|0;a++;sx+=cx;sy+=cy;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var X=cx+dx,Y=cy+dy;if(X<0||Y<0||X>=gw||Y>=gh)continue;var q=Y*gw+X;if(!lab[q]&&d[q*4+3]>40){lab[q]=n;st.push(q)}}}
    areas[n]=a;cen[n]=[sx/a,sy/a];
  }
  if(n<2)return null;
  var ids=[];for(var i=1;i<=n;i++)ids.push(i);
  ids.sort(function(a,b){return areas[b]-areas[a]});
  var keep=ids.slice(0,Math.min(MAXE,n)),total=areas.reduce(function(a,v){return a+(v||0)},0);
  keep=keep.filter(function(id,i){return i===0||areas[id]>total*0.004});   // ignore specks: they join the nearest element
  if(keep.length<2)return null;
  var map={};
  ids.forEach(function(id){
    if(keep.indexOf(id)>=0){map[id]=keep.indexOf(id);return}
    var b=0,bd=1e18;keep.forEach(function(k,j){var dd=Math.hypot(cen[k][0]-cen[id][0],cen[k][1]-cen[id][1]);if(dd<bd){bd=dd;b=j}});map[id]=b;
  });
  var full=it.bm.getContext('2d').getImageData(0,0,w,h),fd=full.data,outs=keep.map(function(){return new Uint8ClampedArray(w*h*4)});
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){
    var o=(y*w+x)*4;if(!fd[o+3])continue;
    var gx0=Math.min(gw-1,(x*gw/w)|0),gy0=Math.min(gh-1,(y*gh/h)|0),L=lab[gy0*gw+gx0];
    if(!L){var bd2=99;for(var r=1;r<=3&&!L;r++)for(var yy=-r;yy<=r;yy++)for(var xx=-r;xx<=r;xx++){var X2=gx0+xx,Y2=gy0+yy;if(X2<0||Y2<0||X2>=gw||Y2>=gh)continue;var l2=lab[Y2*gw+X2];if(l2&&xx*xx+yy*yy<bd2){bd2=xx*xx+yy*yy;L=l2}}}
    if(!L)continue;var t=outs[map[L]];t[o]=fd[o];t[o+1]=fd[o+1];t[o+2]=fd[o+2];t[o+3]=fd[o+3];
  }
  return outs.map(function(arr){var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(arr,w,h),0,0);return {bm:c,w:w,h:h}});
}
function buildGroup(){
  var items=lastItems,keep=$('keeplayout').checked;
  try{
      var cvs=keep?composeLogo(items):composePieces(items),W=cvs[0].width,H=cvs[0].height,MAXP=12,first=cvs.map(function(c){return traceBitmap(c,W,H,MAXP,null,!$('nest').checked)});
      if(first.some(function(r){return !r})){say('One of the images has no visible pixels.');return}
      if(first.some(function(r){return r.err})){say('Could not trace one of the silhouettes.');return}
      var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      first.forEach(function(r){var s=r.sh,hw=s.bw*s.u/2,hh=s.bh*s.u/2;x0=Math.min(x0,s.cx-hw);x1=Math.max(x1,s.cx+hw);y0=Math.min(y0,s.cy-hh);y1=Math.max(y1,s.cy+hh)});
      var frame={cx:(x0+x1)/2,cy:(y0+y1)/2,u:(y1-y0)||1};
      var rs=cvs.map(function(c){return traceBitmap(c,W,H,MAXP,frame,!$('nest').checked)}),sh=StarCore.joinShapes(rs.map(function(r){return r.sh}));sh.grow=$('nest').checked?1.15:1;
      var comp=document.createElement('canvas');comp.width=W;comp.height=H;var cx2=comp.getContext('2d');cvs.forEach(function(c){cx2.drawImage(c,0,0)});
      useShape(sh,comp,cvs);
      fileNote(sh,{simple:rs.some(function(r){return r.simple}),opaque:rs.some(function(r){return r.opaque})},cvs.length);
  }catch(err){say('Could not process that image.')}
}
$('keeplayout').addEventListener('change',function(){if(lastItems&&lastItems.length>1)buildGroup()});
$('nest').addEventListener('change',function(){if(lastItems&&lastItems.length>1)buildGroup()});
$('pieceMode').addEventListener('change',function(){
  if(!lastOne)return;
  if($('pieceMode').value==='separate'&&lastParts){lastItems=lastParts;$('keepRow').hidden=$('nestRow').hidden=false;buildGroup();return}
  lastItems=null;$('keepRow').hidden=$('nestRow').hidden=true;var it=lastOne,r=traceBitmap(it.bm,it.w,it.h,12);if(r&&!r.err){useShape(r.sh,it.bm);fileNote(r.sh,r,1)}
});
$('file').addEventListener('change',function(e){
  var files=Array.prototype.slice.call(e.target.files||[],0,8);e.target.value='';if(!files.length)return;
  // a PNG / WebP keeps its own colors by default (box off); an SVG is painted with the Shape fill (box on). Either can be changed afterwards.
  var allSvg=files.every(function(f){return /svg/i.test(f.type)||/\.svg$/i.test(f.name)});
  $('tint').checked=allSvg;
  Promise.all(files.map(readPicture)).then(function(items){
    try{
      if(items.length===1){
        var it=items[0],r=traceBitmap(it.bm,it.w,it.h,12);
        if(!r){say('That image has no visible pixels.');return}
        if(r.err){say('Could not trace that silhouette.');return}
        lastOne=it;lastParts=splitElements(it,8);lastItems=null;
        $('modeRow').hidden=!lastParts;$('keepRow').hidden=$('nestRow').hidden=true;
        if(lastParts&&$('pieceMode').value==='separate'){lastItems=lastParts;$('keepRow').hidden=$('nestRow').hidden=false;buildGroup();return}
        useShape(r.sh,it.bm);fileNote(r.sh,r,1);return;
      }
      lastOne=null;lastParts=null;$('modeRow').hidden=true;lastItems=items;$('keepRow').hidden=$('nestRow').hidden=false;buildGroup();
    }catch(err){say('Could not process that image.')}
  }).catch(function(err){say(err&&err.message?err.message:'Could not read that image.')});
});

/* ---------- export ---------- */
function saveFile(name,data,mime){
  var blob=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'});
  return VideoExport.save(name,blob).then(function(r){say(r==='saved'?'Saved '+name:r==='declined'?'Save cancelled.':'Could not save the file.')});
}
var notes={video:'Records one full cycle at the chosen quality, built to loop: the end cuts straight back to the start. MP4 when your browser supports it, otherwise WebM.',
  html:'A single HTML file that replays one cycle in a loop. No libraries, works offline, easy to embed.',
  lottie:'One cycle as Lottie JSON (30 fps): every shape is its own layer with position, rotation and scale keyframes. Opens in After Effects (Bodymovin), LottieFiles and others.',
  png:'The current frame at the chosen quality.',svg:'The shape as a vector with the current fill.'};
function fmtNote(){$('fmtnote').textContent=notes[$('fmt').value]||'';resState()}
$('fmt').addEventListener('change',fmtNote);fmtNote();

function outDims(){   // exact export size: the typed one for Custom, otherwise the quality (short side) at the frame's ratio
  if($('ratio').value==='custom')return[evn($('cw').value,1080),evn($('ch').value,1350)];
  var k=(+$('res').value||1080)/Math.min(P.W,P.H);return[Math.round(P.W*k/2)*2,Math.round(P.H*k/2)*2];
}
function resK(){return outDims()[0]/P.W}
function setBusy(b){busy=b;$('export').disabled=b;$('play').disabled=b;$('reset').disabled=b}
function bake(){
  return new Promise(function(res,rej){
    try{
      var bs=StarCore.createSim(Matter,shape,Object.assign({},P));if(sim.ready)bs.setPlans(sim.getPlans());else bs.prepareAll();var nF=Math.round(bs.total*60),frames=[],i=0;
      (function chunk(){
        try{
          var t0=performance.now();
          while(i<nF&&performance.now()-t0<12){bs.update(1/60);frames.push(bs.poses());i++}
          say('Rendering one cycle… '+Math.round(i/nF*100)+'%');
          if(i<nF)setTimeout(chunk,0);else res({fps:60,frames:frames});
        }catch(e){rej(e)}
      })();
    }catch(e){rej(e)}
  });
}
function bitmapURL(){if(!custom)return null;var im=curImages();return im.bitmaps?im.bitmaps.map(function(c){return c.toDataURL('image/png')}):im.bitmap.toDataURL('image/png')}
function playVideo(bk){
  var k=resK(),od=outDims(),cw=od[0],ch=od[1],oc=document.createElement('canvas');oc.width=cw;oc.height=ch;
  var octx=oc.getContext('2d'),g=exportG(false),n=bk.frames.length;
  return VideoExport.run({canvas:oc,fps:60,period:n/60,width:cw,height:ch,status:say,
    renderAt:function(t){var i=Math.max(0,Math.min(n-1,Math.round(t*60)));StarExport.drawScene(octx,g,bk.frames[i],k)}});
}
$('export').onclick=function(){
  if(busy)return;
  var f=$('fmt').value,tr=$('alpha').checked;
  setBusy(true);
  var job;
  try{
    if(f==='png'){
      var k=resK(),od=outDims(),oc=document.createElement('canvas');oc.width=od[0];oc.height=od[1];
      StarExport.drawScene(oc.getContext('2d'),exportG(tr),sim.poses(),k);
      job=new Promise(function(res,rej){oc.toBlob(function(b){b?res(b):rej(new Error('Could not create the PNG'))},'image/png')}).then(function(b){return saveFile('shape-multiplier.png',b)});
    }else if(f==='svg'){
      job=saveFile(custom?'silhouette.svg':'star.svg',StarExport.buildShapeSVG(exportG(false)),'image/svg+xml');
    }else{
      job=bake().then(function(bk){
        if(f==='lottie')return saveFile('shape-drop.lottie.json',JSON.stringify(StarExport.buildLottie(bk,exportG(tr),bitmapURL())),'application/json');
        if(f==='html')return saveFile('shape-drop-animation.html',StarExport.buildPlayerHTML(bk,exportG(tr),bitmapURL()),'text/html');
        return playVideo(bk).then(function(r){return saveFile('shape-drop.'+r.ext,r.blob).then(function(){if(r.ext==='webm')say('Saved as WebM (MP4 is not supported by this browser).')})});
      });
    }
  }catch(e){job=Promise.reject(e)}
  job.catch(function(e){say('Export failed: '+(e&&e.message?e.message:e))}).then(function(){setBusy(false)});
};

/* Settings file: this tool keeps its own store, so Save writes it out and Load puts it back and reopens the tool. */
if(window.ToolPersist)ToolPersist.ui({name:'shape-drop',
  get:function(){saveSettings();try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){return {}}},
  set:function(st){try{localStorage.setItem(STORE_KEY,JSON.stringify(st))}catch(e){}location.reload()}});

if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){playing=false;$('play').textContent='Play'}
requestAnimationFrame(frame);
})();
