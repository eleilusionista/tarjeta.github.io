// script.js

// ---------- DOM ----------
const video  = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx    = canvas.getContext('2d');
const btn    = document.getElementById('magicBtn');
const arBox  = document.querySelector('.ar');

// ---------- Cartas ----------
const cardImg = new Image(); // se carga cuando revelas

// ---------- Landmarks por dedo (MediaPipe) ----------
const FINGERS = {
  thumb:  [1,2,3,4],
  index:  [5,6,7,8],
  middle: [9,10,11,12],
  ring:   [13,14,15,16],
  pinky:  [17,18,19,20],
};

// ---------- Sprites de huesos ----------
const bones = {
  palm:   new Image(),
  thumb:  new Image(),
  index:  new Image(),
  middle: new Image(),
  ring:   new Image(),
  pinky:  new Image(),
};
bones.palm.src   = './assets/bones/palm.png';
bones.thumb.src  = './assets/bones/thumb.png';
bones.index.src  = './assets/bones/index.png';
bones.middle.src = './assets/bones/middle.png';
bones.ring.src   = './assets/bones/ring.png';
bones.pinky.src  = './assets/bones/pinky.png';

// ---------- Estado UI / magia ----------
let xrActive = false;   // mostrar huesos tras primer toque
let phase    = 0;       // 0=pinta, 1=</>7, 2=valor (toque largo)
let suit     = '';      // 'H','C','D','S'
let isMajor  = false;   // derecha => >7
let vibrCount= 0;
let vibrTimer= null;
let auto7T   = null;

// ---------- Suavizado ----------
const ALPHA = 0.75;
const smooth = {
  palm:  {cx:0, cy:0, angle:0, w:0, h:0, ready:false},
  thumb: {cx:0, cy:0, angle:0, len:0, ready:false},
  index: {cx:0, cy:0, angle:0, len:0, ready:false},
  middle:{cx:0, cy:0, angle:0, len:0, ready:false},
  ring:  {cx:0, cy:0, angle:0, len:0, ready:false},
  pinky: {cx:0, cy:0, angle:0, len:0, ready:false},
};
const lerp   = (a,b,t)=> a + (b-a)*t;
const clamp  = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));
const anglerp= (a,b,t)=> { const d=Math.atan2(Math.sin(b-a),Math.cos(b-a)); return a + d*t; };

// ---------- Helpers pose ----------
const P = (lm,i,W,H)=> ({x: lm[i].x*W, y: lm[i].y*H});
function fingerPose(lm, finger, W, H){
  const [mcp, , , tip] = FINGERS[finger];
  const A = P(lm, mcp, W, H), B = P(lm, tip, W, H);
  return { cx:(A.x+B.x)/2, cy:(A.y+B.y)/2,
           angle: Math.atan2(B.y-A.y, B.x-A.x),
           len: Math.hypot(B.x-A.x, B.y-A.y) };
}
function palmPose(lm, W, H){
  const pts = [0,5,9,13,17].map(i=>P(lm,i,W,H));
  const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const w  = Math.hypot(pts[4].x-pts[1].x, pts[4].y-pts[1].y);
  const h  = Math.hypot(pts[2].x-pts[0].x, pts[2].y-pts[0].y);
  const mid= P(lm,9,W,H), wrist=P(lm,0,W,H);
  const angle = Math.atan2(mid.y-wrist.y, mid.x-wrist.x);
  return {cx, cy, w, h, angle};
}

/* Factor de “apertura” del dedo (0 = colapsado en la palma, 1 = completamente extendido).
   Nos basamos en la longitud MCP→TIP normalizada por la altura de la palma.
*/
function fingerOpenK(lm, finger, W, H, palmH){
  const [mcp, , , tip] = FINGERS[finger];
  const A = P(lm, mcp, W, H), B = P(lm, tip, W, H);
  const len = Math.hypot(B.x-A.x, B.y-A.y);
  const k = (len - 0.22*palmH) / (0.75*palmH); // umbrales heurísticos
  return clamp(k, 0, 1);
}

function drawBone(img, cx, cy, angle, targetW, targetH, alpha=0.9){
  if(!img.complete || !img.naturalWidth) return;
  const ar = img.naturalHeight / img.naturalWidth;
  const W = targetW, H = targetH ?? (W * ar);
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle); ctx.globalAlpha=alpha;
  ctx.drawImage(img, -W/2, -H/2, W, H);
  ctx.restore();
}

// ---------- MediaPipe ----------
const hands = new Hands({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
});
hands.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:0.7, minTrackingConfidence:0.7 });
hands.onResults(onResults);

// ---------- Cámara ----------
startCamera().then(loop).catch(()=>{});
async function startCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} },
    audio:false
  });
  video.srcObject = stream;
  await video.play();
  resizeCanvas();
}
function resizeCanvas(){
  const r = arBox.getBoundingClientRect();
  canvas.width  = r.width;
  canvas.height = r.height;
}
addEventListener('resize', resizeCanvas);

async function loop(){ if(video.readyState>=2){ await hands.send({ image: video }); } requestAnimationFrame(loop); }

// ---------- Dibujo por frame ----------
function onResults(results){
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  if(!xrActive) return;
  const lm = results.multiHandLandmarks?.[0];
  if(!lm) return;

  // PALMA (suavizada)
  const pp = palmPose(lm, W, H);
  const sp = smooth.palm;
  sp.cx = sp.ready ? lerp(sp.cx, pp.cx, 1-ALPHA) : pp.cx;
  sp.cy = sp.ready ? lerp(sp.cy, pp.cy, 1-ALPHA) : pp.cy;
  sp.angle = sp.ready ? anglerp(sp.angle, pp.angle, 1-ALPHA) : pp.angle;
  sp.w = sp.ready ? lerp(sp.w, pp.w*1.25, 1-ALPHA) : pp.w*1.25;
  sp.h = sp.ready ? lerp(sp.h, pp.h*1.45, 1-ALPHA) : pp.h*1.45;
  sp.ready = true;

  // Dibuja palma
  drawBone(bones.palm, sp.cx, sp.cy, sp.angle, sp.w, sp.h, 0.95);

  // DEDOS (interpolamos entre PALMA y DEDO según “apertura” k)
  for(const key of ['thumb','index','middle','ring','pinky']){
    const fp = fingerPose(lm, key, W, H);
    const k  = fingerOpenK(lm, key, W, H, pp.h); // 0..1

    // Objetivo: mezclar con palma para “agrupar” cuando k≈0
    const tgt = {
      cx:    lerp(sp.cx, fp.cx, k),
      cy:    lerp(sp.cy, fp.cy, k),
      angle: anglerp(sp.angle, fp.angle, k),
      len:   lerp(0.28*sp.w, fp.len*1.05, k) // pequeño en la palma, tamaño real al abrir
    };

    const s = smooth[key];
    s.cx = s.ready ? lerp(s.cx, tgt.cx, 1-ALPHA) : tgt.cx;
    s.cy = s.ready ? lerp(s.cy, tgt.cy, 1-ALPHA) : tgt.cy;
    s.angle = s.ready ? anglerp(s.angle, tgt.angle, 1-ALPHA) : tgt.angle;
    s.len = s.ready ? lerp(s.len, tgt.len, 1-ALPHA) : tgt.len;
    s.ready = true;

    const img = bones[key];
    const ar = img.naturalHeight ? (img.naturalHeight/img.naturalWidth) : 0.25;
    drawBone(img, s.cx, s.cy, s.angle, s.len, s.len*ar, 0.9);
  }

  // Carta (si ya fue elegida) — centrada en palma con misma rotación
  if(cardImg.complete && cardImg.naturalWidth){
    const base = Math.max(80, Math.min(0.5*sp.w, 170));
    drawBone(cardImg, sp.cx, sp.cy, sp.angle, base, base, 0.85);
  }
}

// ---------- Botón: activar XR + sistema de toques secreto ----------
btn.addEventListener('pointerup', e => {
  const r = btn.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  if(!xrActive){ xrActive = true; } // activar rayos X al primer toque

  if(phase === 0){
    const left = x < r.width/2, top = y < r.height/2;
    suit = (top&&left)?'H':(top&&!left)?'D':(!top&&left)?'C':'S';
    phase = 1;
  }else if(phase === 1){
    isMajor = x > r.width/2;
    phase = 2;
    clearTimeout(auto7T);
    auto7T = setTimeout(()=>{ if(phase===2){ reveal(7); phase=0; } }, 1200);
  }
});

btn.addEventListener('pointerdown', () => {
  if(phase !== 2) return;
  clearTimeout(auto7T);
  vibrCount = 0;
  clearInterval(vibrTimer);
  vibrTimer = setInterval(() => {
    navigator.vibrate?.(100);
    vibrCount++;
    if(vibrCount >= 6) clearInterval(vibrTimer);
  }, 300);
});
btn.addEventListener('pointerup', () => {
  if(phase !== 2) return;
  clearInterval(vibrTimer);
  const n = (vibrCount>0) ? (isMajor ? vibrCount+7 : vibrCount) : 7;
  reveal(n);
  phase = 0;
});

function reveal(num){
  let v;
  if(num===1) v='A';
  else if(num<=10) v=String(num);
  else if(num===11) v='J';
  else if(num===12) v='Q';
  else if(num===13) v='K';
  const s = suit.toLowerCase(); // h/c/d/s
  cardImg.src = `./assets/${v}${s}.svg`;
}