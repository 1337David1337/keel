// Солнце над Минском и вид страницы: днём — морская карта, после заката — HUD, ночью — красный свет.
// Подключается в <head>, чтобы вид выбрался до первой отрисовки, без мигания
(function () {
  "use strict";
  const RAD = Math.PI / 180, LAT = 53.9, LNG = 27.567;
  // Формулы SunCalc: высота солнца над горизонтом и азимут от севера по часовой стрелке
  function pos(date) {
    const d = date / 864e5 - .5 + 2440588 - 2451545, M = RAD * (357.5291 + .98560028 * d), e = RAD * 23.4397;
    const L = M + RAD * (1.9148 * Math.sin(M) + .02 * Math.sin(2 * M) + .0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const h = RAD * (280.16 + 360.9856235 * d) + RAD * LNG - ra, phi = RAD * LAT;
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
    const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { alt: alt / RAD, az: (az / RAD + 540) % 360 };
  }
  // Восход и закат — когда верхний край солнца пересекает горизонт (−0,833° с учётом рефракции)
  const cache = {};
  function times(date) {
    const k = date.toDateString();
    if (cache[k]) return cache[k];
    const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
    let rise = null, set = null, prev = pos(d0).alt;
    for (let m = 2; m <= 1440; m += 2) {
      const t = new Date(d0.getTime() + m * 6e4), a = pos(t).alt;
      if (prev < -.833 && a >= -.833) rise = t;
      if (prev >= -.833 && a < -.833) set = t;
      prev = a;
    }
    return (cache[k] = { rise, set });
  }
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
  // Ночь для красного света: с 22:00 до 5:00
  const isNight = d => { const h = d.getHours(); return h >= 22 || h < 5; };
  // theme: auto — по солнцу, light — всегда карта, dark — всегда HUD; red: false — красный свет выключен
  function apply({ theme = read("habits.theme") || "auto", red = read("habits.red") !== "off", now = new Date() } = {}) {
    const p = pos(now), light = theme === "light" || (theme !== "dark" && p.alt > 2), root = document.documentElement;
    root.dataset.look = light ? "chart" : "hud";
    root.classList.toggle("red", !light && red && isNight(now));
    // У горизонта в сумерки — тёплое зарево с той стороны, где солнце: утром справа (восток), вечером слева
    const glow = p.alt > -14 && p.alt < 10 ? Math.max(0, 1 - Math.abs(p.alt + 2) / 12) : 0;
    root.style.setProperty("--glow", (glow * (light ? .55 : 1)).toFixed(3));
    root.style.setProperty("--sun-x", p.az < 180 ? "78%" : "22%");
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = light ? "#F2ECDF" : "#05070A";
    return { light, red: root.classList.contains("red"), night: isNight(now), sun: p };
  }
  window.Sky = { pos, times, apply, isNight };
  apply();
})();
