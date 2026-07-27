/* api.js — NeteaseCloudMusicApi 访问层 + 扫码登录状态
   依赖: 无（原生 fetch）。暴露 window.API */
window.API = (function () {
  const BASE = 'http://localhost:3000';      // NeteaseCloudMusicApi
  const WEB = 'http://localhost:8080';       // 本地静态服务（含图片代理）
  const LS_COOKIE = 'ncm_cookie';
  const LS_PROFILE = 'ncm_profile';

  let profile = null; // {userId, nickname, avatarUrl}

  /* ---------- 基础请求 ---------- */
  function qs(params) {
    const sp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') sp.set(k, v);
    });
    const c = cookie();
    if (c) sp.set('cookie', c);
    sp.set('timestamp', Date.now());
    return sp.toString();
  }
  async function req(path, params) {
    const r = await fetch(`${BASE}${path}?${qs(params)}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* ---------- cookie / 用户 ---------- */
  function cookie() { return localStorage.getItem(LS_COOKIE) || ''; }
  function saveCookie(c) { localStorage.setItem(LS_COOKIE, c); }
  function loadProfile() {
    try { profile = JSON.parse(localStorage.getItem(LS_PROFILE) || 'null'); } catch (e) { profile = null; }
    return profile;
  }

  /* ---------- 图片（防 403 防盗链：统一走本地代理） ---------- */
  function pic(url, w, h) {
    if (!url) return '';
    const u = w ? `${url}?param=${w}y${h || w}` : url;
    return `${WEB}/img?url=${encodeURIComponent(u)}`;
  }

  /* ---------- 数据归一化 ---------- */
  // 统一成 {id,title,artist,album,dur,cover,fee}
  function mapSong(s) {
    const ar = s.ar || s.artists || [];
    const al = s.al || s.album || {};
    return {
      id: s.id,
      title: s.name,
      artist: ar.map(a => a.name).join('/') || '未知歌手',
      album: al.name || '—',
      dur: Math.round((s.dt ?? s.duration ?? 0) / 1000),
      cover: pic(al.picUrl, 300),
      fee: s.fee,
    };
  }
  function mapPlaylist(p) {
    return {
      id: p.id,
      name: p.name,
      cover: pic(p.picUrl || p.coverImgUrl, 300),
      count: p.trackCount ?? p.playCount ?? 0,
    };
  }

  /* ---------- 登录 ---------- */
  async function qrKey() { return (await req('/login/qr/key')).data.unikey; }
  async function qrCreate(key) { return (await req('/login/qr/create', { key, qrimg: true })).data.qrimg; }
  async function qrCheck(key) { return req('/login/qr/check', { key }); } // {code, cookie?}
  async function refreshStatus() {
    try {
      const d = await req('/login/status');
      const p = d.data && d.data.profile;
      if (p) {
        profile = { userId: p.userId, nickname: p.nickname, avatarUrl: p.avatarUrl };
        localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
      } else {
        profile = null;
        localStorage.removeItem(LS_PROFILE);
        localStorage.removeItem(LS_COOKIE);
      }
    } catch (e) { /* 离线时保留本地 profile */ loadProfile(); }
    return profile;
  }
  async function logout() {
    try { await req('/logout'); } catch (e) {}
    profile = null;
    localStorage.removeItem(LS_COOKIE);
    localStorage.removeItem(LS_PROFILE);
  }

  /* ---------- 业务接口 ---------- */
  const api = {
    BASE, WEB, pic, mapSong, mapPlaylist, req,
    cookie, saveCookie, refreshStatus, logout, qrKey, qrCreate, qrCheck,
    user() { return profile || loadProfile(); },
    loggedIn() { return !!api.user(); },

    personalized: (limit = 12) => req('/personalized', { limit }),
    userPlaylist: (uid) => req('/user/playlist', { uid, limit: 50 }),
    playlistDetail: (id) => req('/playlist/detail', { id }),
    playlistTracks: (id, limit = 200) => req('/playlist/track/all', { id, limit }),
    search: (keywords, limit = 30) => req('/cloudsearch', { keywords, type: 1, limit }),
    songUrl: (id) => req('/song/url/v1', { id, level: 'exhigh' }),
    lyric: (id) => req('/lyric', { id }),
    personalFm: () => req('/personal_fm'),   // 本版本路由为下划线形式（/personal/fm 会 404）
    fmTrash: (id) => req('/fm_trash', { id }),
    like: (id, like) => req('/like', { id, like }),
    likelist: (uid) => req('/likelist', { uid }),
    playlistSub: (id, t) => req('/playlist/subscribe', { id, t }),        // t: 1 收藏 2 取消
    playlistTracksOp: (op, pid, tracks) => req('/playlist/tracks', { op, pid, tracks }),
    comments: (id) => req('/comment/music', { id }),
    toplist: () => req('/toplist'),
    topArtists: (limit = 60) => req('/top/artists', { limit }),
    artistSongs: (id, limit = 50) => req('/artist/songs', { id, limit }),
    topSong: (type = 0) => req('/top/song', { type }),
    recommendSongs: () => req('/recommend/songs'),
    songUrlLevel: (id, level) => req('/song/url/v1', { id, level }),
  };
  loadProfile();
  return api;
})();
