// CloudBase HTTP cloud function with DB persistence and linear daily sessions
const tcb = require('@cloudbase/node-sdk')
const app = tcb.init({ env: process.env.TCB_ENV })
const db = app.database()
const _ = db.command
const colMemos = db.collection('memos')
const colDaily = db.collection('dailySessions')

// Stages and warm questions (10 per stage)
const STAGES = [
  {
    name: '童年',
    qa: [
      f('童年的哪个气味让你一下回到当时？'),
      f('谁的一句话至今留在你心里？'),
      f('一件让你感到被温柔对待的小事是什么？'),
      f('第一次觉得自己长大了，发生了什么？'),
      f('你最喜欢的玩具/游戏，承载了怎样的快乐？'),
      f('一次受挫后，谁的安慰让你重新站起来？'),
      f('放学路上的哪个画面，让你现在想起还会笑？'),
      f('家里有什么独特的小习惯，让你记忆很深？'),
      f('生病时，谁做过让你特别安心的事？'),
      f('哪件小事让你第一次懂得“珍惜”？')
    ]
  },
  {
    name: '少年',
    qa: [
      f('在学校里，谁影响了你看待世界的方式？'),
      f('你做过的一次勇敢决定是什么？'),
      f('哪次失败让你学会了与自己和解？'),
      f('和同伴一起完成的事情，哪次最让你自豪？'),
      f('你曾经受过的误解，后来是如何被理解的？'),
      f('哪位老师的一句话让你受用至今？'),
      f('一次与家人对话，让你更懂了彼此的是什么？'),
      f('你第一次“真正想变好”的契机是什么？'),
      f('当你遇到不公平时，你做了什么？'),
      f('你最想对那时的自己说什么？')
    ]
  },
  {
    name: '青年/成年',
    qa: [
      f('哪次选择改变了你的人生方向？'),
      f('你如何面对挫折并走了出来？'),
      f('一段重要关系如何塑造了今天的你？'),
      f('第一次独当一面，发生了什么？'),
      f('你最想传递给后辈的一条经验是什么？'),
      f('曾被误解的坚持，后来怎样被看见？'),
      f('一次道别让你学到了什么？'),
      f('哪座城市承载了你的成长印记？'),
      f('一次向内的和解，让你变得更柔软？'),
      f('现在的你，最想感谢谁？')
    ]
  }
]

function f(question){
  return {
    feedback: '谢谢你的分享，我们慢慢往下走。',
    question
  }
}

exports.main = async (event, context) => {
  const { httpMethod = 'GET', path = '/', body, headers = {}, queryStringParameters } = event || {}
  const normPath = normalizePath(path)
  const uid = getUidFromAuth(headers) || 'guest'

  if (httpMethod === 'OPTIONS') { return http(204, '') }

  try {
    if (normPath === '/health' && httpMethod === 'GET') {
      return http(200, { ok: true, ts: Date.now() })
    }

    // Auth demo
    if (normPath === '/login' && httpMethod === 'POST') {
      const payload = safeJSON(body)
      const token = signToken({ uid: `u_${hash(payload.email || 'guest')}` })
      return http(200, { token })
    }
    if (normPath === '/register' && httpMethod === 'POST') {
      const payload = safeJSON(body)
      const token = signToken({ uid: `u_${hash(payload.email || 'guest')}` })
      return http(200, { token })
    }
    if (normPath === '/verify' && httpMethod === 'GET') { return http(200, { ok: true }) }

    // Memos
    if (normPath === '/memos' && httpMethod === 'GET') {
      const r = await colMemos.where({ uid }).orderBy('createdAt','desc').limit(100).get()
      return http(200, r.data || [])
    }
    if (normPath === '/memos' && httpMethod === 'POST') {
      const payload = safeJSON(body)
      const doc = {
        uid,
        text: payload.text || '',
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        visibility: payload.visibility || 'private',
        createdAt: Date.now()
      }
      const res = await colMemos.add(doc)
      return http(201, { _id: res.id || res._id, ...doc })
    }
    if (normPath === '/memos/delete' && httpMethod === 'POST') {
      const payload = safeJSON(body)
      if (!payload.id) return http(400, { message: 'id required' })
      await colMemos.doc(payload.id).remove()
      return http(200, { ok: true })
    }

    // Daily: linear 10Q per stage
    if (normPath === '/daily/session' && httpMethod === 'GET') {
      const s = await ensureSession(uid)
      const stage = STAGES[s.stageIdx]
      const qa = stage.qa[s.qIdx]
      return http(200, {
        stageText: stage.name,
        progress: `${s.qIdx}/${stage.qa.length}`,
        question: qa.question,
        feedback: latestFeedback(s, qa)
      })
    }
    if (normPath === '/daily/session/answer' && httpMethod === 'POST') {
      const payload = safeJSON(body)
      const s = await ensureSession(uid)
      const stage = STAGES[s.stageIdx]
      const qa = stage.qa[s.qIdx]
      const rec = {
        stageIdx: s.stageIdx,
        qIdx: s.qIdx,
        question: qa.question,
        answer: payload.answer || '',
        ts: Date.now()
      }
      // append history
      await colDaily.doc(s._id).update({ history: _.push(rec) })
      // advance pointer
      let nextStage = s.stageIdx
      let nextQ = s.qIdx + 1
      if (nextQ >= stage.qa.length) { nextQ = 0; nextStage = (s.stageIdx + 1) % STAGES.length }
      await colDaily.doc(s._id).update({ stageIdx: nextStage, qIdx: nextQ })
      return http(200, { ok: true })
    }
    if (normPath === '/daily/session/next' && httpMethod === 'POST') {
      const s = await ensureSession(uid)
      const stage = STAGES[s.stageIdx]
      let nextStage = s.stageIdx
      let nextQ = s.qIdx + 1
      if (nextQ >= stage.qa.length) { nextQ = 0; nextStage = (s.stageIdx + 1) % STAGES.length }
      await colDaily.doc(s._id).update({ stageIdx: nextStage, qIdx: nextQ })
      const st = STAGES[nextStage]
      const qa = st.qa[nextQ]
      return http(200, { question: qa.question, feedback: qa.feedback, stageText: st.name, progress: `${nextQ}/${st.qa.length}` })
    }

    return http(404, { message: 'Not Found' })
  } catch (e) {
    return http(500, { message: e && e.message ? e.message : 'Server Error' })
  }
}
exports.main_handler = exports.main

async function ensureSession(uid){
  const got = await colDaily.where({ uid }).limit(1).get()
  if (got.data && got.data.length) return got.data[0]
  const init = { uid, stageIdx: 0, qIdx: 0, history: [], createdAt: Date.now() }
  const res = await colDaily.add(init)
  return { _id: res.id || res._id, ...init }
}

function latestFeedback(s, qa){
  const last = (s.history || []).slice(-1)[0]
  if (last && last.answer) {
    return `读到你写的“${trimSample(last.answer)}”，很真挚。${qa.feedback}`
  }
  return qa.feedback
}
function trimSample(t){ t = String(t); if (t.length > 24) return t.slice(0,24) + '…'; return t }

function normalizePath(p) { if (!p) return '/'; if (p === '/api') return '/'; if (p.startsWith('/api/')) return p.slice(4); return p }
function http(statusCode, data, extraHeaders) { return { statusCode, headers: { 'Content-Type': 'application/json', ...cors(), ...(extraHeaders||{}) }, body: data === '' ? '' : JSON.stringify(data) } }
function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } }
function safeJSON(raw){ try { return JSON.parse(raw || '{}') } catch(e){ return {} } }
function hash(str){ let h=0; const s=String(str); for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0 } return Math.abs(h).toString(36) }
function signToken(payload){ return Buffer.from(JSON.stringify(payload)).toString('base64') }
function getUidFromAuth(headers){ try { const auth=(headers.Authorization||headers.authorization||''); const token=(auth.split(' ')[1]||'').trim(); if(!token) return ''; const json=JSON.parse(Buffer.from(token,'base64').toString('utf8')); return json&&json.uid?json.uid:'' } catch(e){ return '' } }

