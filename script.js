// script.js

// ---------- DOM ----------
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const btn = document.getElementById('magicBtn');
const msg = document.getElementById('msg');

// ---------- Cartas ----------
const cardImg = new Image(); // se carga cuando eliges la carta

// ---------- DEDOS (índices MediaPipe) ----------
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

// ---------- Estado / toques ----------
let phase = 0;          // 0=pinta, 1=</>7, 2=valor (toque largo opcional)
let suit = '';          // 'H','C','D','S'
let isMajor = false;    // derecha => >7
let vibrCount = 0;
let vibrTimer = null;
let autoSevenTimer = null;

// ---------- Suavizado (EMA) ----------
const ALPHA = 0.75; // 0..1 (más alto => más suave)
const smooth = {
  palm:  {cx:0, cy:0, angle:0, w:0, h:0, ready:false},
  thumb: {cx:0, cy:0, angle:0, len:0, ready:false},
  index: {cx:0, cy:0, angle:0, len:0, ready:false},
  middle:{cx:0, cy:0, angle:0, len:0, ready:false},
  ring:  {cx:0, cy:0, angle:0, len:0, ready:false},
  pinky: {cx:0, cy:0, angle:0, len:0, ready:false},
};
const lerp = (a,b,t)=> a + (b-a)*t;
const anglerp = (a,b,t)=> { let d=Math.atan2(Math.sin(b-a),Math.cos(b-a)); return a + d*t; };

// ---------- Helpers ----------
const P = (lm,i,W,H)=> ({x: lm[i].x*W, y: lm[i].y*H});
function fingerPose(lm, finger, W, H){
  const [mcp, , , tip] = FINGERS[finger]; // mcp->tip
  const A = P(lm, mcp, W, H);
  const B = P(lm, tip, W, H);
  return {
    cx:(A.x+B.x)/2, cy:(A.y+B.y)/2,
    angle: Math.atan2(B.y-A.y, B.x-A.x),
    len: Math.hypot(B.x-A.x, B.y-A.y)
  };
}
function palmPose(lm, W, H){
  const pts = [0,5,9,13,17].map(i=>P(lm,i,W,H)); // muñeca + MCPs
  const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const w = Math.hypot(pts[4].x-pts[1].x, pts[4].y-pts[1].y); // ancho palma
  const h = Math.hypot(pts[2].x-pts[0].x, pts[2].y-pts[0].y); // alto palma
  const mid = P(lm,9,W,H), wrist=P(lm,0,W,H);
  const angle = Math.atan2(mid.y-wrist.y, mid.x-wrist.x);
  return {cx, cy, w, h, angle};
}
function drawBone(img, cx, cy, angle, targetW, targetH, alpha=0.9){
  if(!img.complete || !img.naturalWidth) return;
  const ar = img.naturalHeight / img.naturalWidth;
  const W = targetW, H = targetH ?? (W * ar);
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle); ctx.globalAlpha=alpha;
  ctx.drawImage(img, -W/2, -H/2, W, H);
  ctx.restore();
}

// ---------- MediaPipe Hands ----------
const hands = new Hands({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});
hands.onResults(onResults);

// ---------- Cámara (trasera) ----------
startCamera().then(loop).catch(err=>{
  console.error(err);
  msg.textContent = 'No pude acceder a la cámara. Revisa permisos/HTTPS.';
});

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
  canvas.width  = video.videoWidth  || canvas.clientWidth;
  canvas.height = video.videoHeight || canvas.clientHeight;
}
addEventListener('resize', resizeCanvas);

async function loop(){
  if(video.readyState>=2){ await hands.send({ image: video }); }
  requestAnimationFrame(loop);
}

// ---------- Dibujo por frame ----------
function onResults(results){
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const lm = results.multiHandLandmarks?.[0];
  if(!lm) return;

  // PALMA (suavizada)
  {
    const p = palmPose(lm, W, H);
    const s = smooth.palm;
    s.cx = s.ready ? lerp(s.cx, p.cx, 1-ALPHA) : p.cx;
    s.cy = s.ready ? lerp(s.cy, p.cy, 1-ALPHA) : p.cy;
    s.angle = s.ready ? anglerp(s.angle, p.angle, 1-ALPHA) : p.angle;
    s.w = s.ready ? lerp(s.w, p.w*1.25, 1-ALPHA) : p.w*1.25;
    s.h = s.ready ? lerp(s.h, p.h*1.45, 1-ALPHA) : p.h*1.45;
    s.ready = true;
    drawBone(bones.palm, s.cx, s.cy, s.angle, s.w, s.h, 0.95);
  }

  // DEDOS (suavizados)
  for(const key of ['thumb','index','middle','ring','pinky']){
    const fp = fingerPose(lm, key, W, H);
    const s = smooth[key];
    s.cx = s.ready ? lerp(s.cx, fp.cx, 1-ALPHA) : fp.cx;
    s.cy = s.ready ? lerp(s.cy, fp.cy, 1-ALPHA) : fp.cy;
    s.angle = s.ready ? anglerp(s.angle, fp.angle, 1-ALPHA) : fp.angle;
    s.len = s.ready ? lerp(s.len, fp.len*1.05, 1-ALPHA) : fp.len*1.05;
    s.ready = true;
    const img = bones[key];
    const ar = img.naturalHeight ? (img.naturalHeight/img.naturalWidth) : 0.25;
    drawBone(img, s.cx, s.cy, s.angle, s.len, s.len*ar, 0.9);
  }

  // CARTA (centrada en la palma y rotada)
  if(cardImg.complete && cardImg.naturalWidth){
    const s = smooth.palm;
    const base = Math.max(80, Math.min(0.5*s.w, 170));
    drawBone(cardImg, s.cx, s.cy, s.angle, base, base, 0.85);
  }
}

// ---------- Sistema de toques secreto ----------
btn.addEventListener('pointerup', e => {
  const r = btn.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  if(phase === 0){
    const left = x < r.width/2, top = y < r.height/2;
    suit = (top&&left)?'H':(top&&!left)?'D':(!top&&left)?'C':'S';
    phase = 1;
    msg.textContent = `Pinta: ${suit} | Ahora <7 (izq) o >7 (der)`;
  }else if(phase === 1){
    isMajor = x > r.width/2;
    phase = 2;
    msg.textContent = `Seleccionado ${isMajor?'>7':'<7'}. Mantén para A–6, o espera para 7.`;
    clearTimeout(autoSevenTimer);
    autoSevenTimer = setTimeout(()=>{
      if(phase===2){ revealWithNumber(7); phase=0; }
    }, 1200);
  }
});

btn.addEventListener('pointerdown', () => {
  if(phase !== 2) return;
  clearTimeout(autoSevenTimer);
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
  revealWithNumber(n);
  phase = 0;
});

// ---------- Carga de carta ----------
function revealWithNumber(num){
  let value;
  if(num===1) value='A';
  else if(num<=10) value=String(num);
  else if(num===11) value='J';
  else if(num===12) value='Q';
  else if(num===13) value='K';
  else value=String(num);

  const s = suit.toLowerCase(); // h/c/d/s
  const file = `${value}${s}.svg`; // p.ej. "9h.svg"
  cardImg.src = `./assets/${file}`;
  msg.textContent = `Carta: ${value}${suit}`;
}