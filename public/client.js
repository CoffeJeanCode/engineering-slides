/* ============================================================= */
/*  Cliente / Audiencia — El Método de la Ingeniería              */
/*  5 juegos sincronizados por WS + pantalla de espera            */
/*  Lógica de bloqueo: al enviar -> check verde; se desbloquea    */
/*  cuando el presentador cambia de diapositiva.                  */
/* ============================================================= */

const socket = io();
const manager = new SlideManager('#app', {
  slideClass: '.view',
  fadeOut: 0.2,
  fadeIn: 0.3,
  yOffset: 24,
  stagger: 0.1,
});
manager.init();

let state = null;

/* Vista activa según la diapositiva del presentador (0..11) */
const VIEW_FOR_SLIDE = {
  2: 'estimate',
  4: 'tribunal',
  6: 'heur',
  8: 'gertie',
  10: 'quiz',
};
const DEFAULT_VIEW = 'standby';
const VIEW_INDEX = { standby: 0, estimate: 1, tribunal: 2, heur: 3, gertie: 4, quiz: 5 };

/* ¿Diapositivas de contenido? El cliente se queda en espera. */
const CONTENT_SLIDES = [0, 1, 3, 5, 7, 9, 11];

let myView = DEFAULT_VIEW;
let answered = {};       // vista bloqueada (form oculto -> check verde)
let quizAnsweredIndex = -1;
let lastQuizRevealed = -1;

/* ------------------------------------------------------------- */
/*  UI helpers                                                    */
/* ------------------------------------------------------------- */

function viewByName(name) {
  return document.querySelector(`.view[data-view="${name}"]`);
}

function showSent(name) {
  const v = viewByName(name);
  if (!v) return;
  const form = v.querySelector('.view-form');
  const sent = v.querySelector('.view-sent');
  if (!form || !sent) return;
  answered[name] = true;

  gsap.to(form, { autoAlpha: 0, y: -14, duration: 0.28, ease: 'power2.in', onComplete: () => form.classList.add('hidden') });
  sent.classList.remove('hidden');
  gsap.fromTo(sent, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)' });
}

function showForm(name) {
  const v = viewByName(name);
  if (!v) return;
  const form = v.querySelector('.view-form');
  const sent = v.querySelector('.view-sent');
  if (!form || !sent) return;
  answered[name] = false;

  sent.classList.add('hidden');
  gsap.set(sent, { clearProps: 'all' });
  form.classList.remove('hidden');
  gsap.set(form, { autoAlpha: 1, y: 0 });
}

/* Reset de controles al entrar a una vista (nuevo juego). */
function onViewEnter(name) {
  quizAnsweredIndex = -1;
  if (name === 'estimate') {
    const input = document.getElementById('estInput');
    input.value = '';
    input.disabled = false;
    document.getElementById('estBtn').disabled = false;
    renderEstimateCountdown();
  }
  if (name === 'tribunal') {
    document.getElementById('culpableBtn').disabled = false;
    document.getElementById('inocenteBtn').disabled = false;
  }
  if (name === 'heur') {
    document.getElementById('heurABtn').disabled = false;
    document.getElementById('heurBBtn').disabled = false;
  }
  if (name === 'gertie') {
    document.getElementById('wordInput').value = '';
    document.getElementById('wordInput').disabled = false;
    document.getElementById('wordBtn').disabled = false;
  }
  if (name === 'quiz') {
    renderQuizQuestion();
  }
  showForm(name);
}

/* ------------------------------------------------------------- */
/*  Juego 1 — Reto Ping-Pong                                      */
/* ------------------------------------------------------------- */

const estInput = document.getElementById('estInput');
const estBtn = document.getElementById('estBtn');

function renderEstimateCountdown() {
  if (!state) return;
  const el = document.getElementById('estCountdown');
  if (state.data.estimateOpen) {
    el.textContent = state.timeLeft + 's';
    estInput.disabled = false;
    estBtn.disabled = false;
  } else {
    el.textContent = 'Tiempo agotado';
    estInput.disabled = true;
    estBtn.disabled = true;
  }
}

estBtn.addEventListener('click', () => {
  if (answered.estimate) return;
  const value = Number(estInput.value);
  if (estInput.value.trim() === '' || Number.isNaN(value) || value < 0) return;
  socket.emit('ESTIMATE_SUBMIT', value);
  showSent('estimate');
});

estInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') estBtn.click();
});

/* ------------------------------------------------------------- */
/*  Juego 2 — El Tribunal del Tiempo                              */
/* ------------------------------------------------------------- */

document.getElementById('culpableBtn').addEventListener('click', () => {
  if (answered.tribunal) return;
  socket.emit('VOTE_TIME', 'culpable');
  showSent('tribunal');
});

document.getElementById('inocenteBtn').addEventListener('click', () => {
  if (answered.tribunal) return;
  socket.emit('VOTE_TIME', 'inocente');
  showSent('tribunal');
});

/* ------------------------------------------------------------- */
/*  Juego 3 — Choque de Heurísticas                               */
/* ------------------------------------------------------------- */

document.getElementById('heurABtn').addEventListener('click', () => {
  if (answered.heur) return;
  socket.emit('VOTE_HEUR', 'A');
  showSent('heur');
});

document.getElementById('heurBBtn').addEventListener('click', () => {
  if (answered.heur) return;
  socket.emit('VOTE_HEUR', 'B');
  showSent('heur');
});

/* ------------------------------------------------------------- */
/*  Juego 4 — El Misterio de Gertie                               */
/* ------------------------------------------------------------- */

const wordInput = document.getElementById('wordInput');
const wordBtn = document.getElementById('wordBtn');

function submitWord() {
  const word = wordInput.value.trim().toLowerCase();
  if (!word || /\s/.test(word)) return;
  socket.emit('WORD_SUBMIT', word);
  showSent('gertie');
}

wordBtn.addEventListener('click', submitWord);
wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitWord();
});

/* ------------------------------------------------------------- */
/*  Juego 5 — Mapeo de Paradigmas                                 */
/* ------------------------------------------------------------- */

const quizQuestion = document.getElementById('quizQuestion');
const quizOptions = document.getElementById('quizOptions');

function renderQuizQuestion() {
  if (!state) return;
  const qIndex = state.data.revealedQuiz;

  if (qIndex >= state.quiz.length) {
    quizQuestion.textContent = '¡Gracias por participar!';
    quizOptions.innerHTML = '';
    return;
  }

  const item = state.quiz[qIndex];
  quizQuestion.textContent = item.question;
  quizOptions.innerHTML = '';

  const letters = ['A', 'B', 'C'];
  item.options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.className = 'w-full px-5 py-4 rounded-xl bg-slate-800 text-left text-base font-bold hover:bg-slate-700 hover:border-cyan-400 transition active:scale-95 border-2 border-transparent';
    btn.innerHTML = `<span class="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-amber-400 text-[#1a0f14] font-black mr-3">${letters[i]}</span>${text}`;
    btn.addEventListener('click', () => {
      if (answered.quiz) return;
      socket.emit('QUIZ_ANSWER', { q: qIndex, option: letters[i] });
      quizAnsweredIndex = qIndex;
      showSent('quiz');
    });
    quizOptions.appendChild(btn);
  });
}

/* ------------------------------------------------------------- */
/*  Estado global                                                 */
/* ------------------------------------------------------------- */

function render(s) {
  const prevSlide = state ? state.slide : -1;
  state = s;

  const nextView = VIEW_FOR_SLIDE[s.slide] || DEFAULT_VIEW;

  // Cambio de diapositiva -> nueva vista (desbloquea si el presentador avanzó)
  if (s.slide !== prevSlide) {
    if (myView !== nextView) {
      const idx = VIEW_INDEX[nextView];
      if (idx !== manager.current) manager.goTo(idx);
      myView = nextView;
    }
    onViewEnter(nextView);
  }

  // Countdown de la estimación (se actualiza cada segundo vía STATE)
  if (myView === 'estimate' && s.slide === 2) renderEstimateCountdown();

  // Juego 5: el presentador reveló la siguiente equivalencia
  if (s.slide === 10 && s.data.revealedQuiz !== lastQuizRevealed) {
    lastQuizRevealed = s.data.revealedQuiz;
    if (myView === 'quiz' && quizAnsweredIndex !== lastQuizRevealed) {
      quizAnsweredIndex = -1;
      showForm('quiz');
      renderQuizQuestion();
    }
  }
}

socket.on('STATE', render);
socket.on('connect', () => {
  document.getElementById('connText').textContent = 'Conectado';
  document.querySelector('#connStatus span').className = 'w-2 h-2 rounded-full bg-lime-400';
});
socket.on('disconnect', () => {
  document.getElementById('connText').textContent = 'Reconectando...';
  document.querySelector('#connStatus span').className = 'w-2 h-2 rounded-full bg-amber-400';
});
socket.on('connect_error', () => {
  document.getElementById('connText').textContent = 'Sin conexión';
  document.querySelector('#connStatus span').className = 'w-2 h-2 rounded-full bg-red-400';
});
