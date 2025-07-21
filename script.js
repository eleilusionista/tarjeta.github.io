// script.js

// ----- Elementos DOM -----
const video      = document.getElementById('video');
const canvas     = document.getElementById('overlay');
const ctx        = canvas.getContext('2d');
const magicBtn   = document.getElementById('magicBtn');

// ----- Imágenes de superposición -----
const boneImage  = new Image();
boneImage.src    = './assets/huesos.png';           // PNG transparente con huesos
let cardImage    = new Image();                      // Se asignará al revelar

// ----- Variables de control de toques -----
let phase       = 0;       // 0=espera pinta, 1=espera mayor/menor, 2=espera largo
let suit         = '';     // 'H','C','D','S'
let isMajor      = false;  // true = >7, false = <7
let vibrCount    = 0;      // contador de vibraciones
let vibrInterval = null;
let touchStart   = 0;      // instante del tercer toque

// ----- Inicializar MediaPipe Hands -----
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

// ----- Iniciar cámara -----
const camera = new Camera(video, {
  onFrame: async () => { await hands.send({ image: video }); },
  width: 640,
  height: 480
});
camera.start();

// ----- Dibujar cada frame -----
function onResults(results) {
  // Ajusta canvas al video
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Si hay mano detectada, dibuja huesos y carta
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    // Posición de la palma: landmark[0]
    const x = lm[0].x * canvas.width;
    const y = lm[0].y * canvas.height;

    // Dibuja huesos centrados en la palma
    const boneSize = 200;
    ctx.drawImage(boneImage, x - boneSize/2, y - boneSize/2, boneSize, boneSize);

    // Si ya hay carta elegida, dibújala
    if (cardImage.src) {
      const cardSize = 100;
      ctx.drawImage(cardImage, x - cardSize/2, y - cardSize/2, cardSize, cardSize);
    }
  }
}

// ----- Lógica de toques en el botón -----

// 1er y 2º toque en touchend
magicBtn.addEventListener('touchend', e => {
  const rect = magicBtn.getBoundingClientRect();
  const tx   = e.changedTouches[0].clientX - rect.left;
  const ty   = e.changedTouches[0].clientY - rect.top;

  if (phase === 0) {
    // 1er toque: cuadrante -> pinta
    const left  = tx < rect.width/2;
    const top   = ty < rect.height/2;
    if (top && left)      suit = 'H'; // Corazones
    else if (top && !left) suit = 'D'; // Diamantes
    else if (!top && left) suit = 'C'; // Tréboles
    else                   suit = 'S'; // Picas
    phase = 1;
  }
  else if (phase === 1) {
    // 2º toque: mitad izq/der -> menor/mayor que 7
    isMajor = tx > rect.width/2;
    phase   = 2;
  }
});

// 3er toque: inicia medición en touchstart
magicBtn.addEventListener('touchstart', () => {
  if (phase !== 2) return;
  vibrCount  = 0;
  touchStart = Date.now();
  // Vibrar cada 300ms hasta 6 veces
  vibrInterval = setInterval(() => {
    navigator.vibrate(100);
    vibrCount++;
    if (vibrCount >= 6) clearInterval(vibrInterval);
  }, 300);
});

// Cierra medición y revela carta en el siguiente touchend
magicBtn.addEventListener('touchend', () => {
  if (phase !== 2) return;
  clearInterval(vibrInterval);

  // Determina valor numérico
  let num;
  if (vibrCount > 0) {
    num = isMajor ? vibrCount + 7 : vibrCount;
  } else {
    num = 7;
  }

  // Mapea num a valor de carta
  let value;
  if (num === 1)      value = 'A';
  else if (num <= 10) value = String(num);
  else if (num === 11) value = 'J';
  else if (num === 12) value = 'Q';
  else if (num === 13) value = 'K';
  else                 value = String(num);

  // Crea nombre de archivo: e.g. '9H.png'
  const fileName = `${value}${suit}.png`;
  showCard(fileName);

  phase = 0; // reinicia secuencia
});

// ----- Mostrar la carta elegida -----
function showCard(fileName) {
  cardImage.src = `./assets/cartas/${fileName}`;
}