const $ = id => document.getElementById(id)
const promptEl = $('prompt'),
  sendBtn = $('send'),
  thread = $('thread'),
  hero = $('hero'),
  stage = $('stage'),
  wrap = $('wrap')

// Mobile keyboard handling: keep the layout exactly as tall as the visible area,
// so the input bar sits right above the keyboard and nothing slides behind it.
;(function fitToVisibleArea () {
  const vv = window.visualViewport
  if (!vv) return
  const fullHeight = () => Math.max(window.innerHeight, vv.height)
  let baseline = fullHeight()
  const apply = () => {
    document.documentElement.style.setProperty('--app-h', vv.height + 'px')
    const keyboardOpen = baseline - vv.height > 120
    document.body.classList.toggle('kb-open', keyboardOpen)
    window.scrollTo(0, 0)
    if (keyboardOpen) stage.scrollTop = stage.scrollHeight
  }
  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  window.addEventListener('orientationchange', () =>
    setTimeout(() => {
      baseline = fullHeight()
      apply()
    }, 350)
  )
  apply()
})()

// Server ager conversation er ID ei variable e thake. Refresh dile null hoye jay (notun chat).
let previousInteractionId = null

let chatHistory = [];   // Groq er jonno: ager shob message ekhane thake

promptEl.addEventListener('input', () => {
  promptEl.style.height = 'auto'
  promptEl.style.height = promptEl.scrollHeight + 'px'
})
promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
})

// Send button chapleo textarea er focus jeno na jay, tahole mobile er keyboard bondho hoy na
sendBtn.addEventListener('pointerdown', e => e.preventDefault())
sendBtn.addEventListener('mousedown', e => e.preventDefault())
sendBtn.addEventListener('click', () => {
  send()
  promptEl.focus() // tap er shomoy-i focus ferot, tai keyboard niche namar shujog pay na
})

document.querySelectorAll('.chip').forEach(c =>
  c.addEventListener('click', () => {
    promptEl.value = c.textContent
    send()
  })
)

// ===== Model switcher =====
const MODELS = { samson: 'Sam Logic', quick: 'Sam Turbo 2.1' };
let currentModel = 'samson';
const modelEl = $('model'), modelBtn = $('modelBtn'), modelMenu = $('modelMenu'), modelLabel = $('modelLabel');

function setModel(key) {
  if (!MODELS[key]) key = 'samson';
  currentModel = key;
  modelLabel.textContent = MODELS[key];
  modelMenu.querySelectorAll('.model-opt').forEach(o => o.classList.toggle('active', o.dataset.model === key));
  try { localStorage.setItem('samson-model', key); } catch (e) {}
}
function toggleMenu(open) {
  const show = open === undefined ? !modelEl.classList.contains('open') : open;
  modelEl.classList.toggle('open', show);
  modelBtn.setAttribute('aria-expanded', String(show));
}
// Button chapleo textarea theke focus jeno na jay (mobile keyboard bondho hoy na)
[modelBtn, modelMenu].forEach(el => el.addEventListener('pointerdown', e => e.preventDefault()));
modelBtn.addEventListener('click', () => toggleMenu());
modelMenu.addEventListener('click', e => {
  const opt = e.target.closest('.model-opt');
  if (!opt) return;
  setModel(opt.dataset.model);
  toggleMenu(false);
});
document.addEventListener('click', e => { if (!modelEl.contains(e.target)) toggleMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });
try { setModel(localStorage.getItem('samson-model') || 'samson'); } catch (e) { setModel('samson'); }


function message (kind, label, text) {
  const d = document.createElement('div')
  d.className = 'msg ' + kind
  const who = document.createElement('div')
  who.className = 'who'
  const av = document.createElement('div')
  if (kind === 'assistant') {
    av.className = 'av ai'
    av.innerHTML = '<svg><use href="#mark"/></svg>'
  } else {
    av.className = 'av'
    av.textContent = kind === 'error' ? '!' : 'Y'
  }
  const name = document.createElement('span')
  name.textContent = label
  who.append(av, name)
  const b = document.createElement('div')
  b.className = 'bubble'
  b.textContent = text || ''
  d.append(who, b)
  return d
}

// Turns plain text into DOM nodes where http(s) links become clickable <a> tags.
// Built with DOM nodes (not innerHTML), so the AI's text can never inject HTML.
function linkify (el, text) {
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g
  let last = 0,
    m
  while ((m = urlRe.exec(text)) !== null) {
    let url = m[0]
    const trailing = url.match(/[.,;:!?।]+$/) // keep sentence punctuation outside the link
    if (trailing) url = url.slice(0, -trailing[0].length)

    el.appendChild(document.createTextNode(text.slice(last, m.index)))
    const a = document.createElement('a')
    a.href = url
    a.textContent = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    el.appendChild(a)
    last = m.index + url.length
    urlRe.lastIndex = last
  }
  el.appendChild(document.createTextNode(text.slice(last)))
}

// **bold** handle kore. Closing ** na ashle ager ongsho bold hoye thake (typing e asterisk dekha jay na).
// Closing ** na thakle strong e 'open' class dei, jate typing er shomoy glass na lage.
function inline (parent, text) {
  const parts = text.split('**')
  parts.forEach((part, i) => {
    if (!part) return
    if (i % 2) {
      const strong = document.createElement('strong')
      if (i === parts.length - 1) strong.className = 'open'
      linkify(strong, part)
      parent.appendChild(strong)
    } else {
      linkify(parent, part)
    }
  })
}

// Markdown -> DOM (innerHTML noy, tai safe).
// "* item" / "- item" / "1. item" / "১. item" => list
// "## heading" ba puro-line-bold => heading (glassy)
function render (el, text) {
  el.textContent = ''
  el.classList.add('md')
  const stack = []
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const li = line.match(/^(\s*)([*\-•]|\p{Nd}+[.)।])\s+(.*)$/u) // Bangla digit o chene
    if (li) {
      const indent = li[1].length
      while (stack.length && stack[stack.length - 1].indent > indent)
        stack.pop()
      let top = stack[stack.length - 1]
      if (!top || top.indent < indent) {
        const ul = document.createElement('ul')
        ;(top && top.lastLi ? top.lastLi : el).appendChild(ul)
        top = { ul, indent, lastLi: null }
        stack.push(top)
      }
      const item = document.createElement('li')
      const isNum = /^\p{Nd}+[.)।]$/u.test(li[2])
      let body = li[3]
      if (isNum) {
        item.classList.add('num')
        // number ke bold er bhitore dhukai, jate number shoho glassy hoy
        body = body.startsWith('**')
          ? '**' + li[2] + ' ' + body.slice(2)
          : li[2] + ' ' + body
      }
      inline(item, body)
      top.ul.appendChild(item)
      top.lastLi = item
      continue
    }
    stack.length = 0
    if (!line.trim()) {
      el.appendChild(
        Object.assign(document.createElement('div'), { className: 'gap' })
      )
      continue
    }
    const h = line.match(/^#{1,6}\s+(.*)$/)
    const p = document.createElement('div')
    const isHead = h || /^\s*\*\*[^*]+(\*\*)?\s*$/.test(line)
    const raw = h ? h[1] : line
    const already = /^\s*(\*\*)?\p{Nd}+[.)।]/u.test(raw)
    p.className =
      'para' + (isHead ? ' head' : '') + (isHead && already ? ' hasnum' : '')
    inline(p, h ? '**' + h[1] + '**' : line)
    el.appendChild(p)
  }
  el.classList.toggle('bn', /[\u0980-\u09FF]/.test(text))
}

// Gentle word-by-word reveal for a premium feel
function reveal (el, text) {
  const words = text.split(/(\s+)/)
  let i = 0
  const step = () => {
    const chunk = Math.max(1, Math.ceil(words.length / 140))
    i += chunk
    render(el, words.slice(0, i).join(''))
    stage.scrollTop = stage.scrollHeight
    if (i < words.length) requestAnimationFrame(() => setTimeout(step, 14))
  }
  step()
}

// ===== Creator card =====
const CREATOR = {
  name: 'Mr. Sanju',
  photo: 'creator.jpg',
  musics: ['VISION.mp3', 'VISION.mp3'], // <- song er list. Aro song jog korte chaile ekhane likhun
  insta: 'https://www.instagram.com/sam_son.22',
  handle: '@sam_son.22'
}

// Shob song age-i browser e load kore rakhi, jate baajar shomoy deri na hoy
CREATOR.musics.forEach(s => {
  const a = new Audio()
  a.preload = 'auto'
  a.src = s
})

// Ekta-i audio element. Prothom click e "unlock" hoy (iPhone/Safari er jonno dorkar)
const creatorAudio = new Audio()
creatorAudio.preload = 'auto'
let audioUnlocked = false
function unlockAudio () {
  if (audioUnlocked) return
  audioUnlocked = true
  creatorAudio.src = CREATOR.musics[0]
  creatorAudio.muted = true
  creatorAudio
    .play()
    .then(() => {
      creatorAudio.pause()
      creatorAudio.currentTime = 0
      creatorAudio.muted = false
    })
    .catch(() => {
      audioUnlocked = false
      creatorAudio.muted = false
    })
}

// Random song, kintu ager bar-er song ta abar na
let lastSong = -1
function pickSong () {
  const list = CREATOR.musics
  if (list.length === 1) return list[0]
  let i
  do {
    i = Math.floor(Math.random() * list.length)
  } while (i === lastSong)
  lastSong = i
  return list[i]
}

// 11 second: 1s e fade in (max 80%), 10s por 1s e fade out
let musicTimers = []
function playCreatorMusic () {
  musicTimers.forEach(t => {
    clearInterval(t)
    clearTimeout(t)
  })
  musicTimers = []

  const MAX = 0.84// volume 84%
  const TOTAL_MS = 14000 // total 14 second
  const FADE_MS = 1200 // fade in/out 1.2 second
  const STEP_MS = 100
  const step = MAX / (FADE_MS / STEP_MS)

  try {
    creatorAudio.pause()
    const song = pickSong()
    if (!creatorAudio.src.endsWith(song)) creatorAudio.src = song // notun song
    else creatorAudio.currentTime = 0 // ekoi song hole shuru theke
    creatorAudio.volume = 0
    creatorAudio.play().catch(() => {})

    let v = 0
    const fin = setInterval(() => {
      v = Math.min(MAX, v + step)
      creatorAudio.volume = v
      if (v >= MAX) clearInterval(fin)
    }, STEP_MS)

    const t = setTimeout(() => {
      const fout = setInterval(() => {
        creatorAudio.volume = Math.max(0, creatorAudio.volume - step)
        if (creatorAudio.volume <= 0) {
          clearInterval(fout)
          creatorAudio.pause()
        }
      }, STEP_MS)
      musicTimers.push(fout)
    }, TOTAL_MS - FADE_MS)

    const stop = setTimeout(() => creatorAudio.pause(), TOTAL_MS + 200)
    musicTimers.push(fin, t, stop)
  } catch (e) {}
}

function showCreator (el, lang) {
  el.textContent = ''
  el.classList.add('creator')

  const row = document.createElement('div')
  row.className = 'cc'

  const photo = document.createElement('button')
  photo.type = 'button'
  photo.className = 'cc-photo'
  photo.setAttribute('aria-label', 'Photo boro kore dekhun')
  const img = document.createElement('img')
  img.src = CREATOR.photo
  img.alt = CREATOR.name
  photo.appendChild(img)
  photo.addEventListener('click', () => openPhoto(CREATOR.photo))
  photo.style.visibility = 'hidden' // animation cholar shomoy jaygata khali thakbe

  const info = document.createElement('div')
  info.className = 'cc-info'
  const label = document.createElement('div')
  label.className = 'cc-label'
  label.textContent = lang === 'bn' ? 'আমাকে তৈরি করেছেন' : 'Created by'
  const name = document.createElement('div')
  name.className = 'cc-name'
  name.textContent = CREATOR.name
  const a = document.createElement('a')
  a.className = 'cc-link'
  a.href = CREATOR.insta
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="url(#igGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<defs><linearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#feda75"/><stop offset=".35" stop-color="#fa7e1e"/>' +
    '<stop offset=".6" stop-color="#d62976"/><stop offset="1" stop-color="#962fbf"/>' +
    '</linearGradient></defs>' +
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' +
    '<circle cx="17.5" cy="6.5" r="1" fill="url(#igGrad)" stroke="none"/>' +
    '</svg><span></span>'
  a.querySelector('span').textContent = CREATOR.handle

  info.append(label, name, a)
  row.append(photo, info)
  el.appendChild(row)

  flyPhoto(photo, img) // NOTUN: chhoto -> full screen -> abar chhoto
}

// Photo: card theke dhire dhire full screen, kichukkhon thake, tarpor abar asol jaygay
function flyPhoto (photoBtn, img) {
  const GROW_MS = 1100 // boro hote koto shomoy
  const HOLD_MS = 2700 // full screen e 2.70s shomoy thakbe
  const SHRINK_MS = 950 // abar chhoto hote koto shomoy
  const ease = 'cubic-bezier(.22,.9,.24,1)'
  const show = () => {
    photoBtn.style.visibility = ''
  }

  const ready =
    img.complete && img.naturalWidth
      ? Promise.resolve(true)
      : new Promise(r => {
          img.onload = () => r(true)
          img.onerror = () => r(false)
        })

  ready.then(ok => {
    if (!ok || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return show()

    requestAnimationFrame(async () => {
      const rectOf = () => {
        const r = img.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      }
      const px = r => ({
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px'
      })

      const from = rectOf()
      // full screen e photo er asol ratio thik rekhe boro hobe
      const ratio = img.naturalWidth / img.naturalHeight
      const maxW = window.innerWidth - 32,
        maxH = window.innerHeight - 32
      let w = maxW,
        h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      const to = {
        left: (window.innerWidth - w) / 2,
        top: (window.innerHeight - h) / 2,
        width: w,
        height: h
      }

      const bg = document.createElement('div')
      bg.className = 'fly-bg'
      const fly = document.createElement('img')
      fly.className = 'fly-img'
      fly.src = img.src
      fly.alt = ''
      Object.assign(fly.style, px(from))
      document.body.append(bg, fly)

      // click ba Esc chaple agei chhoto hoye jabe
      let skip
      const skipped = new Promise(r => {
        skip = r
      })
      bg.addEventListener('click', () => skip())
      const onKey = e => {
        if (e.key === 'Escape') skip()
      }
      document.addEventListener('keydown', onKey)

      // 1) chhoto theke full screen
      bg.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: GROW_MS * 0.7,
        fill: 'forwards'
      })
      await fly.animate(
        [
          { ...px(from), borderRadius: '17px' },
          { ...px(to), borderRadius: '16px' }
        ],
        { duration: GROW_MS, easing: ease, fill: 'forwards' }
      ).finished

      // 2) full screen e kichukkhon thake
      await Promise.race([new Promise(r => setTimeout(r, HOLD_MS)), skipped])

      // 3) abar card er asol jaygay fire ashe
      const back = rectOf()
      bg.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: SHRINK_MS,
        fill: 'forwards'
      })
      await fly.animate(
        [
          { ...px(to), borderRadius: '16px' },
          { ...px(back), borderRadius: '17px' }
        ],
        { duration: SHRINK_MS, easing: ease, fill: 'forwards' }
      ).finished

      show()
      bg.remove()
      fly.remove()
      document.removeEventListener('keydown', onKey)
    })
  })
}

// Photo te click korle puro screen e dekhay
function openPhoto (src) {
  const ov = document.createElement('div')
  ov.className = 'lightbox'
  const big = document.createElement('img')
  big.src = src
  big.alt = CREATOR.name
  ov.appendChild(big)
  const close = () => {
    ov.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = e => {
    if (e.key === 'Escape') close()
  }
  ov.addEventListener('click', close)
  document.addEventListener('keydown', onKey)
  document.body.appendChild(ov)
}

async function send () {
  const text = promptEl.value.trim()
  if (!text || sendBtn.disabled) return
  unlockAudio() // user er click/Enter er shomoy audio unlock

  sendBtn.disabled = true
  wrap.classList.add('busy')
  hero.style.display = 'none'
  thread.appendChild(message('user', 'You', text))

  const pending = message('assistant', 'Samson AI', '')
  pending.querySelector('.bubble').innerHTML =
    '<div class="thinking"><div class="bars"><i></i><i></i><i></i><i></i><i></i></div><span class="shimmer">Thinking…</span></div>'
  thread.appendChild(pending)

  promptEl.value = ''
  promptEl.style.height = 'auto'
  stage.scrollTop = stage.scrollHeight

  // Keep the RGB glow visible for at least this long, even if the server answers instantly or fails fast
  const MIN_BUSY_MS = currentModel === 'quick' ? 915 : 2400
  const minWait = new Promise(r => setTimeout(r, MIN_BUSY_MS))

  try {
    const request = fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
        prompt: text,
        previous_interaction_id: previousInteractionId,
        model: currentModel,
        history: currentModel === 'quick' ? chatHistory.slice(-20) : []
      })
    }).then(async res => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok)
        throw new Error(data.error || 'Something went wrong. Please try again.')
      return data
    })

    const [data] = await Promise.all([request, minWait])

    if (data.interactionId) previousInteractionId = data.interactionId

    // Backend bollo creator proshno: photo + naam + link + music
    if (data.type === 'creator') {
      playCreatorMusic()
      showCreator(pending.querySelector('.bubble'), data.lang)
      stage.scrollTop = stage.scrollHeight
      return // finally block tobuo cholbe
    }
        chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply || '' });
    pending.querySelector('.bubble').textContent = ''
    reveal(pending.querySelector('.bubble'), data.reply || '')
  } catch (err) {
    await minWait
    pending.remove()
    thread.appendChild(message('error', 'Error', err.message))
  } finally {
    sendBtn.disabled = false
    wrap.classList.remove('busy')
    if (!window.matchMedia('(pointer: coarse)').matches) promptEl.focus() // phone e uttor ashle keyboard jor kore tulbe na
  }
}
