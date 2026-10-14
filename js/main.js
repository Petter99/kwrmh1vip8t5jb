(() => {
  const $ = (s) => document.querySelector(s);
  const scene = $('#scene'), envelope = $('#envelope'), content = $('#content');
  const audio = $('#bgm'), muteBtn = $('#mute');

  /* ── Corazoncitos flotando en el fondo del sobre ── */
  const bg = $('.hearts-bg');
  for (let i = 0; i < 16; i++) {
    const h = document.createElement('span');
    h.textContent = '♥';
    h.style.left = Math.random() * 100 + '%';
    h.style.fontSize = 14 + Math.random() * 26 + 'px';
    h.style.animationDuration = 9 + Math.random() * 9 + 's';
    h.style.animationDelay = -Math.random() * 14 + 's';
    bg.appendChild(h);
  }

  /* ── Apertura del sobre ── */
  let opened = false;
  envelope.addEventListener('click', () => {
    if (opened) return;
    opened = true;

    // Debe ocurrir dentro del gesto del usuario para que el navegador permita el audio
    audio.volume = 0.6;
    audio.play().catch(() => { /* sin canción todavía: la página sigue funcionando */ });
    muteBtn.hidden = false;

    scene.classList.add('opening');
    envelope.classList.add('open');                       // sello se rompe + solapa se abre
    setTimeout(() => envelope.classList.add('slide'), 750);   // la carta sale
    setTimeout(() => {                                        // la carta "ocupa" la pantalla
      scene.classList.add('leave');
      content.classList.add('show');
      content.removeAttribute('aria-hidden');
      document.body.classList.remove('locked');
      window.scrollTo(0, 0);
    }, 1700);
    setTimeout(() => scene.classList.add('gone'), 2900);
  });

  /* ── Mute ── */
  muteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    muteBtn.classList.toggle('is-muted', audio.muted);
    muteBtn.setAttribute('aria-label', audio.muted ? 'Activar música' : 'Silenciar música');
  });

  /* ── Aparición gradual al hacer scroll ── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.2 });
  document.querySelectorAll('.reveal, .step').forEach((el) => io.observe(el));

  /* ── Hilo rojo de lana: baja por toda la página, detrás del contenido ──
     Va por el borde derecho (más adentro en la galería), hace corazones alternando lados con la
     propia lana, y termina en un corazón de fieltro rojo con un moño grande de lana encima. */
  const thread = $('.thread');
  const P = (c) => thread.querySelector('.th-' + c);
  const BW = (c) => thread.querySelector('.th-bow .bw-' + c);
  const smooth = (k) => k * k * (3 - 2 * k);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f1 = (n) => n.toFixed(1);
  const heartXY = (t) => [
    16 * Math.sin(t) ** 3,
    -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
  ];

  // Remuestrea una polilínea a paso fijo
  function resample(pts, step) {
    const S = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      let [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
      let seg = Math.hypot(x1 - x0, y1 - y0);
      while (carry + seg >= step) {
        const f = (step - carry) / seg;
        x0 += (x1 - x0) * f; y0 += (y1 - y0) * f;
        S.push([x0, y0]);
        seg = Math.hypot(x1 - x0, y1 - y0); carry = 0;
      }
      carry += seg;
    }
    return S;
  }

  // Promedio móvil: redondea puntas y cambios bruscos antes de trenzar
  function smoothLine(S, k) {
    return S.map((_, i) => {
      if (i === 0 || i === S.length - 1) return S[i];
      const a = Math.max(0, i - k), b = Math.min(S.length - 1, i + k);
      let sx = 0, sy = 0;
      for (let j = a; j <= b; j++) { sx += S[j][0]; sy += S[j][1]; }
      return [sx / (b - a + 1), sy / (b - a + 1)];
    });
  }

  // Trenza dos cabos sobre la polilínea S: desplazamiento ± r·sin(fase) sobre la normal.
  // El cabo A se redibuja encima donde cos(fase) > 0 → cruce alternado, aspecto de lana.
  function braid(S, acc, step, r = 1.8, lambda = 11) {
    let front = false;
    for (let i = 0; i < S.length; i++) {
      const p0 = S[Math.max(0, i - 1)], p1 = S[Math.min(S.length - 1, i + 1)];
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1];
      const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
      const ph = (i * step / lambda) * 2 * Math.PI;
      const o = r * Math.sin(ph), nx = -ty, ny = tx;
      const ax = f1(S[i][0] + nx * o) + ',' + f1(S[i][1] + ny * o);
      const bx = f1(S[i][0] - nx * o) + ',' + f1(S[i][1] - ny * o);
      acc.A += (i ? ' L' : ' M') + ax;
      acc.B += (i ? ' L' : ' M') + bx;
      const f = Math.cos(ph) > 0;
      if (f) acc.F += (front ? ' L' : ' M') + ax;
      front = f;
    }
  }

  const bez = (p0, p1, p2, p3, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, q = 1 - t;
      out.push([0, 1].map((k) => q * q * q * p0[k] + 3 * q * q * t * p1[k] + 3 * q * t * t * p2[k] + t * t * t * p3[k]));
    }
    return out;
  };

  // Corazón como lazo del hilo. T = punto del corazón más pegado al hilo (tangente vertical).
  // side -1: el corazón queda a la izquierda del hilo; +1: a la derecha (espejo).
  // Se recorre desde T bajando por su borde, pasa por la punta, rodea los lóbulos y cierra en T.
  function heartRing(s, tiltDeg, side) {
    const a = tiltDeg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), N = 240;
    const at = (t) => { const [hx, hy] = heartXY(t); return [s * (hx * c - hy * sn), s * (hx * sn + hy * c)]; };
    const raw = [];
    let iT = 0;
    for (let i = 0; i < N; i++) {
      raw.push(at(i / N * 2 * Math.PI));
      if (raw[i][0] > raw[iT][0]) iT = i;
    }
    const T = raw[iT], m = side > 0 ? -1 : 1, pts = [];
    for (let j = 0; j <= N; j++) {
      const p = raw[(iT + j) % N];
      pts.push([m * (p[0] - T[0]), p[1] - T[1]]);
    }
    return { pts };
  }

  function buildThread() {
    const w = content.clientWidth, h = content.clientHeight;
    if (!w || !h) return;
    const love = $('#love'), gal = $('#gallery');
    const gTop = gal.offsetTop, gBot = gTop + gal.offsetHeight;

    // Eje del hilo: junto al borde en la carta y el cierre; más adentro y más ondulado en la galería
    const edgeX = w - 22, innerX = w - 74;
    const kIn = (y) => smooth(clamp((y - (gTop - 20)) / 140, 0, 1)) * (1 - smooth(clamp((y - (gBot - 160)) / 140, 0, 1)));
    const wave = (u, y) => {
      const k = kIn(y), a = 4 + 8 * k;
      return edgeX + (innerX - edgeX) * k + a * Math.sin(u / 75) + a * .45 * Math.sin(u / 29 + 1);
    };

    // Un corazón por foto: a la izquierda del hilo junto a las fotos de la izquierda (hay hueco)
    // y a la derecha, más pequeño, junto a las de la derecha. Tamaños variados.
    const sizesL = [2.2, 1.8, 2.4, 2.0, 1.7], sizesR = [1.4, 1.2, 1.4, 1.3];
    const ev = [];
    document.querySelectorAll('.polaroid').forEach((p, i) => {
      const left = i % 2 === 0, j = i >> 1;
      const s = left ? sizesL[j % sizesL.length] : sizesR[j % sizesR.length];
      const side = left ? -1 : 1;
      ev.push({
        yT: p.offsetTop + p.offsetHeight / 2 - 6.5 * s,
        shift: -side * 6,                                  // se mete un poco sobre el hilo: la lana se cruza
        ring: heartRing(s, (j % 2 ? 1 : -1) * 12 * (left ? 1 : -1), side)
      });
    });

    // Corazón final de fieltro (el doble de grande), con el moño encima
    const sF = 4;
    let hyMin = Infinity, hyMax = -Infinity;
    for (let t = 0; t < 2 * Math.PI; t += .05) { const y = heartXY(t)[1]; hyMin = Math.min(hyMin, y); hyMax = Math.max(hyMax, y); }
    const btnBottom = love.offsetTop + love.offsetHeight;
    const feltTop = btnBottom + 80, feltH = sF * (hyMax - hyMin);
    const xc = w / 2, bowY = feltTop + feltH - 10;           // el moño se ata en la punta del corazón

    // 1) Línea central
    const pts = [];
    const y0 = 84;                                          // el hilo nace en un nudo, bajo el botón de mute
    let y = y0, u = y0, ei = 0, done = false;
    while (y < h && !done) {
      const e = ev[ei];
      if (e && y >= e.yT) {
        ei++;
        const x0 = wave(u, y) + e.shift;
        e.ring.pts.forEach((p) => pts.push([x0 + p[0], y + p[1]]));
        y += 5; u += 5;
        continue;
      }
      if (!e && y >= love.offsetTop + 10) {                  // curva suave hacia el centro y baja recto hasta el moño
        const L = Math.max(90, feltTop - 15 - y);
        for (let d = 0; d <= L; d += 5) pts.push([wave(u + d, y + d) + (xc - wave(u + d, y + d)) * smooth(d / L), y + d]);
        y += L;
        for (; y <= bowY; y += 5) pts.push([xc, y]);
        pts.push([xc, bowY]);
        done = true;
        break;
      }
      pts.push([wave(u, y), y]);
      y += 5; u += 5;
    }
    if (!done) pts.push([wave(u, h), h]);

    // 2) Remuestreo + suavizado + trenzado
    const step = 1.8;
    const S = smoothLine(resample(pts, step), 3);
    const main = { A: '', B: '', F: '' };
    braid(S, main, step);
    const center = 'M' + S.map((p) => f1(p[0]) + ',' + f1(p[1])).join(' L');
    P('shadow').setAttribute('d', center);
    P('fuzz').setAttribute('d', center);
    P('a').setAttribute('d', main.A);
    P('b').setAttribute('d', main.B);
    P('a2').setAttribute('d', main.F);

    // Nudo de inicio: bolita de lana enrollada con dos cabitos cortos hacia arriba
    const [sx, sy] = S[0];
    const sk = thread.querySelector('.th-start');
    sk.querySelector('.st-t1').setAttribute('d', `M${f1(sx)},${f1(sy)} C${f1(sx - 2)},${f1(sy - 8)} ${f1(sx - 7)},${f1(sy - 14)} ${f1(sx - 10)},${f1(sy - 24)}`);
    sk.querySelector('.st-t2').setAttribute('d', `M${f1(sx)},${f1(sy)} C${f1(sx + 3)},${f1(sy - 7)} ${f1(sx + 7)},${f1(sy - 13)} ${f1(sx + 9)},${f1(sy - 21)}`);
    sk.querySelector('.bw-f').setAttribute('d',
      `M${f1(sx - 10)},${f1(sy - 24)} l-2,-5 M${f1(sx - 10)},${f1(sy - 24)} l2,-6 M${f1(sx + 9)},${f1(sy - 21)} l2,-5 M${f1(sx + 9)},${f1(sy - 21)} l-2,-6`);
    const sn = sk.querySelector('.bw-n');
    sn.setAttribute('cx', f1(sx)); sn.setAttribute('cy', f1(sy)); sn.setAttribute('rx', 10); sn.setAttribute('ry', 9);
    let sw = '';
    for (let k = -2; k <= 2; k++) sw += `M${f1(sx - 3 + k * 2.4)},${f1(sy + 4)} l5,-8 `;
    sk.querySelector('.bw-w').setAttribute('d', sw);

    // 3) Corazón de fieltro
    const felt = [];
    for (let t = 0; t <= 2 * Math.PI + .01; t += .04) {
      const [hx, hy] = heartXY(t);
      felt.push(f1(xc + sF * hx) + ',' + f1(feltTop + sF * (hy - hyMin)));
    }
    const fd = 'M' + felt.join(' L') + ' Z';
    P('feltsh').setAttribute('d', fd);
    P('felt').setAttribute('d', fd);

    // 4) Moño de lana grande y voluminoso: 2 lazos grandes, 2 lazos caídos, nudo y 2 colas largas
    const bowEl = thread.querySelector('.th-bow');
    bowEl.style.display = done ? '' : 'none';
    if (!done) return;
    const bx = xc, by = bowY;
    const acc = { A: '', B: '', F: '' };
    const lines = [];
    const loop = (dir, Lx, Wy, deg) => {                    // lazo en forma de gota que nace en el nudo
      const ang = deg * Math.PI / 180, q = [];
      for (let t = 0; t <= 2 * Math.PI + .001; t += .09) {
        const X = Lx * (1 - Math.cos(t)) / 2, Y = Wy * Math.sin(t) * Math.sin(t / 2);
        q.push([bx + dir * (X * Math.cos(ang) - Y * Math.sin(ang)), by + (X * Math.sin(ang) + Y * Math.cos(ang))]);
      }
      return q;
    };
    const tails = [
      bez([bx, by], [bx - 6, by + 40], [bx - 28, by + 72], [bx - 36, by + 114], 30),
      bez([bx, by], [bx + 6, by + 38], [bx + 26, by + 68], [bx + 32, by + 106], 30)
    ];
    [...tails, loop(1, 58, 32, 40), loop(-1, 58, 32, 40), loop(1, 82, 42, 8), loop(-1, 82, 42, 8)].forEach((line) => {
      const R = resample(line, step);
      braid(R, acc, step);
      lines.push('M' + R.map((p) => f1(p[0]) + ',' + f1(p[1])).join(' L'));
    });
    BW('shadow').setAttribute('d', lines.join(' '));
    BW('a').setAttribute('d', acc.A);
    BW('b').setAttribute('d', acc.B);
    BW('a2').setAttribute('d', acc.F);
    // puntas deshilachadas de las colas
    const fr = (p, dx) => `M${f1(p[0])},${f1(p[1])} l${dx},6 M${f1(p[0])},${f1(p[1])} l${-dx / 2},7 M${f1(p[0])},${f1(p[1])} l${dx * 1.6},4 M${f1(p[0])},${f1(p[1])} l${-dx * 1.4},3`;
    BW('f').setAttribute('d', fr(tails[0][30], -3) + ' ' + fr(tails[1][30], 3));
    // nudo central: lana enrollada
    const kn = BW('n');
    kn.setAttribute('cx', f1(bx)); kn.setAttribute('cy', f1(by)); kn.setAttribute('rx', 16); kn.setAttribute('ry', 13);
    let wr = '';
    for (let k = -3; k <= 3; k++) wr += `M${f1(bx - 4 + k * 2.5)},${f1(by + 7)} l7,-12 `;
    BW('w').setAttribute('d', wr);
  }

  let tId = 0;
  const rebuild = () => { cancelAnimationFrame(tId); tId = requestAnimationFrame(buildThread); };
  addEventListener('resize', rebuild);
  addEventListener('load', rebuild);
  new ResizeObserver(rebuild).observe(content);   // las fotos lazy cambian la altura al cargar
  rebuild();

  /* ── Polaroids: tap para inclinar ── */
  document.querySelectorAll('.polaroid').forEach((p) => {
    p.addEventListener('click', () => {
      const was = p.classList.contains('tilt');
      document.querySelectorAll('.polaroid.tilt').forEach((x) => x.classList.remove('tilt'));
      if (!was) p.classList.add('tilt');
    });
  });

  /* ── Confeti y corazones (canvas propio, sin librerías) ── */
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  let parts = [], raf = 0;
  const colors = ['#e8778f', '#f7b9c6', '#fde3d6', '#b8445e', '#ffd166', '#ffffff'];

  const resize = () => {
    const d = window.devicePixelRatio || 1;
    cv.width = innerWidth * d; cv.height = innerHeight * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  addEventListener('resize', resize); resize();

  function heart(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * .35);
    ctx.bezierCurveTo(x, y - s * .2, x - s, y - s * .2, x - s, y + s * .35);
    ctx.bezierCurveTo(x - s, y + s * .8, x, y + s * 1.05, x, y + s * 1.3);
    ctx.bezierCurveTo(x, y + s * 1.05, x + s, y + s * .8, x + s, y + s * .35);
    ctx.bezierCurveTo(x + s, y - s * .2, x, y - s * .2, x, y + s * .35);
    ctx.fill();
  }

  function spawn(n) {
    for (let i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .6,
        vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3.5,
        s: 6 + Math.random() * 9, a: Math.random() * 6.28, va: (Math.random() - .5) * .2,
        c: colors[(Math.random() * colors.length) | 0], heart: Math.random() < .55, sway: Math.random() * 6.28
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.sway += .05; p.x += p.vx + Math.sin(p.sway) * .8; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
      if (p.heart) heart(0, 0, p.s); else ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6);
      ctx.restore();
    });
    parts = parts.filter((p) => p.y < innerHeight + 30);
    if (parts.length) raf = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); raf = 0; }
  }

  $('#love').addEventListener('click', () => {
    spawn(140);
    setTimeout(() => spawn(90), 700);
    setTimeout(() => spawn(70), 1500);
    if (!raf) raf = requestAnimationFrame(tick);
    if (navigator.vibrate) navigator.vibrate(40);
  });
})();
