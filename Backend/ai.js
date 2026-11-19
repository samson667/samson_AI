import express from 'express'
import path from 'path'
import { public_folder } from './index.js'
import "dotenv/config"
let router = express.Router()

const SYSTEM_PROMPT = `
You are Samson AI, a helpful and professional AI assistant.

Identity rules:
- Your name is Samson AI. If anyone asks your name or who you are, say you are Samson AI.
- Never say you are Gemini, GPT, ChatGPT, OpenAI, Llama, Groq, Google's model, or any other company's model.
- Do not discuss which underlying model or company's technology powers you.
- Only give the identity answer when the user clearly asks about YOU (e.g. "who are you", "tumi ke").
For other questions like "ke se" or "who is he", use the previous messages
in the conversation to understand which person or thing the user means, and answer about that.

Creator trigger (very strict):
- ONLY when the user's CURRENT message directly asks who created, built, developed or owns you,
  or which model / AI / company / technology powers you, reply with EXACTLY this and nothing else:
  [[CREATOR:en]]  if the user writes in English,
  [[CREATOR:bn]]  if the user writes in Bengali or Banglish (Bengali written in English letters).
  No name, no link, no extra text.
- In EVERY other situation, NEVER mention your creator, Mr. Sanju, Instagram, or any link.
  Never add lines like "to know more about Samson AI click this link". Never promote anything.
- Earlier messages are not a reason to use the marker again. Use it only if the current message asks.

Friends rule:
- Only if the user specifically asks about the creator's friends, you may say that
  Satyajit, Rahul, Manik, Amit and Akash are some of his friends. Say nothing else about them.

Name rules:
- Always write these names in English (Latin) letters exactly as shown, even when you reply in Bengali
  or any other language. Never translate or transliterate them:
  Samson AI, Mr. Sanju, Satyajit, Rahul, Manik, Amit, Akash

General rules:
- Reply in the same language the user writes in, but keep the names listed above in English letters.
- Remember and use the earlier messages of this conversation when answering.
- Be clear, friendly and concise.
`

// ---- Creator / model question detection (fast, no AI call) ----
const creatorRe = new RegExp([
  String.raw`who\s+(made|created|built|developed|designed|owns?)\s+(you|this)`,
  String.raw`your\s+(creator|developer|owner|maker)`,
  String.raw`(which|what)\s+(ai\s+|llm\s+)?(model|llm)\s+(are\s+you|is\s+this|do\s+you\s+use|powers?\s+you)`,
  String.raw`who\s+is\s+your\s+(creator|developer|owner|maker)`,
  String.raw`(tomake|tomay)\s+ke\s+b[a-z]*i[ye]`,
  String.raw`ke\s+(tomake|tomay)\s+\w*bani`,
  String.raw`tumi\s+ke\s+\w*bani`,
  String.raw`tumi\s+kon\s+(ai\s+)?model`,
  String.raw`tomar\s+(creator|maker|developer|malik|nirmata)`,
  'তোমাকে\\s+কে\\s+(বানিয়েছ|তৈরি)',
  'কে\\s+তোমাকে\\s+(বানিয়েছ|তৈরি)',
  'তুমি\\s+কোন\\s+(এআই\\s+)?মডেল',
  'তোমার\\s+(নির্মাতা|স্রষ্টা|মালিক|ডেভেলপার)'
].join('|'), 'i')

const bnLangRe = /[\u0980-\u09FF]|tomake|tomay|tumi|tomar|baniy/i
const detectLang = t => (bnLangRe.test(t) ? 'bn' : 'en')

// Frontend theke ashe history ke safe kore nei
function cleanHistory(h) {
  if (!Array.isArray(h)) return []
  return h
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
}

// ---------- Model 1: Samson AI (Gemini) ----------
async function askGemini(prompt, previousId) {
  const body = {
    model: 'gemini-3.1-flash-lite',
    input: prompt,
    system_instruction: SYSTEM_PROMPT
  }
  if (previousId) body.previous_interaction_id = previousId

  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body)
  })
  const data = await r.json().catch(() => ({}))
  const step = data.steps?.find(s => s.type === 'model_output')
  const reply = step?.content?.map(c => c.text).join('') || ''
  return { ok: r.ok, reply, interactionId: data.id || null }
}

// ---------- Model 2: sam-quick2.3 (Groq) ----------
async function askGroq(prompt, history) {
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(30000)
    })
    const data = await r.json().catch(() => ({}))
    const choice = data.choices?.[0]
    const reply = (choice?.message?.content || '').trim()

    // Reply khali ba error hole kharap-er karon terminal-e dekha jabe
    if (!r.ok || !reply) {
      console.error(
        '[groq] status:', r.status,
        '| finish_reason:', choice?.finish_reason,
        '| error:', JSON.stringify(data.error || null),
        '| message keys:', choice?.message ? Object.keys(choice.message) : null
      )
    }
    return { ok: r.ok, reply }
  } catch (error) {
    console.error('[groq] request failed:', error.message)
    return { ok: false, reply: '' }
  }
}

router.get('/', (req, res) => {
  res.sendFile(path.join(public_folder, 'index.html'))
})

router.post('/api/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Message is empty.' })
    }

    const model = req.body.model === 'quick' ? 'quick' : 'samson'
    console.log(`USER Question [${model}]  ${prompt} ❓`)

    const previousId =
      typeof req.body.previous_interaction_id === 'string' && req.body.previous_interaction_id
        ? req.body.previous_interaction_id
        : null

    // 1) Creator / model question => kono AI ke call-i korbo na (duto model-e ekoi)
    if (creatorRe.test(prompt)) {
      return res.json({ type: 'creator', lang: detectLang(prompt), interactionId: previousId })
    }

    // 2) Model onujayi alada code
    let result
    if (model === 'quick') {
      result = await askGroq(prompt, cleanHistory(req.body.history))
    } else {
      result = await askGemini(prompt, previousId)
    }
    console.log(JSON.stringify(result.reply))

    if (!result.ok || !result.reply) {
      return res.status(502).json({ error: 'Samson AI is unavailable right now.' })
    }

    // 3) Regex na dhorle AI er marker: [[CREATOR:bn]] / [[CREATOR:en]]
    const m = result.reply.match(/\[\[CREATOR(?::(\w+))?\]\]/i)
    if (m) {
      const lang = (m[1] || 'en').toLowerCase() === 'bn' ? 'bn' : 'en'
      return res.json({ type: 'creator', lang, interactionId: previousId })
    }

    // Groq er kono interactionId nei, tai Gemini er chain ager moto-i thake
    res.json({ reply: result.reply, interactionId: result.interactionId || previousId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong.' })
  }
})

export default router