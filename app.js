/* app.js — 主逻辑：视图 / 播放 / 歌词 / 全屏播放页 / 登录
   数据源: NeteaseCloudMusicApi (api.js)；API 不可用时发现页回退到 data.js mock */
const $ = id=>document.getElementById(id);
const fmt = s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
const ICO_PLAY = '<path d="M8 5v14l11-7z"/>';
const ICO_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';

/* ---------- 状态 ---------- */
const P = {
  queue: [], idx: -1, playing: false, elapsed: 0,
  mode: 0,                       // 0 列表循环 1 单曲 2 随机
  fm: false,                     // 当前队列是否为私人FM
  liked: new Set(),
  song(){ return this.queue[this.idx] },
};

/* ---------- 轻提示 toast ---------- */
let toastTimer = null;
function toast(msg){
  let el = $("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast"; document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 2600);
}

/* ---------- 视图切换 ---------- */
function showView(name){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("show"));
  $("view-"+name).classList.add("show");
  document.querySelectorAll("#sidebar .side-item[data-view]").forEach(b=>
    b.classList.toggle("active", b.dataset.view===name));
}
document.querySelectorAll("#sidebar .side-item[data-view]").forEach(b=>
  b.onclick = ()=>{
    showView(b.dataset.view);
    if(b.dataset.view==="me") loadMe();
  });

/* ---------- 渲染 ---------- */
/* 表格封面懒加载：进入视口才赋 src */
const imgIO = ("IntersectionObserver" in window) ? new IntersectionObserver(entries=>{
  entries.forEach(en=>{
    if(en.isIntersecting){
      const img = en.target;
      if(img.dataset.src) img.src = img.dataset.src;
      imgIO.unobserve(img);
    }
  });
}, { rootMargin: "200px" }) : null;
function lazyCover(img){
  if(imgIO) imgIO.observe(img);
  else if(img.dataset.src) img.src = img.dataset.src;
}

function songRow(s, i, queue){
  const tr = document.createElement("tr");
  tr.dataset.id = s.id;
  tr.innerHTML = `
    <td class="c-num"><span class="t-num">${String(i+1).padStart(2,"0")}</span>
      <span class="eq"><i></i><i></i><i></i></span></td>
    <td><span class="t-title"><img class="t-cover" data-src="${s.cover}" alt=""><span class="t-name">${s.title}</span></span></td>
    <td><span class="t-sub">${s.artist}</span></td>
    <td><span class="t-sub">${s.album}</span></td>
    <td class="c-dur">${fmt(s.dur)}</td>`;
  tr.onclick = ()=>{ P.queue = queue; P.fm = false; playAt(queue.findIndex(x=>x.id===s.id)); };
  tr.oncontextmenu = e=>{ e.preventDefault(); openCtxMenu(e.clientX, e.clientY, s); };
  lazyCover(tr.querySelector(".t-cover"));
  return tr;
}

/* 发现页：真实推荐歌单，失败回退 mock */
async function renderDiscover(){
  const grid = $("pl-cards"); grid.innerHTML = "";
  // skeleton 占位
  for(let i=0;i<8;i++){
    const sk = document.createElement("div");
    sk.className = "pl-card sk-card";
    sk.innerHTML = `<div class="cv"><div class="sk sk-cv"></div></div><div class="sk sk-line"></div>`;
    grid.appendChild(sk);
  }
  try{
    const d = await API.personalized(12);
    grid.innerHTML = "";
    (d.result||[]).forEach(p=>{
      const pl = API.mapPlaylist(p);
      const b = document.createElement("button");
      b.className = "pl-card";
      b.innerHTML = `<div class="cv"><img src="${pl.cover}" loading="lazy" decoding="async"></div><div class="nm">${pl.name}</div>`;
      b.onclick = ()=>openPlaylistById(pl.id);
      grid.appendChild(b);
    });
    renderHero(d.result);
  }catch(e){
    console.warn("[discover] API 不可用，回退 mock 数据", e);
    grid.innerHTML = "";
    DB.PLAYLISTS.forEach(pl=>{
      const b = document.createElement("button");
      b.className = "pl-card";
      b.innerHTML = `<div class="cv"><img src="${pl.cover}"></div><div class="nm">${pl.name}</div>`;
      b.onclick = ()=>openMockPlaylist(pl);
      grid.appendChild(b);
    });
    renderHero([]);
  }
}

/* 推荐页 hero：问候语 + 每日推荐日历卡 + 私人雷达（名字含“雷达”的推荐歌单，没有则不出该卡） */
function renderHero(list){
  const hero = $("dv-hero"); hero.innerHTML = "";
  const now = new Date(), h = now.getHours();
  $("dv-greet").textContent = h>=5&&h<11 ? "早上好" : h>=11&&h<18 ? "下午好" : "晚上好";
  const daily = document.createElement("button");
  daily.className = "dv-hero-card";
  daily.innerHTML = `<div class="dv-cal"><div class="dv-cal-dow">星期${"日一二三四五六"[now.getDay()]}</div><div class="dv-cal-day serif">${now.getDate()}</div></div>
    <div class="dv-hero-info"><div class="dv-hero-name">每日歌曲推荐</div><div class="dv-hero-sub">根据你的口味每日更新</div></div>`;
  daily.onclick = playDaily;
  hero.appendChild(daily);
  (list||[]).filter(p=>p.name && p.name.includes("雷达")).slice(0,2).forEach(p=>{
    const pl = API.mapPlaylist(p);
    const b = document.createElement("button");
    b.className = "dv-hero-card";
    b.innerHTML = `<img class="dv-hero-cover" src="${pl.cover}" loading="lazy" decoding="async" alt="">
      <div class="dv-hero-info"><div class="dv-hero-name">${pl.name}</div><div class="dv-hero-sub">私人雷达 · 每日更新</div></div>`;
    b.onclick = ()=>openPlaylistById(pl.id);
    hero.appendChild(b);
  });
}
async function playDaily(){
  if(!API.loggedIn()){ toast("登录后查看每日推荐"); openLogin(); return; }
  try{
    const d = await API.recommendSongs();
    const songs = ((d.data && d.data.dailySongs) || []).map(API.mapSong);
    if(!songs.length) throw new Error("empty");
    P.queue = songs; P.fm = false; playAt(0);
    toast("已播放每日推荐");
  }catch(e){ toast("每日推荐加载失败，请稍后再试"); }
}

/* 发现页分栏：tab 切换 + 按需加载（首次激活才请求，之后常驻不重复拉） */
const dvLoaded = { "dv-rec": true };
const dvLoaders = { "dv-top": loadDvTop, "dv-artist": loadDvArtists, "dv-new": loadDvNew };
document.querySelectorAll("#dv-tabs .dv-tab").forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll("#dv-tabs .dv-tab").forEach(x=>x.classList.toggle("active", x===b));
    document.querySelectorAll(".dv-pane").forEach(p=>p.classList.toggle("show", p.id===b.dataset.pane));
    if(!dvLoaded[b.dataset.pane]){
      dvLoaded[b.dataset.pane] = true;
      const fn = dvLoaders[b.dataset.pane];
      if(fn) fn();
    }
  };
});
async function loadDvTop(){
  const grid = $("top-cards");
  for(let i=0;i<8;i++){
    const sk = document.createElement("div");
    sk.className = "pl-card sk-card";
    sk.innerHTML = `<div class="cv"><div class="sk sk-cv"></div></div><div class="sk sk-line"></div>`;
    grid.appendChild(sk);
  }
  try{
    const d = await API.toplist();
    grid.innerHTML = "";
    (d.list||[]).forEach(t=>{
      const b = document.createElement("button");
      b.className = "pl-card";
      b.innerHTML = `<div class="cv"><img src="${API.pic(t.coverImgUrl,300)}" loading="lazy" decoding="async"></div><div class="nm">${t.name}</div><div class="dv-sub">${t.updateFrequency||""}</div>`;
      b.onclick = ()=>openPlaylistById(t.id);
      grid.appendChild(b);
    });
  }catch(e){ grid.innerHTML = '<div class="side-empty">排行榜加载失败</div>'; }
}
async function loadDvArtists(){
  const grid = $("artist-grid");
  grid.innerHTML = '<div class="sk sk-line"></div>'.repeat(12);
  try{
    const d = await API.topArtists(60);
    grid.innerHTML = "";
    (d.artists||[]).forEach(a=>{
      const b = document.createElement("button");
      b.className = "dv-artist-card";
      b.innerHTML = `<img src="${API.pic(a.picUrl,200)}" loading="lazy" decoding="async" alt=""><div class="dv-artist-name">${a.name}</div>`;
      b.onclick = ()=>openArtist(a);
      grid.appendChild(b);
    });
  }catch(e){ grid.innerHTML = '<div class="side-empty">歌手加载失败</div>'; }
}
async function loadDvNew(){
  const tbody = $("new-song-list");
  skRows(tbody, 10);
  try{
    const d = await API.topSong(0);
    const list = (d.data||[]).map(API.mapSong);
    tbody.innerHTML = "";
    list.forEach((s,i)=>tbody.appendChild(songRow(s,i,list)));   // 复用 songRow，自带高亮+右键
    [...tbody.children].forEach((tr,i)=>{ if(i<15) tr.style.animationDelay = (i*30)+"ms"; });
  }catch(e){ tbody.innerHTML = '<tr><td colspan="5"><div class="side-empty">新歌加载失败</div></td></tr>'; }
}

/* 侧栏：我的歌单（需登录） */
async function renderSide(){
  const box = $("side-playlists"); box.innerHTML = "";
  const u = API.user();
  if(!u){
    box.innerHTML = '<div class="side-empty">登录后展示我的歌单</div>';
    return;
  }
  try{
    const d = await API.userPlaylist(u.userId);
    const all = (d.playlist||[]).map(p=>({ raw:p, pl:API.mapPlaylist(p) }));
    // 拆「我创建的」/「我收藏的」两组（按 creator 是否本人判断）
    const groups = [
      { title:"我创建的", items: all.filter(x=>x.raw.creator && x.raw.creator.userId===u.userId) },
      { title:"我收藏的", items: all.filter(x=>!x.raw.creator || x.raw.creator.userId!==u.userId) },
    ];
    groups.forEach(g=>{
      if(!g.items.length) return;
      const t = document.createElement("div");
      t.className = "side-sub-title"; t.textContent = g.title;
      box.appendChild(t);
      g.items.forEach(({ raw:p, pl })=>{
        const b = document.createElement("button");
        b.className = "side-item";
        b.innerHTML = `<img class="side-pl-cover" src="${API.pic(p.coverImgUrl, 60)}" loading="lazy" decoding="async" alt=""><span class="sl-name">${pl.name}</span>`;
        b.onclick = ()=>openPlaylistById(pl.id);
        box.appendChild(b);
      });
    });
  }catch(e){
    box.innerHTML = '<div class="side-empty">歌单加载失败</div>';
  }
}

/* ---------- 歌单详情 ---------- */
let currentList = [];
let currentPl = null;   // {id, subscribed}
function syncSubBtn(){
  $("pl-sub").textContent = currentPl && currentPl.subscribed ? "✓ 已收藏" : "+ 收藏";
}
$("pl-sub").onclick = async ()=>{
  if(!currentPl) return;
  if(!API.loggedIn()){ toast("登录后才能收藏歌单"); openLogin(); return; }
  const t = currentPl.subscribed ? 2 : 1;
  try{
    const r = await API.playlistSub(currentPl.id, t);
    if((r.code ?? 200) !== 200) throw new Error(r.message || r.msg || ("code " + r.code));
    currentPl.subscribed = !currentPl.subscribed;
    syncSubBtn();
    toast(currentPl.subscribed ? "已收藏歌单" : "已取消收藏");
    renderSide();   // 刷新侧栏「我的歌单」
  }catch(e){ toast("操作失败：" + e.message); }
};
function skRows(tbody, n=8){
  tbody.innerHTML = "";
  for(let i=0;i<n;i++){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5"><div class="sk sk-rowline"></div></td>`;
    tbody.appendChild(tr);
  }
}
async function openPlaylistById(id){
  showView("playlist");
  document.querySelectorAll("#sidebar .side-item[data-view]").forEach(b=>b.classList.remove("active"));
  $("pl-tag").textContent = "歌单";
  $("pl-name").textContent = "加载中…";
  $("pl-creator").textContent = ""; $("pl-desc").textContent = "";
  currentPl = null; syncSubBtn();
  $("pl-sub").style.display = "";
  skRows($("song-list"));   // skeleton 占位，杜绝布局位移
  try{
    const [det, trk] = await Promise.all([API.playlistDetail(id), API.playlistTracks(id)]);
    const pl = det.playlist;
    $("pl-cover").src = API.pic(pl.coverImgUrl, 400);
    $("pl-name").textContent = pl.name;
    $("pl-creator").textContent = `${pl.creator.nickname} 创建 · ${pl.trackCount} 首`;
    $("pl-desc").textContent = pl.description || "";
    currentPl = { id: pl.id, subscribed: !!pl.subscribed };
    // 自己的歌单不能收藏自己：仅非本人创建的歌单显示收藏按钮
    const me = API.user();
    $("pl-sub").style.display =
      (me && pl.creator && pl.creator.userId === me.userId) ? "none" : "";
    syncSubBtn();
    currentList = (trk.songs||[]).map(API.mapSong);
    const tbody = $("song-list"); tbody.innerHTML = "";
    currentList.forEach((s,i)=>tbody.appendChild(songRow(s,i,currentList)));
    // 行级联入场（前 15 行 30ms 递增延迟，样式见 style.css 末尾 rowIn）
    [...tbody.children].forEach((tr,i)=>{ if(i<15) tr.style.animationDelay = (i*30)+"ms"; });
    markPlayingRow();
  }catch(e){
    $("pl-name").textContent = "歌单加载失败";
    toast("歌单加载失败，请稍后再试");
  }
}

/* mock 兜底歌单（离线时） */
function openMockPlaylist(pl){
  showView("playlist");
  $("pl-cover").src = pl.cover;
  $("pl-name").textContent = pl.name;
  $("pl-creator").textContent = `${pl.creator} 创建 · ${pl.songs.length} 首`;
  $("pl-desc").textContent = pl.desc;
  currentList = pl.songs.map(id=>DB.SONGS.find(s=>s.id===id));
  const tbody = $("song-list"); tbody.innerHTML = "";
  currentList.forEach((s,i)=>tbody.appendChild(songRow(s,i,currentList)));
}
$("pl-play-all").onclick = ()=>{ if(currentList.length){ P.queue = currentList; P.fm = false; playAt(0); } };

/* 歌手详情：复用歌单详情视图骨架，列表为热门 50 首 */
async function openArtist(a){
  showView("playlist");
  document.querySelectorAll("#sidebar .side-item[data-view]").forEach(b=>b.classList.remove("active"));
  $("pl-tag").textContent = "歌手";
  $("pl-cover").src = a.picUrl ? API.pic(a.picUrl, 400) : "";
  $("pl-name").textContent = a.name;
  $("pl-creator").textContent = "热门歌曲加载中…";
  $("pl-desc").textContent = "";
  currentPl = null; syncSubBtn();
  $("pl-sub").style.display = "none";   // 歌手页无收藏歌单概念
  skRows($("song-list"));
  try{
    const d = await API.artistSongs(a.id);
    currentList = (d.songs||[]).map(API.mapSong);
    $("pl-creator").textContent = `热门 ${currentList.length} 首`;
    const tbody = $("song-list"); tbody.innerHTML = "";
    currentList.forEach((s,i)=>tbody.appendChild(songRow(s,i,currentList)));
    [...tbody.children].forEach((tr,i)=>{ if(i<15) tr.style.animationDelay = (i*30)+"ms"; });
    markPlayingRow();
  }catch(e){
    $("pl-creator").textContent = "歌曲加载失败";
    toast("歌手歌曲加载失败，请稍后再试");
  }
}

/* ---------- 搜索（建议下拉，回车/点击才执行 /cloudsearch） ---------- */
let sgTimer = null, sgItems = [], sgIdx = -1;

function closeSuggest(){
  sgIdx = -1; sgItems = [];
  const box = $("sg-box");
  box.classList.remove("show"); box.innerHTML = "";
}

$("search-input").oninput = e=>{
  const q = e.target.value.trim();
  clearTimeout(sgTimer);
  if(!q){ closeSuggest(); showView("discover"); return; }
  sgTimer = setTimeout(()=>fetchSuggest(q), 400);
};

async function fetchSuggest(q){
  try{
    const d = await API.req("/search/suggest", { keywords: q });
    if($("search-input").value.trim() !== q) return;   // 等待期间输入已变
    const r = d.result || {};
    sgItems = []; sgIdx = -1;
    const box = $("sg-box"); box.innerHTML = "";
    const groups = [
      ["歌曲", (r.songs||[]).slice(0,5).map(s=>({ label:s.name, sub:(s.artists||[]).map(a=>a.name).join("/") }))],
      ["歌手", (r.artists||[]).slice(0,3).map(a=>({ label:a.name, sub:"歌手" }))],
      ["专辑", (r.albums||[]).slice(0,3).map(a=>({ label:a.name, sub:a.artist ? a.artist.name : "" }))],
    ].filter(([,list])=>list.length);
    if(!groups.length){ closeSuggest(); return; }
    groups.forEach(([name,list])=>{
      const gt = document.createElement("div");
      gt.className = "sg-group"; gt.textContent = name;
      box.appendChild(gt);
      list.forEach(it=>{
        const el = document.createElement("button");
        el.className = "sg-item";
        el.innerHTML = `<span class="sg-label">${it.label}</span><span class="sg-sub">${it.sub||""}</span>`;
        el.onclick = ()=>{ $("search-input").value = it.label; closeSuggest(); runSearch(it.label); };
        box.appendChild(el);
        sgItems.push(el);
      });
    });
    box.classList.add("show");
  }catch(e){ /* 建议接口失败静默，不影响回车搜索 */ }
}

$("search-input").onkeydown = e=>{
  if(e.code==="ArrowDown" || e.code==="ArrowUp"){
    if(!$("sg-box").classList.contains("show") || !sgItems.length) return;
    e.preventDefault();
    const d = e.code==="ArrowDown" ? 1 : -1;
    sgIdx = (sgIdx + d + sgItems.length) % sgItems.length;
    sgItems.forEach((el,i)=>el.classList.toggle("on", i===sgIdx));
    sgItems[sgIdx].scrollIntoView({ block:"nearest" });
  }else if(e.code==="Enter"){
    const q = $("search-input").value.trim();
    if(sgIdx>=0 && sgItems[sgIdx]) sgItems[sgIdx].click();
    else if(q){ closeSuggest(); runSearch(q); }
  }else if(e.code==="Escape"){
    closeSuggest();
  }
};
document.addEventListener("click", e=>{
  if(!e.target.closest(".search")) closeSuggest();
});

/* 真正执行搜索（/cloudsearch，type=1 单曲） */
async function runSearch(q){
  showView("search");
  $("search-title").textContent = `搜索“${q}”`;
  skRows($("search-list"), 8);   // skeleton 占位
  try{
    const d = await API.search(q);
    const hits = ((d.result && d.result.songs)||[]).map(API.mapSong);
    const tbody = $("search-list"); tbody.innerHTML = "";
    hits.forEach((s,i)=>tbody.appendChild(songRow(s,i,hits)));
    markPlayingRow();
    if(!hits.length) toast("没有找到相关歌曲");
  }catch(e){ toast("搜索失败，请检查网络"); }
}

/* ---------- 私人FM（电台形态） ---------- */
async function startFm(){
  if(!API.loggedIn()){ toast("私人FM需要登录"); openLogin(); return; }
  $("fm-hint").textContent = "电台加载中…";
  try{
    const d = await API.personalFm();
    const list = (d.data||[]).map(API.mapSong);
    if(!list.length){ $("fm-hint").textContent = "FM 获取失败"; return; }
    P.queue = list; P.fm = true;
    $("fm-hint").textContent = "";
    playAt(0);
  }catch(e){ $("fm-hint").textContent = "FM 获取失败，请稍后再试"; }
}
$("fm-play").onclick = ()=>{
  if(!P.fm || P.idx<0) startFm();
  else togglePlay();
};
$("fm-next").onclick = ()=>{ if(P.fm && P.idx>=0) step(1); else startFm(); };
$("fm-trash").onclick = async ()=>{
  const s = P.song();
  if(!s || !P.fm) return;
  try{ await API.fmTrash(s.id); toast("已标记不喜欢，将减少类似推荐"); }
  catch(e){ toast("操作失败"); }
  step(1);
};
async function fmAppend(){
  const d = await API.personalFm();
  P.queue = P.queue.concat((d.data||[]).map(API.mapSong));
}

/* ---------- 封面取色动态主题（作用于 #np 作用域变量） ---------- */
function extractColors(imgUrl){
  return new Promise(resolve=>{
    const img = new Image();
    img.crossOrigin = "anonymous";   // 图片代理同源，可读像素
    img.onload = ()=>{
      try{
        const n = 50, c = document.createElement("canvas");
        c.width = c.height = n;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, n, n);
        const d = x.getImageData(0, 0, n, n).data;
        const buckets = {};
        for(let i=0;i<d.length;i+=4){
          const r=d[i], g=d[i+1], b=d[i+2];
          const lum = .299*r + .587*g + .114*b;
          if(lum<25 || lum>230) continue;          // 过滤过暗/过亮
          const key = ((r>>5)<<6) | ((g>>5)<<3) | (b>>5);
          (buckets[key] = buckets[key] || []).push([r,g,b]);
        }
        const sorted = Object.values(buckets).sort((a,b)=>b.length-a.length);
        if(!sorted.length) return resolve(null);
        const avg = arr=>arr.reduce((s,v)=>[s[0]+v[0],s[1]+v[1],s[2]+v[2]],[0,0,0])
          .map(v=>Math.round(v/arr.length));
        resolve([avg(sorted[0]), sorted[1] ? avg(sorted[1]) : null]);
      }catch(e){ resolve(null); }
    };
    img.onerror = ()=>resolve(null);
    img.src = imgUrl;
  });
}
function applyNpColors(cols){
  const np = $("np");
  if(!cols || !cols[0]){
    np.style.removeProperty("--np-accent");
    np.style.removeProperty("--np-tint");
    return;
  }
  const rgb = c=>`rgb(${c[0]},${c[1]},${c[2]})`;
  np.style.setProperty("--np-accent", rgb(cols[0]));
  np.style.setProperty("--np-tint", rgb(cols[1] || cols[0]));
}
function tintNpFromCover(s){
  if(!S.npcolor || !s || !s.cover){ applyNpColors(null); return; }
  extractColors(s.cover).then(cols=>{
    if(P.song() === s) applyNpColors(cols);
  });
}

/* ---------- 播放控制 ---------- */
let failCount = 0;   // 连续取不到音源的次数（防跳歌死循环）

async function playAt(i){
  if(i < 0 || i >= P.queue.length) return;
  P.idx = i;
  const s = P.song();
  P.elapsed = 0;
  P.playing = true;
  document.body.classList.remove("paused");
  // 播放条
  $("p-cover").src = s.cover;
  $("p-title").textContent = s.title;
  $("p-artist").textContent = s.artist;
  setPlayIcon(true);
  // 全屏播放页
  $("np-cover").src = s.cover;
  $("np-bg").style.backgroundImage = `url(${s.cover})`;
  $("np-title").textContent = s.title;
  $("np-artist").textContent = `${s.artist} · ${s.album}`;
  $("np-total").textContent = fmt(s.dur);
  // FM 页
  $("fm-cover").src = s.cover;
  $("fm-title").textContent = s.title;
  $("fm-artist").textContent = s.artist;
  // 「我的」正在播放卡片
  $("me-now-cover").src = s.cover;
  $("me-now-title").textContent = s.title;
  $("me-now-artist").textContent = s.artist;
  syncLike();
  markPlayingRow();
  renderQueue();   // 队列面板开着时同步高亮
  loadLyrics(s);
  tintNpFromCover(s);   // 封面取色动态主题（设置里可关）

  // 取真实音源（按当前音质档位）
  let url = null;
  try{
    const r = await API.songUrlLevel(s.id, QUALITY);
    url = r.data && r.data[0] && r.data[0].url;
  }catch(e){ /* 网络错误按无音源处理 */ }
  if(P.song() !== s) return;           // 等待期间用户已切歌
  if(!url) return skipSong(s, "暂无版权或需要 VIP");
  const ok = await AE.play(url, true); // 1.2s 交叉淡入淡出
  if(P.song() !== s) return;
  if(!ok) return skipSong(s, "播放失败");
  failCount = 0;
}

function skipSong(s, reason){
  failCount++;
  if(failCount >= P.queue.length){
    P.playing = false;
    setPlayIcon(false);
    toast("队列中没有可播放的歌曲");
    return;
  }
  toast(`《${s.title}》${reason}，已自动跳过`);
  step(1);
}

/* 播放中音频流报错 → 同样跳下一首 */
AE.onloaderror = ()=>{ if(P.playing && P.song()) skipSong(P.song(), "加载出错"); };
/* 自然播完：记一条本地热力 + 按模式续播 */
AE.onended = ()=>{
  heatRecord();
  if(P.mode === 1){ AE.seek(0); AE.resume(); return; }
  step(1);
};

function setPlayIcon(playing){
  $("p-play-ico").innerHTML = playing ? ICO_PAUSE : ICO_PLAY;
  $("np-play-ico").innerHTML = playing ? ICO_PAUSE : ICO_PLAY;
  $("fm-play-ico").innerHTML = playing ? ICO_PAUSE : ICO_PLAY;
  $("me-play-ico").innerHTML = playing ? ICO_PAUSE : ICO_PLAY;
  document.body.classList.toggle("playing", playing);   // 驱动圆形封面旋转
}
function syncLike(){
  const on = P.song() && P.liked.has(P.song().id);
  $("p-like").classList.toggle("liked", !!on);
  $("np-like").classList.toggle("liked", !!on);
}
function markPlayingRow(){
  const id = P.song()?.id;
  document.querySelectorAll(".song-table tbody tr").forEach(tr=>
    tr.classList.toggle("playing", +tr.dataset.id===id));
}
function togglePlay(){
  if(P.idx<0){ if(currentList.length){ P.queue = currentList; playAt(0); } return; }
  P.playing = !P.playing;
  P.playing ? AE.resume() : AE.pause();
  document.body.classList.toggle("paused", !P.playing);
  setPlayIcon(P.playing);
}
function step(d){
  if(!P.queue.length) return;
  if(d>0 && P.fm && P.idx >= P.queue.length-1){
    // FM 播到队尾：拉一批新歌接着放
    fmAppend().then(()=>playAt(P.idx+1)).catch(()=>toast("FM 加载失败"));
    return;
  }
  let i;
  if(P.mode===2){
    // 随机模式避免原地重复（队列>1 时）
    do { i = Math.floor(Math.random()*P.queue.length); }
    while (P.queue.length>1 && i===P.idx);
  }
  else i = (P.idx + d + P.queue.length) % P.queue.length;
  playAt(i);
}
const MODE_LABEL = ["列表循环","单曲循环","随机播放"];
const ICO_REPEAT  = '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>';
const ICO_REPEAT1 = ICO_REPEAT + '<text x="12" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" stroke="none">1</text>';
const ICO_SHUFFLE = '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>';
const ICO_MODE = [ICO_REPEAT, ICO_REPEAT1, ICO_SHUFFLE];
function cycleMode(){
  P.mode = (P.mode+1)%3;
  ["p-mode","np-mode"].forEach(id=>{
    $(id).title = MODE_LABEL[P.mode];
    $(id).classList.toggle("on", P.mode>0);
    $(id).querySelector("svg").innerHTML = ICO_MODE[P.mode];
  });
  toast(MODE_LABEL[P.mode]);
}
function toggleLike(){
  const s = P.song(); if(!s) return;
  setLike(s, !P.liked.has(s.id));
}
/* 红心真收藏：/like 成功才更新 UI，未登录弹登录引导 */
async function setLike(s, like){
  if(!API.loggedIn()){ toast("登录后才能使用「喜欢」"); openLogin(); return false; }
  try{
    const r = await API.like(s.id, like);
    if(r.code !== 200) throw new Error(r.msg || r.message || "操作失败");
    like ? P.liked.add(s.id) : P.liked.delete(s.id);
    syncLike();
    toast(like ? "已加入我喜欢" : "已取消喜欢");
    return true;
  }catch(e){ toast(e.message || "操作失败"); return false; }
}
/* 启动/登录后拉「我的喜欢」id 列表批量标记 */
async function loadLikes(){
  const u = API.user(); if(!u) return;
  try{
    const d = await API.likelist(u.userId);
    P.liked = new Set(d.ids || []);
    syncLike();
  }catch(e){ console.warn("[likelist]", e); }
}
// 绑定（播放条 + 全屏页共用同一组逻辑）
$("p-play").onclick = togglePlay;
$("np-play").onclick = togglePlay;
$("p-next").onclick = ()=>step(1);
$("np-next").onclick = ()=>step(1);
$("p-prev").onclick = ()=>step(-1);
$("np-prev").onclick = ()=>step(-1);
$("p-mode").onclick = cycleMode;
$("np-mode").onclick = cycleMode;
$("p-like").onclick = toggleLike;
$("np-like").onclick = toggleLike;

/* 进度条（播放条 + 全屏页） */
function seek(bar, e){
  if(!P.song()) return;
  const r = bar.getBoundingClientRect();
  const dur = AE.duration() || P.song().dur;
  P.elapsed = Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)) * dur;
  AE.seek(P.elapsed);
}
$("p-progress").onclick = e=>seek($("p-progress"), e);
$("np-bar").onclick = e=>seek($("np-bar"), e);

/* 音量（收纳式滑杆 + 点击图标静音） */
const ICO_VOL_ON  = '<path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';
const ICO_VOL_OFF = '<path d="M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"/>';
let curVol = 0.6, lastVol = 0.6;
function setVol(v){
  curVol = v;
  if(v > 0) lastVol = v;
  AE.setVolume(v);
  $("vol-fill").style.width = v*100+"%";
  $("vol-ico").innerHTML = v === 0 ? ICO_VOL_OFF : ICO_VOL_ON;
  $("vol-mute").classList.toggle("muted", v === 0);
}
$("vol-bar").onclick = e=>{
  const r = e.currentTarget.getBoundingClientRect();
  setVol(Math.min(1, Math.max(0, (e.clientX-r.left)/r.width)));
};
$("vol-mute").onclick = ()=>setVol(curVol > 0 ? 0 : lastVol || 0.6);

/* ---------- 歌词（LRC / yrc 逐字，np + FM 双容器复用） ---------- */
let lyrSets = [];   // [{box, list:[{t,el,words?}], last}] —— 数据结构保持干净
function parseLRC(str){
  const out = [];
  (str||"").split("\n").forEach(line=>{
    const text = line.replace(/\[[^\]]*\]/g,"").trim();
    if(!text) return;
    for(const m of line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g))
      out.push({ t: +m[1]*60 + +m[2], text });
  });
  return out.sort((a,b)=>a.t-b.t);
}
/* yrc 逐字：行首 [start,dur]，行内 (start,dur,offset)字（毫秒） */
function parseYRC(str){
  const out = [];
  (str||"").split("\n").forEach(line=>{
    if(!line.startsWith("[")) return;   // 跳过 JSON 元信息行
    const m = line.match(/^\[(\d+),(\d+)\]([\s\S]*)$/);
    if(!m) return;
    const words = [];
    const re = /\((\d+),(\d+),\d+\)([^()]*)/g;
    let w;
    while((w = re.exec(m[3])) !== null)
      if(w[3]) words.push({ t:+w[1]/1000, dur:+w[2]/1000, text:w[3] });
    const text = words.map(x=>x.text).join("").trim();
    if(text) out.push({ t:+m[1]/1000, words, text });
  });
  return out.sort((a,b)=>a.t-b.t);
}
function renderLyrics(lines, placeholder){
  lyrSets = ["np-lyrics","fm-lyrics"].map(id=>{
    const box = $(id); box.innerHTML = "";
    // 行数很少（纯音乐/无歌词）时容器内垂直居中，行数正常保持滚动行为
    box.classList.toggle("few", lines.length <= 3);
    const list = [];
    if(!lines.length){
      box.innerHTML = `<div class="ln active">${placeholder || "纯音乐 / 暂无歌词"}</div>`;
    }else{
      // 首尾各加半个容器高的占位，保证第一行/最后一行也能滚到垂直中心
      const mkSpacer = ()=>{
        const sp = document.createElement("div");
        sp.className = "ln-spacer";
        sp.style.height = (box.clientHeight/2 || 200) + "px";
        return sp;
      };
      box.appendChild(mkSpacer());
      lines.forEach(l=>{
        const el = document.createElement("div");
        el.className = "ln";
        const span = document.createElement("span");
        span.textContent = l.text;
        el.appendChild(span);
        // hover 浮现时间戳按钮，点击从该行继续
        const seek = document.createElement("button");
        seek.className = "ln-seek";
        seek.textContent = fmt(l.t);
        seek.onclick = e=>{ e.stopPropagation(); AE.seek(l.t); P.elapsed = l.t; };
        el.appendChild(seek);
        el.onclick = ()=>{ AE.seek(l.t); P.elapsed = l.t; };
        box.appendChild(el);
        list.push({ t: l.t, el, words: l.words || null });
      });
      box.appendChild(mkSpacer());
    }
    return { box, list, last: -1 };
  });
}
async function loadLyrics(s){
  renderLyrics([], "歌词加载中…");
  let lines = null;
  try{
    // 优先 /lyric/new（含 yrc 逐字），无 yrc 用其 lrc；接口失败静默回退 /lyric
    const d = await API.req("/lyric/new", { id: s.id });
    if(P.song() !== s) return;
    if(d.yrc && d.yrc.lyric) lines = parseYRC(d.yrc.lyric);
    if(!lines || !lines.length) lines = parseLRC(d.lrc && d.lrc.lyric);
  }catch(e){
    try{
      const d = await API.lyric(s.id);
      if(P.song() !== s) return;
      lines = parseLRC(d.lrc && d.lrc.lyric);
    }catch(e2){}
  }
  if(P.song() === s) renderLyrics(lines || []);
}
function syncLyrics(){
  const dur = AE.duration() || (P.song() && P.song().dur) || 0;
  lyrSets.forEach((set, si)=>{
    let cur = -1;
    set.list.forEach((l,i)=>{ if(P.elapsed>=l.t) cur = i; });
    set.list.forEach((l,i)=>{
      l.el.classList.toggle("active", i===cur);
      l.el.classList.toggle("passed", i<cur);
      if(i!==cur && l.el.style.getPropertyValue("--kp")) l.el.style.removeProperty("--kp");
    });
    if(cur>=0){
      const item = set.list[cur];
      let p;
      if(item.words && item.words.length){
        // 真·逐字：按每个 word 的真实开始/持续时间点亮
        const ws = item.words;
        let k = -1, frac = 0;
        for(let i=0;i<ws.length;i++){
          if(P.elapsed >= ws[i].t){
            k = i;
            frac = Math.min(1, (P.elapsed - ws[i].t) / Math.max(.1, ws[i].dur));
          }else break;
        }
        p = k<0 ? 0 : (k + frac) / ws.length;
      }else{
        // 伪逐字：行内线性插值
        const t = item.t;
        const nextT = cur+1 < set.list.length ? set.list[cur+1].t : (dur || t+5);
        p = Math.min(1, Math.max(0, (P.elapsed - t) / Math.max(.4, nextT - t)));
      }
      item.el.style.setProperty("--kp", p.toFixed(3));
    }
    // 高亮行滚动到歌词区垂直中心（getBoundingClientRect 相对容器计算）
    if(cur>=0 && cur!==set.last){
      set.last = cur;
      if(si===0) $("me-now-lyric").textContent = set.list[cur].el.textContent.replace(/\d+:\d{2}$/,"");
      const el = set.list[cur].el, box = set.box;
      const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
      box.scrollTo({
        top: box.scrollTop + (r.top - br.top) - box.clientHeight/2 + r.height/2,
        behavior: "smooth",
      });
    }
  });
}

/* ---------- 登录（扫码） ---------- */
let qrTimer = null;
async function openLogin(){
  $("login-mask").classList.add("show");
  $("lg-tip").textContent = "二维码加载中…";
  $("lg-qr-img").src = "";
  try{
    const key = await API.qrKey();
    $("lg-qr-img").src = await API.qrCreate(key);
    $("lg-tip").textContent = "使用网易云音乐 App 扫码";
    clearInterval(qrTimer);
    qrTimer = setInterval(async ()=>{
      try{
        const r = await API.qrCheck(key);
        if(r.code === 800){
          $("lg-tip").textContent = "二维码已过期，点击图片刷新";
          clearInterval(qrTimer);
        }else if(r.code === 802){
          $("lg-tip").textContent = "已扫码，请在手机上确认";
        }else if(r.code === 803){
          clearInterval(qrTimer);
          API.saveCookie(r.cookie);
          closeLogin();
          await onLogin();
          toast("登录成功");
        }
      }catch(e){ /* 单次轮询失败忽略，下一轮重试 */ }
    }, 2000);
  }catch(e){
    $("lg-tip").textContent = "二维码加载失败，请确认 API 服务已启动";
  }
}
function closeLogin(){
  clearInterval(qrTimer);
  $("login-mask").classList.remove("show");
}
$("lg-close").onclick = closeLogin;
$("login-mask").onclick = e=>{ if(e.target.id==="login-mask") closeLogin(); };
$("lg-qr-img").onclick = ()=>openLogin();   // 过期后点击图片刷新

async function onLogin(){
  await API.refreshStatus();
  renderUser();
  renderSide();
  renderDiscover();
  loadLikes();
  if($("view-me").classList.contains("show")) loadMe();
}
async function onLogout(){
  await API.logout();
  renderUser();
  renderSide();
  renderDiscover();
  if($("view-me").classList.contains("show")) loadMe();
  toast("已退出登录");
}
function renderUser(){
  const u = API.user();
  if(u){
    $("user-avatar").innerHTML = `<img src="${API.pic(u.avatarUrl,60)}" alt="">`;
    $("user-name").textContent = u.nickname;
    $("user-box").title = "";
  }else{
    $("user-avatar").textContent = "未";
    $("user-name").textContent = "点击登录";
    $("user-box").title = "";
  }
  $("user-menu").classList.remove("show");
}
/* 点头像：未登录开扫码弹窗；已登录展开下拉菜单（点外部自动关闭） */
$("user-box").onclick = e=>{
  e.stopPropagation();
  if(!API.loggedIn()){ openLogin(); return; }
  $("user-menu").classList.toggle("show");
};
document.addEventListener("click", e=>{
  if(!e.target.closest("#user-box")) $("user-menu").classList.remove("show");
});
$("um-logout").onclick = e=>{
  e.stopPropagation();
  $("user-menu").classList.remove("show");
  onLogout();
};

/* ---------- 「我的」主页 ---------- */
$("me-login").onclick = openLogin;
$("me-now").onclick = ()=>$("np").classList.add("open");
$("me-prev").onclick = e=>{ e.stopPropagation(); step(-1); };
$("me-next").onclick = e=>{ e.stopPropagation(); step(1); };
$("me-play").onclick = e=>{ e.stopPropagation(); togglePlay(); };

let meTab = 1;   // 1 本周 / 0 全部
document.querySelectorAll(".me-tab").forEach(b=>
  b.onclick = ()=>{
    meTab = +b.dataset.type;
    document.querySelectorAll(".me-tab").forEach(x=>x.classList.toggle("active", x===b));
    loadRecords();
  });

async function loadMe(){
  const u = API.user();
  $("me-guest").style.display = u ? "none" : "";
  $("me-body").hidden = !u;
  if(!u) return;
  // skeleton：数据卡 + 排行
  $("me-stats").innerHTML = '<div class="me-stat sk sk-stat"></div>'.repeat(4);
  $("me-records").innerHTML = '<div class="sk sk-recline"></div>'.repeat(5);
  // 数据卡片：/user/detail（累计听歌/关注/粉丝）+ /user/playlist（歌单数）
  try{
    const [det, pls] = await Promise.all([
      API.req("/user/detail", { uid: u.userId }),
      API.userPlaylist(u.userId),
    ]);
    const prof = det.profile || {};
    const stats = [
      ["累计听歌", det.listenSongs ?? "—"],
      ["歌单", (pls.playlist||[]).length],
      ["关注", prof.follows ?? 0],
      ["粉丝", prof.followeds ?? 0],
    ];
    $("me-stats").innerHTML = stats.map(([k,v])=>
      `<div class="me-stat"><div class="me-stat-num serif">${v}</div><div class="me-stat-key">${k}</div></div>`
    ).join("");
  }catch(e){ console.warn("[me] stats", e); }
  loadRecords();
  renderHeat();
  loadHitokoto();
}

/* 一言：hitokoto.cn，3s 超时回退本地备选 */
const LOCAL_QUOTES = [
  ["音乐是灵魂的语言。","佚名"],
  ["凡是过往，皆为序章。","莎士比亚"],
  ["深夜的歌，是白天的回声。","拾音"],
  ["且听风吟，静待花开。","村上春树"],
  ["生活不止眼前的苟且，还有诗和远方。","高晓松"],
  ["愿你走出半生，归来仍是少年。","佚名"],
  ["耳机里的世界，比现实温柔。","拾音"],
  ["我们唱着时间的歌。","五月天"],
  ["声音是看得见的风景。","佚名"],
  ["保持热爱，奔赴山海。","佚名"],
];
async function loadHitokoto(){
  const set = (text, from)=>{
    $("mq-text").textContent = text;
    $("mq-from").textContent = from ? "—— " + from : "";
  };
  try{
    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), 3000);
    const r = await fetch("https://v1.hitokoto.cn/?encode=json", { signal: ctl.signal });
    clearTimeout(timer);
    const d = await r.json();
    if(!d.hitokoto) throw new Error("bad");
    set(d.hitokoto, d.from_who || d.from);
  }catch(e){
    const q = LOCAL_QUOTES[Math.floor(Math.random()*LOCAL_QUOTES.length)];
    set(q[0], q[1]);
  }
}

/* 歌单墙 */
async function openWall(){
  if(!API.loggedIn()){ toast("登录后查看歌单墙"); openLogin(); return; }
  $("wall-mask").classList.add("show");
  const grid = $("wall-grid");
  grid.innerHTML = '<div class="me-empty">加载中…</div>';
  try{
    const d = await API.userPlaylist(API.user().userId);
    grid.innerHTML = "";
    (d.playlist||[]).forEach(p=>{
      const b = document.createElement("button");
      b.className = "wall-item";
      b.innerHTML = `
        <img src="${API.pic(p.coverImgUrl, 300)}" loading="lazy" decoding="async" alt="">
        <span class="wall-info"><span class="wall-nm">${p.name}</span><span class="wall-ct">${p.trackCount||0} 首</span></span>`;
      b.onclick = ()=>{ closeWall(); openPlaylistById(p.id); };
      grid.appendChild(b);
    });
  }catch(e){ grid.innerHTML = '<div class="me-empty">歌单墙加载失败</div>'; }
}
function closeWall(){ $("wall-mask").classList.remove("show"); }
$("me-wall-open").onclick = openWall;
$("wall-close").onclick = closeWall;
$("wall-mask").onclick = e=>{ if(e.target.id==="wall-mask") closeWall(); };

async function loadRecords(){
  const u = API.user(); if(!u) return;
  const box = $("me-records");
  box.innerHTML = '<div class="me-empty">加载中…</div>';
  try{
    const d = await API.req("/user/record", { uid: u.userId, type: meTab });
    const list = (meTab===1 ? d.weekData : d.allData) || [];
    if(!list.length){ box.innerHTML = '<div class="me-empty">暂无听歌记录</div>'; return; }
    const max = Math.max(1, ...list.map(x=>x.playCount||0));
    box.innerHTML = "";
    list.forEach((r,i)=>{
      const s = API.mapSong(r.song);
      const row = document.createElement("div");
      row.className = "me-rec";
      row.innerHTML = `
        <span class="me-rec-rank">${String(i+1).padStart(2,"0")}</span>
        <span class="me-rec-title">${s.title}</span>
        <span class="me-rec-artist">${s.artist}</span>
        <span class="me-rec-bar"><i style="width:${Math.round((r.playCount||0)/max*100)}%"></i></span>
        <span class="me-rec-count">${r.playCount} 次</span>`;
      row.onclick = ()=>{
        P.queue = list.map(x=>API.mapSong(x.song)); P.fm = false; playAt(i);
      };
      box.appendChild(row);
    });
  }catch(e){ box.innerHTML = '<div class="me-empty">听歌排行加载失败</div>'; }
}

/* 本地听歌热力（官方接口无按天数据，从使用拾音开始本地记录） */
const HEAT_KEY = "ncm_heat";
function heatData(){ try{ return JSON.parse(localStorage.getItem(HEAT_KEY)||"{}"); }catch(e){ return {}; } }
function heatKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function heatRecord(){
  const h = heatData(), k = heatKey(new Date());
  h[k] = (h[k]||0)+1;
  localStorage.setItem(HEAT_KEY, JSON.stringify(h));
}
function renderHeat(){
  const h = heatData(), box = $("me-heat");
  box.innerHTML = "";
  const WEEKS = 15;
  const today = new Date();
  // 对齐到本周第一天（周一），往前推 WEEKS-1 周
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay()+6)%7) - (WEEKS-1)*7);
  for(let w=0; w<WEEKS; w++){
    const col = document.createElement("div");
    col.className = "me-heat-col";
    for(let d=0; d<7; d++){
      const day = new Date(start); day.setDate(day.getDate() + w*7 + d);
      const n = h[heatKey(day)] || 0;
      const lv = n===0 ? 0 : n===1 ? 1 : n<=3 ? 2 : n<=6 ? 3 : 4;
      const cell = document.createElement("span");
      cell.className = "me-heat-cell lv"+lv;
      if(day > today) cell.classList.add("future");
      cell.title = `${day.getMonth()+1}月${day.getDate()}日 听了${n}首`;
      col.appendChild(cell);
    }
    box.appendChild(col);
  }
}

/* ---------- 歌曲右键菜单（全局单例，防出屏） ---------- */
let ctxEl = null;
function closeCtxMenu(){ if(ctxEl){ ctxEl.remove(); ctxEl = null; } }
document.addEventListener("click", e=>{ if(ctxEl && !e.target.closest(".ctx-menu")) closeCtxMenu(); });

function openCtxMenu(x, y, s){
  closeCtxMenu();
  const liked = P.liked.has(s.id);
  const items = [
    { label:"下一首播放", act:()=>playNextInQueue(s) },
    { label:"收藏到歌单…", act:()=>openCollectDialog(s) },
    { label: liked ? "取消我喜欢" : "我喜欢", act:()=>setLike(s, !liked) },
    { label:"查看评论", act:()=>openComments(s) },
    { label:"上传到云盘", disabled:true, tip:"云盘用于上传本地文件，后续支持" },
  ];
  ctxEl = document.createElement("div");
  ctxEl.className = "ctx-menu";
  items.forEach(it=>{
    const b = document.createElement("button");
    b.className = "ctx-item" + (it.disabled ? " disabled" : "");
    b.textContent = it.label;
    if(it.tip) b.title = it.tip;
    if(!it.disabled) b.onclick = ()=>{ closeCtxMenu(); it.act(); };
    ctxEl.appendChild(b);
  });
  document.body.appendChild(ctxEl);
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 10)) + "px";
  ctxEl.style.top  = Math.max(6, Math.min(y, innerHeight - r.height - 10)) + "px";
}
function playNextInQueue(s){
  if(!P.queue.length || P.idx<0){ P.queue=[s]; P.fm=false; playAt(0); return; }
  P.queue.splice(P.idx+1, 0, s);
  toast(`《${s.title}》将在下一首播放`);
  renderQueue();
}

/* ---------- 音质选择（localStorage 记档，切档重拉音源并续播进度） ---------- */
const QUALITY_KEY = "ncm_quality";
const QUALITIES = [
  { k:"standard", name:"标准" },
  { k:"exhigh",   name:"极高" },
  { k:"lossless", name:"无损" },
  { k:"hires",    name:"Hi-Res" },
];
let QUALITY = localStorage.getItem(QUALITY_KEY) || "exhigh";
function qName(k){ const q = QUALITIES.find(x=>x.k===k); return q ? q.name : k; }
function syncQualityBtn(){ $("p-quality").textContent = qName(QUALITY); }

let qmEl = null;
function closeQMenu(){ if(qmEl){ qmEl.remove(); qmEl = null; } }
document.addEventListener("click", e=>{ if(qmEl && !e.target.closest(".q-menu")) closeQMenu(); });

$("p-quality").onclick = e=>{
  e.stopPropagation();
  if(qmEl){ closeQMenu(); return; }
  closeCtxMenu();
  qmEl = document.createElement("div");
  qmEl.className = "ctx-menu q-menu";
  QUALITIES.forEach(q=>{
    const b = document.createElement("button");
    b.className = "ctx-item" + (q.k===QUALITY ? " on" : "");
    b.textContent = q.name + (q.k===QUALITY ? " ✓" : "");
    b.onclick = ()=>{ closeQMenu(); setQuality(q.k); };
    qmEl.appendChild(b);
  });
  document.body.appendChild(qmEl);
  const r = $("p-quality").getBoundingClientRect();
  const m = qmEl.getBoundingClientRect();
  qmEl.style.left = Math.max(6, Math.min(r.right - m.width, innerWidth - m.width - 10)) + "px";
  qmEl.style.top  = Math.max(6, r.top - m.height - 10) + "px";   // 锚定按钮上方
};

async function setQuality(k){
  if(k === QUALITY) return;
  const s = P.song();
  if(!s || !P.playing){         // 未在播放：只记档，下次播放生效
    QUALITY = k; localStorage.setItem(QUALITY_KEY, k); syncQualityBtn();
    toast(`音质已切换为「${qName(k)}」`);
    return;
  }
  try{
    const r = await API.songUrlLevel(s.id, k);
    const d0 = r.data && r.data[0];
    // VIP 档位在非 VIP 账号下会被降级返回：url 为空或返回 level 不符都视为不可用
    if(!d0 || !d0.url || (d0.level && d0.level !== k)) throw new Error("unavailable");
    if(P.song() !== s) return;  // 等待期间已切歌：丢弃本次结果，保持原档
    const t = AE.time();
    QUALITY = k; localStorage.setItem(QUALITY_KEY, k); syncQualityBtn();
    const ok = await AE.play(d0.url, false);   // 不做交叉淡入淡出，尽量无缝
    if(ok){ AE.seek(t); toast(`音质已切换为「${qName(k)}」`); }
  }catch(e){
    toast(`当前账号无法使用「${qName(k)}」音质，保持原档位`);
  }
}
syncQualityBtn();
/* 收藏到歌单二级弹窗 */
async function openCollectDialog(s){
  if(!API.loggedIn()){ toast("登录后才能收藏到歌单"); openLogin(); return; }
  const mask = document.createElement("div");
  mask.className = "collect-mask";
  mask.innerHTML = `<div class="collect-box">
      <div class="lg-title serif">收藏到歌单</div>
      <div class="collect-list"><div class="me-empty">加载中…</div></div>
    </div>`;
  mask.onclick = e=>{ if(e.target===mask) mask.remove(); };
  document.body.appendChild(mask);
  try{
    const d = await API.userPlaylist(API.user().userId);
    const listEl = mask.querySelector(".collect-list");
    listEl.innerHTML = "";
    (d.playlist||[]).forEach(p=>{
      const b = document.createElement("button");
      b.className = "collect-item";
      b.innerHTML = `<img src="${API.pic(p.coverImgUrl,60)}" loading="lazy" decoding="async"><span>${p.name}</span>`;
      b.onclick = async ()=>{
        try{
          const r = await API.playlistTracksOp("add", p.id, s.id);
          const code = r.code ?? (r.body && r.body.code);
          code===200 ? toast(`已收藏到「${p.name}」`)
                     : toast(r.message || (r.body && r.body.message) || "收藏失败（可能已在歌单中）");
        }catch(e){ toast("收藏失败"); }
        mask.remove();
      };
      listEl.appendChild(b);
    });
  }catch(e){
    mask.querySelector(".collect-list").innerHTML = '<div class="me-empty">歌单加载失败</div>';
  }
}

/* ---------- 播放队列浮层 ---------- */
$("p-queue").onclick = e=>{
  e.stopPropagation();
  const p = $("queue-panel");
  p.classList.toggle("show");
  if(p.classList.contains("show")) renderQueue();
};
document.addEventListener("click", e=>{
  if(!e.target.closest("#queue-panel") && !e.target.closest("#p-queue"))
    $("queue-panel").classList.remove("show");
});
$("qp-clear").onclick = ()=>{
  P.queue = []; P.idx = -1; P.playing = false;
  AE.pause();
  setPlayIcon(false);
  document.body.classList.add("paused");
  markPlayingRow();
  renderQueue();
};
function buildQueueList(container){
  container.innerHTML = "";
  if(!P.queue.length){ container.innerHTML = '<div class="me-empty">队列为空</div>'; return; }
  P.queue.forEach((s,i)=>{
    const row = document.createElement("div");
    row.className = "qp-item" + (i===P.idx ? " on" : "");
    row.innerHTML = `<img class="qp-cover" src="${s.cover}" loading="lazy" decoding="async" alt=""><span class="qp-name">${s.title}</span><span class="qp-artist">${s.artist}</span><button class="qp-del" title="移除">×</button>`;
    row.onclick = ()=>playAt(i);
    row.querySelector(".qp-del").onclick = e=>{
      e.stopPropagation();
      P.queue.splice(i,1);
      if(i < P.idx) P.idx--;
      else if(i === P.idx){
        if(P.queue.length) playAt(Math.min(P.idx, P.queue.length-1));
        else { P.idx=-1; P.playing=false; AE.pause(); setPlayIcon(false); }
      }
      markPlayingRow();
      renderQueue();
    };
    container.appendChild(row);
  });
}
function renderQueue(){
  if($("queue-panel").classList.contains("show")){
    $("qp-count").textContent = `播放队列 (${P.queue.length})`;
    buildQueueList($("qp-list"));
  }
  if(npPanel) buildQueueList($("npp-queue"));
}

/* ---------- np 第三列面板（评论 / 播放队列共用一槽） ---------- */
let npPanel = null;   // 'c' 评论 | 'q' 队列 | null 收起
/* 动态计算三列几何：面板宽 + 让位平移量写入 CSS 变量，
   保证任何窗口宽度下封面列/歌词列/面板互不重叠且不溢出视口 */
function npLayout(){
  const W = innerWidth;
  const left = $("np-left"), right = $("np-right"), title = $("np-title");
  // offsetLeft 链不受 panel-open 的 translateX 影响，可安全累加到同一参照系
  const absL = el=>{ let x = 0; while(el){ x += el.offsetLeft; el = el.offsetParent; } return x; };
  const leftL = absL(left);
  // body 右缘取歌词列右缘与标题右缘的较大者（长标题可能超出列宽）
  const bodyRight = Math.max(absL(right) + right.offsetWidth, absL(title) + title.offsetWidth);
  const bodyW = bodyRight - leftL;
  const GAP = 40;                            // 歌词列与面板的最小间距
  let PW = Math.min(380, W*0.30);
  const maxPanel = W*0.96 - 24 - GAP - bodyW;   // body 最少贴左 24
  PW = Math.max(260, Math.min(PW, maxPanel));
  const np = $("np");
  np.style.setProperty("--np-panel-w", PW + "px");
  const centered = (W - bodyW) / 2;             // 无面板时 body 居中 left 边
  const panelLeft = W*0.96 - PW;
  const overflow = (centered + bodyW + GAP) - panelLeft;
  const leftEdge = Math.max(24, centered - Math.max(0, overflow));
  np.style.setProperty("--np-shift", (centered - leftEdge) + "px");
}
window.addEventListener("resize", npLayout);
function setNpPanel(which, force){
  if(!force && npPanel === which) which = null;   // 再点当前按钮收起
  npPanel = which;
  npLayout();                                     // 展开/收起都重算几何
  $("np").classList.toggle("panel-open", !!which);
  $("npp-tab-c").classList.toggle("on", which==="c");
  $("npp-tab-q").classList.toggle("on", which==="q");
  $("np-comment").classList.toggle("on", which==="c");
  $("np-queue").classList.toggle("on", which==="q");
  $("npp-track").style.transform = which==="q" ? "translateX(-100%)" : "";
  if(which){                         // 双 pane 预加载，滑动不空白
    buildQueueList($("npp-queue"));
    if(P.song()) loadComments(P.song());
  }
}
$("np-comment").onclick = ()=>setNpPanel("c");
$("np-queue").onclick = ()=>setNpPanel("q");
$("npp-tab-c").onclick = ()=>setNpPanel("c", true);
$("npp-tab-q").onclick = ()=>setNpPanel("q", true);
$("npp-close").onclick = ()=>setNpPanel(null, true);

/* ---------- 评论（渲染进 np 第三列） ---------- */
let cmSong = null;
const esc = t=>String(t).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* 右键菜单入口：展开全屏页并打开评论列 */
function openComments(s){
  if(!s) return;
  $("np").classList.add("open");
  setNpPanel("c", true);
  loadComments(s);
}
async function loadComments(s){
  cmSong = s;
  const body = $("npp-comments");
  body.innerHTML = '<div class="sk sk-recline"></div>'.repeat(6);
  try{
    const d = await API.comments(s.id);
    if(cmSong !== s) return;
    body.innerHTML = "";
    const hot = d.hotComments || [], news = d.comments || [];
    if(hot.length){
      body.appendChild(cmGroup("热门评论"));
      hot.slice(0,10).forEach(c=>body.appendChild(cmItem(c)));
    }
    if(news.length){
      body.appendChild(cmGroup("最新评论"));
      news.slice(0,20).forEach(c=>body.appendChild(cmItem(c)));
    }
    if(!hot.length && !news.length) body.innerHTML = '<div class="me-empty">还没有评论</div>';
  }catch(e){ body.innerHTML = '<div class="me-empty">评论加载失败</div>'; }
}
function cmGroup(t){
  const el = document.createElement("div");
  el.className = "cm-group"; el.textContent = t; return el;
}
function cmItem(c){
  const el = document.createElement("div");
  el.className = "cm-item";
  const t = new Date(c.time);
  const ts = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  el.innerHTML = `
    <img class="cm-ava" src="${API.pic(c.user.avatarUrl,60)}" loading="lazy" decoding="async">
    <div class="cm-main">
      <div class="cm-meta"><span class="cm-nick">${esc(c.user.nickname)}</span><span class="cm-time">${ts}</span></div>
      <div class="cm-text">${esc(c.content)}</div>
      <div class="cm-liked">${c.likedCount||0} 赞</div>
    </div>`;
  return el;
}
$("np-close").onclick = ()=>{ $("np").classList.remove("open"); setNpPanel(null, true); };

/* ---------- AI 助理 ---------- */
const AI_CFG_KEY = "ncm_ai";
function aiCfg(){
  return Object.assign(
    { base:"https://api.openai.com/v1", key:"", model:"gpt-4o-mini", system:"" },
    JSON.parse(localStorage.getItem(AI_CFG_KEY)||"{}")
  );
}
function stShowPage(name){
  $("st-page-main").hidden = name!=="main";
  $("st-page-ai").hidden = name!=="ai";
}
$("st-ai-open").onclick = ()=>stShowPage("ai");
$("st-ai-back").onclick = ()=>stShowPage("main");
// 配置字段：初始化 + 输入即存 localStorage
[["ai-base","base"],["ai-key","key"],["ai-model","model"],["ai-system","system"]].forEach(([id,k])=>{
  const el = $(id);
  el.value = aiCfg()[k];
  el.oninput = ()=>{
    const c = aiCfg();
    c[k] = k==="system" ? el.value : el.value.trim();
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(c));
    syncAiGuest();
  };
});
const aiHistory = [];   // [{role, content}]，会话内有效
let aiBusy = false;
function syncAiGuest(){
  const ok = !!aiCfg().key;
  $("ai-guest").hidden = ok;
  $("ai-input-row").style.display = ok ? "" : "none";
}
$("ai-open-settings").onclick = ()=>{ openSettings(); stShowPage("ai"); };
function aiBubble(role, text){
  const el = document.createElement("div");
  el.className = "ai-msg " + role;
  el.textContent = text;
  $("ai-msgs").appendChild(el);
  $("ai-msgs").scrollTop = $("ai-msgs").scrollHeight;
  return el;
}
/* 默认系统提示词（配置页系统提示词非空时覆盖它） */
const AI_SYS_DEFAULT = "你是「拾音」内置的音乐助理，可以帮用户搜歌、点歌、推荐音乐、控制播放。" +
  "用户描述心情/场景时，主动推荐并直接用工具播放（比如用户说心情不好，就选治愈/舒缓关键词搜歌单并播放一批）。" +
  "调用工具后用一两句话总结你做了什么，不要罗列参数。";
/* 工具调用过程小卡片（区别于对话气泡）：loading 态 → done 换图标文案 */
function aiToolCard(ui){
  const el = document.createElement("div");
  el.className = "ai-tool loading";
  el.innerHTML = `<span class="ai-tool-ico">${ui.icon}</span><span class="ai-tool-text">${ui.text}</span>`;
  $("ai-msgs").appendChild(el);
  $("ai-msgs").scrollTop = $("ai-msgs").scrollHeight;
  return {
    done(u){
      el.classList.remove("loading");
      el.querySelector(".ai-tool-ico").textContent = u.icon;
      el.querySelector(".ai-tool-text").textContent = u.text;
      $("ai-msgs").scrollTop = $("ai-msgs").scrollHeight;
    },
  };
}
/* 发送消息 → Agent 循环（工具调用在 ai-tools.js 的 aiAgentRun 里） */
async function sendAiMessage(text){
  const c = aiCfg();
  if(!c.key){ syncAiGuest(); return; }
  if(aiBusy) return;
  aiBusy = true;
  $("ai-send").disabled = true;                 // 发送中禁用
  aiHistory.push({ role:"user", content:text });
  aiBubble("user", text);
  const loading = aiBubble("ai", "…");
  loading.classList.add("loading");
  const cards = new Map();                      // tool_call_id → 过程卡片（避免污染 history 里的 call 对象）
  try{
    const { reply } = await aiAgentRun(
      { base:c.base, key:c.key, model:c.model, system:c.system || AI_SYS_DEFAULT },
      aiHistory,
      {
        onToolStart(call){
          const t = AI_TOOLS.find(x=>x.schema.function.name===call.function.name);
          let ui = { icon:"⚙️", text:"执行中…" };
          try{ if(t && t.pending) ui = t.pending(JSON.parse(call.function.arguments || "{}")); }catch(e){}
          cards.set(call.id, aiToolCard(ui));
        },
        onToolEnd(call, result){
          const cd = cards.get(call.id);
          if(cd) cd.done(result.ui);
        },
        onDegrade(){ $("ai-tool-hint").hidden = false; },   // 设置页 AI 配置处提示
      }
    );
    loading.textContent = reply;
    loading.classList.remove("loading");
  }catch(e){
    loading.remove();
    while(aiHistory.length && aiHistory[aiHistory.length-1].role!=="user") aiHistory.pop();
    aiHistory.pop();   // 回滚本次 user 消息，保持历史干净
    toast("AI 请求失败：" + e.message);
  }
  aiBusy = false;
  $("ai-send").disabled = false;
  $("ai-msgs").scrollTop = $("ai-msgs").scrollHeight;
}
/* 换模型后认为工具支持状态未知，收起降级提示 */
$("ai-model").addEventListener("input", ()=>{ $("ai-tool-hint").hidden = true; });
$("ai-send").onclick = ()=>{
  const t = $("ai-input").value.trim();
  if(!t) return;
  $("ai-input").value = "";
  sendAiMessage(t);
};
$("ai-input").onkeydown = e=>{
  if(e.code==="Enter" && !e.shiftKey){
    e.preventDefault();
    $("ai-send").click();
  }
};
syncAiGuest();

/* ---------- 全屏播放页开合 ---------- */
$("p-cover-wrap").onclick = ()=>{ $("np").classList.add("open"); npLayout(); };


/* ---------- 设置（主题模式 / 主题色 / 封面形态） ---------- */
const SET_KEY = "ncm_settings";
const ACCENTS = {
  moss:   { name:"苔绿", light:["#35705e","#2a5b4c","#dcebe4"], dark:["#6fbf9d","#8bd0b2","#26382f"] },
  blue:   { name:"黛蓝", light:["#3a5a8c","#2e4870","#dde5f0"], dark:["#7ea3d8","#98b8e2","#26303f"] },
  persim: { name:"柿红", light:["#c05a3a","#9e4a2f","#f3e0d8"], dark:["#e08a6a","#eba183","#3a2a24"] },
  purple: { name:"藤紫", light:["#7a5a9e","#634a80","#e8dff0"], dark:["#a98fd0","#bca4dc","#2e2838"] },
  amber:  { name:"琥珀", light:["#b8862e","#966d24","#f0e6d2"], dark:["#d8a94e","#e2ba6e","#38301f"] },
};
/* 歌词字体候选（写入 --lyr-font，值是完整 font stack） */
const LYFONTS = {
  sans:  '"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
  serif: '"Songti SC","STSong","Noto Serif SC","SimSun",serif',
  kai:   '"Kaiti SC","STKaiti","KaiTi",serif',
};
const S = Object.assign(
  { theme:"light", accent:"moss", cover:"square", lysize:17.5, npcolor:true, lyfont:"serif", lyweight:600, npbg:"static" },
  JSON.parse(localStorage.getItem(SET_KEY) || "{}")
);
function saveSettings(){ localStorage.setItem(SET_KEY, JSON.stringify(S)); }
function applySettings(){
  const root = document.documentElement;
  root.dataset.theme = S.theme;
  root.dataset.npbg = S.npbg;   // 播放页背景：static 静态模糊 / fluid 流体动态
  const [a, ad, soft] = ACCENTS[S.accent][S.theme];
  root.style.setProperty("--accent", a);
  root.style.setProperty("--accent-d", ad);
  root.style.setProperty("--accent-soft", soft);
  root.style.setProperty("--lyr-size", S.lysize + "px");
  root.style.setProperty("--lyr-font", LYFONTS[S.lyfont] || LYFONTS.serif);
  root.style.setProperty("--lyr-weight", S.lyweight);
  $("np-cover-wrap").classList.toggle("circle", S.cover==="circle");
  $("fm-cover-wrap").classList.toggle("circle", S.cover==="circle");
  // 弹窗内选中态 / 控件回显
  document.querySelectorAll("#st-theme button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.theme));
  document.querySelectorAll("#st-cover button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.cover));
  document.querySelectorAll("#st-npcolor button").forEach(b=>b.classList.toggle("on", (b.dataset.v==="1")===!!S.npcolor));
  document.querySelectorAll("#st-lyfont button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.lyfont));
  document.querySelectorAll("#st-lyweight button").forEach(b=>b.classList.toggle("on", +b.dataset.v===+S.lyweight));
  document.querySelectorAll("#st-npbg button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.npbg));
  document.querySelectorAll("#st-accents .st-dot").forEach(d=>d.classList.toggle("on", d.dataset.k===S.accent));
  $("st-lysize-range").value = S.lysize;
  $("st-lysize-val").textContent = S.lysize + "px";
  if(!S.npcolor) applyNpColors(null);
}
// 色板圆点
Object.entries(ACCENTS).forEach(([k,v])=>{
  const d = document.createElement("button");
  d.className = "st-dot"; d.dataset.k = k; d.title = v.name;
  d.style.background = v.light[0];
  d.style.color = v.light[0];   // .st-dot.on 的描边用 currentColor 取本色
  d.onclick = ()=>{ S.accent = k; saveSettings(); applySettings(); };
  $("st-accents").appendChild(d);
});
document.querySelectorAll("#st-theme button").forEach(b=>
  b.onclick = ()=>{ S.theme = b.dataset.v; saveSettings(); applySettings(); });
document.querySelectorAll("#st-cover button").forEach(b=>
  b.onclick = ()=>{ S.cover = b.dataset.v; saveSettings(); applySettings(); });
document.querySelectorAll("#st-npcolor button").forEach(b=>
  b.onclick = ()=>{
    S.npcolor = b.dataset.v==="1";
    saveSettings(); applySettings();
    if(S.npcolor && P.song()) tintNpFromCover(P.song());   // 重开时立即取色
  });
$("st-lysize-range").oninput = e=>{
  S.lysize = +e.target.value;
  saveSettings(); applySettings();
};
document.querySelectorAll("#st-lyfont button").forEach(b=>
  b.onclick = ()=>{ S.lyfont = b.dataset.v; saveSettings(); applySettings(); });
document.querySelectorAll("#st-lyweight button").forEach(b=>
  b.onclick = ()=>{ S.lyweight = +b.dataset.v; saveSettings(); applySettings(); });
document.querySelectorAll("#st-npbg button").forEach(b=>
  b.onclick = ()=>{ S.npbg = b.dataset.v; saveSettings(); applySettings(); });
/* 自定义 CSS：注入 <style id="user-css">，localStorage 持久化 */
const USER_CSS_KEY = "ncm_user_css";
function applyUserCss(css){
  let el = document.getElementById("user-css");
  if(!el){ el = document.createElement("style"); el.id = "user-css"; document.head.appendChild(el); }
  el.textContent = css || "";
}
$("st-custom-css").value = localStorage.getItem(USER_CSS_KEY) || "";
applyUserCss($("st-custom-css").value);
$("st-css-apply").onclick = ()=>{
  const css = $("st-custom-css").value;
  localStorage.setItem(USER_CSS_KEY, css);
  applyUserCss(css);
  toast("自定义 CSS 已应用");
};
function openSettings(){ $("user-menu").classList.remove("show"); stShowPage("main"); $("settings-mask").classList.add("show"); }
function closeSettings(){ $("settings-mask").classList.remove("show"); }
$("um-settings").onclick = e=>{ e.stopPropagation(); openSettings(); };
$("tb-settings").onclick = ()=>openSettings();   // 顶栏齿轮直达设置
$("st-close").onclick = closeSettings;
$("settings-mask").onclick = e=>{ if(e.target.id==="settings-mask") closeSettings(); };
applySettings();

/* ---------- 键盘 ---------- */
document.addEventListener("keydown",e=>{
  if(e.code==="Space" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){
    e.preventDefault(); togglePlay();
  }
  if(e.code==="Escape"){
    $("np").classList.remove("open"); closeLogin(); closeSettings();
    setNpPanel(null, true); closeCtxMenu();
  }
  if(e.ctrlKey && e.code==="ArrowRight") step(1);
  if(e.ctrlKey && e.code==="ArrowLeft") step(-1);
});

/* ---------- 主循环（进度/歌词 UI，时间由 <audio> 驱动） ---------- */
let last = 0;
function loop(t){
  last = t;
  if(P.playing && P.song()){
    P.elapsed = AE.time();
    const s = P.song(), dur = AE.duration() || s.dur || 1;
    const pc = Math.min(1, P.elapsed/dur);
    $("p-fill").style.width = pc*100+"%";
    $("np-fill").style.width = pc*100+"%";
    $("p-time").textContent = `${fmt(P.elapsed)} / ${fmt(dur)}`;
    $("np-cur").textContent = fmt(P.elapsed);
    $("np-total").textContent = fmt(dur);
    $("me-now-fill").style.width = pc*100+"%";
    syncLyrics();
  }
  requestAnimationFrame(loop);
}

/* ---------- 启动 ---------- */
DB.SONGS.forEach(s=>s.cover = makeCover(s));                 // mock 兜底封面
DB.PLAYLISTS.forEach(pl=>{ pl.cover = DB.SONGS.find(s=>s.id===pl.songs[0]).cover; });
renderUser();
renderDiscover();
renderSide();
API.refreshStatus().then(u=>{ if(u){ renderUser(); renderSide(); loadLikes(); } });
requestAnimationFrame(t=>{ last=t; requestAnimationFrame(loop) });
