/*
 * Aldeia Realty — live listings browse
 * ------------------------------------
 * Progressive enhancement for properties.html / pt/properties.html.
 * The nightly build (scripts/build-listings.js) still renders static cards
 * into #ar-grid, so the page works with no JS and paints instantly. This
 * script then loads data/listings-<lang>.json and takes over the grid:
 *
 *   - filter bar (town · price · T · sale/rent · near beach · pool · land)
 *   - results update instantly, no page load
 *   - URL reflects the filters (?town=…&max=…) so a view is shareable
 *   - empty state offers "alert me" → Formspree
 *   - "Synced from our CRM · updated Xh ago" from the feed timestamp
 *
 * No dependencies. ES5-ish on purpose (matches the rest of the site).
 */
(function () {
  'use strict';

  var root = document.getElementById('ar-browse');
  var grid = document.getElementById('ar-grid');
  var empty = document.getElementById('ar-empty');
  if (!root || !grid) return;

  var isPt = (document.documentElement.lang || 'en').toLowerCase().indexOf('pt') === 0;
  var BASE = isPt ? '../' : '';            // pt/ pages live one level down
  var DATA_URL = BASE + 'data/listings-' + (isPt ? 'pt' : 'en') + '.json';
  var FORM_URL = 'https://formspree.io/f/xkoenyzb';
  var TOWNS = ['Caldas da Rainha', 'Óbidos', 'Peniche', 'Nazaré', 'Leiria'];
  var BEACH_MAX = 15;      // "near beach" = ≤ 15 min by car
  var LAND_MIN = 500;      // "land" = plot of 500 m² or more

  var T = isPt ? {
    town: 'Zona', allTowns: 'Todas as zonas', other: 'Outras',
    price: 'Preço', anyPrice: 'Qualquer preço', upTo: 'até', from: 'a partir de',
    typ: 'Tipologia', anyT: 'Qualquer T',
    sale: 'Venda', rent: 'Arrendar', both: 'Ambos',
    beach: 'Praia < 15 min', pool: 'Piscina', land: 'Terreno',
    sort: 'Ordenar', sortNew: 'Mais recentes', sortLow: 'Preço ↑', sortHigh: 'Preço ↓',
    clear: 'Limpar filtros', copy: 'Copiar link desta pesquisa', copied: 'Link copiado',
    homes: function (n) { return n === 1 ? '1 imóvel' : n + ' imóveis'; },
    synced: 'Sincronizado com o nosso CRM', updated: 'atualizado', ago: function (s) { return 'há ' + s; },
    justNow: 'agora mesmo', min: 'min', h: 'h', d: 'd',
    upd: 'Atualizado', bath: 'WC', energy: 'Energ.', exclusive: 'Exclusivo',
    perMonth: '/ mês', or: 'ou', view: 'Ver Imóvel →',
    emptyKicker: 'Nenhum imóvel corresponde',
    emptyTitle: function (f) { return 'Nada em ' + f + ' <em>neste momento</em>.'; },
    emptyBody: 'É uma resposta real, não uma falha nos nossos dados — partilhamos angariações com todas as agências da Costa de Prata. Duas coisas que costumam ajudar:',
    widen: 'Alargar para', include: 'Incluir', more: function (n) { return '+' + n + (n === 1 ? ' imóvel' : ' imóveis'); },
    alertKicker: 'Ou deixe-nos ficar atentos por si',
    alertBody: 'Enviamos um email quando surgir algo que corresponda a estes filtros. Sem conta, sem newsletter.',
    email: 'o-seu@email.com', alertBtn: 'Avisem-me quando aparecer →',
    sending: 'A enviar…', sent: 'Recebido. Avisamos assim que algo corresponder.', failed: 'Não foi possível enviar. Escreva para info@aldeiarealty.com.',
    needEmail: 'Indique um email válido.',
    everywhere: 'toda a Costa de Prata',
    emptyBodyNone: 'É uma resposta real, não uma falha nos nossos dados — partilhamos angariações com todas as agências da Costa de Prata. Quando surgir, queremos que seja o primeiro a saber.',
    noBeach: 'Qualquer distância à praia', noPool: 'Com ou sem piscina', noLand: 'Com ou sem terreno', anyOp: 'Venda e arrendamento'
  } : {
    town: 'Town', allTowns: 'All five areas', other: 'Other',
    price: 'Price', anyPrice: 'Any price', upTo: 'up to', from: 'from',
    typ: 'Typology', anyT: 'Any T',
    sale: 'Sale', rent: 'Rent', both: 'Both',
    beach: 'Beach < 15 min', pool: 'Pool', land: 'Land',
    sort: 'Sort', sortNew: 'Newest', sortLow: 'Price ↑', sortHigh: 'Price ↓',
    clear: 'Clear filters', copy: 'Copy link to this view', copied: 'Link copied',
    homes: function (n) { return n === 1 ? '1 home' : n + ' homes'; },
    synced: 'Synced from our CRM', updated: 'updated', ago: function (s) { return s + ' ago'; },
    justNow: 'just now', min: 'min', h: 'h', d: 'd',
    upd: 'Updated', bath: 'bath', energy: 'Energy', exclusive: 'Exclusive',
    perMonth: '/ month', or: 'or', view: 'View Property →',
    emptyKicker: '0 homes match',
    emptyTitle: function (f) { return 'Nothing in ' + f + ' <em>right now</em>.'; },
    emptyBody: 'That’s a real answer, not a gap in our data — we share listings with every agency on the Silver Coast. Two things that usually help:',
    widen: 'Widen to', include: 'Include', more: function (n) { return '+' + n + (n === 1 ? ' home' : ' homes'); },
    alertKicker: 'Or let us watch for you',
    alertBody: 'We’ll email you when something matches these filters. No account, no newsletter.',
    email: 'you@email.com', alertBtn: 'Alert me when it appears →',
    sending: 'Sending…', sent: 'Received. We’ll email you the moment something matches.', failed: 'Could not send. Please email info@aldeiarealty.com directly.',
    needEmail: 'Add a valid email so we can reach you.',
    everywhere: 'the whole Silver Coast',
    emptyBodyNone: 'That\u2019s a real answer, not a gap in our data \u2014 we share listings with every agency on the Silver Coast. When one appears, you should be the first to know.',
    noBeach: 'Any distance to the beach', noPool: 'With or without a pool', noLand: 'With or without land', anyOp: 'Sale and rent'
  };

  var PRICE_STEPS = [150000, 200000, 250000, 300000, 400000, 500000, 650000, 800000, 1000000, 1500000];

  // ---------- helpers ----------
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function euro(n) { return n == null ? '' : Number(n).toLocaleString('pt-PT').replace(/ | /g, '.') + ' €'; }
  function euroShort(n) { return n >= 1000000 ? ('€' + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M') : ('€' + Math.round(n / 1000) + 'k'); }
  function parseFeedDate(s) { // "2026-09-02 12:01:27" (feed local time) → Date
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  function relTime(d) {
    if (!d) return '';
    var s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 90) return T.justNow;
    if (s < 3600) return T.ago(Math.round(s / 60) + ' ' + T.min);
    if (s < 86400) return T.ago(Math.round(s / 3600) + ' ' + T.h);
    return T.ago(Math.round(s / 86400) + ' ' + T.d);
  }
  function townOf(p) {
    var c = fold(p.location);
    for (var i = 0; i < TOWNS.length; i++) if (fold(TOWNS[i]) === c) return TOWNS[i];
    return 'other';
  }
  function tOf(p) { return p.bedrooms || 0; }

  // ---------- state ↔ URL ----------
  var state = { town: '', min: 0, max: 0, t: 0, op: 'any', beach: false, pool: false, land: false, sort: 'new' };
  function readUrl() {
    var q = new URLSearchParams(location.search);
    state.town = q.get('town') || '';
    state.min = +q.get('min') || 0;
    state.max = +q.get('max') || 0;
    state.t = +q.get('t') || 0;
    state.op = q.get('op') || 'any';
    state.beach = q.get('beach') === '1';
    state.pool = q.get('pool') === '1';
    state.land = q.get('land') === '1';
    state.sort = q.get('sort') || 'new';
  }
  function writeUrl() {
    var q = new URLSearchParams();
    if (state.town) q.set('town', state.town);
    if (state.min) q.set('min', state.min);
    if (state.max) q.set('max', state.max);
    if (state.t) q.set('t', state.t);
    if (state.op !== 'any') q.set('op', state.op);
    if (state.beach) q.set('beach', '1');
    if (state.pool) q.set('pool', '1');
    if (state.land) q.set('land', '1');
    if (state.sort !== 'new') q.set('sort', state.sort);
    var qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }
  function isFiltered() {
    return !!(state.town || state.min || state.max || state.t || state.op !== 'any' || state.beach || state.pool || state.land);
  }

  // ---------- filtering ----------
  function matches(p, s) {
    if (s.town && townOf(p) !== s.town) return false;
    if (s.op === 'sale' && !(p.operation === 'sale' || p.operation === 'both')) return false;
    if (s.op === 'rent' && !(p.operation === 'rent' || p.operation === 'both')) return false;
    if (s.op === 'both' && p.operation !== 'both') return false;
    // price filter looks at the sale price when a sale is on offer, else rent
    var price = (s.op === 'rent') ? (p.priceRent || p.price) : (p.priceSale || p.price);
    if (s.min && !(price >= s.min)) return false;
    if (s.max && !(price <= s.max)) return false;
    if (s.t && !(tOf(p) >= s.t)) return false;
    if (s.beach && !(p.beachMinutes != null && p.beachMinutes <= BEACH_MAX)) return false;
    if (s.pool && !p.pool) return false;
    if (s.land && !(p.plot && p.plot >= LAND_MIN)) return false;
    return true;
  }
  function apply(list, s) { return list.filter(function (p) { return matches(p, s); }); }
  function sorted(list) {
    var out = list.slice();
    if (state.sort === 'low') out.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
    else if (state.sort === 'high') out.sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
    else out.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
    return out;
  }

  // ---------- render: filter bar ----------
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function renderBar(all) {
    var towns = TOWNS.map(function (t) { return opt(t, t, state.town); }).join('');
    var hasOther = all.some(function (p) { return townOf(p) === 'other'; });
    if (hasOther) towns += opt('other', T.other, state.town);
    var mins = '<option value="0">' + esc(T.anyPrice) + '</option>' + PRICE_STEPS.map(function (v) { return opt(v, T.from + ' ' + euroShort(v), state.min); }).join('');
    var maxs = '<option value="0">' + esc(T.anyPrice) + '</option>' + PRICE_STEPS.map(function (v) { return opt(v, T.upTo + ' ' + euroShort(v), state.max); }).join('');
    var ts = '<option value="0">' + esc(T.anyT) + '</option>' + [1, 2, 3, 4, 5].map(function (n) { return opt(n, 'T' + n + ' +', state.t); }).join('');
    root.innerHTML =
      '<form class="ar-fbar" id="ar-fbar" onsubmit="return false">' +
        '<label class="ar-fsel"><span>' + esc(T.town) + '</span><select name="town"><option value="">' + esc(T.allTowns) + '</option>' + towns + '</select></label>' +
        '<label class="ar-fsel"><span>' + esc(T.price) + ' ' + esc(T.from) + '</span><select name="min">' + mins + '</select></label>' +
        '<label class="ar-fsel"><span>' + esc(T.price) + ' ' + esc(T.upTo) + '</span><select name="max">' + maxs + '</select></label>' +
        '<label class="ar-fsel"><span>' + esc(T.typ) + '</span><select name="t">' + ts + '</select></label>' +
        '<div class="ar-fseg" role="group" aria-label="' + esc(T.sale + ' / ' + T.rent) + '">' +
          seg('any', isPt ? 'Tudo' : 'All') + seg('sale', T.sale) + seg('rent', T.rent) + seg('both', T.both) +
        '</div>' +
        chip('beach', T.beach) + chip('pool', T.pool) + chip('land', T.land) +
      '</form>' +
      '<div class="ar-fmeta">' +
        '<span class="ar-fcount" id="ar-count" aria-live="polite"></span>' +
        '<span class="ar-fsync" id="ar-sync"></span>' +
        '<span class="ar-factions">' +
          '<label class="ar-fsort"><span>' + esc(T.sort) + '</span><select name="sort" form="ar-fbar">' + opt('new', T.sortNew, state.sort) + opt('low', T.sortLow, state.sort) + opt('high', T.sortHigh, state.sort) + '</select></label>' +
          '<button type="button" class="ar-flink" id="ar-clear" hidden>' + esc(T.clear) + '</button>' +
          '<button type="button" class="ar-flink" id="ar-copy">' + esc(T.copy) + '</button>' +
        '</span>' +
      '</div>';

    function seg(v, label) { return '<button type="button" data-op="' + v + '" class="ar-fsegb' + (state.op === v ? ' on' : '') + '" aria-pressed="' + (state.op === v) + '">' + esc(label) + '</button>'; }
    function chip(k, label) { return '<button type="button" data-chip="' + k + '" class="ar-fchip' + (state[k] ? ' on' : '') + '" aria-pressed="' + !!state[k] + '">' + esc(label) + '</button>'; }

    var form = document.getElementById('ar-fbar');
    form.addEventListener('change', function (e) {
      var el = e.target;
      if (!el.name) return;
      if (el.name === 'town') state.town = el.value;
      else if (el.name === 'sort') state.sort = el.value;
      else state[el.name] = +el.value || 0;
      update();
    });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.op) {
        state.op = b.dataset.op;
        Array.prototype.forEach.call(form.querySelectorAll('.ar-fsegb'), function (x) {
          var on = x.dataset.op === state.op; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on);
        });
        update();
      } else if (b.dataset.chip) {
        var k = b.dataset.chip; state[k] = !state[k];
        b.classList.toggle('on', state[k]); b.setAttribute('aria-pressed', state[k]);
        update();
      }
    });
    document.getElementById('ar-clear').addEventListener('click', function () {
      state = { town: '', min: 0, max: 0, t: 0, op: 'any', beach: false, pool: false, land: false, sort: state.sort };
      renderBar(all); update();
    });
    document.getElementById('ar-copy').addEventListener('click', function () {
      var btn = this, url = location.href;
      var done = function () { btn.textContent = T.copied; setTimeout(function () { btn.textContent = T.copy; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else { window.prompt('URL', url); }
    });
  }

  // ---------- render: cards ----------
  function cardHtml(p) {
    var href = BASE + p.url;
    var badge = p.operation === 'both' ? (isPt ? 'VENDA OU ARRENDAMENTO' : 'FOR SALE OR RENT')
              : p.operation === 'rent' ? (isPt ? 'ARRENDAR' : 'FOR RENT') : (isPt ? 'VENDA' : 'FOR SALE');
    var big, small = '';
    if (p.operation === 'rent') { big = euro(p.priceRent || p.price) + ' ' + T.perMonth; }
    else { big = euro(p.priceSale || p.price); if (p.priceRent) small = T.or + ' ' + euro(p.priceRent) + ' ' + T.perMonth; }
    var m2 = p.areaUseful || p.areaBuilt;
    var facts = [
      p.bedrooms ? 'T' + p.bedrooms : null,
      p.bathrooms ? p.bathrooms + ' ' + T.bath : null,
      m2 ? Math.round(m2) + ' m²' : null
    ].filter(Boolean).map(esc);
    var energy = p.energy ? '<span class="ar-energy">' + esc(T.energy + ' ' + p.energy) + '</span>' : '';
    var where = esc(p.location) + (p.zone && fold(p.zone) !== fold(p.location) ? ' · ' + esc(p.zone) : '');
    var upd = p.updated ? '<span class="ar-upd">' + esc(T.upd + ' ' + relTime(parseFeedDate(p.updated))) + '</span>' : '';
    return '<div class="prop-card ar-card">' +
      '<a href="' + esc(href) + '" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;height:100%">' +
        '<div class="prop-img" style="background-image:url(\'' + esc(p.image || '') + '\')">' +
          '<div class="prop-badge">' + badge + '</div>' +
          (p.exclusive ? '<div class="ar-excl">' + esc(T.exclusive) + '</div>' : '') +
        '</div>' +
        '<div class="prop-body">' +
          '<div class="ar-cardtop"><div class="prop-loc">' + where + '</div>' + upd + '</div>' +
          '<div class="ar-price">' + esc(big) + '</div>' +
          (small ? '<div class="ar-price-sm">' + esc(small) + '</div>' : '') +
          '<h3>' + esc(p.title) + '</h3>' +
          '<div class="ar-facts">' + facts.join('<i>·</i>') + (energy ? '<i>·</i>' + energy : '') + '</div>' +
          '<span class="prop-link">' + T.view + '</span>' +
        '</div>' +
      '</a>' +
    '</div>';
  }

  // ---------- render: empty state ----------
  function describeFilters() {
    var bits = [];
    bits.push(state.town ? (state.town === 'other' ? T.other : state.town) : T.everywhere);
    if (state.max) bits.push(T.upTo + ' ' + euroShort(state.max));
    if (state.min) bits.push(T.from + ' ' + euroShort(state.min));
    if (state.t) bits.push('T' + state.t + '+');
    if (state.beach) bits.push(T.beach.split(' ·')[0].toLowerCase());
    if (state.pool) bits.push(T.pool.toLowerCase());
    if (state.land) bits.push(T.land.toLowerCase());
    return bits.join(', ');
  }
  function suggestions(all) {
    // Relax one thing at a time and count what that would unlock.
    var out = [];
    function tryIt(label, patch) {
      var s = {}; for (var k in state) s[k] = state[k]; for (var j in patch) s[j] = patch[j];
      var n = apply(all, s).length;
      if (n > 0) out.push({ label: label, n: n, patch: patch });
    }
    if (state.max) {
      var next = PRICE_STEPS.filter(function (v) { return v > state.max; })[0];
      if (next) tryIt(T.widen + ' ' + euroShort(next), { max: next });
    }
    if (state.town && state.town !== 'other') tryIt(T.include + ' ' + T.allTowns.toLowerCase(), { town: '' });
    if (state.t > 1) tryIt('T' + (state.t - 1) + '+', { t: state.t - 1 });
    if (state.beach) tryIt(T.noBeach, { beach: false });
    if (state.pool) tryIt(T.noPool, { pool: false });
    if (state.land) tryIt(T.noLand, { land: false });
    if (state.op !== 'any') tryIt(T.anyOp, { op: 'any' });
    return out.slice(0, 3);
  }
  function renderEmpty(all) {
    var sugg = suggestions(all);
    empty.innerHTML =
      '<div class="ar-empty-in">' +
        '<div class="kicker">' + esc(T.emptyKicker) + '</div>' +
        '<h3>' + T.emptyTitle(esc(describeFilters())) + '</h3>' +
        '<p>' + esc(sugg.length ? T.emptyBody : T.emptyBodyNone) + '</p>' +
        (sugg.length ? '<div class="ar-sugg">' + sugg.map(function (s, i) {
          return '<button type="button" class="ar-suggb" data-i="' + i + '"><span>' + esc(s.label) + '</span><em>' + esc(T.more(s.n)) + '</em></button>';
        }).join('') + '</div>' : '') +
        '<form class="ar-alert" id="ar-alert" novalidate>' +
          '<div class="kicker">' + esc(T.alertKicker) + '</div>' +
          '<p>' + esc(T.alertBody) + '</p>' +
          '<div class="ar-alert-row">' +
            '<label for="ar-alert-email" class="sr-only">Email</label>' +
            '<input id="ar-alert-email" type="email" name="email" placeholder="' + esc(T.email) + '" autocomplete="email" required>' +
            '<button type="submit">' + esc(T.alertBtn) + '</button>' +
          '</div>' +
          '<div class="ar-rmsg" id="ar-alert-msg"></div>' +
        '</form>' +
      '</div>';
    empty.hidden = false;
    Array.prototype.forEach.call(empty.querySelectorAll('.ar-suggb'), function (b) {
      b.addEventListener('click', function () {
        var s = sugg[+b.dataset.i]; for (var k in s.patch) state[k] = s.patch[k];
        renderBar(all); update();
      });
    });
    document.getElementById('ar-alert').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('ar-alert-email'), msg = document.getElementById('ar-alert-msg');
      if (!input.value || !input.checkValidity()) { msg.textContent = T.needEmail; input.focus(); return; }
      msg.textContent = T.sending;
      var fd = new FormData();
      fd.append('email', input.value);
      fd.append('_subject', 'Listing alert - website');
      fd.append('filters', describeFilters());
      fd.append('url', location.href);
      fd.append('language', isPt ? 'pt' : 'en');
      fetch(FORM_URL, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
        .then(function (r) { msg.textContent = r.ok ? T.sent : T.failed; if (r.ok) input.value = ''; })
        .catch(function () { msg.textContent = T.failed; });
    });
  }

  // ---------- update ----------
  var ALL = [];
  function update() {
    writeUrl();
    var list = sorted(apply(ALL, state));
    grid.innerHTML = list.map(cardHtml).join('');
    grid.hidden = list.length === 0;
    document.getElementById('ar-count').textContent = T.homes(list.length);
    document.getElementById('ar-clear').hidden = !isFiltered();
    if (list.length) { empty.hidden = true; empty.innerHTML = ''; }
    else renderEmpty(ALL);
  }

  // ---------- boot ----------
  readUrl();
  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (json) {
      ALL = (json && json.listings) || [];
      if (!ALL.length) return; // keep whatever the build rendered
      renderBar(ALL);
      var syncEl = document.getElementById('ar-sync');
      var fd = parseFeedDate(json.feedUpdated);
      syncEl.innerHTML = '<span class="ar-dot" aria-hidden="true"></span>' + esc(T.synced) + (fd ? ' · ' + esc(T.updated + ' ' + relTime(fd)) : '');
      update();
      root.classList.add('is-ready');
    })
    .catch(function () { /* JSON missing or offline: static cards stay as they are */ });
})();
