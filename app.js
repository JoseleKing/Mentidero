/* ==========================================================================
   Mentidero — lógica del juego (sin dependencias ni servidor)
   ========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  var CONFIG = {
    // Día 1 del reto (fecha local del jugador, formato AAAA-MM-DD).
    START_DATE: '2026-10-01',
    WORDS_URL: 'words.json',
    STORAGE_KEY: 'mentidero:v1',
    WORDS_PER_DAY: 3
  };

  var MS_PER_DAY = 86400000;

  // ---------------------------------------------------------------------------
  // Lógica pura (sin DOM) — exportada para las pruebas
  // ---------------------------------------------------------------------------

  function parseISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    var date = new Date(y, mo, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
    return date;
  }

  function toISODate(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  // Número de días naturales entre dos fechas locales (inmune al cambio de hora).
  function daysBetween(from, to) {
    var a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    var b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / MS_PER_DAY);
  }

  // Día del reto: 1 el día de inicio, 2 el siguiente… (≤ 0 si aún no ha empezado).
  function dayNumber(now, startISO) {
    return daysBetween(parseISODate(startISO), now) + 1;
  }

  // Hash FNV-1a de 32 bits.
  function hashString(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Generador pseudoaleatorio con semilla (mulberry32).
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Opciones de una palabra en orden aleatorio pero estable para ese día.
  function buildOptions(entry, day) {
    var options = [{ text: entry.verdadera, isTrue: true }].concat(
      entry.falsas.map(function (t) { return { text: t, isTrue: false }; })
    );
    var rand = seededRandom(hashString(CONFIG.START_DATE + '#' + day + '#' + entry.palabra));
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = options[i]; options[i] = options[j]; options[j] = tmp;
    }
    return options;
  }

  function emptyState() {
    return {
      introSeen: false,
      games: {},
      stats: { played: 0, correct: 0, streak: 0, maxStreak: 0, lastDay: null, dist: [0, 0, 0, 0] }
    };
  }

  function loadState(storage) {
    try {
      var raw = storage && storage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return emptyState();
      var parsed = JSON.parse(raw);
      var base = emptyState();
      return {
        introSeen: !!parsed.introSeen,
        games: parsed.games || {},
        stats: Object.assign(base.stats, parsed.stats || {})
      };
    } catch (e) {
      return emptyState();
    }
  }

  function saveState(storage, state) {
    try { storage && storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
  }

  function getGame(state, day) {
    if (!state.games[day]) state.games[day] = { results: [], done: false };
    return state.games[day];
  }

  // Registra la respuesta de la palabra `index` del día. Devuelve true si es nueva.
  function recordAnswer(state, day, index, isRight) {
    var game = getGame(state, day);
    if (game.done || game.results.length !== index) return false;
    game.results.push(!!isRight);
    if (game.results.length === CONFIG.WORDS_PER_DAY) finishGame(state, day);
    return true;
  }

  // Cierra la partida del día y actualiza estadísticas y racha (idempotente).
  function finishGame(state, day) {
    var game = getGame(state, day);
    if (game.done) return;
    game.done = true;
    var score = game.results.filter(Boolean).length;
    var s = state.stats;
    s.played += 1;
    s.correct += score;
    s.dist[score] = (s.dist[score] || 0) + 1;
    if (s.lastDay === day - 1) s.streak += 1;
    else if (s.lastDay !== day) s.streak = 1;
    s.lastDay = day;
    if (s.streak > s.maxStreak) s.maxStreak = s.streak;
  }

  // Racha visible hoy: se pierde si ayer no se jugó (y hoy tampoco aún).
  function currentStreak(state, today) {
    var s = state.stats;
    if (s.lastDay === null) return 0;
    return s.lastDay >= today - 1 ? s.streak : 0;
  }

  function shareText(day, results) {
    var dots = results.map(function (r) { return r ? '🟢' : '🔴'; }).join('');
    var score = results.filter(Boolean).length;
    return 'Mentidero #' + day + ' ' + dots + '\n' + score + '/' + results.length + ' verdades descubiertas';
  }

  function msUntilNextDay(now) {
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next - now;
  }

  function formatCountdown(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    return [h, m, s].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }

  var Logic = {
    CONFIG: CONFIG,
    parseISODate: parseISODate,
    toISODate: toISODate,
    dayNumber: dayNumber,
    hashString: hashString,
    seededRandom: seededRandom,
    buildOptions: buildOptions,
    emptyState: emptyState,
    loadState: loadState,
    saveState: saveState,
    recordAnswer: recordAnswer,
    finishGame: finishGame,
    currentStreak: currentStreak,
    shareText: shareText,
    msUntilNextDay: msUntilNextDay,
    formatCountdown: formatCountdown
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return;

  // ---------------------------------------------------------------------------
  // Interfaz
  // ---------------------------------------------------------------------------

  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalBody = document.getElementById('modal-body');
  var toastEl = document.getElementById('toast');
  var storage = (function () { try { return window.localStorage; } catch (e) { return null; } })();

  var state = loadState(storage);
  var words = null;     // array de días de words.json
  var today = 0;        // número de día del reto
  var countdownTimer = null;
  var toastTimer = null;
  var LETTERS = ['A', 'B', 'C'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function longDate(d) {
    return d.getDate() + ' de ' + MONTHS[d.getMonth()] + ' de ' + d.getFullYear();
  }

  function persist() { saveState(storage, state); }

  // Con la partida de hoy terminada, la mano ☜ marca Mentidero como «Hecho» en Almanaque.
  function avisarAlmanaque() {
    if (window.almanaqueHecho) window.almanaqueHecho();
  }

  function setSub(text) { document.getElementById('masthead-sub').textContent = text; }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2200);
  }

  function render(html) {
    stopCountdown();
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  // ---------- Modal ----------

  function openModal(html) {
    modalBody.innerHTML = html;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }

  function closeModal() {
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }

  function introHTML() {
    return '' +
      '<h2 id="modal-title">¿Qué es un mentidero?</h2>' +
      '<p class="lead">En el Madrid del Siglo de Oro, los mentideros eran los corrillos donde se juntaba la gente ociosa a ' +
      'propagar noticias, chismes y rumores. Allí, la verdad y el bulo corrían de boca en boca, y no siempre era fácil distinguirlos.</p>' +
      '<div class="fleuron">❦ ❦ ❦</div>' +
      '<ol class="steps">' +
      '<li>Cada día hay <b>tres palabras</b> raras, pero reales, del español.</li>' +
      '<li>Cada una trae tres definiciones: <b>una verdadera</b> y dos bulos.</li>' +
      '<li>Toca la que creas cierta. Solo hay un intento por palabra.</li>' +
      '<li>Vuelve mañana: el pliego del día es el mismo para todos, y cada día que juegas suma a tu racha.</li>' +
      '</ol>';
  }

  function statsHTML() {
    var s = state.stats;
    var pct = s.played ? Math.round(s.correct / (s.played * CONFIG.WORDS_PER_DAY) * 100) : 0;
    return '' +
      '<div class="stats">' +
      '<div><b>' + s.played + '</b><span>Días jugados</span></div>' +
      '<div><b>' + currentStreak(state, today) + '</b><span>Racha actual</span></div>' +
      '<div><b>' + s.maxStreak + '</b><span>Mejor racha</span></div>' +
      '<div><b>' + pct + '%</b><span>Aciertos</span></div>' +
      '</div>';
  }

  function showIntro() { openModal(introHTML()); }

  function showStats() {
    var dist = state.stats.dist;
    var rows = [3, 2, 1, 0].map(function (n) {
      return '<li><b>' + n + '/3</b> — ' + (dist[n] || 0) + (dist[n] === 1 ? ' día' : ' días') + '</li>';
    }).join('');
    openModal('<h2 id="modal-title">Estadísticas</h2>' + statsHTML() +
      '<ul class="recap">' + rows + '</ul>');
  }

  // ---------- Pantallas ----------

  function screenIntro() {
    setSub('Gaceta de verdades y bulos');
    render(
      '<section class="screen">' +
      '<p class="kicker">Aviso al lector</p>' +
      introHTML().replace(/<h2[^>]*>.*?<\/h2>/, '') +
      '<button class="btn" id="btn-start" type="button">Entrar al mentidero</button>' +
      '</section>'
    );
    document.getElementById('btn-start').addEventListener('click', function () {
      state.introSeen = true;
      persist();
      route();
    });
  }

  function screenQuestion(index) {
    var entry = words[today - 1].palabras[index];
    var game = getGame(state, today);
    var options = buildOptions(entry, today);

    var dots = '';
    for (var i = 0; i < CONFIG.WORDS_PER_DAY; i++) {
      var cls = i < game.results.length ? (game.results[i] ? 'is-right' : 'is-wrong') : (i === index ? 'is-current' : '');
      dots += '<span class="' + cls + '"></span>';
    }

    render(
      '<section class="screen">' +
      '<div class="progress" aria-label="Palabra ' + (index + 1) + ' de ' + CONFIG.WORDS_PER_DAY + '">' + dots + '</div>' +
      '<div class="word"><h2>' + esc(entry.palabra) + '</h2>' +
      '<p class="word__cat">' + esc(entry.categoria || '') + '</p></div>' +
      '<p class="prompt">¿Cuál es la verdad y cuáles los bulos?</p>' +
      '<ul class="options">' + options.map(function (o, k) {
        return '<li><button class="option" type="button" data-k="' + k + '">' +
          '<span class="option__letter">' + LETTERS[k] + '</span>' +
          '<span class="option__text"><span class="option__ink">' + esc(o.text) + '</span></span></button></li>';
      }).join('') + '</ul>' +
      '<div id="reveal"></div>' +
      '</section>'
    );

    var buttons = app.querySelectorAll('.option');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        var k = +btn.getAttribute('data-k');
        var isRight = options[k].isTrue;
        if (!recordAnswer(state, today, index, isRight)) return;
        persist();
        if (getGame(state, today).done) avisarAlmanaque();
        revealAnswer(entry, options, buttons, k, index);
      });
    });
  }

  function revealAnswer(entry, options, buttons, chosen, index) {
    var falseOrder = 0;
    Array.prototype.forEach.call(buttons, function (btn, k) {
      btn.disabled = true;
      if (k === chosen) btn.classList.add('is-chosen');
      if (options[k].isTrue) {
        btn.classList.add('is-true');
      } else {
        btn.classList.add('is-false');
        btn.style.setProperty('--delay', (k === chosen ? 0 : 0.15 + falseOrder * 0.15) + 's');
        falseOrder++;
      }
    });

    var dot = app.querySelectorAll('.progress span')[index];
    dot.className = options[chosen].isTrue ? 'is-right' : 'is-wrong';

    var right = options[chosen].isTrue;
    var last = index === CONFIG.WORDS_PER_DAY - 1;
    var reveal = document.getElementById('reveal');
    reveal.innerHTML =
      '<p class="verdict ' + (right ? 'verdict--right' : '') + '">' +
      (right ? '¡Bien visto! Esa es la verdad.' : '¡Bulo! Te la han colado.') + '</p>' +
      '<p class="curio"><strong>Curiosidad.</strong> ' + esc(entry.curiosidad) + '</p>' +
      '<div class="reveal-actions"><button class="btn" id="btn-next" type="button">' +
      (last ? 'Ver el resultado' : 'Siguiente palabra') + '</button></div>';

    var next = document.getElementById('btn-next');
    next.addEventListener('click', route);
    setTimeout(function () {
      reveal.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 650);
  }

  function screenSummary() {
    var game = getGame(state, today);
    var day = words[today - 1];
    var score = game.results.filter(Boolean).length;
    var phrases = [
      'Hoy los bulos se han salido con la suya.',
      'Algo has olido, pero el mentidero te ha engañado.',
      'Buen oído: casi nadie te la cuela.',
      '¡Ni un bulo te ha pasado! Digno de la Real Academia.'
    ];
    var emoji = game.results.map(function (r) { return r ? '🟢' : '🔴'; }).join('');
    var isLast = today === words.length;

    render(
      '<section class="screen">' +
      '<p class="kicker">Pliego n.º ' + today + ' · resultado</p>' +
      '<div class="score">' +
      '<div class="score__big">' + score + '/' + CONFIG.WORDS_PER_DAY + '</div>' +
      '<p class="score__emoji" aria-hidden="true">' + emoji + '</p>' +
      '<p class="score__phrase">' + phrases[score] + '</p>' +
      '</div>' +
      '<ul class="recap">' + day.palabras.map(function (p, i) {
        var ok = game.results[i];
        return '<li><span class="mark ' + (ok ? '' : 'mark--wrong') + '">' + (ok ? '✔' : '✘') + '</span> ' +
          '<b>' + esc(p.palabra) + '</b>: ' + esc(p.verdadera) + '</li>';
      }).join('') + '</ul>' +
      statsHTML() +
      '<div class="stack">' +
      '<button class="btn" id="btn-share" type="button">Compartir resultado</button>' +
      '</div>' +
      '<p class="countdown">' + (isLast ? 'Era el último pliego del prototipo. La imprenta cierra en' : 'Próximo pliego en') +
      '<time id="countdown">--:--:--</time></p>' +
      '</section>'
    );

    document.getElementById('btn-share').addEventListener('click', function () {
      share(shareText(today, game.results));
    });
    startCountdown();
  }

  function screenEnded() {
    setSub('Fin del prototipo');
    render(
      '<section class="screen screen--center">' +
      '<p class="kicker">Se acabó la tinta</p>' +
      '<div class="fleuron">❦</div>' +
      '<p>Has llegado al final de este prototipo de <b>Mentidero</b>: los ' + words.length +
      ' pliegos de palabras ya se han publicado.</p>' +
      '<p>Los impresores andan componiendo nuevas palabras. <b>Muy pronto habrá más.</b> ¡Gracias por jugar!</p>' +
      (state.stats.played ? statsHTML() : '') +
      '</section>'
    );
  }

  function screenNotStarted() {
    setSub('Gaceta de verdades y bulos');
    var start = parseISODate(CONFIG.START_DATE);
    render(
      '<section class="screen screen--center">' +
      '<p class="kicker">Próximamente</p>' +
      '<p>El primer pliego de <b>Mentidero</b> se publicará el ' + longDate(start) + '.</p>' +
      '</section>'
    );
  }

  function screenError() {
    render(
      '<section class="screen screen--center">' +
      '<p class="kicker">Tinta derramada</p>' +
      '<p>No se han podido cargar las palabras. Si abriste el archivo directamente, sírvelo con un servidor local ' +
      '(consulta el README).</p>' +
      '</section>'
    );
  }

  // ---------- Compartir ----------

  function share(text) {
    var url = location.origin + location.pathname;
    var full = text + (location.protocol.indexOf('http') === 0 ? '\n' + url : '');
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      navigator.share({ text: full }).catch(function (err) {
        if (err && err.name !== 'AbortError') copy(full);
      });
      return;
    }
    copy(full);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Resultado copiado al portapapeles'); },
        function () { legacyCopy(text); }
      );
    } else {
      legacyCopy(text);
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toast(ok ? 'Resultado copiado al portapapeles' : text);
  }

  // ---------- Cuenta atrás ----------

  function startCountdown() {
    var el = document.getElementById('countdown');
    function tick() {
      var ms = msUntilNextDay(new Date());
      el.textContent = formatCountdown(ms);
      if (ms <= 1000) {
        stopCountdown();
        setTimeout(boot, 1500);
      }
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  // ---------- Enrutado ----------

  function route() {
    if (today < 1) return screenNotStarted();
    if (today > words.length) return screenEnded();

    setSub('Pliego n.º ' + today + ' · ' + longDate(new Date()));

    if (!state.introSeen) return screenIntro();
    var game = getGame(state, today);
    if (game.done) {
      avisarAlmanaque();
      return screenSummary();
    }
    screenQuestion(game.results.length);
  }

  function boot() {
    today = dayNumber(new Date(), CONFIG.START_DATE);
    state = loadState(storage);
    route();
  }

  // La portada con el logo se ve al menos PORTADA_MS desde que se abre la página y luego se desvanece.
  function retirarPortada() {
    var PORTADA_MS = 900, FUNDIDO_MS = 400;
    var portada = document.getElementById('portada');
    if (!portada) return;
    setTimeout(function () {
      portada.classList.add('oculta');
      setTimeout(function () { portada.remove(); }, FUNDIDO_MS);
    }, Math.max(0, PORTADA_MS - performance.now()));
  }

  document.getElementById('btn-help').addEventListener('click', showIntro);
  document.getElementById('btn-stats').addEventListener('click', showStats);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  fetch(CONFIG.WORDS_URL)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { words = data.dias; boot(); })
    .catch(function () { screenError(); })
    .then(retirarPortada);

  // Si la pestaña vuelve a primer plano en otro día, recargar el reto.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && words && dayNumber(new Date(), CONFIG.START_DATE) !== today) boot();
  });
})();
