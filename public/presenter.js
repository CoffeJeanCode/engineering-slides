/* ============================================================= */
/*  Presentador — El Método de la Ingeniería (B.V. Koen)          */
/*  12 diapositivas · UI orgánica (líquido, orbe, burbujas,       */
/*  nodos conectados) alimentada por eventos de Socket.io.        */
/* ============================================================= */

const socket = io({ query: { role: 'presenter' } });
const manager = new SlideManager('#presentation-container', { yOffset: 40, stagger: 0.2 });
manager.init();

let state = null;

const slideNum = document.getElementById('slideNum');
const slideTotal = document.getElementById('slideTotal');
const slideLabel = document.getElementById('slideLabel');
const userCountEl = document.getElementById('userCount');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const revealBtn = document.getElementById('revealBtn');

slideTotal.textContent = '11';

/* ------------------------------------------------------------- */
/*  QR de conexión (Slide 1)                                      */
/* ------------------------------------------------------------- */

function renderQr(finalUrl) {
  document.getElementById('joinUrl').textContent = finalUrl;

  // Generar código QR en formato estándar (negro sobre blanco):
  // máximo contraste y legible para todos los lectores del celular.
  new QRCode(document.getElementById('qrcode'), {
    text: finalUrl,
    width: 260,
    height: 260,
    colorDark: '#000000',
    colorLight: '#ffffff',
  });
}

function qrBaseUrl() {
  return window.location.origin.replace(/\/$/, '') + '/client.html';
}

fetch('/api/config')
  .then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  })
  .then(data => {
    // Usa la URL pública inyectada por el túnel o la de localhost
    const baseUrl = String(data.url || '').replace(/\/$/, '');
    renderQr(baseUrl ? baseUrl + '/client.html' : qrBaseUrl());
  })
  .catch(err => {
    // Si /api/config no está disponible (p. ej. servidor estático o túnel caído),
    // el QR se genera con el mismo origen desde el que se abrió la página.
    console.warn("No se pudo obtener config, usando origen actual:", err);
    renderQr(qrBaseUrl());
  });

/* ============================================================= */
/*  JUEGO 1 · Reto Ping-Pong (líquido de luz)                    */
/* ============================================================= */

const ESTIMATE_CAP = 100000;

let pingPong = null;

function getPingPong() {
  if (!pingPong) pingPong = new PingPongCanvas(document.getElementById('pingCanvas'));
  return pingPong;
}

function renderEstimate(s) {
  const ests = s.data.estimates;
  const avg = ests.length ? ests.reduce((a, b) => a + b, 0) / ests.length : 0;

  document.getElementById('estCount').textContent = ests.length;
  document.getElementById('timerNum').textContent = s.data.estimateOpen ? s.timeLeft : '0';

  // Una pelota por estimación: al cambiar las estimaciones, caen/rebotan en la cápsula
  const pit = getPingPong();
  pit.setCount(ests.length);
  if (ests.length && !pit.running) pit.start();

  countUp(document.getElementById('pingPongAvg'), avg, 0.8);
}

/* ============================================================= */
/*  JUEGO 2 · El Tribunal del Tiempo (tira y afloja)             */
/* ============================================================= */

function renderTribunal(s) {
  const total = s.data.culpable + s.data.inocente;
  const c = total ? Math.round((s.data.culpable / total) * 100) : 50;

  document.getElementById('numCulpable').textContent = s.data.culpable;
  document.getElementById('numInocente').textContent = s.data.inocente;
  document.getElementById('tugPct').textContent = `${c}% / ${100 - c}%`;

  tugOrb(
    document.getElementById('tugOrb'),
    document.getElementById('tugTrack'),
    s.data.culpable,
    s.data.inocente
  );
}

/* ============================================================= */
/*  JUEGO 3 · Choque de Heurísticas (impacto de tarjetas)        */
/* ============================================================= */

function renderHeur(s) {
  document.getElementById('heurA').textContent = s.data.heurA;
  document.getElementById('heurB').textContent = s.data.heurB;
  impactCards(
    document.getElementById('heurCardA'),
    document.getElementById('heurCardB'),
    s.data.heurA,
    s.data.heurB
  );
}

/* ============================================================= */
/*  JUEGO 4 · El Misterio de Gertie (burbujas flotantes)         */
/* ============================================================= */

const bubbleField = document.getElementById('bubbleField');
let lastWordCount = 0;

function renderGertie(s) {
  document.getElementById('wordCount').textContent = s.data.words.length;
  const words = s.data.words;

  if (words.length > lastWordCount) {
    words.slice(lastWordCount).forEach((w, i) => spawnBubble(bubbleField, w, i));
  }
  lastWordCount = words.length;
}

/* ============================================================= */
/*  JUEGO 5 · Mapeo de Paradigmas (nodos conectados)             */
/* ============================================================= */

let leftNodes = [];
let rightNodes = [];
let quizItems = [];
let quizBuilt = false;
let lastRevealed = 0;

function buildQuizNodes(s) {
  const leftCol = document.getElementById('leftCol');
  const rightCol = document.getElementById('rightCol');
  leftCol.innerHTML = '';
  rightCol.innerHTML = '';
  document.getElementById('mapSvg').innerHTML = '';
  leftNodes = [];
  rightNodes = [];

  s.quiz.forEach((item, i) => {
    const l = document.createElement('div');
    l.className = 'node node-left glass';
    l.innerHTML =
      `<span>${item.paradigm}</span>` +
      `<span class="votes">` +
      `<span class="dot" data-opt="A">A</span>` +
      `<span class="dot" data-opt="B">B</span>` +
      `<span class="dot" data-opt="C">C</span>` +
      `</span>`;
    leftCol.appendChild(l);
    leftNodes.push(l);

    // Los nodos de la derecha son las tecnologías (opciones)
    if (i === 0) {
      item.options.forEach((opt, j) => {
        const r = document.createElement('div');
        r.className = 'node node-right glass';
        r.innerHTML = `<span>${opt}</span><span class="meter"><span class="meter-fill"></span></span>`;
        rightCol.appendChild(r);
        rightNodes.push(r);
      });
    }
  });

  quizItems = s.quiz;
  quizBuilt = true;
}

function updateQuizChips(s) {
  const rows = s.quiz.map(() => ({ A: 0, B: 0, C: 0 }));
  const rightTotals = { A: 0, B: 0, C: 0 };

  s.data.quizAnswers.forEach((a) => {
    if (rows[a.q]) rows[a.q][a.option] = (rows[a.q][a.option] || 0) + 1;
    rightTotals[a.option] = (rightTotals[a.option] || 0) + 1;
  });

  // Nodos izquierdos: puntos velados (sin números)
  leftNodes.forEach((n, i) => {
    if (n.classList.contains('matched-left')) return;
    const c = rows[i];
    n.querySelectorAll('.dot').forEach((dot) => {
      const count = c[dot.dataset.opt] || 0;
      dot.classList.toggle('lit', count > 0);
      dot.classList.toggle('hot', count >= 3);
    });
  });

  // Nodos derechos: barra de capacidad relativa (sin número)
  const maxTotal = Math.max(1, ...Object.values(rightTotals));
  rightNodes.forEach((n, j) => {
    if (n.classList.contains('matched-right')) return;
    const fill = n.querySelector('.meter-fill');
    if (fill) fill.style.width = (rightTotals[['A', 'B', 'C'][j]] / maxTotal) * 100 + '%';
  });
}

function flashNode(node) {
  gsap.fromTo(
    node,
    { scale: 1 },
    { scale: 1.08, duration: 0.35, yoyo: true, repeat: 2, ease: 'sine.inOut', transformOrigin: 'center center' }
  );
}

function revealMatch(s, leftNode, rightNode, qIdx, optIdx) {
  const letter = ['A', 'B', 'C'][optIdx];
  const rowCount = s.data.quizAnswers.filter((a) => a.q === qIdx && a.option === letter).length;
  const totalRight = s.data.quizAnswers.filter((a) => a.option === letter).length;

  // Nodo izquierdo: los puntos velados dan paso al conteo revelado
  const votes = leftNode.querySelector('.votes');
  if (votes) {
    votes.classList.add('reveal');
    votes.innerHTML = `<span class="reveal-count">✓ ${letter} · <b>0</b></span>`;
    countUp(votes.querySelector('b'), rowCount, 0.8);
  }

  // Nodo derecho: la barra se completa y aparece el número
  const meter = rightNode.querySelector('.meter');
  if (meter) {
    meter.style.display = 'none';
    const num = document.createElement('span');
    num.className = 'meter-num';
    num.innerHTML = `<b>0</b>`;
    rightNode.appendChild(num);
    countUp(num.querySelector('b'), totalRight, 0.8);
  }

  flashNode(leftNode);
  flashNode(rightNode);
}

function renderQuiz(s) {
  const revealed = s.data.revealedQuiz;

  // Reconstruir si es la primera vez o si se reinició el juego
  if (!quizBuilt || revealed < lastRevealed) {
    buildQuizNodes(s);
    lastRevealed = 0;
  }

  updateQuizChips(s);

  // Revelado paso a paso: el cable "descubre" el camino y enciende la equivalencia
  const svg = document.getElementById('mapSvg');
  const container = document.getElementById('mapContainer');
  for (let i = lastRevealed; i < revealed; i++) {
    const idx = ['A', 'B', 'C'].indexOf(quizItems[i].answer);
    leftNodes[i].classList.add('matched-left');
    rightNodes[idx].classList.add('matched-right');
    drawCable(svg, container, leftNodes[i], rightNodes[idx], () => revealMatch(s, leftNodes[i], rightNodes[idx], i, idx));
  }
  lastRevealed = Math.max(lastRevealed, revealed);

  revealBtn.disabled = revealed >= quizItems.length;
  revealBtn.textContent =
    revealed >= quizItems.length
      ? 'Todas las equivalencias conectadas'
      : `Revelar equivalencia (${revealed}/${quizItems.length})`;
}

/* ------------------------------------------------------------- */
/*  Render global                                                 */
/* ------------------------------------------------------------- */

const GAME_RESET_KEY = { estimate: 'estimate', tribunal: 'tribunal', heur: 'heur', gertie: 'gertie', quiz: 'quiz' };

function renderAll(s) {
  if (!s) return;
  const prevSlide = state ? state.slide : -1;
  state = s;

  const meta = s.slides[s.slide];
  slideNum.textContent = String(s.slide);
  slideLabel.textContent = meta ? meta.name : '';
  prevBtn.disabled = s.slide <= 0;
  nextBtn.disabled = s.slide >= s.slides.length - 1;
  resetBtn.disabled = !meta || meta.type !== 'game';

  if (s.slide !== prevSlide) manager.goTo(s.slide);

  userCountEl.textContent = s.users;
  countUp(document.getElementById('userCountBig'), s.users, 0.7);

  if (s.slide === 2) renderEstimate(s);
  else if (pingPong && pingPong.running) pingPong.stop();
  if (s.slide === 4) renderTribunal(s);
  if (s.slide === 6) renderHeur(s);
  if (s.slide === 8) renderGertie(s);
  if (s.slide === 10) renderQuiz(s);
}

/* ------------------------------------------------------------- */
/*  Controles                                                     */
/* ------------------------------------------------------------- */

nextBtn.addEventListener('click', () => socket.emit('SLIDE_CHANGE', (state ? state.slide : 0) + 1));
prevBtn.addEventListener('click', () => socket.emit('SLIDE_CHANGE', (state ? state.slide : 0) - 1));

resetBtn.addEventListener('click', () => {
  if (!state) return;
  const meta = state.slides[state.slide];
  const key = meta && GAME_RESET_KEY[meta.game];
  if (key) socket.emit('RESET_DATA', key);
});

revealBtn.addEventListener('click', () => socket.emit('REVEAL_ANSWER'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') nextBtn.click();
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevBtn.click();
});

/* ------------------------------------------------------------- */
/*  Socket                                                        */
/* ------------------------------------------------------------- */

socket.on('STATE', renderAll);
socket.on('connect', () => console.log('Presentador conectado'));
socket.on('disconnect', () => {
  slideLabel.textContent = 'Reconectando...';
});
