const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3123;

app.get('/api/config', (req, res) => {
  res.json({ url: process.env.PUBLIC_URL || `http://localhost:${PORT}` });
});

app.use(express.static(path.join(__dirname, 'public')));

/* ================================================================== */
/*  Mapa de diapositivas (0..11)                                       */
/*  content -> diapositiva de CONTENIDO (cliente en espera)            */
/*  game    -> diapositiva de JUEGO (cliente muestra una interfaz)     */
/* ================================================================== */

const SLIDES = [
  { name: 'Inicio', type: 'content' },
  { name: 'Más allá de la Ciencia', type: 'content' },
  { name: 'Reto Ping-Pong', type: 'game', game: 'estimate' },
  { name: 'El Estado del Arte (SOTA)', type: 'content' },
  { name: 'El Tribunal del Tiempo', type: 'game', game: 'tribunal' },
  { name: 'Ayudas Plausibles pero Falibles', type: 'content' },
  { name: 'Choque de Heurísticas', type: 'game', game: 'heur' },
  { name: 'Límites del Estado del Arte', type: 'content' },
  { name: 'El Misterio de Gertie', type: 'game', game: 'gertie' },
  { name: 'La Vigencia del Método', type: 'content' },
  { name: 'Mapeo de Paradigmas', type: 'game', game: 'quiz' },
  { name: 'Ser ingeniero es ser humano', type: 'content' },
];

/* ================================================================== */
/*  Datos del mapeo de paradigmas (Juego 5)                            */
/*  Heurística clásica de Koen -> tecnología moderna                    */
/* ================================================================== */

const QUIZ = [
  {
    paradigm: '<i class="ph ph-target" style="font-size: 48px; color: #fbbf24; margin-bottom: 8px; display: block;"></i><span style="font-size:12px; font-weight: 500;">Aproximaciones sucesivas</span>',
    question: '«Aproximaciones sucesivas» equivale a…',
    options: ['Metodologías Ágiles', 'Control de Versiones (Git)', 'Microservicios'],
    answer: 'A',
  },
  {
    paradigm: '<i class="ph ph-arrow-u-up-left" style="font-size: 48px; color: #fbbf24; margin-bottom: 8px; display: block;"></i><span style="font-size:12px; font-weight: 500;">Oportunidad de retirarse</span>',
    question: '«Oportunidad de retirarse» equivale a…',
    options: ['Metodologías Ágiles', 'Control de Versiones (Git)', 'Microservicios'],
    answer: 'B',
  },
  {
    paradigm: '<i class="ph ph-puzzle-piece" style="font-size: 48px; color: #fbbf24; margin-bottom: 8px; display: block;"></i><span style="font-size:12px; font-weight: 500;">Dividir problemas</span>',
    question: '«Dividir problemas» equivale a…',
    options: ['Metodologías Ágiles', 'Control de Versiones (Git)', 'Microservicios'],
    answer: 'C',
  },
];

const ESTIMATE_SECONDS = 30;
const MAX_ESTIMATE = 100000;

const state = {
  slide: 0,
  users: 0,
  estimateDeadline: 0,
  data: {
    estimates: [],        // Juego 1
    estimateOpen: true,   // ventana de estimación abierta
    culpable: 0,          // Juego 2
    inocente: 0,          // Juego 2
    heurA: 0,             // Juego 3
    heurB: 0,             // Juego 3
    heurWinner: null,     // 'A' | 'B' | null
    words: [],            // Juego 4
    quizAnswers: [],      // Juego 5
    revealedQuiz: 0,      // Juego 5
  },
};

const clients = new Set();
const players = {}; // Nuevo: para puntajes
let estimateTimer = null;

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function snapshot() {
  return {
    slide: state.slide,
    slides: SLIDES,
    users: clients.size,
    quiz: QUIZ,
    data: { ...state.data, estimates: state.data.estimates.slice(), words: state.data.words.slice() },
    timeLeft: state.data.estimateOpen
      ? Math.max(0, Math.ceil((state.estimateDeadline - Date.now()) / 1000))
      : 0,
  };
}

function broadcast() {
  io.emit('STATE', snapshot());
}

function stopEstimateTimer() {
  if (estimateTimer) {
    clearInterval(estimateTimer);
    estimateTimer = null;
  }
  state.estimateDeadline = 0;
}

function startEstimateTimer() {
  stopEstimateTimer();
  state.data.estimateOpen = true;
  state.estimateDeadline = Date.now() + ESTIMATE_SECONDS * 1000;

  estimateTimer = setInterval(() => {
    const left = Math.max(0, Math.ceil((state.estimateDeadline - Date.now()) / 1000));
    if (left <= 0) {
      stopEstimateTimer();
      state.data.estimateOpen = false;
    }
    broadcast();
  }, 1000);
}

function changeSlide(next) {
  const idx = Number(next);
  if (!Number.isInteger(idx) || idx < 0 || idx >= SLIDES.length) return;

  state.slide = idx;

  if (SLIDES[idx].game === 'estimate') {
    startEstimateTimer();
  } else {
    stopEstimateTimer();
  }

  broadcast();
}

function resetData(key) {
  if (key === 'estimate' || key === 'all') {
    state.data.estimates = [];
    state.data.estimateOpen = true;
    if (SLIDES[state.slide].game === 'estimate') startEstimateTimer();
    else stopEstimateTimer();
  }
  if (key === 'tribunal' || key === 'all') {
    state.data.culpable = 0;
    state.data.inocente = 0;
  }
  if (key === 'heur' || key === 'all') {
    state.data.heurA = 0;
    state.data.heurB = 0;
    state.data.heurWinner = null;
  }
  if (key === 'gertie' || key === 'all') state.data.words = [];
  if (key === 'quiz' || key === 'all') {
    state.data.quizAnswers = [];
    state.data.revealedQuiz = 0;
  }
}

/* ================================================================== */
/*  Socket.io                                                          */
/* ================================================================== */

io.on('connection', (socket) => {
  const role = String(socket.handshake.query.role || 'client');

  /* ---------- Presentador ---------- */
  if (role === 'presenter') {
    socket.emit('STATE', snapshot());

    socket.on('SLIDE_CHANGE', (s) => changeSlide(s));

    socket.on('RESET_DATA', (key) => {
      resetData(String(key));
      broadcast();
    });

    socket.on('REVEAL_ANSWER', () => {
      if (state.data.revealedQuiz < QUIZ.length) state.data.revealedQuiz += 1;
      broadcast();
    });

    return;
  }

  /* ---------- Cliente / audiencia ---------- */
  clients.add(socket.id);
  socket.emit('STATE', snapshot());
  broadcast(); // actualiza el contador de usuarios del presentador

  socket.on('REGISTER_PLAYER', ({ nickname }) => {
    players[socket.id] = { 
      nickname: (nickname || "Eng_" + socket.id.slice(0,4)).substring(0,15), 
      score: 0 
    };
    socket.emit('PLAYER_READY', players[socket.id]);
    io.emit('SCORE_UPDATE', Object.values(players));
  });

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    delete players[socket.id];
    broadcast();
    io.emit('SCORE_UPDATE', Object.values(players));
  });

  /* Juego 1 — Reto Ping-Pong */
  socket.on('ESTIMATE_SUBMIT', (value) => {
    if (SLIDES[state.slide].game !== 'estimate' || !state.data.estimateOpen) return;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_ESTIMATE) {
      state.data.estimates.push(Math.round(n));
      
      // Lógica de puntaje
      if (players[socket.id]) {
        players[socket.id].score += 100;
        socket.emit('MY_SCORE_UPDATE', players[socket.id].score);
        io.emit('SCORE_UPDATE', Object.values(players));
      }
      
      broadcast();
    }
  });

  /* Juego 2 — El Tribunal del Tiempo */
  socket.on('VOTE_TIME', (side) => {
    if (SLIDES[state.slide].game !== 'tribunal') return;
    const v = String(side).toLowerCase();
    if (v === 'culpable') state.data.culpable += 1;
    else if (v === 'inocente') state.data.inocente += 1;
    else return;
    
    if (players[socket.id]) {
      players[socket.id].score += 100;
      socket.emit('MY_SCORE_UPDATE', players[socket.id].score);
      io.emit('SCORE_UPDATE', Object.values(players));
    }
    broadcast();
  });

  /* Juego 3 — Choque de Heurísticas */
  socket.on('VOTE_HEUR', (side) => {
    if (SLIDES[state.slide].game !== 'heur') return;
    const h = String(side).toUpperCase();
    if (h === 'A') state.data.heurA += 1;
    else if (h === 'B') state.data.heurB += 1;
    else return;
    state.data.heurWinner =
      state.data.heurA > state.data.heurB ? 'A' : state.data.heurB > state.data.heurA ? 'B' : null;
      
    if (players[socket.id]) {
      players[socket.id].score += 100;
      socket.emit('MY_SCORE_UPDATE', players[socket.id].score);
      io.emit('SCORE_UPDATE', Object.values(players));
    }
    broadcast();
  });

  /* Juego 4 — El Misterio de Gertie */
  socket.on('WORD_SUBMIT', (word) => {
    if (SLIDES[state.slide].game !== 'gertie') return;
    const clean = String(word || '').trim().toLowerCase().slice(0, 15);
    if (!clean || /\s/.test(clean)) return;
    state.data.words.push(clean);
    
    if (players[socket.id]) {
      players[socket.id].score += 200;
      socket.emit('MY_SCORE_UPDATE', players[socket.id].score);
      io.emit('SCORE_UPDATE', Object.values(players));
    }
    broadcast();
  });

  /* Juego 5 — Mapeo de Paradigmas */
  socket.on('QUIZ_ANSWER', (payload) => {
    if (SLIDES[state.slide].game !== 'quiz') return;
    const q = Number(payload && payload.q);
    const option = String((payload && payload.option) || '').toUpperCase();
    if (Number.isInteger(q) && q >= 0 && q < QUIZ.length && ['A', 'B', 'C'].includes(option)) {
      if (q === state.data.revealedQuiz) {
        state.data.quizAnswers.push({ q, option });
        
        if (players[socket.id]) {
          players[socket.id].score += (QUIZ[q].answer === option) ? 150 : 50;
          socket.emit('MY_SCORE_UPDATE', players[socket.id].score);
          io.emit('SCORE_UPDATE', Object.values(players));
        }
        
        broadcast();
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Presentación en línea -> http://localhost:${PORT}`);
  console.log(`Presenter -> http://localhost:${PORT}/presenter.html`);
  console.log(`Cliente   -> http://localhost:${PORT}/client.html`);
});
