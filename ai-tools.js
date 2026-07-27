/* ============================================================
   AI 助理工具集 + Agent 循环（function calling）
   每个工具 = OpenAI function schema + pending 文案 + 本地执行函数
   依赖 app.js 全局：P / playAt / step / togglePlay / setLike（调用时取值）
   ============================================================ */

/* 搜索结果缓存：play_song 只有 song_id 时从这里找回完整歌曲对象 */
const AI_SONG_CACHE = new Map();
function aiCacheSongs(list){ list.forEach(s=>AI_SONG_CACHE.set(s.id, s)); }
/* 精简结构省 token */
function aiCompact(s){ return { id:s.id, 歌名:s.title, 歌手:s.artist, 专辑:s.album }; }
function aiPlayQueue(songs, idx=0){ P.queue = songs; P.fm = false; playAt(idx); }

const AI_TOOLS = [
  {
    schema: { type:"function", function:{
      name:"search_songs",
      description:"搜索歌曲，返回前若干首的 id/歌名/歌手/专辑",
      parameters:{ type:"object", properties:{
        keywords:{ type:"string", description:"搜索关键词（歌名/歌手/歌词）" },
        limit:{ type:"number", description:"返回数量，默认 5" },
      }, required:["keywords"] },
    }},
    pending: a=>({ icon:"🔍", text:`搜索：${a.keywords}` }),
    run: async a=>{
      const d = await API.search(a.keywords, a.limit || 5);
      const songs = ((d.result && d.result.songs) || []).slice(0, a.limit || 5).map(API.mapSong);
      aiCacheSongs(songs);
      return {
        ui: { icon:"🔍", text:`搜索「${a.keywords}」：${songs.length} 首结果` },
        data: { songs: songs.map(aiCompact) },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"play_song",
      description:"播放指定 id 的歌曲（id 需先通过 search_songs 获得）",
      parameters:{ type:"object", properties:{
        song_id:{ type:"number", description:"歌曲 id" },
      }, required:["song_id"] },
    }},
    pending: ()=>({ icon:"▶", text:"准备播放…" }),
    run: async a=>{
      const s = AI_SONG_CACHE.get(+a.song_id) || AI_SONG_CACHE.get(a.song_id);
      if(!s) return {
        ui: { icon:"⚠️", text:"找不到该歌曲" },
        data: { error:"未知 song_id，请先调用 search_songs 搜索" },
      };
      aiPlayQueue([s]);
      return {
        ui: { icon:"▶", text:`正在播放《${s.title}》` },
        data: { ok:true, 正在播放: aiCompact(s) },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"search_and_play",
      description:"搜索并直接播放最匹配的歌曲（搜索结果会作为播放队列）。用户点名要听某首歌时优先用这个",
      parameters:{ type:"object", properties:{
        keywords:{ type:"string", description:"搜索关键词，如「周杰伦 晴天」" },
      }, required:["keywords"] },
    }},
    pending: a=>({ icon:"▶", text:`点歌：${a.keywords}` }),
    run: async a=>{
      const d = await API.search(a.keywords, 10);
      const songs = ((d.result && d.result.songs) || []).map(API.mapSong);
      if(!songs.length) return {
        ui: { icon:"🔍", text:`没有找到「${a.keywords}」` },
        data: { error:"无搜索结果，可换关键词重试" },
      };
      aiCacheSongs(songs);
      aiPlayQueue(songs);
      return {
        ui: { icon:"▶", text:`正在播放《${songs[0].title}》- ${songs[0].artist}` },
        data: { ok:true, 正在播放: aiCompact(songs[0]), 队列: songs.length },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"queue_playlist",
      description:"把指定 id 的歌单整单加入播放队列并播放",
      parameters:{ type:"object", properties:{
        playlist_id:{ type:"number", description:"歌单 id" },
      }, required:["playlist_id"] },
    }},
    pending: ()=>({ icon:"📋", text:"加载歌单…" }),
    run: async a=>{
      const [det, trk] = await Promise.all([API.playlistDetail(a.playlist_id), API.playlistTracks(a.playlist_id)]);
      const songs = (trk.songs || []).map(API.mapSong);
      if(!songs.length) return {
        ui: { icon:"📋", text:"歌单是空的" },
        data: { error:"歌单没有歌曲" },
      };
      aiCacheSongs(songs);
      aiPlayQueue(songs);
      const name = det.playlist ? det.playlist.name : "";
      return {
        ui: { icon:"📋", text:`已加入播放队列 ${songs.length} 首（${name}）` },
        data: { ok:true, 歌单: name, 数量: songs.length },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"search_playlist_and_play",
      description:"按关键词搜歌单，取最匹配的一个整单播放。适合「放点适合 XX 的歌」「来个学习歌单」这类场景",
      parameters:{ type:"object", properties:{
        keywords:{ type:"string", description:"歌单关键词，如「治愈」「舒缓」「学习」" },
      }, required:["keywords"] },
    }},
    pending: a=>({ icon:"📋", text:`找歌单：${a.keywords}` }),
    run: async a=>{
      const d = await API.req("/cloudsearch", { keywords:a.keywords, type:1000, limit:5 });
      const pls = (d.result && d.result.playlists) || [];
      if(!pls.length) return {
        ui: { icon:"📋", text:`没有匹配「${a.keywords}」的歌单` },
        data: { error:"无歌单结果，可换关键词重试" },
      };
      const pl = pls[0];
      const trk = await API.playlistTracks(pl.id);
      const songs = (trk.songs || []).map(API.mapSong);
      if(!songs.length) return {
        ui: { icon:"📋", text:"歌单是空的" },
        data: { error:"歌单没有歌曲" },
      };
      aiCacheSongs(songs);
      aiPlayQueue(songs);
      return {
        ui: { icon:"📋", text:`已加入播放队列 ${songs.length} 首（${pl.name}）` },
        data: { ok:true, 歌单: pl.name, 数量: songs.length },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"play_daily_recommend",
      description:"播放每日推荐（根据用户口味每日更新）。需要用户已登录",
      parameters:{ type:"object", properties:{} },
    }},
    pending: ()=>({ icon:"📅", text:"获取每日推荐…" }),
    run: async ()=>{
      if(!API.loggedIn()) return {
        ui: { icon:"🔒", text:"每日推荐需要登录" },
        data: { error:"需要登录网易云账号，请转告用户先在「拾音」里扫码登录" },
      };
      const d = await API.recommendSongs();
      const songs = ((d.data && d.data.dailySongs) || []).map(API.mapSong);
      if(!songs.length) return {
        ui: { icon:"📅", text:"每日推荐为空" },
        data: { error:"每日推荐为空，请稍后再试" },
      };
      aiCacheSongs(songs);
      aiPlayQueue(songs);
      return {
        ui: { icon:"📅", text:`正在播放每日推荐（${songs.length} 首）` },
        data: { ok:true, 数量: songs.length },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"play_my_playlist",
      description:"播放用户自己的歌单，按名字模糊匹配；不传 name 则列出歌单名供选择。需要用户已登录",
      parameters:{ type:"object", properties:{
        name:{ type:"string", description:"歌单名（可模糊）" },
      } },
    }},
    pending: a=>({ icon:"📂", text: a.name ? `找我的歌单：${a.name}` : "查看我的歌单…" }),
    run: async a=>{
      if(!API.loggedIn()) return {
        ui: { icon:"🔒", text:"我的歌单需要登录" },
        data: { error:"需要登录网易云账号，请转告用户先在「拾音」里扫码登录" },
      };
      const u = API.user();
      const d = await API.userPlaylist(u.userId);
      const pls = d.playlist || [];
      if(!a.name) return {
        ui: { icon:"📂", text:`找到 ${pls.length} 个歌单` },
        data: { 歌单: pls.map(p=>p.name), 提示:"请用户指定要播放的歌单名后再调用本工具" },
      };
      const kw = String(a.name).toLowerCase();
      const m = pls.find(p=>p.name === a.name) || pls.find(p=>p.name.toLowerCase().includes(kw));
      if(!m) return {
        ui: { icon:"📂", text:`没有匹配「${a.name}」的歌单` },
        data: { error:"没有匹配的歌单", 歌单: pls.map(p=>p.name) },
      };
      const trk = await API.playlistTracks(m.id);
      const songs = (trk.songs || []).map(API.mapSong);
      if(!songs.length) return {
        ui: { icon:"📋", text:"歌单是空的" },
        data: { error:"歌单没有歌曲" },
      };
      aiCacheSongs(songs);
      aiPlayQueue(songs);
      return {
        ui: { icon:"📋", text:`正在播放歌单《${m.name}》（${songs.length} 首）` },
        data: { ok:true, 歌单: m.name, 数量: songs.length },
      };
    },
  },
  {
    schema: { type:"function", function:{
      name:"control_playback",
      description:"控制播放：next 下一首 / prev 上一首 / pause 暂停 / resume 继续 / like 给当前歌曲点红心",
      parameters:{ type:"object", properties:{
        action:{ type:"string", enum:["next","prev","pause","resume","like"] },
      }, required:["action"] },
    }},
    pending: a=>{
      const m = { next:"⏭ 下一首", prev:"⏮ 上一首", pause:"⏸ 暂停", resume:"▶ 继续播放", like:"❤️ 红心当前歌曲" };
      return { icon:"🎛", text: m[a.action] || "控制播放" };
    },
    run: async a=>{
      switch(a.action){
        case "next": step(1); break;
        case "prev": step(-1); break;
        case "pause": if(P.playing) togglePlay(); break;
        case "resume": if(!P.playing) togglePlay(); break;
        case "like": {
          const s = P.song();
          if(!s) return { ui:{ icon:"⚠️", text:"当前没有在播的歌" }, data:{ error:"当前没有在播放的歌曲" } };
          await setLike(s, true);
          return { ui:{ icon:"❤️", text:`已红心《${s.title}》` }, data:{ ok:true, action:"like", 歌曲: aiCompact(s) } };
        }
        default:
          return { ui:{ icon:"⚠️", text:"未知操作" }, data:{ error:"action 只能是 next/prev/pause/resume/like" } };
      }
      const labels = { next:"下一首", prev:"上一首", pause:"已暂停", resume:"继续播放" };
      return { ui:{ icon:"🎛", text: labels[a.action] }, data:{ ok:true, action:a.action } };
    },
  },
  {
    schema: { type:"function", function:{
      name:"get_now_playing",
      description:"获取当前正在播放的歌曲信息和播放状态",
      parameters:{ type:"object", properties:{} },
    }},
    pending: ()=>({ icon:"🎵", text:"查看当前播放…" }),
    run: async ()=>{
      const s = P.song();
      if(!s) return {
        ui: { icon:"🎵", text:"当前没有在播的歌" },
        data: { 播放中:false },
      };
      return {
        ui: { icon:"🎵", text:`当前：《${s.title}》- ${s.artist}` },
        data: Object.assign({ 播放中:P.playing, 进度秒:Math.round(P.elapsed) }, aiCompact(s)),
      };
    },
  },
];

async function aiToolExec(name, args){
  const t = AI_TOOLS.find(x=>x.schema.function.name === name);
  if(!t) throw new Error("未知工具 " + name);
  return t.run(args || {});
}

/* ---------- Agent 循环（DOM 无关，可注入 fetchImpl 单测） ----------
   cfg:   { base, key, model, system }
   hooks: { fetchImpl?, onToolStart(call)?, onToolEnd(call, result)?, onDegrade()? }
   返回 { reply, degraded }；history 原地追加 assistant/tool 消息 */
async function aiAgentRun(cfg, history, hooks){
  hooks = hooks || {};
  const f = hooks.fetchImpl || fetch;
  let useTools = true, degraded = false;
  for(let round = 0; round < 6; round++){          // 6 轮上限防死循环
    const body = {
      model: cfg.model,
      messages: [{ role:"system", content:cfg.system }, ...history.slice(-20)],
      stream: false,
    };
    if(useTools) body.tools = AI_TOOLS.map(t=>t.schema);
    const r = await f(cfg.base.replace(/\/+$/,"") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":"Bearer " + cfg.key },
      body: JSON.stringify(body),
    });
    if(!r.ok){
      // 模型不支持 tools（典型 400/404/422）：摘掉 tools 降级重试一次
      if(useTools && (r.status===400 || r.status===404 || r.status===422)){
        useTools = false; degraded = true;
        if(hooks.onDegrade) hooks.onDegrade();
        continue;
      }
      throw new Error("HTTP " + r.status);
    }
    const d = await r.json();
    const msg = d.choices && d.choices[0] && d.choices[0].message;
    if(!msg) throw new Error("返回格式异常");
    const calls = msg.tool_calls || [];
    if(useTools && calls.length){
      history.push({ role:"assistant", content: msg.content || "", tool_calls: calls });
      for(const call of calls){
        if(hooks.onToolStart) hooks.onToolStart(call);
        let result;
        try{
          result = await aiToolExec(call.function.name, JSON.parse(call.function.arguments || "{}"));
        }catch(e){
          result = { ui:{ icon:"⚠️", text:"工具执行失败" }, data:{ error: String(e && e.message || e) } };
        }
        if(hooks.onToolEnd) hooks.onToolEnd(call, result);
        history.push({ role:"tool", tool_call_id: call.id, content: JSON.stringify(result.data) });
      }
      continue;                                    // 带着工具结果进入下一轮
    }
    if(!msg.content) throw new Error("返回格式异常");
    history.push({ role:"assistant", content: msg.content });
    return { reply: msg.content, degraded };
  }
  return { reply:"（这一轮工具调用有点多，先到这里，可以换个说法再试）", degraded };
}
