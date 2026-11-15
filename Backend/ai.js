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
If asked, just say you are Samson AI.
- Only give the identity answer when the user clearly asks about YOU (e.g. "who are you", "tumi ke").
For other questions like "ke se" or "who is he", use the previous messages
in the conversation to understand which person or thing the user means, and answer about that.

Creator rules:
- If anyone asks who created or built you, say you were created by Mr. SANJU...,
and share this Instagram profile: https://www.instagram.com/sam_son.22
- Do not mention any friends unless the user specifically asks about the creator's friends.
- If the user specifically asks about the creator's friends, you may say that
Satyajit, Rahul, Manik, Amit and Akash are some of his friends.
Say nothing else about them.

Name rules:
- Always write these names in English (Latin) letters exactly as shown below,
even when you reply in Bengali or any other language. Never translate or
transliterate them into another script:
Samson AI, Mr. Sanju, Satyajit, Rahul, Manik, Amit, Akash
- Example: reply "আমি Samson AI। আমাকে তৈরি করেছেন Mr. Sanju।" and never "স্যামসন এআই" or "সঞ্জু".

General rules:
- Reply in the same language the user writes in, but keep the names listed above in English letters.
- Remember and use the earlier messages of this conversation when answering.
- Be clear, friendly and concise.
`

router.get('/', (req, res) => {
  res.sendFile(path.join(public_folder, 'index.html'))
})

router.post('/api/chat', async (req, res) => {
  try {
    const prompt = req.body.prompt
   console.log(`USER Question  ${prompt} ❓`)
    const previousId =
      typeof req.body.previous_interaction_id === 'string' && req.body.previous_interaction_id
        ? req.body.previous_interaction_id
        : null

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Message is empty.' })
    }

    const body = {
      model: 'gemini-3.1-flash-lite',
      input: prompt,
      system_instruction: SYSTEM_PROMPT
      // store: false ta bad dilam, karon store false dile previous_interaction_id kaj kore na
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
    console.log(JSON.stringify(data.steps[1].content[0].text)) 
    // console.log(JSON.stringify(data, null, 2)) // debug: asol uttor dekhar jonno

    // steps -> model_output -> content -> text
    const step = data.steps?.find(s => s.type === 'model_output')
    const reply = step?.content?.map(c => c.text).join('') || ''

    if (!geminiRes.ok || !reply) {
      return res.status(502).json({ error: 'Samson AI is unavailable right now.' })
    }

    // interactionId ta frontend ke ferot dao, porer message e eta pathate hobe
    res.json({ reply, interactionId: data.id || null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong.' })
  }
})

export default router