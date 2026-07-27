/* audio.js — 真实音频引擎：双 <audio> 交叉淡入淡出
   暴露 window.AE，接口兼容旧合成引擎：play/pause/resume/setVolume
   新增: seek/time/duration/onended/onloaderror（供 app.js 使用） */
window.AE = (function () {
  const XFADE = 1.2;          // crossfade 秒数
  const els = [new Audio(), new Audio()];
  let cur = 0;                // 当前发声的元素下标
  let vol = 0.6;              // 用户音量
  let raf = null;             // 淡入淡出动画帧

  els.forEach(a => { a.preload = 'auto'; a.volume = 0; });

  function active() { return els[cur]; }
  function inactive() { return els[1 - cur]; }

  function cancelFade() { if (raf) cancelAnimationFrame(raf), (raf = null); }

  /* 线性淡变 helper */
  function ramp(audio, from, to, dur, done) {
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / (dur * 1000));
      if (!audio.paused || to === 0) audio.volume = (from + (to - from) * p) * vol;
      if (p < 1) raf = requestAnimationFrame(tick);
      else { raf = null; done && done(); }
    })(t0);
  }

  const AE = {
    onended: null,       // 当前曲目自然播完
    onloaderror: null,   // 音频加载/播放失败

    /* 加载并播放 url，旧曲目淡出。返回 Promise<boolean> */
    play(url, xfade = true) {
      cancelFade();
      const next = inactive();
      const old = active();
      try { next.pause(); } catch (e) {}
      next.src = url;
      next.volume = 0;
      const d = xfade ? XFADE : 0.15;
      cur = 1 - cur;
      // 旧曲目淡出后停掉
      if (old.src && !old.paused) {
        const from = Math.min(1, vol > 0 ? old.volume / vol : 0);
        ramp(old, from, 0, d, () => { try { old.pause(); old.removeAttribute('src'); old.load(); } catch (e) {} });
      } else if (old.src) {
        try { old.pause(); old.removeAttribute('src'); old.load(); } catch (e) {}
      }
      return next.play().then(() => {
        ramp(next, 0, 1, d);
        return true;
      }).catch(err => {
        console.warn('[AE] play failed', err);
        return false;
      });
    },

    pause()  { const a = active(); a.volume = 0; a.pause(); },
    resume() {
      const a = active();
      if (!a.src) return;
      a.volume = vol;
      a.play().catch(() => {});
    },

    setVolume(v) { vol = v; if (!active().paused) active().volume = v; },

    seek(t) { if (active().src) active().currentTime = t; },
    time() { return active().currentTime || 0; },
    duration() { const d = active().duration; return isFinite(d) ? d : 0; },
    playing() { return !active().paused; },
  };

  els.forEach(a => {
    a.addEventListener('ended', () => { if (a === active()) AE.onended && AE.onended(); });
    a.addEventListener('error', () => {
      // 只上报“当前曲目”加载失败（旧曲目被清 src 也会触发 error，忽略）
      if (a === active() && a.src && AE.onloaderror) AE.onloaderror(a.error);
    });
  });

  return AE;
})();
