const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const source = name => readFileSync(join(root, name), 'utf8');

function createGame(mode = 'solo'){
  const nodes = [];
  function element(tag){
    const handlers = {};
    const node = {
      tag, children: [], dataset: {}, disabled: false, textContent: '',
      appendChild(child){ this.children.push(child); return child; },
      addEventListener(event, handler){ handlers[event] = handler; },
      click(){ if (!this.disabled) handlers.click(); }
    };
    nodes.push(node);
    return node;
  }
  const area = element('div');
  const messages = [];
  const intervals = new Map();
  const storage = new Map();
  let timerId = 0;
  const context = vm.createContext({
    console,
    document: {
      createElement: element,
      querySelector: selector => nodes.find(n => '#' + n.id === selector) || null,
      querySelectorAll: selector => selector === '#action-area [data-plus]' ? nodes.filter(n => n.dataset.plus != null) : [],
      addEventListener(){}
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    setInterval(fn){ intervals.set(++timerId, fn); return timerId; },
    clearInterval: id => intervals.delete(id),
    Sound: { play(){} },
    Net: { relay: message => messages.push(JSON.parse(JSON.stringify(message))) }
  });
  context.window = context;
  vm.runInContext(source('content/generated.js'), context);
  vm.runInContext(source('src/engine.js'), context);
  const app = source('src/app.js');
  const initHook = "  document.addEventListener('DOMContentLoaded', init);";
  assert.ok(app.includes(initHook));
  // The UI is an IIFE; expose its actual handlers only inside this isolated test context.
  vm.runInContext(app.replace(initHook,
    '  window.bidUI = { renderBid, updateBidPanel, applyRemoteAction };'), context);
  const engine = context.Engine;
  if (mode === 'solo') engine.newGame(2, '观察者', null);
  else engine.newMultiGame({
    players: [{ id: 'host', name: '房主' }, { id: 'guest', name: '客人' }],
    localId: mode === 'host' ? 'host' : 'guest', isHost: mode === 'host'
  });
  engine.state.phase = 'bid';
  engine.state.players.forEach(p => { p.cp = 6; p.bid = 0; p.locked = false; });
  context.bidUI.renderBid(area, engine.state);
  engine.on('change', context.bidUI.updateBidPanel);
  function button(label){
    const matches = nodes.filter(n => n.tag === 'button' && n.textContent === label);
    assert.equal(matches.length, 1, 'Expected exactly one button: ' + label);
    return matches[0];
  }
  return {
    engine, messages, button, ui: context.bidUI,
    tick(){ for (const fn of [...intervals.values()]) fn(); },
    info: () => nodes.find(n => n.id === 'my-bid-info').textContent
  };
}

for (const mode of ['solo', 'host']){
  test(mode + ': +1/+2/+3 accumulate and stop at the control-point limit', () => {
    const game = createGame(mode);
    for (const [label, expected] of [['+1', 1], ['+2', 3], ['+3', 6]]){
      game.button(label).click();
      assert.equal(game.engine.localPlayer().bid, expected);
      assert.match(game.info(), new RegExp('当前出价 ' + expected));
    }
    for (const label of ['+1', '+2', '+3']){
      assert.equal(game.button(label).disabled, true);
      game.button(label).click();
    }
    assert.equal(game.engine.localPlayer().bid, 6);
    assert.equal(game.engine.localPlayer().cp, 6);
    assert.deepEqual(game.messages, []);
  });

  test(mode + ': clear resets the bid and lock prevents further changes', () => {
    const game = createGame(mode);
    game.button('+3').click();
    game.button('清零').click();
    assert.equal(game.engine.localPlayer().bid, 0);
    assert.equal(game.button('+3').disabled, false);
    game.button('+2').click();
    game.button('🔒 锁定出价').click();
    assert.equal(game.engine.localPlayer().locked, true);
    assert.match(game.info(), /已锁定/);
    for (const label of ['+1', '+2', '+3']) assert.equal(game.button(label).disabled, true);
    game.button('清零').click();
    game.engine.humanSetBid(5);
    assert.equal(game.engine.localPlayer().bid, 2);
  });
}

test('buttons only enable affordable increments', () => {
  const game = createGame();
  game.engine.humanSetBid(5);
  assert.equal(game.button('+1').disabled, false);
  assert.equal(game.button('+2').disabled, true);
  assert.equal(game.button('+3').disabled, true);
  game.button('+1').click();
  assert.equal(game.engine.localPlayer().bid, 6);
  game.engine.humanSetBid(99);
  assert.equal(game.engine.localPlayer().bid, 6);
  game.engine.humanSetBid(-1);
  assert.equal(game.engine.localPlayer().bid, 0);
});

test('guest buttons relay bids to the host and reflect authoritative snapshots', () => {
  const host = createGame('host');
  const guest = createGame('guest');
  function clickAndSync(label, action){
    const previous = guest.engine.localPlayer().bid;
    guest.button(label).click();
    assert.equal(guest.engine.localPlayer().bid, previous);
    assert.equal(guest.messages.length, 1);
    const message = guest.messages.shift();
    assert.deepEqual(message, { k: 'action', ...action });
    host.ui.applyRemoteAction('guest', message);
    guest.engine.applySnapshot(JSON.parse(JSON.stringify(host.engine.snapshot())));
  }
  for (const [label, amount] of [['+1', 1], ['+2', 3], ['+3', 6]]){
    clickAndSync(label, { kind: 'bid', amount });
    assert.equal(guest.engine.localPlayer().bid, amount);
    assert.equal(host.engine.playerById('guest').bid, amount);
  }
  assert.equal(guest.button('+1').disabled, true);
  clickAndSync('清零', { kind: 'bid', amount: 0 });
  assert.equal(guest.engine.localPlayer().bid, 0);
  clickAndSync('+2', { kind: 'bid', amount: 2 });
  clickAndSync('🔒 锁定出价', { kind: 'lock' });
  assert.equal(guest.engine.localPlayer().locked, true);
  for (const label of ['+1', '+2', '+3']) assert.equal(guest.button(label).disabled, true);
  clickAndSync('清零', { kind: 'bid', amount: 0 });
  assert.equal(guest.engine.localPlayer().bid, 2);
});

test('a winning human bid resolves and deducts control points once', () => {
  const game = createGame();
  const player = game.engine.localPlayer();
  player.selected = { cardId: 'talk', a: 'mio', b: 'akari' };
  for (const label of ['+1', '+2', '+3']) game.button(label).click();
  for (const bot of game.engine.state.players.filter(p => !p.human)){
    bot.bid = 4;
    bot.locked = true;
  }
  game.button('🔒 锁定出价').click();
  game.tick();
  assert.equal(game.engine.state.phase, 'narr');
  assert.equal(player.cp, 0);
  assert.equal(player.bid, 6);
  assert.ok(game.engine.state.log.some(line => line.includes('观察者 以 6 点主导')));
  assert.ok(game.engine.aff('mio', 'akari') > 0);
  game.tick();
  assert.equal(player.cp, 0);
});

test('a saved bid remains numeric and can be raised after loading', () => {
  const game = createGame();
  game.button('+2').click();
  assert.equal(game.engine.save(), true);
  game.engine.abandon();
  assert.equal(game.engine.load(), true);
  game.button('+3').click();
  assert.equal(game.engine.localPlayer().bid, 5);
  assert.equal(typeof game.engine.localPlayer().bid, 'number');
});
