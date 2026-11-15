const $ = id => document.getElementById(id);
const promptEl = $('prompt'), sendBtn = $('send'), thread = $('thread'), hero = $('hero'), stage = $('stage'), wrap = $('wrap');

// Mobile keyboard handling: keep the layout exactly as tall as the visible area,
// so the input bar sits right above the keyboard and nothing slides behind it.
(function fitToVisibleArea() {
  const vv = window.visualViewport;
  if (!vv) return;
  const fullHeight = () => Math.max(window.innerHeight, vv.height);
  let baseline = fullHeight();
  const apply = () => {
    document.documentElement.style.setProperty('--app-h', vv.height + 'px');
    const keyboardOpen = baseline - vv.height > 120;
    document.body.classList.toggle('kb-open', keyboardOpen);
    window.scrollTo(0, 0);                               // the browser must never pan the page
    if (keyboardOpen) stage.scrollTop = stage.scrollHeight;
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', () => setTimeout(() => { baseline = fullHeight(); apply(); }, 350));
  apply();
})();

promptEl.addEventListener('input', () => {
  promptEl.style.height = 'auto';
  promptEl.style.height = promptEl.scrollHeight + 'px';
});
promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
sendBtn.addEventListener('click', send);
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { promptEl.value = c.textContent; send(); }));

function message(kind, label, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + kind;
  const who = document.createElement('div');
  who.className = 'who';
  const av = document.createElement('div');
  if (kind === 'assistant') { av.className = 'av ai'; av.innerHTML = '<svg><use href="#mark"/></svg>'; }
  else { av.className = 'av'; av.textContent = kind === 'error' ? '!' : 'Y'; }
  const name = document.createElement('span');
  name.textContent = label;
  who.append(av, name);
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text || '';
  d.append(who, b);
  return d;
}

// Turns plain text into DOM nodes where http(s) links become clickable <a> tags.
// Built with DOM nodes (not innerHTML), so the AI's text can never inject HTML.
function linkify(el, text) {
  el.textContent = '';
  const urlRe = /https?:\/\/[^\s<>"')\]]+/g;
  let last = 0, m;
  while ((m = urlRe.exec(text)) !== null) {
    let url = m[0];
    const trailing = url.match(/[.,;:!?।]+$/);       // keep sentence punctuation outside the link
    if (trailing) url = url.slice(0, -trailing[0].length);

    el.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = document.createElement('a');
    a.href = url;
    a.textContent = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.appendChild(a);
    last = m.index + url.length;
    urlRe.lastIndex = last;
  }
  el.appendChild(document.createTextNode(text.slice(last)));
}

// Gentle word-by-word reveal for a premium feel
function reveal(el, text) {
  const words = text.split(/(\s+)/);
  let i = 0;
  el.textContent = '';
  const step = () => {
    const chunk = Math.max(1, Math.ceil(words.length / 140));
    el.textContent += words.slice(i, i + chunk).join('');
    i += chunk;
    stage.scrollTop = stage.scrollHeight;
    if (i < words.length) requestAnimationFrame(() => setTimeout(step, 14));
    else linkify(el, text);                          // links become clickable once typing finishes
  };
  step();
}

async function send() {
  const text = promptEl.value.trim();
  if (!text || sendBtn.disabled) return;

  sendBtn.disabled = true;
  wrap.classList.add('busy');
  hero.style.display = 'none';
  thread.innerHTML = '';                       // stateless: no history is kept
  thread.appendChild(message('user', 'You', text));

  const pending = message('assistant', 'Samson AI', '');
  pending.querySelector('.bubble').innerHTML =
    '<div class="thinking"><div class="bars"><i></i><i></i><i></i><i></i><i></i></div><span class="shimmer">Thinking…</span></div>';
  thread.appendChild(pending);

  promptEl.value = ''; promptEl.style.height = 'auto';
  stage.scrollTop = stage.scrollHeight;

  // Keep the RGB glow visible for at least this long, even if the server answers instantly or fails fast
  const MIN_BUSY_MS = 2600;
  const minWait = new Promise(r => setTimeout(r, MIN_BUSY_MS));

  try {
    const request = fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text })
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      return data;
    });

    const [data] = await Promise.all([request, minWait]);
    pending.querySelector('.bubble').textContent = '';
    reveal(pending.querySelector('.bubble'), data.reply || '');
  } catch (err) {
    await minWait;
    pending.remove();
    thread.appendChild(message('error', 'Error', err.message));
  } finally {
    sendBtn.disabled = false;
    wrap.classList.remove('busy');
    promptEl.focus();
  }
}