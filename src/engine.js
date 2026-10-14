/* engine.js —— 游戏核心逻辑（单机 + AI 机器人）。
   规则：双向独立好感0~5 / 9学期 / 控制点竞价 / 秘密干扰告白 / 四类结局。 */
window.Engine = (function () {
  const CH = window.CONTENT.characters;
  const CARDS = window.CONTENT.cards;
  const ids = CH.map(c => c.id);
  const charById = id => CH.find(c => c.id === id) || { name: id, color: '#888' };
  const cardById = id => CARDS.find(c => c.id === id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = n => Math.floor(Math.random() * n);
  const randRange = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[rand(arr.length)];
  const now = () => Date.now();

  const TX = window.CONTENT.text || {};
  const TOTAL_ROUNDS = 12, CP_PER_ROUND = 6, HAND_SIZE = 5, BID_TIME = 60;
  const CHAPTERS = TX.chapters || ['第一章', '第二章', '第三章'];
  const INTRO_LINES = TX.introLines || ['风穿过走廊。'];
  const CONFESS_NOT_MET = TX.confessNotMet || ['〔{P} 主导〕{A} 向 {B} 告白了，却没能被回应。'];
  const CONFESS_OK = TX.confessOk || ['〔{P} 主导〕{A} 的告白成功了。'];
  const CONFESS_FAIL = TX.confessFail || ['〔{P} 主导〕{A} 的告白没有得到回应。{WHO} 下意识地退缩了。'];

  const listeners = {};
  function on(ev, cb){ (listeners[ev] || (listeners[ev] = [])).push(cb); }
  function emit(ev, data){ (listeners[ev] || []).forEach(f => f(data)); }

  let S = null;
  let loopId = null;

  /* ---------------- 初始化 ---------------- */
  function randomGoal(){
    let a, b;
    do { a = ids[rand(ids.length)]; b = ids[rand(ids.length)]; } while (a === b);
    return { a, b };
  }

  function newGame(botCount, playerName, secretGoal){
    const players = [{
      id: 'you', name: playerName || '观察者', human: true,
      cp: 0, hand: [], bid: 0, selected: null, locked: false, goal: secretGoal
    }];
    for (let i = 0; i < botCount; i++){
      players.push({
        id: 'bot' + i, name: '机器人 ' + String.fromCharCode(65 + i), human: false,
        cp: 0, hand: [], bid: 0, selected: null, locked: false, goal: randomGoal(), nextAct: 0
      });
    }
    const aff = {};
    ids.forEach(a => { aff[a] = {}; ids.forEach(b => { if (a !== b) aff[a][b] = 0; }); });

    S = { phase: 'idle', round: 0, players, aff, log: [], confessions: [], couples: [],
          revealedSecrets: {}, summary: null, deadline: 0, timeLeft: 0, paused: false, ended: false,
          ending: null, started: false, botCount, savedAt: null, continued: {},
          mode: 'solo', localId: 'you', passive: false };
    startLoop();
    S.phase = 'prologue';   // 先进入序章，界面推进后调用 startRound() 才进入第 1 学期
    return S;
  }

  /* 联机对局：由房主构造玩家名单；客户端为被动（只接收快照） */
  function newMultiGame(cfg){
    const players = (cfg.players || []).map(pt => ({
      id: pt.id, name: pt.name, human: true, bot: false,
      cp: 0, hand: [], bid: 0, selected: null, locked: false,
      goal: (pt.id === cfg.localId ? (cfg.localGoal || null) : null)
    }));
    for (let i = 0; i < (cfg.botCount || 0); i++){
      players.push({ id: 'bot' + i, name: '机器人 ' + String.fromCharCode(65 + i), human: false, bot: true,
        cp: 0, hand: [], bid: 0, selected: null, locked: false, goal: randomGoal(), nextAct: 0 });
    }
    const aff = {};
    ids.forEach(a => { aff[a] = {}; ids.forEach(b => { if (a !== b) aff[a][b] = 0; }); });
    S = { phase: 'prologue', round: 0, players, aff, log: [], confessions: [], couples: [],
          revealedSecrets: {}, summary: null, deadline: 0, timeLeft: 0, paused: false, ended: false,
          ending: null, started: false, botCount: cfg.botCount || 0, savedAt: null, continued: {},
          mode: 'multi', localId: cfg.localId, passive: !cfg.isHost };
    startLoop();
    return S;
  }

  function startLoop(){ stopLoop(); loopId = setInterval(tick, 100); }
  function stopLoop(){ if (loopId){ clearInterval(loopId); loopId = null; } }

  /* ---------------- 好感 ---------------- */
  function aff(a, b){ return (S.aff[a] && S.aff[a][b]) || 0; }
  function addAff(a, b, d){ if (a === b) return 0; const v = clamp(aff(a, b) + d, 0, 5); S.aff[a][b] = v; return v; }
  function isCouple(a, b){ return S.couples.some(c => (c.a === a && c.b === b) || (c.a === b && c.b === a)); }
  function scoreForPair(a, b){ if (!a || !b) return 0; let s = aff(a, b) + aff(b, a); if (isCouple(a, b)) s += 10; return s; }
  function isSecretRevealed(id){ return !!(S && S.revealedSecrets && S.revealedSecrets[id]); }
  function revealSecret(id, reason){
    if (!S || !id || S.revealedSecrets[id]) return;
    S.revealedSecrets[id] = true;
    const c = charById(id);
    emit('secret', { id, name: c.name, reason, secret: c.secret });
    const tpl = TX.secretReveal || '（你窥见了 {name} 的秘密：{secret}）';
    pushNarrative(tpl.replace(/\{name\}/g, c.name).replace(/\{secret\}/g, c.secret));
  }

  /* ---------------- 牌堆 ---------------- */
  function dealHand(){
    const pool = [];
    CARDS.forEach(c => { const w = c.type === 'daily' ? 4 : (c.type === 'crisis' ? 2 : 1); for (let i = 0; i < w; i++) pool.push(c.id); });
    const hand = [];
    for (let i = 0; i < HAND_SIZE; i++) hand.push(pool[rand(pool.length)]);
    return hand;
  }

  /* ---------------- 阶段 ---------------- */
  function setPhase(ph, secs){
    S.phase = ph;
    S.timeLeft = secs || 0;
    S.deadline = secs ? now() + secs * 1000 : 0;
    emit('change');
  }
  // 读剧情阶段：必须所有玩家都点「继续」才推进（机器人自动视为已继续）
  function resetContinued(){
    S.continued = {};
    S.players.forEach(p => { S.continued[p.id] = !p.human; });
  }
  function allContinued(){ return S.players.every(p => S.continued[p.id]); }
  function readSecs(){ return S.mode === 'multi' ? 120 : 0; }

  function beginRound(){
    S.round++;
    if (S.round > TOTAL_ROUNDS){ finish(); return; }
    S.players.forEach(p => {
      p.cp = CP_PER_ROUND; p.hand = dealHand();
      p.bid = 0; p.selected = null; p.locked = false; p.nextAct = 0;
    });
    // 章节间歇：每 4 学期一章
    if ((S.round - 1) % 4 === 0){
      const ch = CHAPTERS[Math.floor((S.round - 1) / 4)];
      if (ch) pushNarrative('—— ' + ch + ' ——');
    }
    resetContinued();
    setPhase('intro', readSecs());
    pushNarrative('【第 ' + S.round + ' / ' + TOTAL_ROUNDS + ' 学期】' + INTRO_LINES[(S.round - 1) % INTRO_LINES.length]);
    emit('roundStart', S.round);
  }

  function startRound(){ beginRound(); }
  function setGoal(a, b){ const me = S.players.find(p => p.human); if (me) me.goal = { a, b }; emit('change'); }

  function goSelect(){
    setPhase('select', 0);
    // 机器人从容出招（放缓节奏）
    S.players.forEach(p => { if (!p.human) p.nextAct = now() + randRange(2200, 4500); });
  }
  function goBid(){
    S.players.forEach(p => {
      if (!p.selected) p.selected = autoSelect(p);
      p.bid = 0; p.locked = false;
      if (!p.human) p.nextAct = now() + randRange(2500, 6000);
    });
    setPhase('bid', BID_TIME);
  }
  function resolveBidding(){
    let winner = null, high = -1;
    S.players.forEach(p => { if (p.bid > high){ high = p.bid; winner = p; } });
    if (winner && high > 0){
      winner.cp = Math.max(0, winner.cp - high);
      applyWinner(winner, winner.selected, high);
    } else {
      pushNarrative('本轮无人主导，少女们的关系在沉默里原地停留。');
    }
    resetContinued();
    setPhase('narr', readSecs());
  }
  function goSummary(){
    const pairs = [];
    for (let i = 0; i < ids.length; i++){
      for (let j = i + 1; j < ids.length; j++){
        const a = ids[i], b = ids[j];
        pairs.push({ a, b, sum: aff(a, b) + aff(b, a) });
      }
    }
    pairs.sort((x, y) => y.sum - x.sum);
    S.summary = {
      round: S.round,
      top: pairs.slice(0, 3),
      confs: S.confessions.filter(c => c.round === S.round),
      couples: S.couples.length
    };
    resetContinued();
    setPhase('summary', readSecs());
    emit('change');
  }
  function goNext(){ if (S.round >= TOTAL_ROUNDS) finish(); else beginRound(); }

  function pushNarrative(text){ S.log.push(text); emit('narrative', text); emit('change'); }

  /* ---------------- 结算 ---------------- */
  function renderNarr(card, a, b){
    const A = charById(a), B = charById(b);
    let text = '';
    // 主动方(A)按自己性格的「出手」
    if (card.actions && card.actions[a]) text += card.actions[a];
    else if (card.narratives && card.narratives.length) text += pick(card.narratives);
    else if (card.narrative) text += card.narrative;
    // 对象(B)按自己性格的「反应」
    if (card.reactions && card.reactions[b]) text += card.reactions[b];
    // 收尾
    if (card.closings && card.closings.length) text += pick(card.closings);
    return text.replace(/\{A\}/g, A.name).replace(/\{B\}/g, B.name);
  }
  function applyWinner(player, sel, bid){
    const card = cardById(sel.cardId);
    if (!card) return;
    if (card.type === 'confession'){ resolveConfession(player, sel.a, sel.b); return; }
    const changes = [];
    (card.effects || []).forEach(e => {
      const from = e.from === 'self' ? sel.a : sel.b;
      const to = e.to === 'self' ? sel.a : sel.b;
      applyDelta(from, to, e.amount, changes);
    });
    if (card.type === 'daily'){
      [sel.a, sel.b].forEach(cid => {
        const c = charById(cid); const other = cid === sel.a ? sel.b : sel.a;
        let sc = 0;
        card.tags.forEach(t => { if (c.likeTags.includes(t)) sc++; if (c.dislikeTags.includes(t)) sc--; });
        sc = clamp(sc, -1, 1);
        if (sc) applyDelta(cid, other, sc, changes);
      });
    }
    pushNarrative('〔' + player.name + ' 以 ' + bid + ' 点主导〕' + renderNarr(card, sel.a, sel.b));
    if (changes.length) pushNarrative(describe(changes));
    emit('resolved', { card, a: sel.a, b: sel.b, changes, player });
    if (card.id === 'secret_seen' && sel.b) revealSecret(sel.b, '撞见秘密');
  }
  function applyDelta(from, to, amount, changes){
    if (!from || !to || from === to) return;
    const before = aff(from, to);
    const after = addAff(from, to, amount);
    if (after !== before) changes.push({ from, to, delta: after - before, value: after });
  }
  function describe(changes){
    const tpl = TX.affinityLine || '{from}→{to} 好感 {sign}{delta}（现 {value}）';
    return changes.map(ch => tpl
      .replace(/\{from\}/g, charById(ch.from).name)
      .replace(/\{to\}/g, charById(ch.to).name)
      .replace(/\{sign\}/g, ch.delta > 0 ? '+' : '')
      .replace(/\{delta\}/g, ch.delta)
      .replace(/\{value\}/g, ch.value)).join('　');
  }
  function resolveConfession(player, a, b){
    const na = charById(a).name, nb = charById(b).name;
    const ab = aff(a, b), ba = aff(b, a);
    const met = ab >= 4 && ba >= 4;
    const fail = clamp(charById(a).secretResist + charById(b).secretResist, 0, 0.85);
    const success = met && Math.random() >= fail;
    const data = { a, b, aName: na, bName: nb, ab, ba, met, success, failChance: fail, round: S.round, by: player.id };
    S.confessions.push(data);
    let line;
    if (!met){
      line = pick(CONFESS_NOT_MET).replace(/\{P\}/g, player.name).replace(/\{A\}/g, na).replace(/\{B\}/g, nb);
    } else if (success){
      S.couples.push({ a, b });
      line = pick(CONFESS_OK).replace(/\{P\}/g, player.name).replace(/\{A\}/g, na).replace(/\{B\}/g, nb);
    } else {
      const who = charById(a).secretResist >= charById(b).secretResist ? na : nb;
      line = pick(CONFESS_FAIL).replace(/\{P\}/g, player.name).replace(/\{A\}/g, na).replace(/\{WHO\}/g, who);
    }
    pushNarrative(line);
    emit('confession', data);
    if (met && !success){
      const resister = charById(a).secretResist >= charById(b).secretResist ? a : b;
      revealSecret(resister, '告白受挫');
    }
  }

  /* ---------------- 机器人 ---------------- */
  function autoSelect(p){
    const cardId = p.hand[rand(p.hand.length)];
    const card = cardById(cardId);
    const n = (card && card.targets) || 2;
    const pool = ids.slice();
    const picked = [];
    while (picked.length < n && pool.length) picked.push(pool.splice(rand(pool.length), 1)[0]);
    return { cardId, a: picked[0], b: picked[1] || '' };
  }
  function botsTick(){
    const t = now();
    S.players.forEach(p => {
      if (p.human) return;
      if (S.phase === 'select' && !p.selected && p.nextAct && t >= p.nextAct){
        p.selected = autoSelect(p); p.nextAct = 0; emit('change');
      } else if (S.phase === 'bid' && !p.locked && p.nextAct && t >= p.nextAct){
        if (p.bid < p.cp && p.bid < 5 && Math.random() < 0.65){
          p.bid = Math.min(p.cp, p.bid + randRange(1, 2));
        } else {
          p.locked = true;
        }
        p.nextAct = t + randRange(2800, 6500);
        emit('change');
      }
    });
  }

  /* ---------------- 主循环 ---------------- */
  function tick(){
    if (!S || S.ended) return;
    if (S.passive) return;                 // 客户端不跑主循环，只接收房主快照
    if (S.paused) return;
    if (S.deadline) S.timeLeft = Math.max(0, (S.deadline - now()) / 1000);
    botsTick();
    // 读剧情阶段：全员「继续」或超时才推进
    if (S.phase === 'intro' && (allContinued() || (S.deadline && S.timeLeft <= 0))){ goSelect(); return; }
    if (S.phase === 'select' && S.players.every(p => p.selected)){ goBid(); return; }
    if (S.phase === 'bid'){
      if (S.timeLeft <= 0 && S.deadline){ S.players.forEach(p => { if (!p.locked) p.locked = true; }); }
      if (S.players.every(p => p.locked)){ resolveBidding(); return; }
    }
    if (S.phase === 'narr' && (allContinued() || (S.deadline && S.timeLeft <= 0))){ goSummary(); return; }
    if (S.phase === 'summary' && (allContinued() || (S.deadline && S.timeLeft <= 0))){ goNext(); return; }
    emit('change');
  }

  /* ---------------- 结局 ---------------- */
  function finish(){
    S.ended = true; S.phase = 'over';
    computeEnding();
    stopLoop();
    emit('over', S.ending);
    emit('change');
  }
  function computeEnding(){
    const couples = [], unrequited = [], friendship = [], triangle = [];
    for (let i = 0; i < ids.length; i++){
      for (let j = i + 1; j < ids.length; j++){
        const a = ids[i], b = ids[j];
        const ab = aff(a, b), ba = aff(b, a);
        if (isCouple(a, b)) couples.push({ a, b });
        else if (ab >= 4 && ba >= 4) friendship.push({ a, b, ab, ba });
        else if ((ab >= 4 && ba <= 2) || (ba >= 4 && ab <= 2)) unrequited.push({ a, b, ab, ba });
        else if (ab >= 3 && ba >= 3) friendship.push({ a, b, ab, ba });
      }
    }
    ids.forEach(c => {
      let incoming = 0;
      ids.forEach(o => { if (o !== c && aff(o, c) >= 3) incoming++; });
      if (incoming >= 2) triangle.push(c);
    });
    const goals = S.players.filter(p => p.goal).map(p => ({
      id: p.id, name: p.name, human: p.human,
      goal: p.goal, score: scoreForPair(p.goal.a, p.goal.b)
    })).sort((x, y) => y.score - x.score);
    S.ending = { round: S.round, couples, unrequited, friendship, triangle,
                 confessions: S.confessions, log: S.log, goals };
  }

  /* ---------------- 玩家操作（按玩家 id，支持联机） ---------------- */
  function playerById(pid){ return S ? S.players.find(p => p.id === pid) : null; }
  function localPlayer(){ return S ? S.players.find(p => p.id === S.localId) : null; }

  function applySelect(pid, cardId, a, b){
    const p = playerById(pid);
    if (!p || S.phase !== 'select') return;
    if (!p.hand.includes(cardId) || !a || (b && a === b)) return;
    p.selected = { cardId, a, b };
    emit('change');
  }
  function applyBid(pid, amount){
    const p = playerById(pid);
    if (!p || S.phase !== 'bid' || p.locked) return;
    p.bid = clamp(amount, 0, p.cp);
    emit('change');
  }
  function applyLock(pid){
    const p = playerById(pid);
    if (!p || S.phase !== 'bid') return;
    p.locked = true; emit('change');
  }
  function humanSelect(cardId, a, b){ applySelect(S.localId, cardId, a, b); }
  function humanSetBid(amount){ applyBid(S.localId, amount); }
  function humanLock(){ applyLock(S.localId); }
  function applyContinue(pid){ if (S && S.continued) { S.continued[pid] = true; emit('change'); } }
  function humanContinue(){ applyContinue(S.localId); }
  function setPaused(v){ if (!S) return; S.paused = !!v; emit('change'); }
  function skipNarrative(){ /* 由 app 处理的打字机跳过钩子，占位 */ }

  /* ---------------- 联机：快照 / 机器人 / 增删玩家 ---------------- */
  function snapshot(){
    if (!S) return null;
    return {
      phase: S.phase, round: S.round, aff: S.aff,
      players: S.players.map(p => ({ id: p.id, name: p.name, human: p.human, cp: p.cp, bid: p.bid, selected: p.selected, locked: p.locked, hand: p.hand })),
      log: S.log, confessions: S.confessions, couples: S.couples,
      revealedSecrets: S.revealedSecrets, summary: S.summary, continued: S.continued,
      paused: S.paused, ended: S.ended, ending: S.ending, timeLeft: S.timeLeft
    };
  }
  function applySnapshot(d){
    if (!S || !d) return;
    const lp = S.players.find(p => p.id === S.localId);
    const keepGoal = lp ? lp.goal : null;
    S.phase = d.phase; S.round = d.round; S.aff = d.aff;
    S.players = (d.players || []).map(p => ({ ...p, bot: !p.human, goal: (p.id === S.localId ? keepGoal : null) }));
    S.log = d.log || []; S.confessions = d.confessions || []; S.couples = d.couples || [];
    S.revealedSecrets = d.revealedSecrets || {}; S.summary = d.summary || null; S.continued = d.continued || {};
    S.paused = !!d.paused; S.ended = !!d.ended; S.ending = d.ending || null;
    S.timeLeft = d.timeLeft || 0; S.deadline = 0;
    emit('change');
  }
  function addBot(){
    if (!S) return;
    let n = 0; const used = S.players.map(p => p.id);
    while (used.includes('bot' + n)) n++;
    S.players.push({ id: 'bot' + n, name: '机器人 ' + String.fromCharCode(65 + n), human: false, bot: true, cp: 0, hand: [], bid: 0, selected: null, locked: false, goal: randomGoal(), nextAct: 0 });
    emit('change');
  }
  function removePlayer(pid){ if (S) { S.players = S.players.filter(p => p.id !== pid); emit('change'); } }
  function setGoalOf(pid, a, b){ const p = playerById(pid); if (p) p.goal = { a, b }; }
  function refreshEnding(){ if (S) { computeEnding(); emit('change'); } }
  function abandon(){ stopLoop(); S = null; }
  function setEnding(d){ if (S) { S.ending = d; emit('change'); } }

  /* ---------------- 存档 ---------------- */
  const SAVE_KEY = 'lily-fate-save';
  function save(){
    if (!S) return false;
    try {
      S.savedAt = new Date().toISOString();
      S.players.forEach(p => { if (!p.human) p.nextAct = 0; });
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
      return true;
    } catch (e){ return false; }
  }
  function hasSave(){ try { return !!localStorage.getItem(SAVE_KEY); } catch (e){ return false; } }
  function load(){
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      S = JSON.parse(raw);
      S.paused = false;
      if (S.players) S.players.forEach(p => { if (!p.human) p.nextAct = 0; });
      if (S.ended) return false;
      startLoop();
      emit('change');
      return true;
    } catch (e){ return false; }
  }
  function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch (e){} }

  return {
    on, newGame, newMultiGame, startRound, setGoal, addBot, removePlayer, setGoalOf,
    applySelect, applyBid, applyLock, applyContinue, playerById, localPlayer, snapshot, applySnapshot,
    refreshEnding, setEnding, abandon,
    load, save, hasSave, clearSave,
    humanSelect, humanSetBid, humanLock, humanContinue, setPaused, skipNarrative,
    get state(){ return S; },
    get localId(){ return S ? S.localId : null; },
    get mode(){ return S ? S.mode : 'solo'; },
    ids, charById, cardById, aff, isCouple, scoreForPair, renderNarr,
    isSecretRevealed, revealSecret,
    TOTAL_ROUNDS, CP_PER_ROUND, HAND_SIZE
  };
})();
