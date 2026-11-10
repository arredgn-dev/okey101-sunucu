// 101 Okey kural motoru ve bilgisayar oyuncular (internetsiz, tamamen cihazda çalışır)
(function (root) {
  'use strict';
  var ROW = 15, SLOTS = 30;
  var NAMES_BOT = ['Zeynep', 'Murat', 'Elif'];

  function tc(id) { return id >= 104 ? -1 : Math.floor(id / 26); }
  function tn(id) { return id >= 104 ? 0 : (id % 13) + 1; }
  function isFake(id) { return id >= 104; }
  function okeyOf(g) { var n = tn(g) + 1; if (n > 13) n = 1; return { c: tc(g), n: n }; }
  function isJoker(id, ok) { return id < 104 && tc(id) === ok.c && tn(id) === ok.n; }
  function val(id, ok) { return id >= 104 ? { c: ok.c, n: ok.n } : { c: tc(id), n: tn(id) }; }
  function face(id, ok) { return isJoker(id, ok) ? 101 : val(id, ok).n; }
  function handValue(ids, ok) { var s = 0; ids.forEach(function (id) { s += face(id, ok); }); return s; }
  function keyOf(c, n) { return c * 14 + n; }

  function newDeck() {
    var d = []; for (var i = 0; i < 106; i++) d.push(i);
    for (var j = d.length - 1; j > 0; j--) { var r = Math.floor(Math.random() * (j + 1)), t = d[j]; d[j] = d[r]; d[r] = t; }
    return d;
  }

  // ---------- Grup geçerliliği ----------
  // Per: aynı sayı, farklı renk (3-4). Seri: aynı renk, ardışık; 1 sadece en başta olur (12-13-1 olmaz).
  function normalize(ids, ok) {
    if (ids.length < 3) return null;
    var J = [], N = [];
    ids.forEach(function (id) { if (isJoker(id, ok)) J.push(id); else N.push(id); });
    if (!N.length) return null;
    var vs = N.map(function (id) { return val(id, ok); });
    var best = null;
    var n0 = vs[0].n;
    if (ids.length <= 4 && vs.every(function (v) { return v.n === n0; })) {
      var cs = {}, dup = false;
      vs.forEach(function (v) { if (cs[v.c]) dup = true; cs[v.c] = 1; });
      if (!dup) best = { type: 'per', tiles: N.concat(J), value: n0 * ids.length, n: n0 };
    }
    var c0 = vs[0].c;
    if (ids.length <= 13 && vs.every(function (v) { return v.c === c0; })) {
      var byN = {}, ok2 = true, mn = 99, mx = 0;
      vs.forEach(function (v, i) { if (byN[v.n] != null) ok2 = false; byN[v.n] = N[i]; mn = Math.min(mn, v.n); mx = Math.max(mx, v.n); });
      if (ok2) {
        var gaps = (mx - mn + 1) - N.length;
        if (gaps <= J.length) {
          var extra = J.length - gaps, s = mn, e = mx;
          while (extra > 0 && e < 13) { e++; extra--; }
          while (extra > 0 && s > 1) { s--; extra--; }
          if (extra === 0) {
            var tiles = [], value = 0, ji = 0;
            for (var x = s; x <= e; x++) { tiles.push(byN[x] != null ? byN[x] : J[ji++]); value += x; }
            var r = { type: 'seri', tiles: tiles, value: value, start: s, c: c0 };
            if (!best || r.value >= best.value) best = r;
          }
        }
      }
    }
    return best;
  }
  function pairOk(a, b, ok) {
    if (isJoker(a, ok) || isJoker(b, ok)) return true;
    var A = val(a, ok), B = val(b, ok); return A.c === B.c && A.n === B.n;
  }
  // Yerdeki bir gruba taş eklenebilir mi (işleme)
  function canAdd(m, id, ok) {
    if (m.type === 'cift') return false;
    var j = isJoker(id, ok), v = val(id, ok);
    if (m.type === 'per') {
      if (m.tiles.length >= 4) return false;
      if (j) return true;
      if (v.n !== m.n) return false;
      return !m.tiles.some(function (t) { return !isJoker(t, ok) && val(t, ok).c === v.c; });
    }
    var s = m.start, e = m.start + m.tiles.length - 1;
    if (j) return s > 1 || e < 13;
    if (v.c !== m.c) return false;
    return v.n === s - 1 || v.n === e + 1;
  }
  function applyAdd(m, id, ok) {
    if (m.type === 'per') { m.tiles.push(id); m.value += m.n; return; }
    var s = m.start, e = s + m.tiles.length - 1, j = isJoker(id, ok);
    if ((j && e < 13) || (!j && val(id, ok).n === e + 1)) { m.tiles.push(id); m.value += e + 1; }
    else { m.tiles.unshift(id); m.start--; m.value += s - 1; }
  }
  function isIslek(id, table, ok) { return table.some(function (m) { return canAdd(m, id, ok); }); }

  // ---------- En yüksek puanlı per/seri dizilimi ----------
  function bestMelds(ids, ok) {
    var counts = new Array(56).fill(0), byKey = {}, J = [];
    ids.forEach(function (id) {
      if (isJoker(id, ok)) { J.push(id); return; }
      var v = val(id, ok), k = keyOf(v.c, v.n); counts[k]++; (byKey[k] = byKey[k] || []).push(id);
    });
    var memo = new Map();
    function rec(jl) {
      var k = -1;
      for (var i = 0; i < 56; i++) if (counts[i] > 0) { k = i; break; }
      if (k < 0) return { v: 0, m: [] };
      var mk = counts.join('') + jl;
      var hit = memo.get(mk); if (hit) return hit;
      counts[k]--;
      var r0 = rec(jl), best = { v: r0.v, m: r0.m };
      var c = Math.floor(k / 14), n = k % 14;
      // per
      var others = [];
      for (var cc = c + 1; cc < 4; cc++) if (counts[keyOf(cc, n)] > 0) others.push(keyOf(cc, n));
      for (var mask = 0; mask < (1 << others.length); mask++) {
        var sub = [];
        for (var b = 0; b < others.length; b++) if (mask & (1 << b)) sub.push(others[b]);
        for (var j = 0; j <= Math.min(jl, 2); j++) {
          var size = 1 + sub.length + j;
          if (size < 3 || size > 4) continue;
          sub.forEach(function (x) { counts[x]--; });
          var rr = rec(jl - j);
          sub.forEach(function (x) { counts[x]++; });
          var v = n * size + rr.v;
          if (v > best.v) { var mm = [k].concat(sub); for (var q = 0; q < j; q++) mm.push(-1); best = { v: v, m: [mm].concat(rr.m) }; }
        }
      }
      // seri (k serinin en küçük gerçek taşı; öncesi okeyle dolabilir)
      for (var s = Math.max(1, n - jl); s <= n; s++) {
        var need = n - s, meld = [], taken = [], value = 0;
        for (var x = s; x < n; x++) { meld.push(-1); value += x; }
        meld.push(k); value += n;
        for (var e = n + 1; e <= 13; e++) {
          var kk = keyOf(c, e);
          if (counts[kk] > 0) { counts[kk]--; taken.push(kk); meld.push(kk); }
          else { need++; if (need > jl) break; meld.push(-1); }
          value += e;
          if (meld.length >= 3) {
            var r2 = rec(jl - need);
            if (value + r2.v > best.v) best = { v: value + r2.v, m: [meld.slice()].concat(r2.m) };
          }
        }
        taken.forEach(function (x) { counts[x]++; });
      }
      counts[k]++;
      memo.set(mk, best);
      return best;
    }
    var res = rec(J.length);
    var pool = {}; Object.keys(byKey).forEach(function (k) { pool[k] = byKey[k].slice(); });
    var jokers = J.slice();
    var melds = res.m.map(function (m) { return m.map(function (x) { return x < 0 ? jokers.shift() : pool[x].shift(); }); });
    var rest = []; Object.keys(pool).forEach(function (k) { rest = rest.concat(pool[k]); });
    return { value: res.v, melds: melds, rest: rest.concat(jokers) };
  }

  function pairPlan(ids, ok) {
    var byKey = {}, J = [], pairs = [], singles = [], natural = 0;
    ids.forEach(function (id) {
      if (isJoker(id, ok)) { J.push(id); return; }
      var v = val(id, ok), k = keyOf(v.c, v.n); (byKey[k] = byKey[k] || []).push(id);
    });
    Object.keys(byKey).sort(function (a, b) { return b - a; }).forEach(function (k) {
      var a = byKey[k].slice();
      while (a.length >= 2) { pairs.push([a.shift(), a.shift()]); natural++; }
      singles = singles.concat(a);
    });
    singles.sort(function (a, b) { return face(b, ok) - face(a, ok); });
    var withJ = pairs.slice(), J2 = J.slice(), s2 = singles.slice();
    while (J2.length && s2.length) withJ.push([s2.shift(), J2.shift()]);
    while (J2.length >= 2) withJ.push([J2.shift(), J2.shift()]);
    return { natural: natural, pairs: pairs, withJokers: withJ, singles: singles, jokers: J };
  }

  // ---------- Istaka düzeni ----------
  function sortKey(id, ok) { return isJoker(id, ok) ? 999 : val(id, ok).c * 20 + val(id, ok).n; }
  function layoutGroups(groups, rest) {
    var slots = new Array(SLOTS).fill(null), row = 0, col = 0, extra = [];
    groups.forEach(function (g) {
      if (col + g.length > ROW && row === 0) { row = 1; col = 0; }
      if (col + g.length > ROW) { extra = extra.concat(g); return; }
      g.forEach(function (id) { slots[row * ROW + col++] = id; });
      col++;
    });
    rest = extra.concat(rest);
    rest.forEach(function (id) {
      var i = slots.indexOf(null, row * ROW + Math.min(col, ROW));
      if (i < 0) i = slots.indexOf(null);
      slots[i] = id;
    });
    return slots;
  }
  function arrangeSeri(ids, ok) {
    var b = bestMelds(ids, ok);
    var rest = b.rest.sort(function (a, c) { return sortKey(a, ok) - sortKey(c, ok); });
    return layoutGroups(b.melds, rest);
  }
  function arrangeCift(ids, ok) {
    var p = pairPlan(ids, ok);
    var rest = p.singles.sort(function (a, c) { return sortKey(a, ok) - sortKey(c, ok); }).concat(p.jokers);
    return layoutGroups(p.pairs, rest);
  }
  function groupsOf(layout) {
    var gs = [], cur = [];
    for (var i = 0; i < layout.length; i++) {
      if (i % ROW === 0 && cur.length) { gs.push(cur); cur = []; }
      if (layout[i] == null) { if (cur.length) { gs.push(cur); cur = []; } }
      else cur.push(layout[i]);
    }
    if (cur.length) gs.push(cur);
    return gs;
  }
  // Istakadaki gruplardan açılabilecekleri hesapla
  function evalGroups(groups, ok) {
    var sets = [], setVal = 0, pairs = [];
    groups.forEach(function (g) {
      if (g.length === 2 && pairOk(g[0], g[1], ok)) pairs.push(g.slice());
      else if (g.length >= 3) { var r = normalize(g, ok); if (r) { sets.push(r); setVal += r.value; } }
    });
    return { sets: sets, setVal: setVal, pairs: pairs };
  }

  // ---------- Oyun ----------
  function newMatch(numHands, myName) {
    return { numHands: numHands, handNo: 0, totals: [0, 0, 0, 0], names: [myName || 'Sen'].concat(NAMES_BOT),
      dealer: Math.floor(Math.random() * 4), g: null, results: [], ended: false };
  }
  function deal(M) {
    M.handNo++;
    var deck = newDeck();
    var gi = deck.findIndex(function (id) { return id < 104; });
    var gosterge = deck.splice(gi, 1)[0];
    var starter = (M.dealer + 1) % 4, hands = [[], [], [], []];
    for (var r = 0; r < 4; r++) { var s = (starter + r) % 4; for (var k = 0; k < (r === 0 ? 22 : 21); k++) hands[s].push(deck.pop()); }
    M.g = { hands: hands, deck: deck, discards: [[], [], [], []], gosterge: gosterge, ok: okeyOf(gosterge),
      turn: starter, phase: 'play', opened: [null, null, null, null], openVal: [0, 0, 0, 0], table: [],
      mustUse: null, noLeft: false, pen: [0, 0, 0, 0], penLog: [[], [], [], []], turnNo: 0, openedAt: [-1, -1, -1, -1],
      over: null, last: null, drawn: null };
  }
  function fail(m) { return { ok: false, err: m }; }
  function ok_() { return { ok: true }; }
  function removeIds(hand, ids) { ids.forEach(function (id) { var i = hand.indexOf(id); if (i >= 0) hand.splice(i, 1); }); }
  function addPen(g, s, why) { g.pen[s] += 101; g.penLog[s].push(why); }

  function drawCenter(M, s) {
    var g = M.g;
    if (g.over || g.turn !== s || g.phase !== 'draw') return fail('Şimdi taş çekemezsin.');
    if (!g.deck.length) { endDeck(M); return ok_(); }
    var t = g.deck.pop(); g.hands[s].push(t); g.phase = 'play'; g.drawn = t;
    g.last = { s: s, type: 'draw' };
    return ok_();
  }
  function drawLeft(M, s) {
    var g = M.g, prev = (s + 3) % 4;
    if (g.over || g.turn !== s || g.phase !== 'draw') return fail('Şimdi taş çekemezsin.');
    if (g.noLeft) return fail('Bu el ortadan çekmelisin.');
    if (!g.discards[prev].length) return fail('Solda taş yok.');
    var t = g.discards[prev].pop(); g.hands[s].push(t); g.phase = 'play'; g.mustUse = t; g.drawn = t;
    g.last = { s: s, type: 'left', tile: t };
    return ok_();
  }
  function returnLeft(M, s) {
    var g = M.g, prev = (s + 3) % 4;
    if (g.turn !== s || g.mustUse == null || g.hands[s].indexOf(g.mustUse) < 0) return fail('Geri bırakılacak taş yok.');
    removeIds(g.hands[s], [g.mustUse]); g.discards[prev].push(g.mustUse); g.mustUse = null;
    addPen(g, s, 'Soldan alınan taş kullanılmadı');
    g.phase = 'draw'; g.noLeft = true; g.drawn = null;
    return ok_();
  }
  function layGroups(g, s, groups, type) {
    groups.forEach(function (gr) {
      removeIds(g.hands[s], gr);
      if (type === 'cift') g.table.push({ owner: s, type: 'cift', tiles: gr.slice(), value: 0 });
      else { var r = normalize(gr, g.ok); g.table.push({ owner: s, type: r.type, tiles: r.tiles, value: r.value, start: r.start, c: r.c, n: r.n }); }
      if (g.mustUse != null && gr.indexOf(g.mustUse) >= 0) g.mustUse = null;
    });
  }
  function count(groups) { var n = 0; groups.forEach(function (x) { n += x.length; }); return n; }
  function contains(groups, id) { return groups.some(function (x) { return x.indexOf(id) >= 0; }); }

  // Açma: ilk açışta 101 puan ya da 5 çift; açtıktan sonra serbestçe yere açar
  function open(M, s, groups) {
    var g = M.g;
    if (g.over || g.turn !== s || g.phase !== 'play') return fail('Önce taş çek.');
    if (!Array.isArray(groups) || groups.length > 30) return fail('Geçersiz hamle.');
    var seen = {};
    for (var gi = 0; gi < groups.length; gi++) {
      if (!Array.isArray(groups[gi]) || groups[gi].length > 13) return fail('Geçersiz hamle.');
      for (var ti = 0; ti < groups[gi].length; ti++) {
        var tid = groups[gi][ti];
        if (typeof tid !== 'number' || seen[tid] || g.hands[s].indexOf(tid) < 0) return fail('Geçersiz taş.');
        seen[tid] = 1;
      }
    }
    var ev = evalGroups(groups, g.ok), hand = g.hands[s];
    if (!g.opened[s]) {
      var useSets = ev.setVal >= 101, usePairs = !useSets && ev.pairs.length >= 5;
      if (!useSets && !usePairs) return fail('Açmak için en az 101 puan (şu an ' + ev.setVal + ') ya da 5 çift (şu an ' + ev.pairs.length + ') gerekir.');
      var gs = useSets ? ev.sets.map(function (r) { return r.tiles; }) : ev.pairs;
      if (count(gs) >= hand.length) return fail('Elinde atacak en az bir taş kalmalı.');
      if (g.mustUse != null && !contains(gs, g.mustUse)) return fail('Soldan aldığın taşı açışta kullanmalısın.');
      layGroups(g, s, gs, useSets ? 'seri' : 'cift');
      g.opened[s] = useSets ? 'seri' : 'cift';
      g.openVal[s] = useSets ? ev.setVal : ev.pairs.length;
      g.openedAt[s] = g.turnNo;
      g.last = { s: s, type: 'open', kind: g.opened[s], value: g.openVal[s] };
      return ok_();
    }
    var sets = ev.sets.map(function (r) { return r.tiles; });
    var pairs = g.opened[s] === 'cift' ? ev.pairs : [];
    if (!sets.length && !pairs.length) return fail(g.opened[s] === 'cift' ? 'Yere açılacak geçerli bir grup ya da çift yok.' : 'Yere açılacak geçerli bir per ya da seri yok.');
    if (count(sets) + count(pairs) >= hand.length) return fail('Elinde atacak en az bir taş kalmalı.');
    layGroups(g, s, sets, 'seri'); layGroups(g, s, pairs, 'cift');
    g.last = { s: s, type: 'lay' };
    return ok_();
  }
  function addTo(M, s, mi, id) {
    var g = M.g, m = g.table[mi], hand = g.hands[s];
    if (g.over || g.turn !== s || g.phase !== 'play') return fail('Önce taş çek.');
    if (!g.opened[s]) return fail('İşlemek için önce elini açmalısın.');
    if (!m || hand.indexOf(id) < 0) return fail('Geçersiz hamle.');
    if (hand.length <= 1) return fail('Son taşını atarak bitirmelisin.');
    if (!canAdd(m, id, g.ok)) return fail('Bu taş bu gruba eklenemez.');
    removeIds(hand, [id]); applyAdd(m, id, g.ok);
    if (g.mustUse === id) g.mustUse = null;
    g.last = { s: s, type: 'add', tile: id };
    return ok_();
  }
  // force=false iken ceza gerektiren atışta uyarı döner
  function discard(M, s, id, force) {
    var g = M.g, hand = g.hands[s];
    if (g.over || g.turn !== s || g.phase !== 'play') return fail('Önce taş çek.');
    if (hand.indexOf(id) < 0) return fail('Bu taş sende yok.');
    if (g.mustUse != null && hand.indexOf(g.mustUse) >= 0) return fail('Soldan aldığın taşı bu el kullanmalısın ya da "Geri bırak"a dokunmalısın.');
    var final = hand.length === 1;
    var why = null;
    if (!final && isJoker(id, g.ok)) why = 'Okey atıldı';
    else if (!final && isIslek(id, g.table, g.ok)) why = 'İşlek taş atıldı';
    if (why && !force) return { ok: false, warn: why };
    if (why) addPen(g, s, why);
    removeIds(hand, [id]); g.discards[s].push(id);
    g.last = { s: s, type: 'discard', tile: id };
    if (final) { finish(M, s, id); return ok_(); }
    g.turn = (s + 1) % 4; g.phase = 'draw'; g.turnNo++; g.mustUse = null; g.noLeft = false; g.drawn = null;
    return ok_();
  }
  function finish(M, w, lastId) {
    var g = M.g, ok = g.ok, jokerD = isJoker(lastId, ok), wt = g.opened[w];
    var mult = (wt === 'cift' ? 2 : 1) * (jokerD ? 2 : 1);
    var elden = g.openedAt[w] === g.turnNo && [0, 1, 2, 3].every(function (p) { return p === w || !g.opened[p]; });
    var rows = [0, 1, 2, 3].map(function (p) {
      var base, note;
      if (p === w) { base = elden ? -202 * (jokerD ? 2 : 1) : -101 * mult; note = 'Bitirdi'; }
      else if (elden) { base = 404 * (jokerD ? 2 : 1); note = 'Elden bitti'; }
      else if (!g.opened[p]) { base = Math.min(404, 202 * mult); note = 'Açmadı'; }
      else { var hv = handValue(g.hands[p], ok), f = mult * (g.opened[p] === 'cift' ? 2 : 1); base = hv * f; note = 'Elde ' + hv + (f > 1 ? ' × ' + f : ''); }
      return { base: base, pen: g.pen[p], penLog: g.penLog[p].slice(), total: base + g.pen[p], note: note };
    });
    rows.forEach(function (r, p) { M.totals[p] += r.total; });
    g.over = { type: 'win', winner: w, kind: wt, jokerD: jokerD, elden: elden, rows: rows, hands: g.hands.map(function (h) { return h.slice(); }) };
    M.results.push(rows.map(function (r) { return r.total; }));
    if (M.handNo >= M.numHands) M.ended = true;
  }
  function endDeck(M) {
    var g = M.g;
    var rows = [0, 1, 2, 3].map(function (p) {
      var j = g.hands[p].filter(function (id) { return isJoker(id, g.ok); }).length;
      return { base: j * 101, pen: g.pen[p], penLog: g.penLog[p].slice(), total: j * 101 + g.pen[p], note: j ? 'Elde okey' : '—' };
    });
    rows.forEach(function (r, p) { M.totals[p] += r.total; });
    g.over = { type: 'deck', rows: rows, hands: g.hands.map(function (h) { return h.slice(); }) };
    M.results.push(rows.map(function (r) { return r.total; }));
    if (M.handNo >= M.numHands) M.ended = true;
  }
  function nextHand(M) {
    if (M.ended) return;
    M.dealer = (M.dealer + 1) % 4;
    deal(M);
  }
  function winnerOf(M) { var mn = Math.min.apply(null, M.totals); return M.totals.indexOf(mn); }

  // ---------- Bilgisayar oyuncu ----------
  function pairRoute(hand, ok) {
    var p = pairPlan(hand, ok);
    return p.natural + p.jokers.length >= 5 && bestMelds(hand, ok).value < 75;
  }
  // Elde en az bir taş kalacak şekilde grupları kırp
  function keepOne(groups, handLen, minVal, ok) {
    groups = groups.map(function (x) { return x.slice(); });
    if (count(groups) < handLen) return groups;
    for (var i = 0; i < groups.length; i++) if (groups[i].length >= 4) { groups[i].pop(); if (!normalize(groups[i], ok)) groups[i].push(groups[i].shift()); return groups; }
    groups.sort(function (a, b) { return a.length - b.length; });
    groups.shift();
    if (minVal) { var v = 0; groups.forEach(function (x) { var r = normalize(x, ok); v += r ? r.value : 0; }); if (v < minVal) return null; }
    return groups;
  }
  function botDraw(M, s) {
    var g = M.g, ok = g.ok, prev = (s + 3) % 4, hand = g.hands[s];
    var L = g.discards[prev].length ? g.discards[prev][g.discards[prev].length - 1] : null;
    var take = false;
    if (L != null && !g.noLeft) {
      var h2 = hand.concat([L]);
      if (g.opened[s]) {
        take = isIslek(L, g.table, ok) || bestMelds(h2, ok).melds.some(function (m) { return m.indexOf(L) >= 0; });
      } else {
        var b = bestMelds(h2, ok);
        if (b.value >= 101 && b.melds.some(function (m) { return m.indexOf(L) >= 0; })) take = true;
        else if (pairRoute(hand, ok)) { var p = pairPlan(h2, ok); take = p.natural >= 5 && p.pairs.some(function (x) { return x.indexOf(L) >= 0; }); }
      }
    }
    return take ? drawLeft(M, s) : drawCenter(M, s);
  }
  function botMeld(M, s) {
    var g = M.g, ok = g.ok, hand = g.hands[s];
    if (!g.opened[s]) {
      var b = bestMelds(hand, ok);
      if (b.value >= 101) {
        var gs = keepOne(b.melds, hand.length, 101, ok);
        if (gs) open(M, s, gs);
      } else {
        var p = pairPlan(hand, ok);
        if (p.withJokers.length >= 5 && (p.natural >= 4 || pairRoute(hand, ok))) {
          var ps = p.withJokers.slice(); if (count(ps) >= hand.length) ps.pop();
          if (ps.length >= 5) open(M, s, ps);
        }
      }
    }
    if (g.opened[s]) {
      var bb = bestMelds(hand, ok);
      var sets = keepOne(bb.melds, hand.length, 0, ok);
      if (sets && sets.length) open(M, s, sets);
      if (g.opened[s] === 'cift') {
        var pp = pairPlan(hand, ok).pairs; if (count(pp) >= hand.length) pp.pop();
        if (pp.length) open(M, s, pp);
      }
      var again = true;
      while (again && hand.length > 1) {
        again = false;
        for (var i = 0; i < hand.length && !again; i++) {
          for (var mi = 0; mi < g.table.length; mi++) {
            if (canAdd(g.table[mi], hand[i], ok)) { addTo(M, s, mi, hand[i]); again = true; break; }
          }
        }
      }
    }
    if (g.mustUse != null && hand.indexOf(g.mustUse) >= 0) { returnLeft(M, s); drawCenter(M, s); }
  }
  function botDiscard(M, s) {
    var g = M.g, ok = g.ok, hand = g.hands[s];
    if (g.over) return;
    if (hand.length === 1) return discard(M, s, hand[0], true);
    var cand = hand.filter(function (id) { return !isJoker(id, ok) && !isIslek(id, g.table, ok); });
    if (!cand.length) cand = hand.filter(function (id) { return !isJoker(id, ok); });
    if (!cand.length) cand = hand.slice();
    var route = !g.opened[s] && pairRoute(hand, ok);
    var inMeld = {};
    if (!route) bestMelds(hand, ok).melds.forEach(function (m) { m.forEach(function (id) { inMeld[id] = 1; }); });
    var best = null, bs = 1e9;
    cand.forEach(function (id) {
      var v = val(id, ok), sc = inMeld[id] ? 100 : 0;
      hand.forEach(function (o) {
        if (o === id || isJoker(o, ok)) return;
        var w = val(o, ok), dn = Math.abs(w.n - v.n);
        if (w.c === v.c && w.n === v.n) sc += route ? 30 : 2;
        else if (route) return;
        else if (w.c === v.c && dn === 1) sc += 6;
        else if (w.c === v.c && dn === 2) sc += 3;
        else if (w.n === v.n) sc += 5;
      });
      if (g.opened[s]) {
        // Yerdeki bir seriye bir taş uzakta olan taş yakında işlenebilir: elde tut
        g.table.forEach(function (m) {
          if (m.type !== 'seri' || m.c !== v.c) return;
          var e = m.start + m.tiles.length - 1;
          if (v.n === m.start - 2 || v.n === e + 2) sc += 7;
        });
      }
      sc += g.opened[s] ? -v.n * 0.6 : (route ? 0 : v.n * 0.25);
      if (sc < bs) { bs = sc; best = id; }
    });
    return discard(M, s, best, true);
  }

  var api = {
    ROW: ROW, SLOTS: SLOTS, tc: tc, tn: tn, isFake: isFake, okeyOf: okeyOf, isJoker: isJoker, val: val, face: face,
    handValue: handValue, newDeck: newDeck, normalize: normalize, pairOk: pairOk, canAdd: canAdd, isIslek: isIslek, bestMelds: bestMelds,
    pairPlan: pairPlan, arrangeSeri: arrangeSeri, arrangeCift: arrangeCift, groupsOf: groupsOf, evalGroups: evalGroups,
    newMatch: newMatch, deal: deal, nextHand: nextHand, drawCenter: drawCenter, drawLeft: drawLeft, returnLeft: returnLeft,
    open: open, addTo: addTo, discard: discard, winnerOf: winnerOf, botDraw: botDraw, botMeld: botMeld, botDiscard: botDiscard
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Okey101 = api;
})(this);
