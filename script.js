// script.js
const video  = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx    = canvas.getContext('2d');
const btn    = document.getElementById('magicBtn');
const arBox  = document.querySelector('.ar');

const cardImg = new Image();

// MediaPipe finger indices
const FINGERS = { thumb:[1,2,3,4], index:[5,6,7,8], middle:[9,10,11,12], ring:[13,14,15,16], pinky:[17,18,19,20] };

// Bone sprites
const bones = { palm:new Image(), thumb:new Image(), index:new Image(), middle:new Image(), ring:new Image(), pinky:new Image() };
bones.palm.src   = './assets/bones/palm.png';
bones.thumb.src  = './assets/bones/thumb.png';
bones.index.src  = './assets/bones/index.png';
bones.middle.src = './assets/bones/middle.png';
bones.ring.src   = './assets/bones/ring.png';
bones.pinky.src  = './assets/bones/pinky.png';

// State
let xrActive=false, phase=0, suit='', isMajor=false, vibrCount=0, vibrTimer=null, auto7T=null;

// Smoothing
const ALPHA=0.75, lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const anglerp=(a,b,t)=>{const d=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+d*t;}
const smooth = {
  palm:{cx:0,cy:0,angle:0,w:0,h:0,ready:false},
  thumb:{cx:0,cy:0,angle:0,len:0,ready:false},
  index:{cx:0,cy:0,angle:0,len:0,ready:false},
  middle:{cx:0,cy:0,angle:0,len:0,ready:false},
  ring:{cx:0,cy:0,angle:0,len:0,ready:false},
  pinky:{cx:0,cy:0,angle:0,len:0,ready:false},
};

const P=(lm,i,W,H)=>({x:lm[i].x*W,y:lm[i].y*H});
function palmPose(lm,W,H){
  const pts=[0,5,9,13,17].map(i=>P(lm,i,W,H));
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const w=Math.hypot(pts[4].x-pts[1].x, pts[4].y-pts[1].y);
  const h=Math.hypot(pts[2].x-pts[0].x, pts[2].y-pts[0].y);
  const mid=P(lm,9,W,H), wrist=P(lm,0,W,H);
  const angle=Math.atan2(mid.y-wrist.y, mid.x-wrist.x);
  return {cx,cy,w,h,angle};
}
function fingerPose(lm,f,W,H){
  const [mcp,, ,tip]=FINGERS[f]; const A=P(lm,mcp,W,H), B=P(lm,tip,W,H);
  return {cx:(A.x+B.x)/2, cy:(A.y+B.y)/2, angle:Math.atan2(B.y-A.y,B.x-A.x), len:Math.hypot(B.x-A.x,B.y-A.y)};
}
// “Curl” por 3 secciones: cerrado/medio/abierto usando ángulo en PIP
const CLOSED_T=0.35, OPEN_T=0.7; // umbrales (ajustables)
function fingerOpenK(lm,f){
  const [mcp,pip,,tip]=FINGERS[f];
  const u={x:lm[mcp].x-lm[pip].x, y:lm[mcp].y-lm[pip].y};
  const v={x:lm[tip].x-lm[pip].x, y:lm[tip].y-lm[pip].y};
  const du=Math.hypot(u.x,u.y)||1, dv=Math.hypot(v.x,v.y)||1;
  const cos=(u.x/du)*(v.x/dv)+(u.y/du)*(v.y/dv);
  const theta=Math.acos(clamp(cos,-1,1))*180/Math.PI; // 0..180
  // normaliza: 60°≈cerrado → 160°≈abierto
  const k=clamp((theta-60)/(160-60),0,1);
  return k;
}
function drawBone(img,cx,cy,angle,W,H,alpha=0.9){
  if(!img.complete||!img.naturalWidth) return;
  const ar=img.naturalHeight/img.naturalWidth;
  const w=W,h=H??(W*ar);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);ctx.globalAlpha=alpha;ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
}

// MediaPipe
const hands=new Hands({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
hands.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:0.7,minTrackingConfidence:0.7});
hands.onResults(onResults);

// Cam
startCamera().then(loop).catch(err => {
  console.error('No se pudo iniciar la cámara', err);
  alert('No se pudo acceder a la cámara. Revisa los permisos.');
});

async function startCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},
    audio:false
  });
  video.srcObject = stream;
  await video.play();
  resizeCanvas();
}
function resizeCanvas(){ const r=arBox.getBoundingClientRect(); canvas.width=r.width; canvas.height=r.height; }
addEventListener('resize',resizeCanvas);
async function loop(){ if(video.readyState>=2){ await hands.send({image:video}); } requestAnimationFrame(loop); }

// Draw
function onResults(results){
  const W=canvas.width,H=canvas.height; ctx.clearRect(0,0,W,H);
  if(!xrActive) return;
  const lm=results.multiHandLandmarks?.[0]; if(!lm) return;

  const pp=palmPose(lm,W,H), sp=smooth.palm;
  sp.cx=sp.ready?lerp(sp.cx,pp.cx,1-ALPHA):pp.cx;
  sp.cy=sp.ready?lerp(sp.cy,pp.cy,1-ALPHA):pp.cy;
  sp.angle=sp.ready?anglerp(sp.angle,pp.angle,1-ALPHA):pp.angle;
  sp.w=sp.ready?lerp(sp.w,pp.w*1.25,1-ALPHA):pp.w*1.25;
  sp.h=sp.ready?lerp(sp.h,pp.h*1.45,1-ALPHA):pp.h*1.45;
  sp.ready=true;

  // Estados por dedo (0=cerrado, 1=medio, 2=abierto)
  const states=[];
  const keys=['thumb','index','middle','ring','pinky'];
  const perFingerData = [];
  for(const key of keys){
    const k=fingerOpenK(lm,key);
    const state = (k < CLOSED_T) ? 0 : (k < OPEN_T) ? 1 : 2;
    states.push(state);

    const fp=fingerPose(lm,key,W,H);
    const t = (state===0)?0 : (state===2)?1 : (k-CLOSED_T)/(OPEN_T-CLOSED_T); // 0..1 dentro de “medio”
    // Mezcla hacia la palma y escala por apertura
    const tgt={
      cx:   lerp(sp.cx, fp.cx, t),
      cy:   lerp(sp.cy, fp.cy, t),
      angle:anglerp(sp.angle, fp.angle, t),
      len:  lerp(0.24*sp.w, fp.len*1.05, t),
      alpha: lerp(0.0, 0.9, t) // transparencia: cerrado invisible, abierto visible
    };
    perFingerData.push({key,tgt});
  }

  const allClosed = states.every(s=>s===0);

  // Dibuja palma solo si no está completamente cerrada
  if(!allClosed){ drawBone(bones.palm, sp.cx, sp.cy, sp.angle, sp.w, sp.h, 0.95); }

  // Dibuja dedos con alpha según apertura
  for(const {key,tgt} of perFingerData){
    if(tgt.alpha<=0.01) continue;
    const s=smooth[key];
    s.cx=s.ready?lerp(s.cx,tgt.cx,1-ALPHA):tgt.cx;
    s.cy=s.ready?lerp(s.cy,tgt.cy,1-ALPHA):tgt.cy;
    s.angle=s.ready?anglerp(s.angle,tgt.angle,1-ALPHA):tgt.angle;
    s.len=s.ready?lerp(s.len,tgt.len,1-ALPHA):tgt.len;
    s.ready=true;
    const img=bones[key], ar=img.naturalHeight?(img.naturalHeight/img.naturalWidth):0.25;
    drawBone(img,s.cx,s.cy,s.angle,s.len,s.len*ar,tgt.alpha);
  }

  // Carta (si ya elegida) – la mantenemos visible incluso con mano cerrada; quítala si no quieres
  if(cardImg.complete && cardImg.naturalWidth){
    const base=Math.max(80,Math.min(0.5*sp.w,170));
    drawBone(cardImg,sp.cx,sp.cy,sp.angle,base,base,0.85);
  }
}

// Botón: activar XR + sistema de toques
btn.addEventListener('pointerup', e=>{
  const r=btn.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  if(!xrActive) xrActive=true;

  if(phase===0){
    const left=x<r.width/2, top=y<r.height/2;
    suit=(top&&left)?'H':(top&&!left)?'D':(!top&&left)?'C':'S';
    phase=1;
  }else if(phase===1){
    isMajor=x>r.width/2; phase=2;
    clearTimeout(auto7T); auto7T=setTimeout(()=>{ if(phase===2){ reveal(7); phase=0; } },1200);
  }
});
btn.addEventListener('pointerdown', ()=>{
  if(phase!==2) return; clearTimeout(auto7T); vibrCount=0; clearInterval(vibrTimer);
  vibrTimer=setInterval(()=>{ navigator.vibrate?.(100); vibrCount++; if(vibrCount>=6) clearInterval(vibrTimer); },300);
});
btn.addEventListener('pointerup', ()=>{
  if(phase!==2) return; clearInterval(vibrTimer);
  const n=(vibrCount>0)?(isMajor?vibrCount+7:vibrCount):7; reveal(n); phase=0;
});
function reveal(num){
  let v; if(num===1)v='A'; else if(num<=10)v=String(num); else if(num===11)v='J'; else if(num===12)v='Q'; else v='K';
  const s=suit.toLowerCase(); cardImg.src=`./assets/${v}${s}.svg`;
}