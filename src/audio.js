/* audio.js —— 音频模块
 * 优先播放 assets/audio/sfx/<name>.(ogg|mp3|wav) 里的真实音效文件；
 * 找不到时，回退到内置的合成音（比原来更丰富：分层、噪声、包络、长尾）。
 * BGM：assets/audio/bgm/<name>.(ogg|mp3)。
 * 需要用户先点击一次页面（浏览器自动播放限制）。
 */
window.Sound = (function () {
  let ctx = null, master = null, muted = false;
  let vol = 0.6;                 // 音效音量
  const EXTS = ['.ogg', '.mp3', '.wav', '.m4a'];
  const SFX_NAMES = ['click','hover','card','bid','lock','reveal','confessOk','confessFail',
                     'round','emote','vote','win','lose','pause','resume','page','error','coin','confirm'];
  const files = {};              // name -> HTMLAudioElement（存在即用）
  const bgmFiles = {};           // name -> HTMLAudioElement
  let probed = false;

  function ensure(){
    if (!ctx){
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e){ ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---------- 探测本地音效文件（有就直接用） ---------- */
  function probe(){
    if (probed) return; probed = true;
    SFX_NAMES.forEach(name => {
      let i = 0;
      (function next(){
        if (i >= EXTS.length) return;
        const a = new Audio();
        a.preload = 'auto';
        a.oncanplaythrough = () => { files[name] = a; };
        a.onerror = next;
        a.src = 'assets/audio/sfx/' + name + EXTS[i++];
      })();
    });
    ['theme','library','corridor','rainy'].forEach(name => {
      let i = 0; const exts = ['.ogg','.mp3'];
      (function next(){
        if (i >= exts.length) return;
        const a = new Audio();
        a.preload = 'auto'; a.loop = true;
        a.oncanplaythrough = () => { bgmFiles[name] = a; };
        a.onerror = next;
        a.src = 'assets/audio/bgm/' + name + exts[i++];
      })();
    });
  }

  /* ---------- 合成音 ---------- */
  function envTone(freq, dur, type, volume, when, glideTo, detune){
    const c = ensure(); if (!c || muted) return;
    const t0 = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    if (detune) o.detune.setValueAtTime(detune, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, volume || 0.18), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noiseBurst(dur, volume, when, cutoff){
    const c = ensure(); if (!c || muted) return;
    const t0 = c.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 4500;
    const g = c.createGain(); g.gain.value = volume || 0.12;
    src.connect(f); f.connect(g); g.connect(master); src.start(t0);
  }

  const PRESETS = {
    click:       () => { envTone(880, 0.05, 'square', 0.10); envTone(1320, 0.04, 'square', 0.06, 0.02); },
    hover:       () => { envTone(1200, 0.03, 'sine', 0.05); },
    card:        () => { noiseBurst(0.08, 0.10, 0, 3500); envTone(520, 0.09, 'triangle', 0.14); envTone(780, 0.07, 'triangle', 0.08, 0.05); },
    bid:         () => { envTone(660, 0.06, 'square', 0.14); envTone(990, 0.08, 'square', 0.10, 0.05); },
    lock:        () => { envTone(300, 0.10, 'square', 0.16, 0, 200); envTone(150, 0.16, 'sine', 0.14, 0.02); },
    reveal:      () => { [784, 988, 1175, 1568].forEach((f, i) => envTone(f, 0.5, 'triangle', 0.11, i * 0.08)); noiseBurst(0.3, 0.05, 0, 6000); },
    confessOk:   () => { [523, 659, 784, 1046, 1318].forEach((f, i) => envTone(f, 0.4, 'triangle', 0.13, i * 0.09)); [523, 659, 784].forEach(f => envTone(f, 0.9, 'sine', 0.05, 0.45)); },
    confessFail: () => { [330, 294, 233, 196].forEach((f, i) => envTone(f, 0.5, 'sine', 0.13, i * 0.13)); },
    round:       () => { envTone(523, 0.3, 'triangle', 0.11); envTone(784, 0.4, 'triangle', 0.09, 0.12); envTone(1046, 0.5, 'sine', 0.06, 0.24); },
    emote:       () => { envTone(900, 0.12, 'sine', 0.16, 0, 1300); },
    vote:        () => { envTone(600, 0.1, 'square', 0.12); envTone(800, 0.14, 'square', 0.10, 0.09); },
    win:         () => { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => envTone(f, 0.5, 'triangle', 0.13, i * 0.1)); [523, 784, 1046].forEach(f => envTone(f, 1.2, 'sine', 0.05, 0.6)); },
    lose:        () => { [392, 330, 262, 196].forEach((f, i) => envTone(f, 0.5, 'sine', 0.13, i * 0.15)); },
    pause:       () => { envTone(440, 0.18, 'sine', 0.13, 0, 330); },
    resume:      () => { envTone(330, 0.18, 'sine', 0.13, 0, 494); },
    page:        () => { noiseBurst(0.12, 0.07, 0, 2500); envTone(700, 0.06, 'triangle', 0.06); },
    error:       () => { envTone(220, 0.2, 'sawtooth', 0.11); envTone(180, 0.25, 'sawtooth', 0.09, 0.08); },
    coin:        () => { envTone(988, 0.06, 'square', 0.12); envTone(1319, 0.18, 'square', 0.10, 0.06); },
    confirm:     () => { envTone(523, 0.08, 'triangle', 0.12); envTone(784, 0.14, 'triangle', 0.10, 0.06); }
  };

  function play(name){
    if (muted) return;
    probe();
    const a = files[name];
    if (a){ try { a.currentTime = 0; a.volume = Math.min(1, vol); a.play(); } catch (e){} return; }
    const p = PRESETS[name]; if (p) p();
  }

  function playBgm(name){
    probe();
    stopBgm();
    const a = bgmFiles[name];
    if (!a || muted) return;
    a.volume = 0.35; a.loop = true;
    try { a.play(); } catch (e){}
  }
  function stopBgm(){ Object.keys(bgmFiles).forEach(k => { try { bgmFiles[k].pause(); } catch (e){} }); }

  function setMuted(v){ muted = !!v; if (muted) stopBgm(); }
  function isMuted(){ return muted; }
  function setSfxVolume(v){ vol = Math.max(0, Math.min(1, v)); }

  return { play, playBgm, stopBgm, ensure, probe, setMuted, isMuted, setSfxVolume };
})();
