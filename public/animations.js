/* ============================================================= */
/*  animations.js — Editorial Animations                         */
/* ============================================================= */

gsap.registerPlugin();

/* ------------------------------------------------------------- */
/*  SlideManager                                                 */
/* ------------------------------------------------------------- */

class SlideManager {
  constructor(container, opts = {}) {
    this.root = typeof container === 'string' ? document.querySelector(container) : container;
    this.slideClass = opts.slideClass || '.slide';
    this.activeClass = opts.activeClass || 'active';
    this.animSelector = opts.animSelector || '.anim-item, [data-animate]';
    this.slides = [...this.root.querySelectorAll(this.slideClass)];
    this.current = 0;
    
    // Editorial timings: faster, sharper
    this.fadeOut = 0.2;
    this.fadeIn = 0.4;
    this.stagger = 0.08;
    this.xOffset = 30; // Use slight horizontal drift instead of vertical bounce
    this.tl = null;
  }

  goTo(index) {
    index = Math.max(0, Math.min(this.slides.length - 1, index));
    if (index === this.current) return;
    
    if (this.tl) {
      this.tl.kill();
      this.slides.forEach((s, i) => {
        if (i !== this.current) {
          gsap.set(s, { autoAlpha: 0 });
          s.classList.remove(this.activeClass);
        }
      });
    }

    const isBack = index < this.current;
    const old = this.slides[this.current];
    const next = this.slides[index];
    this.current = index;

    next.classList.add(this.activeClass);

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    
    const startX = isBack ? -this.xOffset : this.xOffset;
    const endX = isBack ? this.xOffset : -this.xOffset;

    tl.fromTo(
      next,
      { autoAlpha: 0, x: startX },
      { autoAlpha: 1, x: 0, duration: this.fadeIn }
    );

    const items = next.querySelectorAll(this.animSelector);
    if (items.length) {
      tl.fromTo(
        items,
        { autoAlpha: 0, x: startX * 0.5 },
        { autoAlpha: 1, x: 0, duration: 0.5, stagger: this.stagger },
        '-=0.2'
      );
    }

    if (old && old !== next) {
      tl.to(
        old,
        {
          autoAlpha: 0,
          x: endX,
          duration: this.fadeOut,
          ease: 'power2.in',
          onComplete: () => old.classList.remove(this.activeClass),
        },
        '<'
      );
    }

    this.tl = tl;
  }

  init() {
    gsap.set(this.slides, { autoAlpha: 0 });
    this.slides[0].classList.add(this.activeClass);

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.to(this.slides[0], { autoAlpha: 1, x: 0, duration: 0.4 });

    const items = this.slides[0].querySelectorAll(this.animSelector);
    if (items.length) {
      tl.fromTo(
        items,
        { autoAlpha: 0, x: this.xOffset * 0.5 },
        { autoAlpha: 1, x: 0, duration: 0.5, stagger: this.stagger },
        '-=0.2'
      );
    }
    this.tl = tl;
  }
}

/* ------------------------------------------------------------- */
/*  Utils                                                        */
/* ------------------------------------------------------------- */

function countUp(el, target, duration = 0.8) {
  const obj = { v: Number(el.dataset.value || 0) };
  gsap.killTweensOf(obj);
  gsap.to(obj, {
    v: target,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = Math.round(obj.v);
      el.dataset.value = String(target);
    },
  });
}

function heartbeatQR(el, scale = 1.02) {
  gsap.fromTo(
    el,
    { scale: 1 },
    { scale, duration: 2, yoyo: true, repeat: -1, ease: 'sine.inOut' }
  );
}

/* ------------------------------------------------------------- */
/*  PingPongCanvas — pelotas de ping-pong con física (Juego 1)    */
/*  Una pelota por estimación: caen con gravedad, rebotan y       */
/*  colisionan dentro de la cápsula.                              */
/* ------------------------------------------------------------- */

class PingPongCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.balls = [];
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.W = rect.width || 140;
    this.H = rect.height || 320;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setCount(n) {
    n = Math.max(0, n);
    while (this.balls.length < n) this.addBall();
    if (this.balls.length > n) this.balls.length = n;
  }

  addBall() {
    const r = 8 + Math.random() * 6;
    this.balls.push({
      x: r + Math.random() * Math.max(1, this.W - 2 * r),
      y: -r,
      vx: (Math.random() - 0.5) * 60,
      vy: 0,
      r,
    });
  }

  step(dt) {
    const G = 500;
    const DAMP = 0.6;
    for (const b of this.balls) {
      b.vy += G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * DAMP; }
      if (b.x + b.r > this.W) { b.x = this.W - b.r; b.vx = -Math.abs(b.vx) * DAMP; }
      if (b.y + b.r > this.H) { b.y = this.H - b.r; if (b.vy > 0) b.vy = -b.vy * DAMP; }
      if (b.y - b.r < 0) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * DAMP; }
    }

    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], c = this.balls[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = a.r + c.r;
        if (dist > 0 && dist < min) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = (min - dist) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;
          const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (rel > 0) {
            const imp = rel * 0.9;
            a.vx -= imp * nx; a.vy -= imp * ny;
            c.vx += imp * nx; c.vy += imp * ny;
          }
        }
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    for (const b of this.balls) {
      const grad = ctx.createRadialGradient(
        b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.2,
        b.x, b.y, b.r
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.7, '#f5e9d6');
      grad.addColorStop(1, '#d8b48a');
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  loop = (t) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

function animateLiquid(fillEl, numEl, avg, cap, capsuleEl) {
  const pct = Math.min(100, Math.max(0, (avg / cap) * 100));
  gsap.to(fillEl, {
    height: pct + '%',
    duration: 0.8,
    ease: 'power2.out',
    overwrite: 'auto',
  });
  
  const rect = capsuleEl.getBoundingClientRect();
  const H = rect.height || 320;
  const surfacePx = (pct / 100) * H;
  gsap.to(numEl, {
    bottom: Math.max(10, surfacePx + 6),
    duration: 0.8,
    ease: 'power2.out',
    overwrite: 'auto',
  });
  countUp(numEl, avg, 0.8);
}

function tugOrb(orbEl, trackEl, culpable, inocente) {
  const total = culpable + inocente;
  const ratio = total ? inocente / total : 0.5;
  const trackW = trackEl.getBoundingClientRect().width;
  const orbW = orbEl.offsetWidth || 24;
  const maxX = trackW / 2 - orbW / 2;
  const x = (ratio * 2 - 1) * maxX;

  gsap.to(orbEl, {
    x,
    duration: 0.8,
    ease: 'power2.out',
    overwrite: 'auto',
  });
}

function impactCards(cardA, cardB, aCount, bCount) {
  cardA.classList.remove('glow', 'loser');
  cardB.classList.remove('glow', 'loser');
  gsap.killTweensOf([cardA, cardB]);

  if (aCount === bCount) {
    gsap.to([cardA, cardB], { x: 0, y: 0, scale: 1, opacity: 1, filter: 'grayscale(0)', duration: 0.5 });
    return;
  }

  const [win, lose] = aCount > bCount ? [cardA, cardB] : [cardB, cardA];

  gsap.to(lose, {
    scale: 0.95,
    opacity: 0.4,
    filter: 'grayscale(1)',
    duration: 0.5,
    ease: 'power2.out',
    overwrite: 'auto',
  });
  lose.classList.add('loser');

  gsap.to(win, {
    scale: 1.05,
    filter: 'grayscale(0)',
    duration: 0.5,
    ease: 'power2.out',
    overwrite: 'auto',
    onStart: () => win.classList.add('glow'),
  });
}

function spawnBubble(field, word, index) {
  const H = field.offsetHeight || 300;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = word;
  bubble.style.left = 10 + Math.random() * 80 + '%';
  bubble.style.setProperty('--rise', H + 60 + 'px');
  bubble.style.animationDuration = 4 + Math.random() * 3 + 's';
  
  field.appendChild(bubble);
  bubble.addEventListener('animationend', () => bubble.remove());
  while (field.children.length > 40) field.firstElementChild.remove();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawCable(svg, container, fromEl, toEl, onComplete) {
  const cRect = container.getBoundingClientRect();
  const fRect = fromEl.getBoundingClientRect();
  const tRect = toEl.getBoundingClientRect();

  const x1 = fRect.right - cRect.left;
  const y1 = fRect.top + fRect.height / 2 - cRect.top;
  const x2 = tRect.left - cRect.left;
  const y2 = tRect.top + tRect.height / 2 - cRect.top;

  svg.setAttribute('viewBox', `0 0 ${cRect.width} ${cRect.height}`);

  const mx = (x1 + x2) / 2;
  const my = Math.max(y1, y2) + 20; 
  const d = `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;

  const sheath = document.createElementNS(SVG_NS, 'path');
  sheath.setAttribute('d', d);
  sheath.classList.add('cable-sheath');

  const core = document.createElementNS(SVG_NS, 'path');
  core.setAttribute('d', d);
  core.classList.add('cable-core');

  svg.appendChild(sheath);
  svg.appendChild(core);

  const len = Math.max(1, core.getTotalLength());
  [sheath, core].forEach((p) => {
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
  });

  gsap.to(sheath, { strokeDashoffset: 0, duration: 0.4, ease: 'power2.out' });
  gsap.to(core, { 
    strokeDashoffset: 0, 
    duration: 0.5, 
    ease: 'power2.out', 
    delay: 0.1,
    onComplete: () => {
      core.classList.add('live');
      if (onComplete) onComplete();
    }
  });
}

function drawEnergyLine(svg, container, fromEl, toEl) {
  drawCable(svg, container, fromEl, toEl);
}

const VOTE_COLORS = {
  A: '#C58B4C',
  B: '#B75738',
  C: '#9D1E2B',
};

function drawVotePath(svg, container, fromEl, toEl, option, index) {
  const cRect = container.getBoundingClientRect();
  const fRect = fromEl.getBoundingClientRect();
  const tRect = toEl.getBoundingClientRect();

  const x1 = fRect.right - cRect.left;
  const y1 = fRect.top + fRect.height / 2 - cRect.top;
  const x2 = tRect.left - cRect.left;
  const y2 = tRect.top + tRect.height / 2 - cRect.top;

  svg.setAttribute('viewBox', `0 0 ${cRect.width} ${cRect.height}`);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const perpX = -dy / dist;
  const perpY = dx / dist;

  const segments = 4;
  const amplitude = 6 + (index % 3) * 2;
  const seed = index * 137.5;
  const points = [{ x: x1, y: y1 }];

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const wave = Math.sin(seed + i * 1.8) * amplitude;
    points.push({ x: px + perpX * wave, y: py + perpY * wave });
  }
  points.push({ x: x2, y: y2 });

  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.5;
    const cpy1 = prev.y + (curr.y - prev.y) * 0.5;
    const cpx2 = curr.x - (next.x - prev.x) * 0.15;
    const cpy2 = curr.y - (next.y - prev.y) * 0.15;
    const cpx3 = curr.x + (next.x - curr.x) * 0.15;
    const cpy3 = curr.y + (next.y - curr.y) * 0.15;
    const cpx4 = next.x - (next.x - curr.x) * 0.5;
    const cpy4 = next.y - (next.y - curr.y) * 0.5;
    d += ` C${cpx1} ${cpy1} ${cpx2} ${cpy2} ${curr.x} ${curr.y}`;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  d += ` C${prev.x + (last.x - prev.x) * 0.5} ${prev.y + (last.y - prev.y) * 0.5} ${last.x} ${last.y} ${last.x} ${last.y}`;

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.classList.add('vote-path');
  path.setAttribute('stroke', VOTE_COLORS[option] || VOTE_COLORS.A);
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-dasharray', '6 4');
  path.setAttribute('opacity', '0');

  svg.appendChild(path);

  const len = Math.max(1, path.getTotalLength());
  path.style.strokeDasharray = `6 4`;
  path.style.strokeDashoffset = String(len);

  gsap.to(path, { opacity: 0.5, duration: 0.3 });
  gsap.to(path, {
    strokeDashoffset: 0,
    duration: 0.8,
    ease: 'power2.out',
  });
}

function revealRow(row) {
  const cell = row.querySelector('.reveal-cell');
  if (!cell) return;
  cell.classList.remove('hidden');
  gsap.fromTo(cell, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' });
}

function sendFeedback(btn, feedbackEl, sentText = 'Enviado') {
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Enviando...`;
  
  gsap.delayedCall(0.4, () => {
    btn.innerHTML = sentText;
    btn.classList.add('opacity-80');
    if (feedbackEl) feedbackEl.textContent = '';
  });
}

window.SlideManager = SlideManager;
window.countUp = countUp;
window.heartbeatQR = heartbeatQR;
window.animateLiquid = animateLiquid;
window.PingPongCanvas = PingPongCanvas;
window.tugOrb = tugOrb;
window.impactCards = impactCards;
window.spawnBubble = spawnBubble;
window.drawEnergyLine = drawEnergyLine;
window.drawCable = drawCable;
window.drawVotePath = drawVotePath;
window.VOTE_COLORS = VOTE_COLORS;
window.revealRow = revealRow;
window.sendFeedback = sendFeedback;
