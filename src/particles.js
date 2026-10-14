/* particles.js —— 轻量 canvas 粒子特效（爱心 / 墨点 / 星光）。
   全屏覆盖层，不拦截鼠标。 */
window.FX = (function () {
  const canvas = document.getElementById('fx-canvas');
  const noop = { hearts(){}, ink(){}, sparkle(){}, burst(){}, center: () => ({ x: 0, y: 0 }), rowCenter: () => ({ x: 0, y: 0 }) };
  if (!canvas) return noop;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, parts = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();

  function center(sel){
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return { x: W / 2, y: H / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function rowCenter(id){ return center('[data-char="' + id + '"]'); }

  function add(p){ if (parts.length < 460) parts.push(p); }

  function burst(x, y, o){
    o = o || {};
    const n = o.count || 16;
    for (let i = 0; i < n; i++){
      const ang = rand(0, Math.PI * 2), sp = rand(1, o.speed || 4);
      add({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (o.up == null ? 1 : o.up),
        g: o.gravity == null ? 0.12 : o.gravity, life: 1, decay: rand(0.012, 0.024),
        size: rand(o.sizeMin || 3, o.sizeMax || 7), color: o.color || '#111',
        shape: o.shape || 'square', rot: rand(0, 6.28), vr: rand(-0.2, 0.2)
      });
    }
  }
  function hearts(x, y, n){
    for (let i = 0; i < (n || 12); i++){
      add({ x: x + rand(-26, 26), y: y + rand(-10, 10), vx: rand(-1, 1), vy: rand(-2.6, -1),
            g: 0.015, life: 1, decay: rand(0.008, 0.015), size: rand(9, 15),
            color: '#111', shape: 'heart', rot: rand(-0.3, 0.3), vr: rand(-0.02, 0.02) });
    }
  }
  function ink(x, y, n){ burst(x, y, { count: n || 18, color: '#111', shape: 'square', gravity: 0.14, up: 2, sizeMin: 3, sizeMax: 9 }); }
  function sparkle(x, y, n){ burst(x, y, { count: n || 22, color: '#444', shape: 'star', gravity: 0.03, up: 1.4, sizeMin: 3, sizeMax: 7, speed: 3 }); }

  function heart(s){
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(0, 0, -s * 0.5, 0, -s * 0.5, s * 0.35);
    ctx.bezierCurveTo(-s * 0.5, s * 0.65, 0, s * 0.95, 0, s * 1.1);
    ctx.bezierCurveTo(0, s * 0.95, s * 0.5, s * 0.65, s * 0.5, s * 0.35);
    ctx.bezierCurveTo(s * 0.5, 0, 0, 0, 0, s * 0.35);
    ctx.fill();
  }

  function loop(){
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--){
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.rot += p.vr; p.life -= p.decay;
      if (p.life <= 0){ parts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
      if (p.shape === 'heart') heart(p.size);
      else if (p.shape === 'star'){ ctx.fillRect(-p.size / 2, -1.5, p.size, 3); ctx.fillRect(-1.5, -p.size / 2, 3, p.size); }
      else if (p.shape === 'circle'){ ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, 6.28); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return { hearts, ink, sparkle, burst, center, rowCenter, resize };
})();
