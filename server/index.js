/* index.js — 一键启动：网易云 API(3000) + 静态页面(8080) + 图片代理 */
const path = require('path')
const express = require('express')
// 先生成匿名 token（写入 os.tmpdir()/anonymous_token，request.js 启动时必读）
const generateConfig = require('NeteaseCloudMusicApi/generateConfig.js')
const { serveNcmApi } = require('NeteaseCloudMusicApi/server.js')

const API_PORT = 3000
const WEB_PORT = 8080

async function main() {
  await generateConfig()
  // 1. 网易云音乐 API（自带 CORS）
  await serveNcmApi({ port: API_PORT, checkVersion: false })
  console.log(`[api] 网易云 API 已启动: http://localhost:${API_PORT}`)

  // 2. 静态页面服务（项目根目录）
  const app = express()
  app.use(express.static(path.join(__dirname, '..')))

  // 3. 图片代理：网易图片防盗链 403 时走这里
  //    用法: http://localhost:8080/img?url=<encodeURIComponent(图片地址)>
  app.get('/img', async (req, res) => {
    const url = req.query.url
    if (
      typeof url !== 'string' ||
      !/^https?:\/\/[\w.-]*(music\.126\.net|music\.163\.com|163cn\.tv)/.test(url)
    ) {
      return res.status(400).end('bad url')
    }
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://music.163.com/',
        },
        redirect: 'follow',
      })
      if (!r.ok) return res.status(r.status).end()
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      const buf = Buffer.from(await r.arrayBuffer())
      res.end(buf)
    } catch (e) {
      res.status(502).end(String(e))
    }
  })

  app.listen(WEB_PORT, () => {
    console.log(`[web] 静态页面已启动: http://localhost:${WEB_PORT}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
