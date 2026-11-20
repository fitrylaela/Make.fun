// Token Radar's page. It reads window.RADAR, which main.ts writes beside dashboard/, and renders the
// ranked board, the filters, a detail view per protocol with the model's own working, and the farm
// plan. No network: every figure it shows is in data.js.
//
// impliedOf() is the same arithmetic main.ts writes to board.json, so the number on screen is
// recomputed from the snapshot's figures and can be checked against the board's row.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var board = document.getElementById('board');
  if (!DATA || !board) return;

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  /* ── formatting ─────────────────────────────────────────── */

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function growthClass(n) {
    if (n === null || n === undefined || !isFinite(n) || Math.abs(n) < 0.05) return 'flat';
    return n > 0 ? 'up' : 'down';
  }

  /* ── the model, in the page ─────────────────────────────── */

  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor,
      row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var waited = Math.min(Math.max(age, 0), model.patience_days) / model.patience_days;
    var patience = 1 + waited * model.patience_weight;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * patience));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  /* ── masthead, stats, method ────────────────────────────── */

  function paintHeader() {
    document.getElementById('as-of').textContent = 'snapshot ' + DATA.as_of;
    document.getElementById('model-version').textContent = DATA.model_version;
    document.getElementById('stat-watchlist').textContent = String(DATA.watchlist_size);
    document.getElementById('stat-rows').textContent = String(DATA.board_size);
    document.getElementById('stat-early').textContent = String(DATA.early_size);
    document.getElementById('stat-live').textContent = String(DATA.live_size);
    document.getElementById('m-minpeers').textContent = String(DATA.model.min_peers);
    document.getElementById('colophon-source').textContent = DATA.source;
  }

  function paintPeers() {
    var body = document.getElementById('peers-body');
    DATA.peers.forEach(function (g) {
      body.appendChild(el('tr', { class: g.borrowed ? 'borrowed' : null },
        el('td', { text: g.category }),
        el('td', { class: 'num', text: String(g.peers) }),
        el('td', { class: 'num mult', text: '×' + g.median.toFixed(2) }),
        el('td', { text: g.borrowed ? 'borrowed: all-category median' : 'its own category' })
      ));
    });
    var toggle = document.getElementById('peers-toggle');
    var panel = document.getElementById('peers-panel');
    toggle.addEventListener('click', function () {
      var open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Hide the peer multiples' : 'Show the peer multiples behind every row';
    });
  }

  /* ── filters ────────────────────────────────────────────── */

  function fillSelect(id, values) {
    var sel = document.getElementById(id);
    values.forEach(function (v) {
      var label = v === 'all' ? 'All' : v;
      sel.appendChild(el('option', { value: v, text: label }));
    });
  }

  function uniq(list) {
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (v) {
      if (v === null || v === undefined || v === '') return;
      if (seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out.sort();
  }

  function paintFilters() {
    fillSelect('category', ['all'].concat(uniq(DATA.rows.map(function (r) { return r.category; }))));
    var chains = [];
    DATA.rows.forEach(function (r) { chains = chains.concat(r.chains || []); });
    fillSelect('chain', ['all'].concat(uniq(chains)));
    document.getElementById('count-pre').textContent = String(DATA.rows.length);
    document.getElementById('count-live').textContent = String(DATA.live.length);

    document.getElementById('q').addEventListener('input', function (e) {
      state.q = e.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById('category').addEventListener('change', function (e) {
      state.category = e.target.value;
      render();
    });
    document.getElementById('chain').addEventListener('change', function (e) {
      state.chain = e.target.value;
      render();
    });
    document.getElementById('sort').addEventListener('change', function (e) {
      state.sort = e.target.value;
      state.dir = e.target.value === 'name' || e.target.value === 'age' ? 1 : -1;
      render();
    });
    document.getElementById('reset').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.sort = 'implied'; state.dir = -1;
      document.getElementById('q').value = '';
      document.getElementById('category').value = 'all';
      document.getElementById('chain').value = 'all';
      document.getElementById('sort').value = 'implied';
      render();
    });
    document.getElementById('tab-pre').addEventListener('click', function () { setTab('pre-token'); });
    document.getElementById('tab-live').addEventListener('click', function () { setTab('live'); });
  }

  function setTab(tab) {
    state.tab = tab;
    document.getElementById('tab-pre').setAttribute('aria-selected', tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    var catField = document.getElementById('category').parentNode;
    var chainField = document.getElementById('chain').parentNode;
    var sortField = document.getElementById('sort').parentNode;
    if (tab === 'live') {
      catField.style.opacity = '.4'; chainField.style.opacity = '.4'; sortField.style.opacity = '.4';
    } else {
      catField.style.opacity = ''; chainField.style.opacity = ''; sortField.style.opacity = '';
    }
    render();
  }

  function matches(row) {
    if (state.category !== 'all' && (row.category || '') !== state.category) return false;
    if (state.chain !== 'all' && (row.chains || []).indexOf(state.chain) < 0) return false;
    if (state.q) {
      var hay = [row.name, row.slug, row.category || '', (row.chains || []).join(' ')].join(' ').toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  }

  function compare(a, b) {
    var d = state.dir;
    switch (state.sort) {
      case 'tvl': return (a.tvl_usd - b.tvl_usd) * d;
      case 'growth': return ((a.change_7d === null ? -999 : a.change_7d) - (b.change_7d === null ? -999 : b.change_7d)) * d;
      case 'age': return ((a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days)) * d;
      case 'multiple': return ((a.multiple || 0) - (b.multiple || 0)) * d;
      case 'name': return a.name.localeCompare(b.name) * d;
      default: return (a.implied_value_usd - b.implied_value_usd) * d;
    }
  }

  /* ── the board ──────────────────────────────────────────── */

  function head() {
    return el('div', { class: 'board-head' },
      el('div', { class: 'num', text: '#' }),
      el('div', { text: 'Protocol' }),
      el('div', { class: 'num', text: 'TVL' }),
      el('div', { class: 'num', text: '7d' }),
      el('div', { class: 'num h-age', text: 'No token' }),
      el('div', { class: 'num', text: 'Implied value' }),
      el('div', { class: 'num h-mult', text: 'Multiple' })
    );
  }

  function preRow(row) {
    var rec = impliedOf(row, DATA.model);
    var same = rec === row.implied_value_usd;
    return el('button', {
      class: 'row', type: 'button',
      'aria-current': state.selected === row.slug ? 'true' : 'false',
      onclick: function () { select(row.slug); }
    },
      el('div', { class: 'r-rank num', text: String(row.rank) }),
      el('div', { class: 'r-name' },
        el('div', { class: 'n', text: row.name }),
        el('div', { class: 'c' },
          el('span', { text: row.category || 'no category' }),
          el('span', { class: 'chain', text: ' · ' + (row.chains || []).slice(0, 2).join(', ') })
        )
      ),
      el('div', { class: 'r-tvl num', text: fmtUsd(row.tvl_usd) }),
      el('div', { class: 'r-growth num ' + growthClass(row.change_7d), text: fmtPct(row.change_7d) }),
      el('div', { class: 'r-age num', text: fmtAge(row.age_days) }),
      el('div', { class: 'r-implied num', text: fmtUsd(same ? row.implied_value_usd : rec), title: same ? null : 'recomputed in the page' }),
      el('div', { class: 'r-mult' + (row.peer_count < DATA.model.min_peers ? ' borrowed' : ''), text: '×' + row.multiple.toFixed(2) })
    );
  }

  function liveRow(row) {
    return el('button', {
      class: 'row', type: 'button',
      onclick: function () { select(row.slug); }
    },
      el('div', { class: 'r-rank num', text: '—' }),
      el('div', { class: 'r-name' },
        el('div', { class: 'n', text: row.name }),
        el('div', { class: 'c' }, el('span', { text: row.category || 'no category' }))
      ),
      el('div', { class: 'r-tvl num', text: fmtUsd(row.tvl_usd) }),
      el('div', { class: 'r-growth num ' + growthClass(row.change_7d), text: fmtPct(row.change_7d) }),
      el('div', { class: 'r-age num', text: '—' }),
      el('div', { class: 'r-implied num', text: fmtUsd(row.mcap_usd) }),
      el('div', { class: 'r-mult', text: '×' + row.multiple.toFixed(2) })
    );
  }

  function render() {
    var list;
    if (state.tab === 'live') {
      list = DATA.live.filter(function (r) {
        if (state.q) {
          var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
          if (hay.indexOf(state.q) < 0) return false;
        }
        return true;
      });
      list = list.slice().sort(function (a, b) { return b.mcap_usd - a.mcap_usd; });
      document.getElementById('result-count').textContent =
        list.length + ' live-token protocol' + (list.length === 1 ? '' : 's') + ' shown, largest market cap first';
    } else {
      list = DATA.rows.filter(matches).slice().sort(compare);
      var total = list.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
      document.getElementById('result-count').textContent =
        list.length + ' of ' + DATA.rows.length + ' protocols shown · ' + fmtUsd(total) + ' of implied value in view';
    }

    board.textContent = '';
    board.appendChild(head());
    var rows = el('div', { class: 'rows' });
    if (list.length === 0) {
      rows.appendChild(el('div', { class: 'empty', text: 'No protocol matches these filters. Clear the search or pick another category.' }));
    } else {
      list.forEach(function (r) { rows.appendChild(state.tab === 'live' ? liveRow(r) : preRow(r)); });
    }
    board.appendChild(rows);
    board.setAttribute('aria-busy', 'false');
  }

  /* ── detail ─────────────────────────────────────────────── */

  function findPre(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }
  function findLive(slug) {
    for (var i = 0; i < DATA.live.length; i++) if (DATA.live[i].slug === slug) return DATA.live[i];
    return null;
  }

  // The evidence line: which protocols the multiple came from, and what each is priced at.
  function peerNote(row) {
    var peers = row.peers || [];
    if (peers.length === 0) return 'no token-bearing peer, so the all-category median';
    var shown = peers.slice(0, 3).map(function (p) { return p.name + ' ×' + p.ratio.toFixed(2); }).join(', ');
    if (row.peer_count < DATA.model.min_peers) {
      return 'only ' + row.peer_count + ' peer' + (row.peer_count === 1 ? '' : 's') + ' (' + shown + '), blended with the all-category median and held within ×' + DATA.model.thin_band + ' of it';
    }
    return 'median of ' + row.peer_count + ' token-bearing peers: ' + shown;
  }

  function wline(k, sub, v, total) {
    return el('div', { class: 'wline' + (total ? ' total' : '') },
      el('div', { class: 'k' }, el('span', { text: k }), sub ? el('small', { text: sub }) : null),
      el('div', { class: 'v', text: v })
    );
  }

  function fact(k, v) {
    return el('div', { class: 'fact' }, el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v }));
  }

  function renderDetail() {
    var host = document.getElementById('detail');
    var pre = state.selected === null ? null : findPre(state.selected);
    var live = pre === null && state.selected !== null ? findLive(state.selected) : null;
    if (pre === null && live === null) {
      host.setAttribute('hidden', '');
      host.textContent = '';
      return;
    }
    host.removeAttribute('hidden');
    host.textContent = '';

    var model = DATA.model;
    var rec = pre === null ? 0 : impliedOf(pre, model);

    var head_ = el('div', { class: 'detail-top' },
      el('div', null,
        el('div', { class: 'detail-rank', text: pre === null ? 'Live token · priced by the market' : 'Rank ' + pre.rank + ' of ' + DATA.board_size + ' · pre-token' }),
        el('h2', { text: (pre === null ? live.name : pre.name) }),
        el('div', { class: 'sub', text: [
          (pre === null ? live.category : pre.category) || 'no category',
          ((pre === null ? live.chains : pre.chains) || []).join(', ') || 'no chain on record',
          'listed ' + ((pre === null ? null : pre.listed_at) || 'unknown')
        ].join(' · ') })
      ),
      el('div', { class: 'detail-value' },
        el('div', { class: 'big', text: fmtUsd(pre === null ? live.mcap_usd : rec) }),
        el('div', { class: 'cap', text: pre === null ? 'market cap today' : 'implied value if it launched' })
      )
    );

    var left = el('div');
    left.appendChild(el('h3', { text: pre === null ? 'The market’s own figures' : 'How the number is built' }));
    if (pre !== null) {
      var workings = el('div', { class: 'workings' });
      workings.appendChild(wline('TVL', 'the snapshot’s figure for this protocol', fmtUsd(pre.tvl_usd)));
      workings.appendChild(wline('Category multiple', peerNote(pre), '×' + pre.multiple.toFixed(4)));
      workings.appendChild(wline('Growth multiplier', '7-day change ' + fmtPct(pre.change_7d) + ', quarter weight', '×' + pre.growth_multiplier.toFixed(4)));
      workings.appendChild(wline('Patience multiplier', fmtAge(pre.age_days) + ' with no token, up to ×' + (1 + model.patience_weight).toFixed(2), '×' + pre.patience_multiplier.toFixed(4)));
      workings.appendChild(wline('Implied value', 'TVL × multiple × growth × patience', fmtUsd(rec), true));
      left.appendChild(workings);
      if (pre.peers && pre.peers.length > 0) {
        var ev = el('div', { class: 'evidence' });
        ev.appendChild(el('h4', { text: 'The peers behind that multiple' }));
        pre.peers.forEach(function (p) {
          ev.appendChild(el('div', { class: 'ev-row' },
            el('span', { class: 'ev-name', text: p.name }),
            el('span', { class: 'ev-ratio', text: '×' + p.ratio.toFixed(2) })
          ));
        });
        left.appendChild(ev);
      }
    } else {
      var facts = el('div', { class: 'facts' });
      facts.appendChild(fact('TVL', fmtUsd(live.tvl_usd)));
      facts.appendChild(fact('Market cap', fmtUsd(live.mcap_usd)));
      facts.appendChild(fact('Market cap / TVL', '×' + live.multiple.toFixed(4)));
      facts.appendChild(fact('7-day TVL change', fmtPct(live.change_7d)));
      left.appendChild(facts);
      left.appendChild(el('p', { class: 'detail-note', text: 'This protocol already trades, so the market has priced it: its market cap is the observation, not a model’s claim. It is set aside from the ranked board so a real valuation never sits beside an implied one.' }));
    }

    var right = el('div');
    if (pre !== null) {
      right.appendChild(el('h3', { text: 'How to farm it before the token exists' }));
      var steps = el('ol', { class: 'steps' });
      var plan = farmSteps(pre);
      plan.forEach(function (s) { steps.appendChild(el('li', { text: s })); });
      right.appendChild(steps);
      right.appendChild(el('p', { class: 'detail-note', text: 'The plan is derived from this protocol’s own record — its category, its chains, its TVL and how long it has waited — and never from a list of names. Cost and time are estimates for one position; never pay anyone to claim a token.' }));
    } else {
      right.appendChild(el('h3', { text: 'Why it is not on the ranked board' }));
      right.appendChild(el('p', { class: 'detail-note', text: 'The radar ranks protocols that record no token, because their launch is still ahead. A protocol whose token already trades is evidence for the model — one of the peer multiples that value the others — and it is shown here at the market’s own price.' }));
    }

    var close = el('button', { class: 'close-btn', type: 'button', text: 'Close', onclick: function () { select(null); } });

    var card = el('div', { class: 'detail-card' }, head_,
      el('div', { class: 'detail-grid' }, left, right),
      el('div', { style: 'margin-top:18px' }, close));

    host.appendChild(card);
  }

  function select(slug) {
    state.selected = slug;
    renderDetail();
    var rows = board.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) rows[i].setAttribute('aria-current', 'false');
    render();
    if (slug !== null) {
      var host = document.getElementById('detail');
      if (host.scrollIntoView) host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ── farm plans, the same derivation main.ts writes ────── */

  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 25e7) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }
  // The plan the page shows is the derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var lend = { text: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $' + Math.round(capital * 0.3) + ' of a major asset against it so both the supply and the borrow count.', gas: 9, minutes: 20 };
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return lend;
    if (c.indexOf('cdp') >= 0) return { text: 'Open a ' + name + ' vault on ' + chain + ' with $' + capital + ' of collateral, mint the stablecoin against it, and keep the vault open.', gas: 12, minutes: 25 };
    if (c.indexOf('dex') >= 0) return { text: "Provide $" + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ', then make one swap through it so the position earns fees and volume.', gas: 11, minutes: 20 };
    if (c.indexOf('leveraged farm') >= 0) return { text: 'Open one $' + capital + ' leveraged position on ' + name + ' at the lowest leverage it allows, on ' + chain + '.', gas: 14, minutes: 25 };
    if (c.indexOf('yield') >= 0 || c.indexOf('aggregator') >= 0) return { text: 'Deposit $' + capital + " of USDC into " + name + "'s top vault on " + chain + ' and leave it through a full harvest cycle.', gas: 7, minutes: 15 };
    if (c.indexOf('bridge') >= 0) return { text: 'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' through ' + name + ', then use the bridged funds inside its own app.', gas: 13, minutes: 25 };
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return { text: "Stake $" + capital + " of " + chain + "'s native asset through " + name + ' and keep the liquid receipt token in the same wallet.', gas: 6, minutes: 15 };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return { text: 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open one small hedge, and leave the margin in place.', gas: 10, minutes: 20 };
    if (c.indexOf('prediction') >= 0) return { text: 'Fund $' + capital + ' on ' + name + ' and place one position on a market that resolves within the hold window.', gas: 8, minutes: 15 };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('manager') >= 0) return { text: 'Deposit $' + capital + " into one of " + name + "'s curated vaults on " + chain + ' and keep the shares rather than the underlying.', gas: 8, minutes: 15 };
    if (c.indexOf('stable') >= 0) return { text: 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it through the window.', gas: 9, minutes: 20 };
    if (c.indexOf('rwa') >= 0) return { text: "Mint $" + capital + " of " + name + "'s yield asset on " + chain + ', complete any allowlist step it requires, and hold it.', gas: 15, minutes: 30 };
    if (c.indexOf('insurance') >= 0) return { text: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for a protocol you already use, and keep the policy active.', gas: 8, minutes: 15 };
    if (c.indexOf('index') >= 0) return { text: 'Mint $' + capital + ' of the index through ' + name + ' on ' + chain + ' and hold the basket rather than the parts.', gas: 9, minutes: 20 };
    if (c.indexOf('farm') >= 0 || c.indexOf('incentive') >= 0) return { text: 'Deposit $' + capital + " into " + name + "'s farm on " + chain + ' and keep it staked through a full reward epoch.', gas: 8, minutes: 15 };
    if (c.indexOf('card') >= 0 || c.indexOf('payment') >= 0) return { text: 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ', then make one small payment with its card or app to register real use.', gas: 5, minutes: 15 };
    if (c.indexOf('privacy') >= 0) return { text: 'Move $' + capital + ' through ' + name + ' on ' + chain + ' once, and again in a later week so the activity spans two windows.', gas: 12, minutes: 20 };
    return lend;
  }

  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var action = actionFor(p, capital, chain);
    var upside = fmtUsd(Math.round(p.tvl_usd * p.multiple));
    var chains = (p.chains || []).length > 1 ? ' It runs on ' + p.chains.slice(0, 3).join(', ') + '; keep the whole position on ' + chain + " so one wallet's activity is easy to read." : '';
    return [
      'Open a wallet used only for this farm, fund it with $' + capital + ' plus gas, and write down the date the first transaction lands.' + chains + ' Cost: $' + capital + ' of capital plus about $' + action.gas + ' of gas for the first transactions. Time: 15 minutes.',
      action.text + ' Cost: $' + capital + ' of capital and about $' + action.gas + ' of gas at a normal fee. Time: ' + action.minutes + ' minutes to set up.',
      'Repeat one qualifying action each week on ' + chain + ': a deposit, a borrow, a swap or a governance vote. Weekly activity across several weeks counts for more than one large transaction. Cost: about $2 to $4 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days without moving the funds, so the activity is recorded in more than one snapshot of the protocol’s own data. Cost: the $' + capital + ' stays in the position and earns whatever the protocol pays. Time: ' + hold + ' days.',
      "Check " + p.name + "'s docs, blog and governance forum every month for a points, snapshot or airdrop programme, and claim only from a link the protocol itself publishes. Cost: no fee to check, and never pay anyone to claim. Time: 10 minutes a month.",
      'Keep a log of the wallet, the dates and every transaction, and weigh the position against the ' + upside + " this category's multiple implies before adding more. Cost: nothing but the log. Time: 5 minutes."
    ];
  }

  /* ── boot ───────────────────────────────────────────────── */

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) { state.q = params.get('q'); document.getElementById('q').value = params.get('q'); }
    if (params.get('category')) { state.category = params.get('category'); document.getElementById('category').value = params.get('category'); }
    if (params.get('chain')) { state.chain = params.get('chain'); document.getElementById('chain').value = params.get('chain'); }
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('tab') === 'live') setTab('live');
  }

  paintHeader();
  paintPeers();
  paintFilters();
  readHash();
  render();
  renderDetail();
})();
