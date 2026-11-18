import express from 'express'
import path from 'path'
import { public_folder } from './index.js'

let router = express.Router()

const SYSTEM_PROMPT = `
You are Samson AI, a helpful and professional AI assistant.

Identity rules:
- Your name is Samson AI. If anyone asks your name or who you are, say you are Samson AI.
- Never say you are Gemini, Google's model, or "a large language model trained by Google".
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
  // English
  String.raw`who\s+(made|created|built|developed|designed|owns?)\s+(you|this)`,
  String.raw`your\s+(creator|developer|owner|maker)`,
  String.raw`(which|what)\s+(ai\s+|llm\s+)?(model|llm)\s+(are\s+you|is\s+this|do\s+you\s+use|powers?\s+you)`,
  String.raw`who\s+is\s+your\s+(creator|developer|owner|maker)`,
  // Banglish
  String.raw`(tomake|tomay)\s+ke\s+b[a-z]*i[ye]`,
  String.raw`ke\s+(tomake|tomay)\s+\w*bani`,
  String.raw`tumi\s+ke\s+\w*bani`,
  String.raw`tumi\s+kon\s+(ai\s+)?model`,
  String.raw`tomar\s+(creator|maker|developer|malik|nirmata)`,
  // Bengali script
  'তোমাকে\\s+কে\\s+(বানিয়েছ|তৈরি)',
  'কে\\s+তোমাকে\\s+(বানিয়েছ|তৈরি)',
  'তুমি\\s+কোন\\s+(এআই\\s+)?মডেল',
  'তোমার\\s+(নির্মাতা|স্রষ্টা|মালিক|ডেভেলপার)'
].join('|'), 'i')

const bnLangRe = /[\u0980-\u09FF]|tomake|tomay|tumi|tomar|baniy/i
const detectLang = t => (bnLangRe.test(t) ? 'bn' : 'en')

router.get('/', (req, res) => {
  res.sendFile(path.join(public_folder, 'index.html'))
})

router.post('/api/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Message is empty.' })
    }
    console.log(`USER Question  ${prompt} ❓`)

    const previousId =
      typeof req.body.previous_interaction_id === 'string' && req.body.previous_interaction_id
        ? req.body.previous_interaction_id
        : null

    // 1) Creator / model question => Gemini ke call-i korbo na
    if (creatorRe.test(prompt)) {
      return res.json({ type: 'creator', lang: detectLang(prompt), interactionId: previousId })
    }

    const body = {
      model: 'gemini-3.1-flash-lite',
      input: prompt,
      system_instruction: SYSTEM_PROMPT
    }
    if (previousId) body.previous_interaction_id = previousId

    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(body)
      }
    )

    const data = await geminiRes.json()
    const step = data.steps?.find(s => s.type === 'model_output')
    const reply = step?.content?.map(c => c.text).join('') || ''
    console.log(JSON.stringify(reply))

    if (!geminiRes.ok || !reply) {
      return res.status(502).json({ error: 'Samson AI is unavailable right now.' })
    }

    // 2) Regex na dhorle AI er marker: [[CREATOR:bn]] / [[CREATOR:en]]
    const m = reply.match(/\[\[CREATOR(?::(\w+))?\]\]/i)
    if (m) {
      const lang = (m[1] || 'en').toLowerCase() === 'bn' ? 'bn' : 'en'
      // previousId ferot dilam: marker er turn ta chat history te thakbe na
      return res.json({ type: 'creator', lang, interactionId: previousId })
    }

    res.json({ reply, interactionId: data.id || null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong.' })
  }
})

export default router