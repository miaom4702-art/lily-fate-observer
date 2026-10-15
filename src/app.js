/* app.js —— 界面渲染与交互（原生 JS，无依赖）。 */
(function () {
  const C = window.CONTENT;
  const E = window.Engine;
  const $ = s => document.querySelector(s);
  const charById = E.charById;
  const U = window.CONTENT.ui || {};
  const TX = window.CONTENT.text || {};
  const G = U.guide || {};
  const BTN = U.buttons || {};
  const NOTES = U.notes || {};
  const TITLES = U.sectionTitles || {};

  const PHASE_NAMES = U.phaseNames || { intro: '回合导入', select: '选择事件卡', bid: '竞价争夺主导权', narr: '剧情演出', summary: '学期小结', over: '对局结束' };

  let currentPhase = null;
  let selCard = null;
  let selecting = false;
  let dragDropFn = null;
  let charBarRefs = {};

  /* ---------------- 通用 ---------------- */
  function el(tag, cls, text){
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  let bgmCurrent = null;
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
    Sound.play('page');
    const map = { 'screen-game': 'library', 'screen-ending': 'rainy' };
    const want = map[id] || 'theme';
    if (want !== bgmCurrent){ bgmCurrent = want; Sound.playBgm(want); }
  }
  function overlay(inner, onClose){
    const root = $('#overlay-root');
    const mask = el('div', 'overlay');
    const box = el('div', 'overlay-box panel');
    box.appendChild(inner);
    mask.appendChild(box);
    mask.addEventListener('click', e => { if (e.target === mask){ mask.remove(); if (onClose) onClose(); } });
    root.appendChild(mask);
    return mask;
  }
  function toast(msg){
    const t = el('div', 'toast', msg);
    $('#overlay-root').appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-show'));
    setTimeout(() => { t.classList.remove('is-show'); setTimeout(() => t.remove(), 300); }, 3400);
  }

  /* ---------------- 步骤条 ---------------- */
  const STEPS = U.steps || ['选事件卡', '选目标', '竞价', '剧情', '小结'];

  /* 打字机速度（字/秒），可调，持久化 */
  let textSpeed = 38;
  try { const v = localStorage.getItem('lily-text-speed'); if (v != null) textSpeed = parseInt(v, 10); } catch (e) {}

  /* ---------------- 打字机 ---------------- */
  const log = $('#narrative-log');
  let narrQueue = [], typing = false, typeTimer = null, typeEl = null, fullText = '', typed = 0;
  function enqueueNarr(text){ narrQueue.push(text); if (!typing) nextNarr(); }
  function nextNarr(){
    if (!narrQueue.length){ typing = false; typeEl = null; refreshContinue(); return; }
    typing = true; fullText = narrQueue.shift(); typed = 0;
    typeEl = el('p', 'narr-line');
    log.appendChild(typeEl);
    clearInterval(typeTimer);
    if (textSpeed <= 0){            // 瞬间显示
      typeEl.textContent = fullText; scrollLog(); nextNarr(); return;
    }
    const cps = textSpeed;
    typeTimer = setInterval(() => {
      typed += Math.max(1, Math.round(cps / 40));
      typeEl.textContent = fullText.slice(0, typed);
      scrollLog();
      if (typed >= fullText.length){
        clearInterval(typeTimer); typeTimer = null;
        typeEl.textContent = fullText;
        nextNarr();
      }
    }, 25);
  }
  function completeTyping(){
    if (typeTimer){ clearInterval(typeTimer); typeTimer = null; }
    if (typeEl) typeEl.textContent = fullText;
    narrQueue.forEach(t => log.appendChild(el('p', 'narr-line', t)));
    narrQueue = []; typing = false; typeEl = null; scrollLog(); refreshContinue();
  }
  function scrollLog(){ log.scrollTop = log.scrollHeight; }
  function refreshContinue(){ if (currentPhase === 'intro' || currentPhase === 'narr') renderAction(); }

  /* ---------------- 对局入口（含对局内的序章演出） ---------------- */
  // 叙事到达：若是序章介绍某位少女，就高亮她的面板；联机时房主把叙事转发给其他人
  function handleNarrative(text){
    const m = /^【([^】·]+) ·/.exec(text);
    if (m){
      const c = C.characters.find(x => x.name === m[1].trim());
      if (c){ Sound.play('reveal'); flashChar(c.id); }
    }
    enqueueNarr(text);
    if (Net.connected() && E.state && E.mode === 'multi' && !E.state.passive) Net.relay({ k: 'narr', text });
  }

  function startGame(){
    const name = ($('#player-name').value || '观察者').trim().slice(0, 12);
    const bots = parseInt($('#bot-count').value, 10) || 2;
    log.innerHTML = ''; narrQueue = []; typing = false; typeEl = null;
    currentPhase = null;
    E.newGame(bots, name, null);     // 单机：引擎从序章开始（与联机流程一致）
    renderCharacters(); renderEmoteBar();
    showScreen('screen-game');
    onChange();
  }

  function flashChar(id){
    const row = document.querySelector('[data-char="' + id + '"]');
    if (!row) return;
    try { row.scrollIntoView({ block: 'nearest' }); } catch (e){}
    row.classList.add('is-flash');
    setTimeout(() => row.classList.remove('is-flash'), 1500);
  }

  function bootNarr(){
    const S = E.state;
    if (S && S.log.length) S.log.forEach(t => enqueueNarr(t));
  }

  /* ---------------- 「还有几人未确认」提示 ---------------- */
  function gatedProgress(){
    const S = E.state; if (!S) return null;
    const list = S.players || [];
    const cnt = obj => list.filter(p => obj && obj[p.id]).length;
    switch (S.phase){
      case 'prologue': case 'intro': case 'narr': case 'summary': return { done: cnt(S.continued), total: list.length };
      case 'goalpick': return { done: cnt(S.goalsReady), total: list.length };
      case 'select': return { done: list.filter(p => p.selected).length, total: list.length };
      case 'bid': return { done: list.filter(p => p.locked).length, total: list.length };
    }
    return null;
  }
  function pendingLine(){
    const g = gatedProgress();
    if (!g) return el('span');
    const left = g.total - g.done;
    return el('p', 'waiting-line', left > 0 ? ('已确认 ' + g.done + ' / ' + g.total + ' 人 —— 还有 ' + left + ' 人未点击确认') : '全员已确认 ✅');
  }

  /* ---------------- 主推 CP（引擎 goalpick 阶段） ---------------- */
  let goalA = null, goalB = null;
  function resetSetup(){ goalA = null; goalB = null; }

  function renderGoalPick(area){
    goalA = null; goalB = null;
    if (E.state.goalsReady && E.state.goalsReady[E.localId]){
      area.appendChild(el('p', 'phase-hint', '已确认主推 CP，等待其他玩家……'));
      area.appendChild(pendingLine());
      return;
    }
    area.appendChild(el('div', 'guide', '序章已毕。现在，选定你「秘密主推」的一对少女——其他观察者看不到你的选择。'));
    const grid = el('div', 'girl-grid');
    const cards = {};
    C.characters.forEach(c => {
      const g = el('button', 'girl-pick');
      const img = el('img', 'avatar pixel'); img.src = c.portrait; img.alt = c.name;
      g.appendChild(img); g.appendChild(el('span', 'girl-name', c.name)); g.appendChild(el('span', 'girl-badge', ''));
      g.addEventListener('click', () => { Sound.play('click'); toggleGoal(c.id); });
      grid.appendChild(g); cards[c.id] = g;
    });
    area.appendChild(grid);
    const note = el('p', 'note', '依次点选两位少女，组成你的主推 CP。'); area.appendChild(note);
    const btn = el('button', 'btn primary big', '✔ 确定主推 CP'); btn.disabled = true; area.appendChild(btn);
    area.appendChild(pendingLine());
    function upd(){
      C.characters.forEach(c => {
        const g = cards[c.id];
        g.classList.toggle('is-a', c.id === goalA);
        g.classList.toggle('is-b', c.id === goalB);
        g.querySelector('.girl-badge').textContent = (c.id === goalA) ? 'A · 主动' : (c.id === goalB) ? 'B · 对象' : '';
      });
      btn.disabled = !(goalA && goalB);
      note.textContent = (goalA && goalB) ? ('主推：' + charById(goalA).name + ' × ' + charById(goalB).name) : '依次点选两位少女，组成你的主推 CP。';
    }
    function toggleGoal(id){
      if (id === goalA) goalA = null;
      else if (id === goalB) goalB = null;
      else if (!goalA) goalA = id;
      else if (!goalB) goalB = id;
      else { goalA = id; goalB = null; }
      upd();
    }
    btn.addEventListener('click', () => {
      if (!goalA || !goalB) return;
      Sound.play('lock');
      E.applyGoal(E.localId, goalA, goalB);                 // 仅本地存储（保密）
      if (isMultiClient()) Net.relay({ k: 'action', kind: 'goalready' });
      else E.applyGoalReady(E.localId);
      renderAction();
    });
    upd();
  }

  /* ---------------- 角色面板 ---------------- */
  function renderCharacters(){
    const list = $('#char-list');
    list.innerHTML = '';
    charBarRefs = {};
    C.characters.forEach(c => {
      const row = el('div', 'char-row');
      row.dataset.char = c.id;
      row.addEventListener('click', () => {
        Sound.play('click');
        if (selecting && dragDropFn){ dragDropFn(c.id); return; }
        openCodex('screen-game', c.id);
      });
      const img = el('img', 'avatar pixel');
      img.src = c.portrait; img.alt = c.name;
      row.appendChild(img);
      const info = el('div', 'char-info');
      info.appendChild(el('div', 'char-name', c.name));
      const barOut = bar('对众人好感');
      const barIn = bar('被在意度');
      info.appendChild(barOut.wrap);
      info.appendChild(barIn.wrap);
      row.appendChild(info);
      list.appendChild(row);
      charBarRefs[c.id] = { out: barOut.fill, in: barIn.fill };
    });
    updateCharBars();
  }
  function bar(labelText){
    const wrap = el('div', 'bar');
    wrap.appendChild(el('span', 'bar-label', labelText));
    const track = el('div', 'bar-track');
    const fill = el('i', 'bar-fill');
    track.appendChild(fill);
    wrap.appendChild(track);
    return { wrap, fill };
  }
  function updateCharBars(){
    const S = E.state; if (!S) return;
    const max = 5 * (C.characters.length - 1);
    C.characters.forEach(c => {
      let out = 0, inc = 0;
      C.characters.forEach(o => { if (o.id === c.id) return; out += E.aff(c.id, o.id); inc += E.aff(o.id, c.id); });
      const ref = charBarRefs[c.id]; if (!ref) return;
      ref.out.style.width = (out / max * 100) + '%';
      ref.in.style.width = (inc / max * 100) + '%';
      ref.out.title = '对众人好感 ' + out;
      ref.in.title = '被在意度 ' + inc;
    });
  }

  /* ---------------- 行动区 ---------------- */
  function renderAction(){
    const S = E.state; if (!S) return;
    const area = $('#action-area');
    area.innerHTML = '';
    selecting = false; dragDropFn = null;
    document.body.classList.remove('is-selecting', 'is-dragging');
    if (S.paused){ area.appendChild(el('p', 'hint', '对局已暂停。')); return; }
    currentPhase = S.phase;
    if (S.phase === 'prologue'){
      if (localContinued()){ area.appendChild(el('p', 'phase-hint', '已继续，等待其他玩家……')); area.appendChild(pendingLine()); return; }
      area.appendChild(el('p', 'phase-hint', '序章 · 观察者。点「继续」逐段阅读；介绍到哪位少女，她在左侧的面板会高亮。'));
      const b = el('button', 'btn primary big', BTN.continue || '继续 ▶');
      b.addEventListener('click', () => { Sound.play('click'); if (typing) completeTyping(); else doContinue(); });
      area.appendChild(b);
      area.appendChild(pendingLine());
      return;
    }
    if (S.phase === 'goalpick'){ renderGoalPick(area); return; }
    if (S.phase === 'intro'){
      if (localContinued()){ area.appendChild(pendingLine()); return; }
      area.appendChild(el('p', 'phase-hint', isMulti() ? '阅读本学期的开场，点击「继续」；所有玩家都继续后进入下一步。' : '阅读本学期的开场，然后点击继续。'));
      const b = el('button', 'btn primary big', BTN.continue || '继续 ▶');
      b.addEventListener('click', () => { Sound.play('click'); if (typing) completeTyping(); else doContinue(); });
      area.appendChild(b);
      area.appendChild(pendingLine());
    } else if (S.phase === 'select'){
      renderSelect(area, S);
      area.appendChild(pendingLine());
    } else if (S.phase === 'bid'){
      renderBid(area, S);
      area.appendChild(pendingLine());
    } else if (S.phase === 'narr'){
      if (localContinued()){ area.appendChild(pendingLine()); return; }
      area.appendChild(el('p', 'phase-hint', '剧情演出中。'));
      const row = el('div', 'btn-row');
      const b = el('button', 'btn primary big', BTN.continue || '继续 ▶');
      b.addEventListener('click', () => { Sound.play('click'); if (typing) completeTyping(); else doContinue(); });
      const skip = el('button', 'btn', BTN.skipText || '跳过长文本');
      skip.addEventListener('click', () => { Sound.play('click'); completeTyping(); });
      row.appendChild(b); row.appendChild(skip);
      area.appendChild(row);
      area.appendChild(pendingLine());
    } else if (S.phase === 'summary'){
      renderSummary(area, S);
      area.appendChild(pendingLine());
    }
  }

  function renderSummary(area, S){
    if (localContinued()){ area.appendChild(pendingLine()); return; }
    const sum = S.summary || {};
    area.appendChild(el('div', 'step-title', '本学期小结'));
    area.appendChild(el('p', 'phase-hint', '第 ' + (sum.round || S.round) + ' 学期结束。目前最亲近的三对：'));
    const list = el('div', 'summary-list');
    (sum.top || []).forEach((p, i) => {
      const row = el('div', 'summary-row');
      row.appendChild(el('span', 'summary-rank', '第 ' + (i + 1) + ' 亲近'));
      row.appendChild(el('span', 'summary-pair', charById(p.a).name + ' × ' + charById(p.b).name));
      row.appendChild(el('span', 'summary-sum', '好感合计 ' + p.sum));
      list.appendChild(row);
    });
    area.appendChild(list);
    if (sum.confs && sum.confs.length){
      sum.confs.forEach(c => area.appendChild(el('p', 'summary-conf',
        '告白：' + c.aName + ' → ' + c.bName + '（' + (c.success ? '成功' : '未能回应') + '）')));
    } else {
      area.appendChild(el('p', 'hint', '本学期没有人说出口。'));
    }
    const last = S.round >= E.TOTAL_ROUNDS;
    const b = el('button', 'btn primary big', last ? (BTN.seeEnding || '查看结局 ▶') : (BTN.nextRound || '进入下一学期 ▶'));
    b.addEventListener('click', () => { Sound.play('click'); doContinue(); });
    area.appendChild(b);
  }

  function renderSelect(area, S){
    const me = E.localPlayer();
    selCard = null; selecting = true;
    document.body.classList.add('is-selecting');
    let a = null, b = null;

    const guide = el('div', 'guide');
    area.appendChild(guide);

    // ① 事件卡
    const cardBlock = el('div', 'step-block');
    cardBlock.appendChild(el('div', 'step-title', '① 选择事件卡'));
    const hand = el('div', 'hand');
    me.hand.forEach(cid => {
      const card = E.cardById(cid);
      const cEl = el('button', 'card card-' + card.type);
      cEl.appendChild(el('span', 'card-name', card.name));
      cEl.appendChild(el('span', 'card-type', typeName(card.type) + ' · ' + card.cost + '点'));
      cEl.appendChild(el('span', 'card-check', '✓ 已选'));
      cEl.title = card.desc;
      cEl.addEventListener('click', () => pickCard(cid, cEl));
      hand.appendChild(cEl);
    });
    cardBlock.appendChild(hand);
    area.appendChild(cardBlock);

    // ② 目标少女
    const girlBlock = el('div', 'step-block');
    girlBlock.appendChild(el('div', 'step-title', '② 选择两名少女（依次点选 = 主动方 A、对象 B）'));
    const grid = el('div', 'girl-grid');
    const girlEls = {};
    C.characters.forEach(c => {
      const g = el('button', 'girl-pick');
      const img = el('img', 'avatar pixel'); img.src = c.portrait; img.alt = c.name;
      g.appendChild(img);
      g.appendChild(el('span', 'girl-name', c.name));
      g.appendChild(el('span', 'girl-badge', ''));
      g.addEventListener('click', () => toggleGirl(c.id));
      grid.appendChild(g);
      girlEls[c.id] = g;
    });
    girlBlock.appendChild(grid);
    area.appendChild(girlBlock);

    const preview = el('div', 'preview');
    area.appendChild(preview);

    const submit = el('button', 'btn primary big', BTN.submitEvent || '✔ 提交事件');
    submit.disabled = true;
    submit.addEventListener('click', () => {
      if (!selCard || !a || !b){ guide.textContent = G.needCard || '还需选择事件卡与两名少女。'; return; }
      Sound.play('lock');
      doSelect(selCard, a, b);
      submit.disabled = true; submit.textContent = G.alreadySubmitted || '已提交，等待其他玩家…';
      refresh();
      selecting = false; dragDropFn = null;
      document.body.classList.remove('is-selecting');
    });
    area.appendChild(submit);

    function pickCard(cid, cEl){
      selCard = cid; Sound.play('card');
      hand.querySelectorAll('.card').forEach(x => x.classList.toggle('is-selected', x === cEl));
      refresh();
    }
    function toggleGirl(id){
      if (!selCard){ Sound.play('click'); refresh(); return; }
      if (id === a) a = null;
      else if (id === b) b = null;
      else if (!a) a = id;
      else if (!b) b = id;
      else { a = id; b = null; }
      Sound.play('card');
      refresh();
    }
    dragDropFn = id => { if (selCard) toggleGirl(id); };

    function refresh(){
      C.characters.forEach(c => {
        const g = girlEls[c.id];
        g.classList.toggle('is-a', c.id === a);
        g.classList.toggle('is-b', c.id === b);
        g.querySelector('.girl-badge').textContent = (c.id === a) ? 'A · 主动' : (c.id === b) ? 'B · 对象' : '';
      });
      if (!selCard) guide.textContent = G.pickCard || '第 1 步：点击下方任意一张事件卡。';
      else if (!a) guide.textContent = G.pickA || '第 2 步：点击一名少女，作为「发起方（主动）」。';
      else if (!b) guide.textContent = G.pickB || '第 3 步：再点击另一名少女，作为「对象（被对待）」。';
      else guide.textContent = G.submit || '第 4 步：确认无误后，点击下方「提交事件」。';

      const card = selCard ? E.cardById(selCard) : null;
      if (!card){
        preview.innerHTML = '<span class="hint">选好事件卡后，这里会显示它对好感的改变方向。</span>';
      } else if (!a || !b){
        preview.innerHTML = '<span class="hint">' + card.name +
          (a ? '　已选主动方 A：' + charById(a).name : '') +
          (b ? '　已选对象 B：' + charById(b).name : '') + '</span>';
      } else {
        const A = charById(a), B = charById(b);
        const ab = E.aff(a, b), ba = E.aff(b, a);
        const rows = (card.effects || []).map(e => {
          const from = e.from === 'self' ? A.name : B.name;
          const to = e.to === 'self' ? A.name : B.name;
          return '<div class="preview-line">' + from + ' → ' + to + '：好感 ' + (e.amount > 0 ? '+' : '') + e.amount + '</div>';
        }).join('');
        const bonus = card.type === 'daily' ? '<div class="preview-line hint">命中「偏好」+1，命中「雷点」-1</div>' : '';
        preview.innerHTML =
          '<div class="preview-head">' + card.name + '：' + A.name + '（A·主动） → ' + B.name + '（B·对象）</div>' +
          (rows || '<div class="preview-line hint">该卡不直接改变好感。</div>') + bonus +
          '<div class="preview-now">当前好感：' + A.name + '→' + B.name + ' ' + ab + '　｜　' + B.name + '→' + A.name + ' ' + ba + '</div>';
      }
      submit.disabled = !(selCard && a && b);
    }
    refresh();

    if (me.selected){
      guide.textContent = G.alreadySubmitted || '已提交，等待其他玩家选牌……';
      submit.disabled = true; submit.textContent = '已提交';
      selecting = false; dragDropFn = null;
      document.body.classList.remove('is-selecting');
    }
  }
  function typeName(t){ return t === 'daily' ? '日常' : t === 'crisis' ? '危机' : '高阶'; }

  function renderBid(area, S){
    const me = E.localPlayer();
    area.appendChild(el('p', 'phase-hint', '消耗控制点争夺本次行动的主导权，出价最高者决定结果。'));
    const info = el('p', 'bid-info');
    info.id = 'my-bid-info';
    area.appendChild(info);
    const row = el('div', 'btn-row');
    [1, 2, 3].forEach(n => {
      const b = el('button', 'btn', '+' + n);
      b.dataset.plus = n;
      b.addEventListener('click', () => { Sound.play('bid'); doBid(E.localPlayer().bid + n); });
      row.appendChild(b);
    });
    const zero = el('button', 'btn', '清零');
    zero.addEventListener('click', () => { Sound.play('click'); doBid(0); });
    const lock = el('button', 'btn primary', '🔒 锁定出价');
    lock.addEventListener('click', () => { Sound.play('lock'); doLock(); });
    row.appendChild(zero); row.appendChild(lock);
    area.appendChild(row);
    const note = el('p', 'hint');
    note.id = 'bid-note';
    area.appendChild(note);
    updateBidPanel();
  }
  function updateBidPanel(){
    const S = E.state; if (!S || S.phase !== 'bid') return;
    const me = E.localPlayer();
    const info = $('#my-bid-info');
    if (info) info.textContent = '剩余控制点 ' + me.cp + '　·　当前出价 ' + me.bid + '　·　' + (me.locked ? '已锁定' : '可继续加价');
    document.querySelectorAll('#action-area [data-plus]').forEach(b => {
      const n = parseInt(b.dataset.plus, 10);
      b.disabled = me.locked || (me.bid + n > me.cp);
    });
    const note = $('#bid-note');
    if (note){
      const winner = S.players.slice().sort((x, y) => y.bid - x.bid)[0];
      note.textContent = winner && winner.bid > 0 ? ('当前最高：' + winner.name + '（' + winner.bid + '）') : '当前还没有人出价。';
    }
  }

  /* ---------------- 出价列表 ---------------- */
  function updateBidList(){
    const S = E.state; const box = $('#bid-list'); if (!S || !box) return;
    box.innerHTML = '';
    if (S.phase !== 'bid'){
      box.appendChild(el('p', 'hint', '仅在竞价阶段显示出价。'));
      return;
    }
    const top = Math.max(0, ...S.players.map(p => p.bid));
    S.players.forEach(p => {
      const row = el('div', 'bid-row');
      row.appendChild(el('span', 'bid-name', p.name + (p.id === E.localId ? '（我）' : '') + (p.bot ? '（机器人）' : '')));
      const v = el('span', 'bid-val', String(p.bid));
      if (p.bid === top && top > 0) row.classList.add('is-top');
      row.appendChild(v);
      box.appendChild(row);
    });
  }

  /* ---------------- 表情 ---------------- */
  function renderEmoteBar(){
    const bar = $('#emote-bar');
    bar.innerHTML = '';
    for (let i = 0; i < 6; i++){
      const b = el('button', 'emote-btn');
      const img = el('img', 'pixel');
      img.src = 'assets/images/icons/emote_' + i + '.png';
      b.appendChild(img);
      b.addEventListener('click', () => { Sound.play('emote'); floatEmote(i); });
      bar.appendChild(b);
    }
  }
  function floatEmote(i){
    const f = el('div', 'emote-float');
    const img = el('img', 'pixel');
    img.src = 'assets/images/icons/emote_' + i + '.png';
    f.appendChild(img);
    f.style.left = (window.innerWidth - 200 - Math.random() * 60) + 'px';
    f.style.top = (window.innerHeight * 0.4 + (Math.random() * 80 - 40)) + 'px';
    $('#overlay-root').appendChild(f);
    setTimeout(() => f.remove(), 2200);
  }

  /* ---------------- 顶栏 / 主刷新 ---------------- */
  function onChange(){
    const S = E.state;
    if (!S || S.phase === 'idle') return;
    $('#round-label').textContent = '第 ' + Math.max(S.round, 0) + ' / ' + E.TOTAL_ROUNDS + ' 学期';
    $('#phase-label').textContent = PHASE_NAMES[S.phase] || '—';
    const me = E.localPlayer();
    $('#cp-label').textContent = '控制点 ' + (me ? me.cp : 0);
    const timer = $('#timer-label');
    if (S.phase === 'bid' && S.deadline){ timer.textContent = '⏱ ' + Math.ceil(S.timeLeft) + ' 秒'; }
    else timer.textContent = '';

    updateCharBars();
    updateBidList();
    updateBidPanel();
    renderStepper(S);
    const bp = $('#bid-panel'); if (bp) bp.style.display = (S.phase === 'bid') ? '' : 'none';
    const wl = $('#waiting-label');
    if (wl){ const g = gatedProgress(); wl.textContent = (g && (g.total - g.done) > 0) ? ('等待 ' + (g.total - g.done) + ' 人确认') : ''; }

    if (S.phase !== currentPhase && S.phase !== 'bid'){ renderAction(); currentPhase = S.phase; }
    else if (S.phase === 'bid' && currentPhase !== 'bid'){ renderAction(); currentPhase = 'bid'; }
  }

  function renderStepper(S){
    const box = $('#stepper'); if (!box) return;
    let idx;
    if (S.phase === 'bid') idx = 2;
    else if (S.phase === 'narr') idx = 3;
    else if (S.phase === 'summary') idx = 4;
    else if (S.phase === 'over') idx = 5;
    else if (S.phase === 'select') idx = selCard ? 1 : 0;
    else idx = -1;
    box.innerHTML = '';
    STEPS.forEach((name, i) => {
      const s = el('div', 'step' + (i === idx ? ' is-active' : '') + (idx > i ? ' is-done' : ''));
      s.appendChild(el('span', 'step-num', String(i + 1)));
      s.appendChild(el('span', 'step-name', name));
      box.appendChild(s);
    });
  }

  /* ---------------- 角色图鉴（页内全屏） ---------------- */
  let codexReturn = 'screen-title';
  function openCodex(from, focusId){
    codexReturn = from || 'screen-title';
    renderCodexScreen(focusId);
    showScreen('screen-codex');
  }
  function renderCodexScreen(focusId){
    const nav = $('#codex-nav'); if (!nav) return;
    nav.innerHTML = '';
    C.characters.forEach(c => {
      const b = el('button', 'btn small', c.name);
      b.dataset.id = c.id;
      b.addEventListener('click', () => { Sound.play('click'); showCodexChar(c.id); });
      nav.appendChild(b);
    });
    showCodexChar(focusId || C.characters[0].id);
  }
  function showCodexChar(id){
    const c = charById(id); if (!c) return;
    const portrait = $('#codex-portrait');
    const detail = $('#codex-detail');
    if (portrait){
      portrait.onerror = function(){ this.onerror = null; this.src = 'assets/images/avatars/' + id + '.png'; };
      portrait.src = 'assets/images/portraits/' + id + '.png';
      portrait.alt = c.name;
    }
    if (detail){
      detail.innerHTML = '';
      const top = el('div', 'char-head');
      const img = el('img', 'avatar big pixel'); img.src = c.portrait; img.alt = c.name;
      top.appendChild(img);
      const nm = el('div');
      nm.appendChild(el('div', 'char-name-lg', c.name));
      nm.appendChild(el('div', 'char-title', c.title));
      top.appendChild(nm);
      detail.appendChild(top);
      detail.appendChild(fieldNode('偏好', tags(c.prefs, 'ok')));
      detail.appendChild(fieldNode('雷点', tags(c.dislikes, 'danger')));
      detail.appendChild(field('性格', c.personality));
      const known = E.isSecretRevealed(c.id);
      detail.appendChild(field('秘密', known ? c.secret : (TX.secretHidden || '？？？（尚未知晓）'), 'accent'));
    }
    document.querySelectorAll('#codex-nav .btn').forEach(b => b.classList.toggle('is-active', b.dataset.id === id));
  }
  /* ---------------- 关系 / 设置 / 暂停 ---------------- */
  function field(label, val, cls){
    return fieldNode(label, el('div', 'field-val ' + (cls || ''), val));
  }
  function fieldNode(label, node){
    const f = el('div', 'char-field');
    f.appendChild(el('div', 'field-label', label));
    f.appendChild(node);
    return f;
  }
  function tags(items, cls){
    const wrap = el('div', 'chips');
    (items || []).forEach(t => wrap.appendChild(el('span', 'chip ' + (cls || ''), t)));
    return wrap;
  }

  function openRelations(){
    const box = el('div', 'relations');
    const head = el('div', 'overlay-head');
    head.appendChild(el('h2', 'section-title', '关系观察面板'));
    const close = el('button', 'btn small', '关闭');
    head.appendChild(close);
    box.appendChild(head);
    box.appendChild(el('p', 'hint', '读法：行 → 列 的单向好感（0~5）。数值越深代表越高。'));
    const table = el('table', 'rel-table');
    const hr = el('tr');
    hr.appendChild(el('th', null, ''));
    C.characters.forEach(c => hr.appendChild(el('th', null, c.name)));
    table.appendChild(hr);
    C.characters.forEach(a => {
      const tr = el('tr');
      tr.appendChild(el('th', null, a.name));
      C.characters.forEach(b => {
        const td = el('td');
        if (a.id === b.id){ td.textContent = '—'; td.className = 'self'; }
        else {
          const v = E.aff(a.id, b.id);
          td.textContent = v;
          td.style.background = shade(v);
          td.title = a.name + ' → ' + b.name + '：' + v;
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    box.appendChild(table);
    const mask = overlay(box);
    close.addEventListener('click', () => mask.remove());
  }
  function shade(v){ const t = v / 5; const g = Math.round(245 - t * 200); return 'rgb(' + g + ',' + g + ',' + g + ')'; }

  function buildSettings(container){
    container.appendChild(el('p', 'hint', NOTES.settings || '排版 / 配色集中在 styles.css，方便随时调整。'));
    const row = el('div', 'field');
    row.appendChild(el('label', null, '文字速度'));
    const sel = el('select', 'select');
    [[25, '慢'], [38, '正常'], [60, '快'], [0, '瞬间']].forEach(([v, t]) => sel.appendChild(new Option(t, String(v), false, v === textSpeed)));
    sel.addEventListener('change', () => {
      textSpeed = parseInt(sel.value, 10);
      try { localStorage.setItem('lily-text-speed', String(textSpeed)); } catch (e) {}
      Sound.play('click');
    });
    row.appendChild(sel);
    container.appendChild(row);

    const muteRow = el('div', 'field');
    muteRow.appendChild(el('label', null, '音效'));
    const mute = el('button', 'btn', Sound.isMuted() ? '已静音' : '开启中');
    mute.addEventListener('click', () => {
      const v = !Sound.isMuted(); Sound.setMuted(v);
      mute.textContent = v ? '已静音' : '开启中';
      const top = $('#btn-mute'); if (top) top.textContent = v ? '音效：关' : '音效：开';
      if (!v) Sound.play('click');
    });
    muteRow.appendChild(mute);
    container.appendChild(muteRow);

    const save = el('button', 'btn', '💾 保存本局进度');
    save.addEventListener('click', () => { const ok = E.save(); save.textContent = ok ? '已保存 ✔' : '保存失败'; });
    container.appendChild(save);
  }
  function openSettings(){
    const box = el('div', 'settings');
    const head = el('div', 'overlay-head');
    head.appendChild(el('h2', 'section-title', '设置'));
    const close = el('button', 'btn small', '关闭');
    head.appendChild(close);
    box.appendChild(head);
    buildSettings(box);
    const mask = overlay(box);
    close.addEventListener('click', () => mask.remove());
  }
  function renderSettingsScreen(){
    const host = $('#settings-body'); if (!host) return;
    host.innerHTML = '';
    buildSettings(host);
  }
  function renderHelp(){
    const host = $('#help-body'); if (!host) return;
    host.innerHTML = '';
    const help = U.help || {};
    const title = document.querySelector('#help-title');
    if (title && help.title) title.textContent = help.title;
    (help.sections || []).forEach(sec => {
      host.appendChild(el('h3', 'sub-title', sec.h));
      if (sec.p) host.appendChild(el('p', null, sec.p));
      if (sec.list){
        const ol = el('ol', 'rules-list');
        sec.list.forEach(t => ol.appendChild(el('li', null, t)));
        host.appendChild(ol);
      }
    });
  }
  function renderTips(){
    const host = $('#tips-list'); if (!host) return;
    host.innerHTML = '';
    ((U.tips && U.tips.items) || []).forEach(t => host.appendChild(el('li', null, t)));
  }
  const SCENES = ['library', 'corridor', 'field', 'infirmary', 'rooftop'];
  function setScene(round){
    const img = $('#scene-img'); if (!img) return;
    const name = SCENES[((round || 1) - 1 + SCENES.length) % SCENES.length];
    img.src = 'assets/images/scenes/' + name + '.png';
  }
  function applyTitles(){
    const map = {
      '#title-relations': 'relations', '#title-narrative': 'narrative', '#title-bids': 'bids',
      '#title-emote': 'emote', '#title-tips': 'tips', '#codex-title': 'codex',
      '#settings-title': 'settings', '#help-title': 'help', '#setup-title': 'setup',
      '#ending-recap-title': 'recap', '#ending-goals-title': 'goals'
    };
    Object.keys(map).forEach(sel => {
      const e = document.querySelector(sel);
      if (e && TITLES[map[sel]]) e.textContent = TITLES[map[sel]];
    });
  }

  function confirmExitGame(){
    const box = el('div', 'exit-confirm');
    box.appendChild(el('h2', 'section-title', '退出对局'));
    box.appendChild(el('p', 'hint', '确定退出当前对局、返回主菜单吗？未保存的进度会丢失（可先点「保存」）。'));
    const row = el('div', 'btn-row');
    const ok = el('button', 'btn primary', '确定退出');
    const cancel = el('button', 'btn', '取消');
    row.appendChild(ok); row.appendChild(cancel);
    box.appendChild(row);
    const mask = overlay(box);
    cancel.addEventListener('click', () => mask.remove());
    ok.addEventListener('click', () => { mask.remove(); exitGame(); });
  }
  function exitGame(){
    Sound.play('click');
    if (Net.connected()) Net.leave();
    lobbyPlayers = []; pendingBots = 0; bgmCurrent = null;
    try { E.abandon(); } catch (e){}
    showScreen('screen-title');
  }

  function openPause(){
    const box = el('div', 'pause');
    box.appendChild(el('h2', 'section-title', '对局已暂停'));
    box.appendChild(el('p', 'hint', '计时与操作已冻结，可随时继续。'));
    const b = el('button', 'btn primary', '继续对局');
    box.appendChild(b);
    const mask = overlay(box);
    b.addEventListener('click', () => { E.setPaused(false); mask.remove(); });
  }

  /* ---------------- 结局 ---------------- */
  let rated = false;
  function endingEpilogue(en){
    const Epi = TX.epilogues || {};
    const one = arr => (arr && arr.length) ? arr[Math.floor(Math.random() * arr.length)] : '';
    if (en.couples && en.couples.length) return one(Epi.couples) || '有些心意，终于被好好接住了。';
    if (en.triangle && en.triangle.length) return one(Epi.triangle) || '三个人的影子在夕阳里交叠又分开。';
    if (en.unrequited && en.unrequited.length) return one(Epi.unrequited) || '这份心意没能抵达，却也曾真实地存在过。';
    if (en.friendship && en.friendship.length) return one(Epi.friendship) || '她们终究没有跨过那条线。';
    return one(Epi.none) || '这个学期安静地结束了。';
  }
  function showEnding(){
    const en = E.state.ending || {};
    currentPhase = 'over';
    const top = (en.goals || [])[0];
    Sound.play(top && top.id === E.localId ? 'win' : 'lose');
    showScreen('screen-ending');
    const recap = $('#ending-recap'); recap.innerHTML = '';
    recap.appendChild(el('p', 'hint', '共经历 ' + (en.round || 12) + ' 个学期。'));
    recap.appendChild(el('p', 'epilogue', endingEpilogue(en)));
    section(recap, '双向奔赴', en.couples, 'pair-accent');
    section(recap, '双向羁绊（挚友）', en.friendship, 'pair-ok');
    section(recap, '单向暗恋', en.unrequited, 'pair-warn');
    if (en.triangle && en.triangle.length)
      recap.appendChild(el('p', 'tri', '三角羁绊的中心：' + en.triangle.map(id => charById(id).name).join('、')));
    recap.appendChild(el('hr', 'rule'));
    recap.appendChild(el('h3', 'sub-title', '告白记录'));
    if (!en.confessions || !en.confessions.length) recap.appendChild(el('p', 'hint', '本局没有人真正说出口。'));
    (en.confessions || []).forEach(c => {
      recap.appendChild(el('p', 'recap-line', c.aName + ' → ' + c.bName + '：' + (c.success ? '告白成功' : '未能回应')));
    });
    recap.appendChild(el('hr', 'rule'));
    recap.appendChild(el('h3', 'sub-title', '少女的秘密'));
    C.characters.forEach(c => {
      const known = E.isSecretRevealed(c.id);
      recap.appendChild(el('p', 'recap-line ' + (known ? '' : 'dim'),
        c.name + '：' + (known ? c.secret : '（始终未被人知晓）')));
    });
    recap.appendChild(el('hr', 'rule'));
    recap.appendChild(el('h3', 'sub-title', '回合流水'));
    (en.log || []).forEach(l => recap.appendChild(el('p', 'log-line', l)));

    const goals = $('#ending-goals'); goals.innerHTML = '';
    (en.goals || []).forEach(g => {
      const row = el('div', 'goal-row' + (g.human ? ' is-me' : ''));
      row.appendChild(el('span', 'goal-name', g.name + (g.human ? '（我）' : '')));
      row.appendChild(el('span', 'goal-pair', charById(g.goal.a).name + ' × ' + charById(g.goal.b).name));
      row.appendChild(el('span', 'goal-score', String(g.score)));
      goals.appendChild(row);
    });
    const mine = (en.goals || []).find(g => g.human);
    if (mine) goals.insertBefore(el('p', 'hint', '我的得分：' + mine.score), goals.firstChild);

    const rate = $('#ending-rate'); rate.innerHTML = '';
    rate.appendChild(el('p', 'sub-title', '为本局故事评分'));
    rated = false;
    const stars = el('div', 'stars');
    for (let i = 1; i <= 5; i++){
      const s = el('button', 'star', '☆');
      s.addEventListener('click', () => {
        stars.querySelectorAll('.star').forEach((x, idx) => x.textContent = idx < i ? '★' : '☆');
        stars.dataset.value = i;
      });
      stars.appendChild(s);
    }
    rate.appendChild(stars);
    const input = el('input', 'text-input');
    input.placeholder = '写下一句本局感想（本地记录）';
    rate.appendChild(input);
    const submit = el('button', 'btn', '提交评分与感想');
    submit.addEventListener('click', () => { rated = true; submit.textContent = '感谢评分 ✔'; submit.disabled = true; });
    rate.appendChild(submit);
  }
  function section(parent, title, arr, cls){
    parent.appendChild(el('h3', 'sub-title', title));
    if (!arr || !arr.length){ parent.appendChild(el('p', 'hint', '（暂无）')); return; }
    arr.forEach(p => {
      const pair = charById(p.a).name + ' × ' + charById(p.b).name;
      const extra = (p.ab != null) ? '（' + p.ab + ' / ' + p.ba + '）' : '';
      parent.appendChild(el('p', 'recap-line ' + (cls || ''), pair + ' ' + extra));
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  /* ================= 联机 ================= */
  let lobbyPlayers = [];
  let pendingBots = 0;
  let bcTimer = null;

  function isMulti(){ return E.mode === 'multi'; }
  function isMultiClient(){ return E.mode === 'multi' && E.state && E.state.passive; }
  function localContinued(){ const S = E.state; return !!(S && S.continued && S.continued[E.localId]); }
  function inGame(){ const s = document.getElementById('screen-game'); return s && s.classList.contains('is-active'); }
  function genCode(){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<5;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }

  function doSelect(cardId,a,b){ if(isMultiClient()) Net.relay({k:'action',kind:'select',cardId,a,b}); else E.humanSelect(cardId,a,b); }
  function doBid(amount){ if(isMultiClient()) Net.relay({k:'action',kind:'bid',amount}); else E.humanSetBid(amount); }
  function doLock(){ if(isMultiClient()) Net.relay({k:'action',kind:'lock'}); else E.humanLock(); }
  function doContinue(){ if(isMultiClient()) Net.relay({k:'action',kind:'continue'}); else E.humanContinue(); }

  function chatLine(boxId, name, text, sys){
    const box = document.getElementById(boxId); if(!box) return;
    const p = el('p','chat-line'+(sys?' sys':''), sys?text:((name?name+'：':'')+text));
    box.appendChild(p); box.scrollTop = box.scrollHeight;
    if (box.children.length > 200) box.removeChild(box.firstChild);
  }
  function sendChat(inputId, boxId){
    const inp = document.getElementById(inputId); if(!inp) return;
    const t = inp.value.trim(); if(!t) return; inp.value='';
    if(!Net.connected()){ chatLine(boxId,'','未连接服务器',true); return; }
    chatLine(boxId, Net.playerName, t);
    Net.relay({ k:'chat', name: Net.playerName, text: t });
  }

  function updateOnline(){
    const n = E.state && E.state.players ? E.state.players.filter(p=>!p.bot).length : lobbyPlayers.length;
    const lbl = document.getElementById('online-label');
    if(lbl) lbl.textContent = isMulti() ? ('在线 ' + n + ' 人') : '';
    const cnt = document.getElementById('lobby-count');
    if(cnt) cnt.textContent = (lobbyPlayers.length || 0) + ' / 8';
  }

  function renderLobbyPlayers(){
    const box = document.getElementById('lobby-players'); if(!box) return;
    box.innerHTML='';
    lobbyPlayers.forEach(p=>{
      const row = el('div','lobby-player');
      row.appendChild(el('span', null, p.name + (p.id===Net.myId?'（我）':'')));
      if(p.host) row.appendChild(el('span','host-badge','房主'));
      else if(Net.isHost && p.id !== Net.myId){
        const k = el('button','btn small kick','踢出');
        k.addEventListener('click', ()=> Net.kick(p.id));
        row.appendChild(k);
      } else row.appendChild(el('span'));
      box.appendChild(row);
    });
    const tools = document.getElementById('lobby-host-tools');
    if(tools) tools.style.display = (Net.isHost && Net.connected()) ? 'flex' : 'none';
  }

  function enterMultiGame(){
    log.innerHTML=''; narrQueue=[]; typing=false; typeEl=null; currentPhase=null;
    renderCharacters(); renderEmoteBar(); showScreen('screen-game'); onChange();
  }
  function hostStart(){
    const roster = lobbyPlayers.map(p=>({ id:p.id, name:p.name }));
    E.newMultiGame({ players: roster, localId: Net.myId, isHost: true, botCount: pendingBots });
    Net.relay({ k:'start', cfg:{ roster, botCount: pendingBots } });   // 先让其他人进入对局
    enterMultiGame();
    E.startPrologue();                                                  // 再推送序章第一段（会转发给所有人）
  }
  function clientStart(cfg){
    E.newMultiGame({ players: cfg.roster, localId: Net.myId, isHost: false, botCount: cfg.botCount||0 });
    enterMultiGame();
  }
  function applyRemoteAction(pid, d){
    if(d.kind==='select') E.applySelect(pid, d.cardId, d.a, d.b);
    else if(d.kind==='bid') E.applyBid(pid, d.amount);
    else if(d.kind==='lock') E.applyLock(pid);
    else if(d.kind==='continue') E.applyContinue(pid);
    else if(d.kind==='goalready') E.applyGoalReady(pid);
  }
  function scheduleBroadcast(){
    if(bcTimer) return;
    bcTimer = setTimeout(()=>{ bcTimer=null; if(Net.connected() && E.mode==='multi' && E.state && !E.state.passive) Net.relay({ k:'state', snap: E.snapshot() }); }, 120);
  }
  function onRelay(m){
    const d = m.data; if(!d) return;
    if(d.k==='chat'){ chatLine(inGame()?'game-chat':'lobby-chat', d.name, d.text); Sound.play('emote'); return; }
    if(d.k==='narr'){ handleNarrative(d.text); return; }
    if(d.k==='start'){ if(!Net.isHost) clientStart(d.cfg); return; }
    if(d.k==='state'){ if(E.mode==='multi' && E.state && E.state.passive) E.applySnapshot(d.snap); return; }
    if(d.k==='action'){ if(Net.isHost) applyRemoteAction(m.from, d); return; }
    if(d.k==='over'){ if(!Net.isHost){ showEnding(); const lp=E.localPlayer(); if(lp && lp.goal) Net.relay({k:'mygoal',a:lp.goal.a,b:lp.goal.b}); } return; }
    if(d.k==='mygoal'){ if(Net.isHost){ if(d.a&&d.b) E.setGoalOf(m.from, d.a, d.b); E.refreshEnding(); Net.relay({k:'ending', ending: E.state.ending}); } return; }
    if(d.k==='ending'){ if(!Net.isHost){ E.setEnding(d.ending); showEnding(); } return; }
  }
  function leaveLobby(){ Net.leave(); lobbyPlayers=[]; pendingBots=0; showScreen('screen-title'); }
  async function netConnect(){
    if(Net.connected()) return true;
    const field = document.getElementById('net-url');
    let url = (field && field.value ? field.value : (Net.defaultServer() || '')).trim();
    if(!url){ const st=document.getElementById('lobby-status'); if(st) st.textContent='请填写服务器地址（局域网：ws://房主IP:8787；公网：wss://你的域名）'; return false; }
    try { await Net.connect(url); return true; }
    catch(e){ const st=document.getElementById('lobby-status'); if(st) st.textContent='连接服务器失败：'+url+'（局域网请先双击「启动服务器.bat」）'; return false; }
  }
  function initNet(){
    const on = (id, ev, fn)=>{ const e=document.getElementById(id); if(e) e.addEventListener(ev, fn); };
    // 服务器地址：若网页已部署在同源（http/https），自动连接、隐藏输入框；否则预填/显示
    const deployed = (location.protocol === 'http:' || location.protocol === 'https:');
    const urlInput = document.getElementById('net-url');
    if (urlInput && !urlInput.value && Net.defaultServer()) urlInput.value = Net.defaultServer();
    const urlRow = document.getElementById('net-url-row');
    if (urlRow) urlRow.style.display = deployed ? 'none' : '';
    on('nav-multi','click', ()=>{ Sound.play('click'); showScreen('screen-lobby'); });
    on('lobby-back','click', leaveLobby);
    on('lobby-leave','click', leaveLobby);
    on('net-create','click', async ()=>{
      Sound.play('click'); if(!await netConnect()) return;
      const name = (document.getElementById('net-name').value||'观察者').trim().slice(0,12) || '观察者';
      let code = (document.getElementById('net-code').value||'').trim().toUpperCase();
      if(code.length<4){ code = genCode(); document.getElementById('net-code').value = code; }
      Net.create(code, name);
    });
    on('net-join','click', async ()=>{
      Sound.play('click');
      const code = (document.getElementById('net-code').value||'').trim().toUpperCase();
      if(code.length<4){ const st=document.getElementById('lobby-status'); if(st) st.textContent='请输入房间码'; return; }
      if(!await netConnect()) return;
      const name = (document.getElementById('net-name').value||'观察者').trim().slice(0,12) || '观察者';
      Net.join(code, name);
    });
    on('lobby-addbot','click', ()=>{ Sound.play('click'); pendingBots++; const st=document.getElementById('lobby-status'); if(st) st.textContent='已添加 '+pendingBots+' 个机器人（开局加入）'; });
    on('lobby-start','click', ()=>{ Sound.play('click'); hostStart(); });
    on('lobby-chat-send','click', ()=>sendChat('lobby-chat-input','lobby-chat'));
    on('lobby-chat-input','keydown', e=>{ if(e.key==='Enter') sendChat('lobby-chat-input','lobby-chat'); });
    on('game-chat-send','click', ()=>sendChat('game-chat-input','game-chat'));
    on('game-chat-input','keydown', e=>{ if(e.key==='Enter') sendChat('game-chat-input','game-chat'); });

    Net.on('joined', ()=>{ Sound.play('confirm'); const st=document.getElementById('lobby-status'); if(st) st.textContent='已加入房间：'+Net.roomCode; renderLobbyPlayers(); });
    Net.on('players', m=>{
      lobbyPlayers = m.players||[]; renderLobbyPlayers(); updateOnline();
      if(Net.isHost && E.mode==='multi' && E.state && !E.state.passive){
        const alive = lobbyPlayers.map(p=>p.id);
        E.state.players.filter(p=>!p.bot).forEach(p=>{ if(!alive.includes(p.id)) E.removePlayer(p.id); });
      }
    });
    Net.on('relay', onRelay);
    Net.on('system', t=>chatLine(inGame()?'game-chat':'lobby-chat','',t,true));
    Net.on('error', msg=>{ const st=document.getElementById('lobby-status'); if(st) st.textContent=msg; Sound.play('error'); });
    Net.on('kicked', ()=>{ alert('你已被房主移出房间'); location.reload(); });
    Net.on('closed', ()=>{ const st=document.getElementById('lobby-status'); if(st) st.textContent='与服务器断开连接'; });

    E.on('change', ()=>{ if(Net.connected() && E.mode==='multi' && E.state && !E.state.passive) scheduleBroadcast(); });
    E.on('over', ()=>{ if(Net.connected() && E.mode==='multi' && E.state && !E.state.passive) Net.relay({ k:'over' }); });
  }

  function init(){
    resetSetup();
    applyTitles();
    renderHelp();
    renderTips();
    initNet();
    $('#btn-start').addEventListener('click', startGame);
    const cont = $('#nav-continue');
    if (cont){
      cont.disabled = !E.hasSave();
      cont.addEventListener('click', () => {
        if (E.load()){ showScreen('screen-game'); renderCharacters(); renderEmoteBar(); onChange(); bootNarr(); }
      });
    }
    $('#nav-new').addEventListener('click', () => { Sound.play('click'); resetSetup(); showScreen('screen-setup'); });
    $('#nav-help').addEventListener('click', () => { Sound.play('click'); showScreen('screen-help'); });
    $('#nav-codex').addEventListener('click', () => { Sound.play('click'); openCodex('screen-title'); });
    const cxb = $('#codex-back'); if (cxb) cxb.addEventListener('click', () => { Sound.play('click'); showScreen(codexReturn); });
    $('#nav-settings').addEventListener('click', () => { Sound.play('click'); renderSettingsScreen(); showScreen('screen-settings'); });
    $('#nav-back-title').addEventListener('click', () => { Sound.play('click'); showScreen('screen-title'); });
    document.querySelectorAll('.screen-back').forEach(b => b.addEventListener('click', () => { Sound.play('click'); showScreen('screen-title'); }));
    $('#btn-save').addEventListener('click', () => { const b = $('#btn-save'); b.textContent = E.save() ? (BTN.saved || '已保存') : (BTN.saveFail || '失败'); setTimeout(() => b.textContent = '保存', 1200); });
    $('#btn-newgame').addEventListener('click', () => { Sound.play('click'); resetSetup(); showScreen('screen-setup'); });
    $('#btn-backmenu').addEventListener('click', () => showScreen('screen-title'));

    document.querySelectorAll('[data-tool]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.tool;
        if (t === 'archive') openCodex('screen-game');
        else if (t === 'relations') openRelations();
        else if (t === 'settings') openSettings();
        else if (t === 'pause'){ E.setPaused(true); openPause(); }
        else if (t === 'exit'){ confirmExitGame(); }
      });
    });

    const muteBtn = $('#btn-mute');
    if (muteBtn){
      muteBtn.addEventListener('click', () => {
        const v = !Sound.isMuted();
        Sound.setMuted(v);
        muteBtn.textContent = v ? '音效：关' : '音效：开';
        if (!v) Sound.play('click');
      });
    }
    document.addEventListener('pointerdown', () => { Sound.ensure(); Sound.probe(); }, { once: true });
    Sound.probe();

    E.on('narrative', handleNarrative);
    E.on('change', onChange);
    E.on('over', showEnding);
    E.on('roundStart', r => { Sound.play('round'); setScene(r); });
    E.on('resolved', d => {
      Sound.play('card');
      const c = FX.center('#action-area');
      FX.ink(c.x, c.y, 12);
      (d.changes || []).forEach(ch => {
        const p = FX.rowCenter(ch.to);
        if (ch.delta > 0) FX.hearts(p.x, p.y, 7); else FX.ink(p.x, p.y, 9);
      });
    });
    E.on('secret', d => {
      Sound.play('reveal');
      const p = FX.rowCenter(d.id);
      FX.sparkle(p.x, p.y, 28);
      toast('秘密揭晓 · ' + d.name + '：' + d.secret);
    });
    E.on('confession', d => {
      const c = FX.center('#narrative-log');
      if (d.success){ Sound.play('confessOk'); FX.hearts(c.x, c.y, 46); }
      else { Sound.play('confessFail'); FX.ink(c.x, c.y, 26); }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape'){ const o = document.querySelector('#overlay-root .overlay'); if (o) o.remove(); }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
