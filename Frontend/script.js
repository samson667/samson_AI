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
    window.scrollTo(0, 0);
    if (keyboardOpen) stage.scrollTop = stage.scrollHeight;
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  window.addEventListener('orientationchange', () => setTimeout(() => { baseline = fullHeight(); apply(); }, 350));
  apply();
})();

// NOTUN: server ager conversation er ID ei variable e thake. Refresh dile null hoye jay (notun chat).
let previousInteractionId = null;

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

// Renders the AI's text safely (DOM nodes only, never innerHTML):
//   **word**  -> <strong> with a soft glass highlight
//   "* item"  -> "• item"
//   http(s) links -> clickable
// An unfinished "**" (while the text is still being typed) is treated as bold until the end,
// so asterisks never flash on screen.
// **bold** handle kore. Closing ** na ashle ager ongsho bold hoye thake, tai typing e asterisk dekha jay na.
function inline(parent, text) {
  text.split('**').forEach((part, i) => {
    if (!part) return;
    if (i % 2) {
      const strong = document.createElement('strong');
      linkify(strong, part);
      parent.appendChild(strong);
    } else {
      linkify(parent, part);
    }
  });
}

// Markdown -> DOM (innerHTML noy, tai safe).
// "* item" / "- item" / "1. item" => proper list (wrap hole alignment thik thake)
// "## heading" => bold line
function render(el, text) {
  el.textContent = '';
  el.classList.add('md');
  const stack = [];                      // nested list track
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const li = line.match(/^(\s*)([*\-•]|\d+\.)\s+(.*)$/);
    if (li) {
      const indent = li[1].length;
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || top.indent < indent) {
        const ul = document.createElement('ul');
        (top && top.lastLi ? top.lastLi : el).appendChild(ul);
        top = { ul, indent, lastLi: null };
        stack.push(top);
      }
      const item = document.createElement('li');
      const num = li[2].match(/^\d+\./);
      if (num) item.classList.add('num');
      inline(item, (num ? li[2] + ' ' : '') + li[3]);
      top.ul.appendChild(item);
      top.lastLi = item;
      continue;
    }
    stack.length = 0;
    if (!line.trim()) { el.appendChild(Object.assign(document.createElement('div'), { className: 'gap' })); continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const p = document.createElement('div');
   
    const isHead = h || /^\s*\*\*[^*]+(\*\*)?\s*$/.test(line); // puro line ta bold hole = heading
    const raw = h ? h[1] : line;
    const already = /^\s*(\*\*)?\p{Nd}+[.)।]/u.test(raw);      // AI nijei number likhle auto-number lagbe na
    p.className = 'para' + (isHead ? ' head' : '') + (isHead && already ? ' hasnum' : '');

    inline(p, h ? '**' + h[1] + '**' : line);
    el.appendChild(p);
  }
    el.classList.toggle('bn', /[\u0980-\u09FF]/.test(text)); // Bangla lekha hole bn class
}

// Gentle word-by-word reveal for a premium feel
function reveal(el, text) {
  const words = text.split(/(\s+)/);
  let i = 0;
  const step = () => {
    const chunk = Math.max(1, Math.ceil(words.length / 140));
    i += chunk;
    render(el, words.slice(0, i).join(''));
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
      // NOTUN: prompt er sathe ager conversation er ID pathao
      body: JSON.stringify({ prompt: text, previous_interaction_id: previousInteractionId })
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      return data;
    });

    const [data] = await Promise.all([request, minWait]);

    // NOTUN: porer message er jonno notun ID save koro
    if (data.interactionId) previousInteractionId = data.interactionId;

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