// Компас «Стези» на вкладке «Сегодня»: частицы, шкала, дуги сфер и стрелка на фокус.
// Данные даёт app.js через Compass.set(); сам компас ничего не считает и ничего не сохраняет
(function () {
  "use strict";
  const TAU = Math.PI * 2, N = -Math.PI / 2, RAD = Math.PI / 180;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR = Math.min(devicePixelRatio || 1, 3); // на iPhone — все три пикселя на точку
  const INK = [31, 43, 53];
  // Оттенок и спокойствие движения в разные части дня
  const PHASE = {
    morning: { tint: [255, 222, 186], amp: 1, breathe: 0 },
    prayer: { tint: [255, 230, 190], amp: .45, breathe: 1 },
    day: { tint: [236, 242, 248], amp: 1.2, breathe: 0 },
    evening: { tint: [218, 210, 255], amp: .8, breathe: 0 },
    night: { tint: [176, 200, 240], amp: .35, breathe: .5 },
  };
  const S = {
    spheres: [], focus: -1, sel: -1, log: [], days: [], north: false, quiet: false, keep: [],
    light: false, phase: "day", sun: null, onSelect: null,
  };
  let cv, ctx, bg, bx, W = 0, H = 0, cx = 0, cy = 0, R = 0, small = false;
  let P = [], spark = [], stars = [], t0 = null, lt = null, mt = 0, na = null, tx = 0, ty = 0, built = false;
  let tint = PHASE.day.tint.slice(), amp = 1, breathe = 0, quietK = 0, raf = 0, idleAt = 0, visible = true;
  const PT = { x: 0, y: 0 };

  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
  // Мягкая светящаяся точка: рисуется один раз и штампуется тысячи раз
  function sprite([r, g, b]) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32), rgb = `${r},${g},${b}`;
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.18, `rgba(${rgb},.9)`); gr.addColorStop(.42, `rgba(${rgb},.25)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
  }
  let dot = sprite([255, 255, 255]), dotKey = "";
  const accD = sprite([240, 161, 90]), accL = sprite([180, 86, 15]);
  let acc = accD;
  const stamp = (x, y, r, a, s = dot) => { ctx.globalAlpha = a > 1 ? 1 : a; ctx.drawImage(s, x - r * 4, y - r * 4, r * 8, r * 8); };
  const sphTh = i => N + Math.PI / S.spheres.length + i * TAU / S.spheres.length;
  const span = () => TAU / Math.max(S.spheres.length, 1) * .78;

  function build() {
    const k = small ? .7 : 1, n = S.spheres.length;
    P = [];
    // каждая частица при первом открытии прилетает на место из-за края
    const add = (x, y, b, extra) => { const a = rnd(0, TAU), d = R * rnd(1.5, 2.8); P.push({ x, y, b, sx: Math.cos(a) * d, sy: Math.sin(a) * d, dl: rnd(0, .8), s: rnd(.5, 1.6), ph: rnd(0, 6.28), r: .7, dp: .6, ...extra }); };
    for (let i = 0; i < 1400 * k; i++) { const th = rnd(0, TAU), r = R * (1 + gauss() * .005); add(Math.cos(th) * r, Math.sin(th) * r, rnd(.25, .6), { th, ring: true, r: rnd(.45, .75), dp: 1 }); }
    const ray = (th, len, wid, b, cnt) => {
      for (let i = 0; i < cnt * k; i++) {
        const u = Math.pow(Math.random(), .8), side = (Math.random() - .5) * 2 * wid * (1 - u);
        add(Math.cos(th) * u * len - Math.sin(th) * side, Math.sin(th) * u * len + Math.cos(th) * side, b, { dp: .25, r: rnd(.4, .7) });
      }
    };
    for (let i = 0; i < 4; i++) { ray(i * Math.PI / 2 - Math.PI / 2, R * .56, R * .065, .22, 220); ray(i * Math.PI / 2 - Math.PI / 4, R * .32, R * .04, .16, 90); }
    const sp = span();
    S.spheres.forEach((s, a) => {
      const fill = Math.min(s.v, 1), th0 = sphTh(a) - sp / 2, cnt = Math.round((20 + 180 * fill) * k * 6 / Math.max(n, 6));
      for (let i = 0; i < cnt; i++) { const th = th0 + Math.random() * sp * fill, r = R * (.8 + gauss() * .007); add(Math.cos(th) * r, Math.sin(th) * r, rnd(.4, .9), { m: a, r: rnd(.5, .9) }); }
    });
    spark = Array.from({ length: 70 }, () => ({ u: Math.random(), j: gauss() }));
    if (built || reduce) t0 = -1e3; // прилёт частиц — только при первом открытии
    built = true;
  }

  function resize() {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    W = r.width; H = r.height; cx = W / 2; cy = H / 2; small = W < 600;
    R = Math.min(W * (small ? .33 : .42), H * .37);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (bg) {
      const sd = Math.min(DPR, 2); bg.width = innerWidth * sd; bg.height = innerHeight * sd; bx.setTransform(sd, 0, 0, sd, 0, 0);
      stars = Array.from({ length: Math.round(innerWidth * innerHeight / 9000) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() < .08 ? 1.4 : .7, ph: rnd(0, 6.28), sp: rnd(.3, 1.3) }));
    }
    build();
  }

  function label(x, y, text, hot, sub, align = "center") {
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.font = `500 ${small ? 9.5 : 11}px "JetBrains Mono", monospace`; if ("letterSpacing" in ctx) ctx.letterSpacing = small ? "1.5px" : "2.5px";
    const hc = S.light ? "#B4560F" : "#F0A15A";
    ctx.fillStyle = hot ? hc : S.light ? "#4F5B64" : "#A3ACB7"; ctx.fillText(text.toUpperCase(), x, y);
    if (sub) { ctx.font = `400 ${small ? 9 : 10}px "JetBrains Mono", monospace`; ctx.fillStyle = hot ? hc : S.light ? "#736F66" : "#6E7884"; ctx.fillText(sub, x, y + (small ? 12 : 15)); }
    ctx.globalCompositeOperation = S.light ? "source-over" : "lighter";
  }

  // Фон страницы: звёзды в HUD, румбовые линии старинной карты — днём
  function drawBg(t) {
    if (!bg) return;
    bx.clearRect(0, 0, innerWidth, innerHeight);
    if (S.light) {
      if (!cv.offsetParent) return;
      const r = cv.getBoundingClientRect(), ox = r.left + cx, oy = r.top + cy, L = Math.hypot(innerWidth, innerHeight) * 1.5;
      bx.lineWidth = 1;
      for (let i = 0; i < 32; i++) { const th = i * TAU / 32; bx.strokeStyle = `rgba(31,43,53,${i % 4 ? .045 : .09})`; bx.beginPath(); bx.moveTo(ox, oy); bx.lineTo(ox + Math.cos(th) * L, oy + Math.sin(th) * L); bx.stroke(); }
    } else {
      bx.fillStyle = "#fff";
      for (const s of stars) { bx.globalAlpha = .12 + .3 * (.5 + .5 * Math.sin(t * s.sp + s.ph)); bx.fillRect(s.x, s.y, s.r, s.r); }
      bx.globalAlpha = 1;
    }
  }

  function draw(t) {
    const ph = PHASE[S.phase] || PHASE.day;
    for (let i = 0; i < 3; i++) tint[i] += (ph.tint[i] - tint[i]) * .04;
    amp += (ph.amp - amp) * .03; breathe += (ph.breathe - breathe) * .03; quietK += ((S.quiet ? 1 : 0) - quietK) * .04;
    const key = S.light ? "ink" : tint.map(v => Math.round(v / 3)).join();
    if (key !== dotKey) { dot = sprite(S.light ? INK : tint.map(Math.round)); acc = S.light ? accL : accD; dotKey = key; }
    drawBg(t);
    if (!cv.offsetParent || !W) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = S.light ? "source-over" : "lighter";
    if (t0 == null) t0 = t;
    const T = t - t0, sk = quietK, n = S.spheres.length;
    // в воскресенье всё затихает: «моторное» время почти останавливается
    const dt = lt == null ? 0 : Math.min(t - lt, .1); lt = t; mt += dt * (1 - sk * .92);
    const fade = ease((T - .3) / 1.2), pulse = 1 + breathe * .025 * Math.sin(t * 1.2), Rp = R * pulse;
    tx += (PT.x - tx) * .05; ty += (PT.y - ty) * .05;
    const off = d => [cx + tx * d * R * .045, cy + ty * d * R * .045]; // параллакс: слои сдвигаются по-разному
    const tc = (S.light ? INK : tint.map(Math.round)).join(), ac = S.light ? "180,86,15" : "240,161,90";
    const col = a => `rgba(${tc},${a * fade})`, amb = a => `rgba(${ac},${a * fade})`;
    const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); };
    const sel = S.sel >= 0 ? S.sel : S.focus, hotI = sk > .5 && S.sel < 0 ? -1 : sel;

    // луч радара
    const sweep = mt * .5, [bx0, by0] = off(1);
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(sweep - 1, bx0, by0), f = 1 / TAU;
      g.addColorStop(0, col(0)); g.addColorStop(f * .999, col(.09 * (1 - sk))); g.addColorStop(f, col(0)); g.addColorStop(1, col(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx0, by0, Rp, 0, TAU); ctx.fill();
    }
    ctx.lineWidth = 1; ctx.strokeStyle = col(.3 * (1 - sk)); ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(bx0 + Math.cos(sweep) * Rp, by0 + Math.sin(sweep) * Rp); ctx.stroke();

    // ободы, шкала в градусах, вращающийся безель
    ctx.strokeStyle = col(.55); circle(bx0, by0, Rp); ctx.strokeStyle = col(.14); circle(bx0, by0, Rp * 1.05);
    for (const [step, inner, a, w] of [[1, .963, .16, .7], [5, .94, .35, 1], [30, .915, .8, 1.3]]) {
      ctx.beginPath(); ctx.lineWidth = w; ctx.strokeStyle = col(a);
      for (let d = 0; d < 360; d += step) {
        if ((step === 1 && d % 5 === 0) || (step === 5 && d % 30 === 0)) continue;
        const th = N + d * RAD, c = Math.cos(th), s = Math.sin(th);
        ctx.moveTo(bx0 + c * Rp * inner, by0 + s * Rp * inner); ctx.lineTo(bx0 + c * Rp * .985, by0 + s * Rp * .985);
      }
      ctx.stroke();
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
    for (let d = 0; d < 360; d += 60) {
      const th = N + d * RAD;
      ctx.font = d ? `400 ${small ? 8 : 9.5}px "JetBrains Mono", monospace` : `600 ${small ? 10 : 12}px "JetBrains Mono", monospace`;
      ctx.fillStyle = d ? col(.45) : S.north && S.sel < 0 ? amb(1) : col(.95);
      ctx.fillText(d ? String(d).padStart(3, "0") : "N", bx0 + Math.cos(th) * Rp * .865, by0 + Math.sin(th) * Rp * .865);
    }
    ctx.fillStyle = col(.5);
    for (let i = 0; i < 120; i++) { const th = i * TAU / 120 + mt * .03; ctx.fillRect(bx0 + Math.cos(th) * Rp * 1.05 - .6, by0 + Math.sin(th) * Rp * 1.05 - .6, 1.2, 1.2); }

    // солнце на своём настоящем азимуте
    if (S.sun && S.sun.alt > -8) {
      const th = N + S.sun.az * RAD, sa = Math.min(1, (S.sun.alt + 8) / 10) * fade, sx = bx0 + Math.cos(th) * Rp * 1.05, sy = by0 + Math.sin(th) * Rp * 1.05;
      ctx.fillStyle = amb(sa); ctx.strokeStyle = amb(sa * .8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, TAU); ctx.fill(); ctx.beginPath();
      for (let i = 0; i < 8; i++) { const r = i * TAU / 8 + mt * .2; ctx.moveTo(sx + Math.cos(r) * 4.8, sy + Math.sin(r) * 4.8); ctx.lineTo(sx + Math.cos(r) * 7.2, sy + Math.sin(r) * 7.2); }
      ctx.stroke();
    }

    // дуги сфер: заполнение — сколько дней из нормы набрано за неделю, пунктир снаружи — перебор
    const [ax, ay] = off(.6), sp = span(), quiet = a => S.keep.includes(a) ? 1 : 1 - .75 * sk;
    S.spheres.forEach((s, a) => {
      const st = sphTh(a) - sp / 2, hot = a === hotI, q = quiet(a);
      ctx.lineCap = "round"; ctx.lineWidth = 3;
      ctx.strokeStyle = col(.07); ctx.beginPath(); ctx.arc(ax, ay, Rp * .8, st, st + sp); ctx.stroke();
      if (s.v > 0) { ctx.strokeStyle = hot ? amb(.9) : col(.6 * q); ctx.beginPath(); ctx.arc(ax, ay, Rp * .8, st, st + sp * Math.min(s.v, 1)); ctx.stroke(); }
      if (s.v > 1) { ctx.lineWidth = 1.2; ctx.setLineDash([2, 4]); ctx.strokeStyle = col(.55 * q); ctx.beginPath(); ctx.arc(ax, ay, Rp * .845, st, st + sp * Math.min(s.v - 1, 1)); ctx.stroke(); ctx.setLineDash([]); }
      ctx.lineCap = "butt"; ctx.lineWidth = 1; ctx.strokeStyle = col(.25); ctx.beginPath();
      for (const e of [st - .03, st + sp + .03]) { ctx.moveTo(ax + Math.cos(e) * Rp * .765, ay + Math.sin(e) * Rp * .765); ctx.lineTo(ax + Math.cos(e) * Rp * .835, ay + Math.sin(e) * Rp * .835); }
      ctx.stroke();
    });

    // внутреннее кольцо крутится навстречу
    ctx.setLineDash([1.5, 5]); ctx.lineDashOffset = -mt * 6; ctx.strokeStyle = col(.4); ctx.lineWidth = 1; circle(...off(.4), Rp * .64); ctx.setLineDash([]);

    // роза ветров: светлая и тёмная грань у каждого луча
    const [rx, ry] = off(.25);
    const kite = (th, len, w, a) => {
      const c = Math.cos(th), s = Math.sin(th), tip = [rx + c * len, ry + s * len], mid = len * .2;
      const L = [rx + c * mid - s * w, ry + s * mid + c * w], Rt = [rx + c * mid + s * w, ry + s * mid - c * w];
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(...tip); ctx.lineTo(...L); ctx.closePath(); ctx.fillStyle = col(a * .5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(...tip); ctx.lineTo(...Rt); ctx.closePath(); ctx.fillStyle = col(a * .08); ctx.fill(); ctx.strokeStyle = col(a); ctx.stroke();
    };
    for (let i = 0; i < 4; i++) kite(N + i * Math.PI / 2 + Math.PI / 4, Rp * .32, Rp * .04, .3);
    for (let i = 0; i < 4; i++) kite(N + i * Math.PI / 2, Rp * .56, Rp * .065, i ? .4 : .7);
    ctx.strokeStyle = col(.35); circle(rx, ry, Rp * .07);

    // журнал курса: куда смотрела стрелка каждый день недели — от старых дней к сегодняшнему
    if (S.log.length && n) {
      const lg = S.log.map((m, i) => { const th = m >= 0 ? sphTh(m) : N, r = Rp * (.2 + .3 * i / Math.max(S.log.length - 1, 1)); return [rx + Math.cos(th) * r, ry + Math.sin(th) * r, th]; });
      const lf = fade * ease((T - 1) / 1.5), last = lg.length - 1;
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = col(.5 * lf); ctx.beginPath(); ctx.moveTo(lg[0][0], lg[0][1]);
      for (let i = 1; i < lg.length; i++) { const [x0, y0] = lg[i - 1], [x1, y1] = lg[i]; ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); }
      ctx.lineTo(lg[last][0], lg[last][1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = `500 ${small ? 7.5 : 8.5}px "JetBrains Mono", monospace`; if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
      const placed = [];
      lg.forEach(([x, y, th], i) => {
        ctx.fillStyle = i === last ? amb(lf) : col(.75 * lf); ctx.beginPath(); ctx.arc(x, y, i === last ? 2.8 : 2, 0, TAU); ctx.fill();
        // соседние дни — по разные стороны пути; подпись, которая слиплась бы с уже стоящей, пропускаем
        for (const sd of i % 2 ? [11, -11] : [-11, 11]) {
          const px = x - Math.sin(th) * sd, py = y + Math.cos(th) * sd;
          if (!S.days[i] || placed.some(([qx, qy]) => Math.abs(qx - px) < 16 && Math.abs(qy - py) < 10)) continue;
          placed.push([px, py]); ctx.fillStyle = col(.5 * lf); ctx.fillText(S.days[i], px, py); break;
        }
      });
    }

    // частицы
    for (const p of P) {
      const e = ease((T - p.dl) / 1.5), x = p.sx + (p.x * pulse - p.sx) * e, y = p.sy + (p.y * pulse - p.sy) * e;
      let a = p.b * (.65 + .35 * Math.sin(t * p.s + p.ph)) * (.25 + .75 * e);
      if (p.ring) a += .6 * Math.pow(Math.max(0, Math.cos(p.th - sweep)), 16) * e * (1 - sk);
      if (p.m != null) a *= quiet(p.m);
      if (S.light) a *= .8;
      stamp(cx + tx * p.dp * R * .045 + x, cy + ty * p.dp * R * .045 + y, p.r, a, p.m === hotI ? acc : dot);
    }

    // стрелка: при открытии делает полтора оборота и успокаивается; в молитву и в воскресенье — на север
    const [nx, ny] = off(-.15), spin = (1 - ease(T / 2.4)) * TAU * 1.5;
    const target = S.sel >= 0 ? sphTh(S.sel) : S.north || S.focus < 0 || !n ? N : sphTh(S.focus);
    if (na == null) na = target;
    na += ((((target - na + Math.PI) % TAU) + TAU) % TAU - Math.PI) * .06;
    const th = na + spin + (Math.sin(t * 1.1) * .05 + Math.sin(t * 2.9) * .015) * (amp + .2) * (1 - sk * .9), c = Math.cos(th), s = Math.sin(th);
    const head = Rp * .74, tail = Rp * .36, w = Rp * .034, Pt = (d, side) => [nx + c * d - s * side, ny + s * d + c * side];
    const tri = (a, b, d, fill) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...d); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.shadowColor = amb(.8); ctx.shadowBlur = S.light ? 4 : 18;
    tri([nx, ny], Pt(head, 0), Pt(Rp * .06, w), amb(1)); tri([nx, ny], Pt(head, 0), Pt(Rp * .06, -w), `rgba(150,88,40,${fade})`);
    ctx.shadowBlur = 0;
    tri([nx, ny], Pt(-tail, 0), Pt(Rp * .06, w), col(.55)); tri([nx, ny], Pt(-tail, 0), Pt(Rp * .06, -w), col(.22));
    ctx.fillStyle = S.light ? "#F2ECDF" : "#05070A"; ctx.beginPath(); ctx.arc(nx, ny, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = col(.9); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = col(1); ctx.beginPath(); ctx.arc(nx, ny, 2, 0, TAU); ctx.fill();
    ctx.restore();
    for (const p of spark) { const u = (p.u + t * .12) % 1, d = Rp * .08 + u * (head - Rp * .08); stamp(nx + c * d - s * p.j * 3, ny + s * d + c * p.j * 3, .7, .6 * Math.sin(u * Math.PI) * fade, acc); }

    const [lx, ly] = off(1);
    S.spheres.forEach((sp2, a) => {
      // сбоку подпись отходит от кольца наружу, сверху и снизу — по центру
      const th2 = sphTh(a), c2 = Math.cos(th2), s2 = Math.sin(th2), side = c2 < -.35 ? "right" : c2 > .35 ? "left" : "center";
      const rr = Rp * (side === "center" ? 1.16 : 1.1), yy = ly + s2 * rr + (s2 > .35 ? 8 : s2 < -.35 ? -4 : 0);
      label(lx + c2 * rr, yy, sp2.n, a === hotI, sk > .5 && !S.keep.includes(a) ? null : sp2.sub, side);
    });
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }

  // Анимация идёт, пока компас на экране и с ним что-то происходит; через минуту покоя — замирает (бережём батарею)
  const IDLE = 60000;
  function frame(now) {
    raf = 0;
    draw(now / 1000);
    if (!reduce && visible && !document.hidden && cv.offsetParent && now - idleAt < IDLE) raf = requestAnimationFrame(frame);
  }
  function wake() { idleAt = performance.now(); if (!raf && cv) raf = requestAnimationFrame(frame); }
  function still() { for (let i = 0; i < 90; i++) draw(4); } // без движения — сразу итоговый кадр

  function hit(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left - cx, y = e.clientY - r.top - cy, d = Math.hypot(x, y);
    if (d < R * .2) return -2; // центр — назад к фокусу
    if (d < R * .6 || d > R * 1.45 || !S.spheres.length) return -1;
    const ang = Math.atan2(y, x); let best = -1, bd = TAU / S.spheres.length / 2;
    S.spheres.forEach((s, i) => { const dd = Math.abs(((ang - sphTh(i) + Math.PI) % TAU + TAU) % TAU - Math.PI); if (dd < bd) { bd = dd; best = i; } });
    return best;
  }

  function mount(canvas, bgCanvas, onSelect) {
    cv = canvas; ctx = cv.getContext("2d"); bg = bgCanvas; bx = bg && bg.getContext("2d"); S.onSelect = onSelect;
    new ResizeObserver(() => { resize(); reduce ? still() : wake(); }).observe(cv);
    addEventListener("resize", () => { resize(); reduce ? still() : wake(); });
    addEventListener("pointermove", e => { if (e.pointerType === "mouse") { PT.x = (e.clientX / innerWidth - .5) * 2; PT.y = (e.clientY / innerHeight - .5) * 2; wake(); } });
    ["pointerdown", "scroll", "keydown"].forEach(ev => addEventListener(ev, wake, { passive: true }));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
    cv.addEventListener("click", e => { const i = hit(e); if (i === -1) return; S.onSelect && S.onSelect(i === -2 ? -1 : i); });
    cv.addEventListener("pointermove", e => { cv.style.cursor = hit(e) !== -1 ? "pointer" : ""; });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) wake(); }).observe(cv);
    resize(); reduce ? still() : wake();
    document.fonts && document.fonts.ready.then(() => (reduce ? still() : wake()));
  }

  // spheres: [{ n, v, sub }]; focus/sel — индекс сферы или -1; log — индексы фокуса по дням; north — стрелка на север
  function set(d) {
    const key = s => s.map(x => x.n + ":" + x.v).join("|"), rebuild = d.spheres && key(d.spheres) !== key(S.spheres);
    Object.assign(S, d);
    if (rebuild && W) build();
    if (cv) reduce ? still() : wake();
  }
  window.Compass = { mount, set, wake };
})();
