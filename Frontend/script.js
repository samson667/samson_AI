const $ = id => document.getElementById(id);
const promptEl = $('prompt'), sendBtn = $('send'), thread = $('thread'), hero = $('hero'), stage = $('stage'), wrap = $('wrap');

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