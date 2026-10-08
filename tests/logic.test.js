// Pruebas de la lógica del juego. Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../app.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words.json'), 'utf8'));
const START = L.parseISODate(L.CONFIG.START_DATE);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function playDay(state, day, results) {
  results.forEach((r, i) => assert.equal(L.recordAnswer(state, day, i, r), true));
}

test('words.json: 41 días × 3 palabras con todos los campos', () => {
  assert.equal(data.dias.length, 41);
  const seen = new Set();
  for (const dia of data.dias) {
    assert.equal(dia.palabras.length, 3);
    for (const p of dia.palabras) {
      for (const k of ['palabra', 'verdadera', 'curiosidad']) assert.ok(p[k] && typeof p[k] === 'string', `${p.palabra}: falta ${k}`);
      assert.equal(p.falsas.length, 2, p.palabra);
      assert.equal(typeof p.verificar, 'boolean', p.palabra);
      if (p.verificar) assert.ok(p.nota_verificar, `${p.palabra}: falta nota_verificar`);
      assert.ok(!seen.has(p.palabra), `palabra repetida: ${p.palabra}`);
      seen.add(p.palabra);
    }
  }
  assert.equal(seen.size, 123);
});

test('ciclo: tras el último día se vuelve al primero', () => {
  // 10 de noviembre de 2026 = pliego 41 (el último); el 11 vuelve a empezar.
  const n = L.dayNumber(L.parseISODate('2026-11-10'), L.CONFIG.START_DATE);
  assert.equal(n, 41);
  assert.equal(L.contentForDay(data.dias, n), data.dias[40]);
  assert.equal(L.contentForDay(data.dias, n + 1), data.dias[0]);
  assert.equal(L.contentForDay(data.dias, n + 2), data.dias[1]);
});

test('selección diaria: día según la fecha de inicio', () => {
  assert.equal(L.dayNumber(START, L.CONFIG.START_DATE), 1);
  assert.equal(L.dayNumber(addDays(START, 1), L.CONFIG.START_DATE), 2);
  assert.equal(L.dayNumber(addDays(START, 9), L.CONFIG.START_DATE), 10);
  assert.equal(L.dayNumber(addDays(START, 10), L.CONFIG.START_DATE), 11);
  assert.equal(L.dayNumber(addDays(START, -1), L.CONFIG.START_DATE), 0);  // aún no empieza
  // Mismo día a cualquier hora
  const s = START;
  assert.equal(L.dayNumber(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 1), L.CONFIG.START_DATE), 1);
  assert.equal(L.dayNumber(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59, 59), L.CONFIG.START_DATE), 1);
});

test('selección diaria: inmune al cambio de hora (último domingo de octubre/marzo)', () => {
  const a = L.parseISODate('2026-10-24'), b = L.parseISODate('2026-10-26');
  assert.equal(L.dayNumber(b, '2026-10-24') - L.dayNumber(a, '2026-10-24'), 2);
  assert.equal(L.dayNumber(L.parseISODate('2027-03-29'), '2027-03-27'), 3);
});

test('orden de opciones: estable para el mismo día y con la verdadera siempre presente', () => {
  const positions = [0, 0, 0];
  data.dias.forEach((dia, i) => {
    dia.palabras.forEach(p => {
      const a = L.buildOptions(p, i + 1), b = L.buildOptions(p, i + 1);
      assert.deepEqual(a, b);
      assert.equal(a.filter(o => o.isTrue).length, 1);
      assert.equal(a.find(o => o.isTrue).text, p.verdadera);
      positions[a.findIndex(o => o.isTrue)]++;
    });
  });
  // La verdadera no cae siempre en la misma posición
  assert.ok(positions.filter(n => n > 0).length >= 2, `posiciones: ${positions}`);
});

test('racha: días consecutivos suman, un hueco la reinicia', () => {
  const st = L.emptyState();
  playDay(st, 1, [true, true, false]);
  assert.equal(st.stats.streak, 1);
  playDay(st, 2, [true, true, true]);
  playDay(st, 3, [false, false, false]);
  assert.equal(st.stats.streak, 3);
  assert.equal(L.currentStreak(st, 3), 3);
  assert.equal(L.currentStreak(st, 4), 3);   // hoy aún sin jugar: se mantiene
  assert.equal(L.currentStreak(st, 5), 0);   // se saltó un día
  playDay(st, 5, [true, false, true]);
  assert.equal(st.stats.streak, 1);
  assert.equal(st.stats.maxStreak, 3);
  assert.equal(st.stats.played, 4);
  assert.equal(st.stats.correct, 2 + 3 + 0 + 2);
  assert.deepEqual(st.stats.dist, [1, 0, 2, 1]);
});

test('no se puede volver a jugar ni repetir respuesta el mismo día', () => {
  const st = L.emptyState();
  assert.equal(L.recordAnswer(st, 1, 0, true), true);
  assert.equal(L.recordAnswer(st, 1, 0, false), false); // doble toque
  assert.equal(L.recordAnswer(st, 1, 2, true), false);  // fuera de orden
  L.recordAnswer(st, 1, 1, true);
  L.recordAnswer(st, 1, 2, true);
  assert.equal(L.recordAnswer(st, 1, 3, true), false);
  L.finishGame(st, 1); // idempotente
  assert.equal(st.stats.played, 1);
  assert.equal(st.stats.streak, 1);
});

test('persistencia en almacenamiento', () => {
  const storage = memoryStorage();
  const st = L.emptyState();
  playDay(st, 1, [true, false, true]);
  L.saveState(storage, st);
  const back = L.loadState(storage);
  assert.deepEqual(back.games[1].results, [true, false, true]);
  assert.equal(back.stats.streak, 1);
  storage.setItem(L.CONFIG.STORAGE_KEY, '{roto');
  assert.deepEqual(L.loadState(storage), L.emptyState());
});

test('texto para compartir: marcas sin revelar respuestas', () => {
  const t = L.shareText(4, [true, false, true]);
  assert.equal(t, 'Mentidero nº 4 ▰▱▰ 2/3 aciertos\njoseleking.github.io/Mentidero');
  for (const dia of data.dias) for (const p of dia.palabras) assert.ok(!t.includes(p.palabra));
});

test('cuenta atrás hasta medianoche', () => {
  const d = new Date(2026, 9, 1, 23, 0, 0);
  assert.equal(L.msUntilNextDay(d), 3600000);
  assert.equal(L.formatCountdown(3600000), '01:00:00');
  assert.equal(L.formatCountdown(3661000 + 999), '01:01:01');
  assert.equal(L.formatCountdown(-5), '00:00:00');
});
