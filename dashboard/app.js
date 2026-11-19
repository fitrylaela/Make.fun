// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, the token-bearing set shown apart, a per-protocol sheet with the model's own inputs and
// the protocol's farm plan, and the fit the whole board comes from. No network: every byte it shows is
// in data.js, and nothing here fetches, imports or links out.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D) return;

  var state = { q: '', category: 'all', tab: 'board', sort: 'implied', dir: -1, open: null };

  // ── formatting ─────────────────────────────────────────────────────────────
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'undated';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30) + 'mo';
    return Math.max(1, Math.round(days)) + 'd';
  }
  function multiple(x) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    if (x >= 1) return x.toFixed(1) + '×';
    return x.toFixed(2) + '×';
  }

  // ── tiny DOM helper ────────────────────────────────────────────────────────
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) {
        child.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else node.appendChild(child);
    }
    return node;
  }
  function svgSearch() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '14'); s.setAttribute('height', '14'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7');
    var l = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    l.setAttribute('d', 'M20 20l-4.2-4.2');
    s.appendChild(c); s.appendChild(l);
    return s;
  }

  // ── the model, restated in the page ────────────────────────────────────────
  // The page recomputes every row from the snapshot's own figures and the coefficients the fit found,
  // so what the reader sees and what board.json carries are visibly the same arithmetic.
  function recompute(row) {
    var c = D.coefficients;
    var m = D.multipliers;
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    growth = Math.min(D.model.growth_clip, Math.max(-D.model.growth_clip, growth));
    var days = row.age_days === null || row.age_days === undefined ? D.model.unknown_age_days : row.age_days;
    var effect = effectOf(row.category);
    var size = Math.exp(c.intercept + c.logTvl * Math.log(row.tvl_usd) + effect);
    var gf = clamp(1 + m.growth_weight * growth, m.growth_band[0], m.growth_band[1]);
    var af = clamp(1 + m.age_weight * Math.log(1 + Math.max(0, days) / 365), m.age_band[0], m.age_band[1]);
    return {
      size: Math.max(1, Math.round(size)),
      gf: gf,
      af: af,
      implied: Math.max(1, Math.round(size * gf * af))
    };
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  var effectIndex = null;
  function effectOf(category) {
    if (!effectIndex) {
      effectIndex = {};
      (D.categories || []).forEach(function (c) { effectIndex[c.category] = c.effect; });
    }
    return effectIndex[category || 'Uncategorised'] || 0;
  }

  // ── data slices ────────────────────────────────────────────────────────────
  function categories() {
    var seen = {};
    D.rows.forEach(function (r) { seen[r.category || 'Other'] = (seen[r.category || 'Other'] || 0) + 1; });
    return Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || (a < b ? -1 : 1); });
  }
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 1e9 : a.age_days; bv = b.age_days === null ? 1e9 : b.age_days; }
      else if (key === 'multiple') { av = a.value_per_tvl; bv = b.value_per_tvl; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  // ── hash state, so a view can be linked and screenshotted ──────────────────
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('c')) state.category = p.get('c');
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('p')) state.open = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('c', state.category);
    if (state.tab !== 'board') p.set('tab', state.tab);
    if (state.open) p.set('p', state.open);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname);
  }

  // ── masthead ───────────────────────────────────────────────────────────────
  function masthead() {
    var meta = document.getElementById('mast-meta');
    meta.textContent = '';
    meta.appendChild(el('span', null, 'snapshot ', el('b', null, D.as_of)));
    meta.appendChild(el('span', null, 'fit ', el('b', null, D.comparables + ' comparables')));
    meta.appendChild(el('span', null, 'R² ', el('b', null, String(D.r_squared))));
    meta.appendChild(el('span', null, D.model_version));

    var tabs = document.getElementById('tabs');
    tabs.textContent = '';
    [['board', 'Ranked board'], ['live', 'Token live'], ['method', 'The model']].forEach(function (t) {
      tabs.appendChild(el('button', {
        type: 'button', role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', text: t[1],
        onclick: function () { state.tab = t[0]; state.open = null; writeHash(); render(); }
      }));
    });
  }

  // ── the lede ───────────────────────────────────────────────────────────────
  function lede() {
    var top = D.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('div', { class: 'kicker', text: 'DefiLlama protocol index · ' + D.as_of }),
        el('h1', null, D.watchlist_size + ' protocols ', el('em', null, 'without a token'), ', ranked by what one would be worth'),
        el('p', { class: 'standfirst' },
          'Every protocol here records no token of its own. The board prices each one the way the market already prices its peers: ',
          el('b', null, D.comparables + ' token-bearing protocols'),
          ' in the same snapshot, fitted by size, seven-day growth, age and category. The house watchlist is the floor, not the ceiling, so the early radar adds ',
          el('b', null, D.early_size + ' more'),
          ' below it. ',
          'Rank 1 is ',
          el('b', null, top ? top.name : '—'),
          ', at ',
          el('b', null, top ? money(top.implied_value_usd) : '—'),
          '.'
        )
      ),
      el('div', { class: 'stats' },
        stat('Watchlist covered', D.watchlist_size + '/' + D.watchlist_size, 'every slug'),
        stat('Pre-token rows', String(D.board_size), D.early_size + ' below the floor'),
        stat('Top implied value', money(top ? top.implied_value_usd : 0), top ? top.name : ''),
        stat('Fit quality', 'R² ' + D.r_squared, D.comparables + ' comparables')
      )
    );
  }
  function stat(k, v, sub) {
    return el('div', { class: 'stat' },
      el('div', { class: 'k', text: k }),
      el('div', { class: 'v' }, v, sub ? el('small', null, ' ' + sub) : null)
    );
  }

  // ── toolbar ────────────────────────────────────────────────────────────────
  function toolbar() {
    var input = el('input', {
      type: 'search', id: 'q', value: state.q, placeholder: 'Search protocol, category or chain',
      'aria-label': 'Search the board', autocomplete: 'off',
      oninput: function () { state.q = input.value; writeHash(); renderBody(); }
    });
    var chips = el('div', { class: 'chips' },
      chip('All', 'all'),
      categories().slice(0, 7).map(function (c) { return chip(c, c); })
    );
    return el('div', { class: 'toolbar' },
      el('div', { class: 'search' }, svgSearch(), input),
      chips,
      el('span', { class: 'count', text: sorted(visibleRows()).length + ' of ' + D.board_size + ' rows' })
    );
  }
  function chip(label, value) {
    return el('button', {
      type: 'button', class: 'chip', text: label,
      'aria-pressed': state.category === value ? 'true' : 'false',
      onclick: function () { state.category = value; writeHash(); render(); }
    });
  }

  // ── the board ──────────────────────────────────────────────────────────────
  function headCell(label, key, cls) {
    var on = state.sort === key;
    return el('div', { class: cls || null },
      el('button', {
        type: 'button', class: on ? 'on' : null,
        text: label + (on ? (state.dir < 0 ? ' ↓' : ' ↑') : ''),
        onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = -1; }
          renderBody();
        }
      })
    );
  }
  function boardHead() {
    return el('div', { class: 'board-head' },
      el('div', null, el('span', { text: '#' })),
      headCell('Protocol', 'name'),
      headCell('TVL', 'tvl', 'r'),
      headCell('7d', 'growth', 'r'),
      headCell('Age', 'age', 'r h-age'),
      headCell('Implied value', 'implied', 'r')
    );
  }
  function board() {
    var list = sorted(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to bring the board back.' }),
        el('button', {
          class: 'chip', type: 'button', text: 'Clear filters',
          onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); }
        })
      );
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var body = el('div', { class: 'board' }, boardHead());
    list.forEach(function (r, i) {
      var row = el('div', {
        class: 'row' + (r.rank <= 3 ? ' top' : ''), tabindex: '0', role: 'button',
        'aria-label': r.name + ', rank ' + r.rank + ', implied value ' + money(r.implied_value_usd),
        style: 'animation-delay:' + Math.min(i * 14, 320) + 'ms',
        onclick: function () { openSheet(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(r.slug); } }
      },
        el('div', { class: 'rank', text: String(r.rank) }),
        el('div', { class: 'who' },
          el('b', { text: r.name }),
          el('span', { text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'chain unrecorded') })
        ),
        el('div', { class: 'num mute c-tvl', text: money(r.tvl_usd) }),
        el('div', { class: 'num c-grow ' + (r.change_7d === null ? 'mute' : r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        el('div', { class: 'num mute c-age', text: age(r.age_days) }),
        el('div', { class: 'value' },
          el('span', { class: 'amt', text: money(r.implied_value_usd) }),
          el('span', { class: 'meter', 'aria-hidden': 'true' },
            el('i', { style: 'width:' + Math.max(4, Math.round((r.implied_value_usd / max) * 100)) + '%' })
          )
        )
      );
      body.appendChild(row);
    });
    return body;
  }

  // ── the token-bearing set ──────────────────────────────────────────────────
  function liveView() {
    var wrap = el('section', null,
      el('div', { class: 'lede', style: 'padding-top:34px' },
        el('div', null,
          el('div', { class: 'kicker', text: 'The market, for scale' }),
          el('h1', null, 'Protocols that ', el('em', null, 'already trade')),
          el('p', { class: 'standfirst' },
            'These are the snapshot\'s token-bearing protocols, set apart from the ranked board on purpose: their value is a fact the market states, not a model\'s estimate. They are also the comparables the board is fitted on, which is why the board can say what a launch would be worth at all.'
          )
        ),
        el('div', { class: 'stats' },
          stat('Token-bearing', String(D.live_size), 'shown by market cap'),
          stat('Fit sample', String(D.comparables), 'positive TVL and cap'),
          stat('Categories', String(D.categories.length), 'with a fitted effect'),
          stat('Snapshot', D.as_of, 'sealed')
        )
      ),
      el('div', { class: 'board' },
        el('div', { class: 'board-head' },
          el('div', null, el('span', { text: '#' })),
          el('div', null, el('span', { text: 'Protocol' })),
          el('div', { class: 'r', text: 'TVL' }),
          el('div', { class: 'r', text: '7d' }),
          el('div', { class: 'r h-age', text: 'Market cap' }),
          el('div', { class: 'r', text: 'Cap / TVL' }),
          el('div', { class: 'r', text: 'Status' })
        ),
        D.live.map(function (r, i) {
          return el('div', { class: 'row', style: 'animation-delay:' + Math.min(i * 12, 260) + 'ms' },
            el('div', { class: 'rank', text: String(i + 1) }),
            el('div', { class: 'who' },
              el('b', { text: r.name }),
              el('span', { text: (r.category || 'Uncategorised') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'chain unrecorded') })
            ),
            el('div', { class: 'num mute c-tvl', text: money(r.tvl_usd) }),
            el('div', { class: 'num c-grow ' + (r.change_7d === null ? 'mute' : r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
            el('div', { class: 'num c-age', text: money(r.mcap_usd) }),
            el('div', { class: 'num', text: multiple(r.mcap_usd / r.tvl_usd) }),
            el('div', { class: 'badge live', text: 'trades' })
          );
        })
      )
    );
    return wrap;
  }

  // ── the model panel ────────────────────────────────────────────────────────
  function methodView() {
    var c = D.coefficients;
    var m = D.multipliers;
    return el('section', null,
      el('div', { class: 'lede', style: 'padding-top:34px' },
        el('div', null,
          el('div', { class: 'kicker', text: 'The fit' }),
          el('h1', null, 'What the market ', el('em', null, 'already pays'), ' for the same protocol at the same size'),
          el('p', { class: 'standfirst' },
            'Nothing here is a hand-picked multiple or a list of favourite names. The board is one least-squares fit over every protocol in this snapshot that already has a token, and the same equation scores every pre-token protocol, whatever its name.'
          )
        ),
        el('div', { class: 'stats' },
          stat('Comparables', String(D.comparables), 'token-bearing, TVL > 0'),
          stat('R²', String(D.r_squared), 'of log market cap'),
          stat('Size elasticity', c.logTvl.toFixed(3), 'ln TVL coefficient'),
          stat('Growth per point', (m.growth_weight * 100).toFixed(1) + '%', 'of value, per pp a week')
        )
      ),
      el('div', { class: 'note', style: 'grid-template-columns:1fr 1.15fr' },
        el('div', null,
          el('h2', { text: 'What is measured, and what is assumed' }),
          el('p', null, 'The fit measures one thing well: size. Over the ' + D.comparables + ' comparables, the ln TVL coefficient is the only estimate that clears two standard errors (t = 5.5); weekly growth (t = −1.6) and age (t = −0.4) do not. Fitting them anyway gave growth a negative sign, so a protocol growing faster was valued lower — the wrong direction for a launch radar. They are therefore not fitted.'),
          el('p', null, 'Instead growth and age enter as multipliers that cannot invert: +1pp a week lifts the value by ' + (m.growth_weight * 100).toFixed(1) + '%, and each year of running with no token lifts it by ' + (m.age_weight * 100).toFixed(0) + '% of a log year. Both are clamped — growth to ' + m.growth_band[0] + '×–' + m.growth_band[1] + '×, age to ' + m.age_band[0] + '×–' + m.age_band[1] + '× — so one parabolic week cannot outrank a protocol five times its size. Every row on the board shows its own size-only value and the two multipliers it was moved by, so the reader can separate the measurement from the assumption.'),
          el('p', null, 'A category\'s effect is the median residual of its comparables, shrunk toward the market\'s own level by how few of them there are, so a category with one comparable nudges its rows and a category with a dozen moves them. Age is the time since DefiLlama first listed the protocol, the best record the snapshot carries of how long it has run with no token; an undated protocol is scored at ' + D.model.unknown_age_days + ' days.'),
          el('p', null, 'The board ranks only pre-token protocols. Token-bearing ones are shown apart, at the market\'s own value, because ranking a fact against an estimate would tell a reader nothing.')
        ),
        el('div', null,
          el('div', { class: 'formula' },
            'size      = exp(' + c.intercept.toFixed(3) +
            '\n                   ' + (c.logTvl < 0 ? '− ' : '+ ') + Math.abs(c.logTvl).toFixed(3) + ' · ln(TVL)' +
            '\n                   + category effect)' +
            '\n\nimplied   = size' +
            '\n          × (1 + ' + m.growth_weight + ' · growth)      clamped ' + m.growth_band[0] + '–' + m.growth_band[1] +
            '\n          × (1 + ' + m.age_weight + ' · ln(1 + years))  clamped ' + m.age_band[0] + '–' + m.age_band[1]
          ),
          el('div', { class: 'effects' },
            (D.categories || []).slice(0, 14).map(function (e) {
              return el('div', { class: 'effect' },
                el('span', { class: 'n', text: e.category }),
                el('span', { class: 'e ' + (e.effect >= 0 ? 'pos' : 'neg'), text: (e.effect >= 0 ? '+' : '') + e.effect.toFixed(2) }),
                el('span', { class: 'c', text: 'n=' + e.comparables })
              );
            })
          ),
          el('p', { class: 'standfirst', style: 'margin-top:14px;font-size:12px' },
            'Category effects, strongest first: the shift the fit gives a category\'s protocols, in log points, with how many comparables it was measured on.'
          )
        )
      )
    );
  }

  // ── the detail sheet ───────────────────────────────────────────────────────
  var sheet = document.getElementById('sheet');
  sheet.addEventListener('close', function () {
    state.open = null;
    writeHash();
    document.querySelectorAll('.row[aria-current="true"]').forEach(function (n) { n.removeAttribute('aria-current'); });
  });

  function openSheet(slug) {
    var row = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { row = D.rows[i]; break; }
    if (!row) return;
    state.open = slug;
    writeHash();

    var predicted = recompute(row);
    var agrees = predicted.implied === row.implied_value_usd;
    var c = D.coefficients;
    var growth = Math.min(D.model.growth_clip, Math.max(-D.model.growth_clip, row.change_7d === null ? 0 : row.change_7d));
    var days = row.age_days === null ? D.model.unknown_age_days : row.age_days;
    var effect = effectOf(row.category);
    var catRow = (D.categories || []).filter(function (e) { return e.category === (row.category || 'Uncategorised'); })[0];

    sheet.textContent = '';
    sheet.appendChild(el('div', { class: 'sheet-head' },
      el('div', null,
        el('div', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + D.board_size + ' · no token on record' }),
        el('h2', { id: 'sheet-title', text: row.name }),
        el('div', { class: 'sub', text: (row.category || 'Uncategorised') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'chain unrecorded') + ' · first listed ' + (row.listed_at || 'unrecorded') })
      ),
      el('button', { class: 'sheet-close', type: 'button', text: 'Close', onclick: function () { sheet.close(); } })
    ));

    var body = el('div', { class: 'sheet-body' });

    body.appendChild(el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'TVL' }), el('b', null, money(row.tvl_usd))),
      el('div', null, el('span', { text: '7d growth' }), el('b', null, pct(row.change_7d))),
      el('div', null, el('span', { text: 'Age, no token' }), el('b', null, age(row.age_days))),
      el('div', null, el('span', { text: 'Category effect' }), el('b', null, (effect >= 0 ? '+' : '') + effect.toFixed(2))),
      el('div', null, el('span', { text: 'Implied / TVL' }), el('b', null, multiple(row.value_per_tvl))),
      el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'big', text: money(row.implied_value_usd) }))
    ));

    body.appendChild(el('h3', { text: 'How the model got there' }));
    body.appendChild(el('p', { style: 'color:var(--ink-soft);line-height:1.6' },
      'Measured: size = exp(' + c.intercept.toFixed(3) + ' ' + (c.logTvl < 0 ? '−' : '+') + ' ' + Math.abs(c.logTvl).toFixed(3) + '·ln(' + money(row.tvl_usd) + ') ' +
      (effect >= 0 ? '+ ' : '− ') + Math.abs(effect).toFixed(2) + ' (' + (row.category || 'Uncategorised') + ', n=' + (catRow ? catRow.comparables : 0) + ')) = ' + money(predicted.size)
    ));
    body.appendChild(el('p', { style: 'color:var(--ink-soft);line-height:1.6;margin-top:6px' },
      'Assumed: growth ' + growth.toFixed(1) + 'pp → ×' + predicted.gf.toFixed(3) + ', age ' + age(row.age_days) + ' → ×' + predicted.af.toFixed(3) +
      ', both clamped so neither can invert the ranking by size.'
    ));
    body.appendChild(el('p', { style: 'margin-top:10px;font-family:var(--mono);font-size:12px;color:var(--ink-faint)' },
      money(predicted.size) + ' × ' + predicted.gf.toFixed(3) + ' × ' + predicted.af.toFixed(3) + ' = ' + money(predicted.implied) +
      (agrees ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate, not a price, and not advice.'
    ));

    body.appendChild(el('h3', { text: 'How to farm it' }));
    body.appendChild(el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      var ti = tail.indexOf(' Time: ');
      var cost = ti >= 0 ? tail.slice(0, ti) : tail;
      var time = ti >= 0 ? tail.slice(ti + 1) : '';
      return el('li', null,
        el('span', { class: 'act', text: action }),
        el('span', { class: 'meta' }, cost ? el('em', null, cost) : null, time ? ' · ' + time : '')
      );
    })));

    sheet.appendChild(body);
    document.querySelectorAll('.row').forEach(function (n) { n.removeAttribute('aria-current'); });
    if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); }
    else sheet.setAttribute('open', '');
  }

  // ── render ─────────────────────────────────────────────────────────────────
  var view = document.getElementById('view');
  function renderBody() {
    var frag = document.createDocumentFragment();
    if (state.tab === 'board') {
      frag.appendChild(lede());
      frag.appendChild(toolbar());
      frag.appendChild(board());
    } else if (state.tab === 'live') {
      frag.appendChild(liveView());
    } else {
      frag.appendChild(methodView());
    }
    view.textContent = '';
    view.appendChild(frag);
  }
  function render() {
    masthead();
    renderBody();
    if (state.open) openSheet(state.open);
  }

  // The farm plan and the model's inputs come out of data.js; the page only lays them out.
  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet.open) sheet.close();
  });
})();
