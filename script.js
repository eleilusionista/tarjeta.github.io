// script.js

// --- Elementos del DOM ---
const video    = document.getElementById('video');
const canvas   = document.getElementById('overlay');
const ctx      = canvas.getContext('2d');
const magicBtn = document.getElementById('magicBtn');

// --- Imágenes superpuestas ---
const boneImage = new Image();
boneImage.src   = './assets/huesos.png';  // Asegúrate de tener huesos.png en assets/
const cardImage = new Image();             // Se cargará dinámicamente

// --- Variables de fase y selección ---
let phase     = 0;    // 0=pinta, 1=mayor/menor, 2=valor largo
let suit      = '';   // 'H','C','D','S'
let isMajor   = false;
let vibrCount = 0;
let vibrIntv  = null;

// --- Iniciar MediaPipe Hands ---
const hands = new Hands({
  locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
  modelComplexity: 1,
  maxNumHands: 1,
  minDetectionConfidence: 0.8,
  minTrackingConfidence: 0.8
});
hands.onResults(onResults);

// --- Iniciar cámara ---
const camera = new Camera(video, {
  onFrame: async () => { await hands.send({ image: video }); },
  width: 640,
  height: 480
});
camera.start();

// --- Dibuja cada frame ---
function onResults(results) {
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiHandLandmarks?.length) {
    const lm = results.multiHandLandmarks[0];
    // Coordenadas de la palma (landmark 0)
    const x = lm[0].x * canvas.width;
    const y = lm[0].y * canvas.height;

    // Dibuja huesos centrados
    const sizeBone = 200;
    ctx.drawImage(boneImage, x - sizeBone/2, y - sizeBone/2, sizeBone, sizeBone);

    // Dibuja carta si ya fue elegida
    if (cardImage.src) {
      const sizeCard = 100;
      ctx.drawImage(cardImage, x - sizeCard/2, y - sizeCard/2, sizeCard, sizeCard);
    }
  }
}

// --- Secuencia de toques ---

// 1er y 2º toque: touchend
magicBtn.addEventListener('touchend', e => {
  const rect = magicBtn.getBoundingClientRect();
  const tx   = e.changedTouches[0].clientX - rect.left;
  const ty   = e.changedTouches[0].clientY - rect.top;

  if (phase === 0) {
    // 1er toque: cuadrante → pinta
    const left = tx < rect.width/2;
    const top  = ty < rect.height/2;
    if (top && left)      suit = 'H'; // Corazones
    else if (top && !left) suit = 'D'; // Diamantes
    else if (!top && left) suit = 'C'; // Tréboles
    else                   suit = 'S'; // Picas
    phase = 1;
  }
  else if (phase === 1) {
    // 2º toque: mitad izq/der → menor/mayor 7
    isMajor = tx > rect.width/2;
    phase = 2;
  }
});

// 3er toque: iniciar vibración en touchstart
magicBtn.addEventListener('touchstart', () => {
  if (phase !== 2) return;
  vibrCount = 0;
  // Vibrar cada 300ms hasta 6 veces
  vibrIntv = setInterval(() => {
    navigator.vibrate(100);
    vibrCount++;
    if (vibrCount >= 6) clearInterval(vibrIntv);
  }, 300);
});

// Al soltar para valor y revelar carta
magicBtn.addEventListener('touchend', () => {
  if (phase !== 2) return;
  clearInterval(vibrIntv);

  // Determina número: si vibrCount>0, usa vibrCount y mayor/menor
  let num;
  if (vibrCount > 0) {
    num = isMajor ? vibrCount + 7 : vibrCount;
  } else {
    num = 7;
  }

  // Mapea número a valor de carta
  let value;
  if (num === 1)       value = 'A';
  else if (num <= 10)  value = String(num);
  else if (num === 11) value = 'J';
  else if (num === 12) value = 'Q';
  else if (num === 13) value = 'K';
  else                  value = String(num);

  // Mostrar carta usando SVGs en assets/
  showCard(value, suit);
  phase = 0;  // Reset para nueva lectura
});

// --- Función para cargar el SVG correcto ---
function showCard(value, suit) {
  const s = suit.toLowerCase();         // 'h','c','d','s'
  const fileName = `${value}${s}.svg`;  // p.ej. '9h.svg'
  cardImage.src = `./assets/${fileName}`;
}
```0