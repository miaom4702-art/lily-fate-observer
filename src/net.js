/* net.js —— 客户端网络（连接房间服务器，WebSocket）。
   服务器只做房间/中继；游戏逻辑由「房主客户端」权威运行。 */
window.Net = (function () {
  let ws = null, myId = null, hostId = null, code = '', name = '观察者';
  const L = {};
  function on(ev, cb){ (L[ev] || (L[ev] = [])).push(cb); }
  function emit(ev, d){ (L[ev] || []).forEach(f => { try { f(d); } catch (e){} }); }
  function connected(){ return !!ws && ws.readyState === 1; }

  // 默认服务器：优先 config.js 指定；否则若网页本身是 http(s)（已部署），自动用同源地址
  function defaultServer(){
    if (window.GAME_CONFIG && window.GAME_CONFIG.server) return window.GAME_CONFIG.server;
    if (typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:')){
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    return '';
  }
  function normalize(url){
    let u = String(url || '').trim();
    if (u.indexOf('https://') === 0) u = 'wss://' + u.slice(8);
    else if (u.indexOf('http://') === 0) u = 'ws://' + u.slice(7);
    else if (u.indexOf('://') < 0){
      // 裸地址：本地用 ws，其余默认 wss（公网/云平台）
      const local = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u);
      u = (local ? 'ws://' : 'wss://') + u;
    }
    return u;
  }
  function connect(url){
    url = url || defaultServer();
    const real = normalize(url);
    return new Promise((resolve, reject) => {
      try { ws = new WebSocket(real); } catch (e){ reject(e); return; }
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('无法连接服务器'));
      ws.onclose = () => { emit('closed'); ws = null; };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e){ return; }
        handle(m);
      };
    });
  }
  function handle(m){
    switch (m.t){
      case 'hello': myId = m.id; break;
      case 'joined': myId = m.id; hostId = m.host; code = m.code; emit('joined', m); break;
      case 'players': hostId = m.host; emit('players', m); break;
      case 'relay': emit('relay', m); break;
      case 'system': emit('system', m.text); break;
      case 'error': emit('error', m.msg); break;
      case 'kicked': emit('kicked'); break;
    }
  }
  function create(c, n){ name = n; myId = null; sendRaw({ t: 'create', code: c, name: n }); }
  function join(c, n){ name = n; myId = null; sendRaw({ t: 'join', code: c, name: n }); }
  function setName(n){ name = n; sendRaw({ t: 'name', name: n }); }
  function relay(data, to){ sendRaw({ t: 'relay', to: to || 'all', data }); }
  function kick(id){ sendRaw({ t: 'kick', target: id }); }
  function leave(){ sendRaw({ t: 'leave' }); close(); }
  function close(){ if (ws){ try { ws.close(); } catch (e){} } ws = null; }
  function sendRaw(o){ if (connected()) ws.send(JSON.stringify(o)); }

  return {
    on, connect, create, join, setName, relay, kick, leave, close, connected, defaultServer,
    get myId(){ return myId; },
    get hostId(){ return hostId; },
    get roomCode(){ return code; },
    get playerName(){ return name; },
    get isHost(){ return myId != null && myId === hostId; }
  };
})();
