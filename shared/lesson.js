/* ===========================================================================
   Interactive lesson engine
   Shared by every lesson page. A lesson page supplies content only.

   Lesson.start({ title, subtitle, glossary, questions, stages, ready })
   Components (call inside ready):
     Lesson.editor(sel, code, {id, tests})        code editor + Run (+ Check)
     Lesson.trace(sel, {code, localLines, vc, localLabel, steps})
     Lesson.parsons(sel, {lines, distract, order})
     Lesson.gaps(sel, {template, gaps, bank, build})
     Lesson.annotate(sel, {code, items, stretch, distract, given})
     Lesson.sorter(sel, {items, cats})
     Lesson.code(src) / Lesson.scopeCode(src, localLines, vc)
     Lesson.run(source) / Lesson.showResult(preEl, result)
     Lesson.onLevel(fn)
   =========================================================================== */
window.Lesson = (function(){
'use strict';

/* ---------------- utils ---------------- */
const $ = (s, r) => (r||document).querySelector(s);
const $$ = (s, r) => [...(r||document).querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const host = sel => typeof sel === 'string' ? $(sel) : sel;

const KW = new Set(['def','return','if','elif','else','for','while','in','and','or','not','True','False','None','import','from','as','pass','break','continue','try','except','lambda','global']);
const BI = new Set(['print','round','len','int','str','float','range','input','abs','min','max','sum','type','list']);
function hl(line, vc){
  const re = /(#.*$)|("[^"]*"|'[^']*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  let out='', last=0, m, prevDef=false;
  while((m = re.exec(line))){
    out += esc(line.slice(last, m.index));
    if(m[1]) out += `<span class="tk-c">${esc(m[1])}</span>`;
    else if(m[2]) out += `<span class="tk-s">${esc(m[2])}</span>`;
    else if(m[3]) out += `<span class="tk-n">${m[3]}</span>`;
    else { const w = m[4];
      if(prevDef){ out += `<span class="tk-f">${w}</span>`; prevDef = false; }
      else if(KW.has(w)){ out += `<span class="tk-k">${w}</span>`; prevDef = (w === 'def'); }
      else if(BI.has(w)) out += `<span class="tk-f">${w}</span>`;
      else { const c = vc && vc(w); out += c ? `<span class="${c}">${w}</span>` : w; } }
    last = re.lastIndex;
  }
  return out + esc(line.slice(last));
}
const codeBlock = (src, id) => `<div class="code"${id?` id="${id}"`:''}>` +
  src.split('\n').map((l,i)=>`<div class="ln" data-l="${i+1}"><i>${i+1}</i><span>${hl(l)||' '}</span></div>`).join('') + `</div>`;
const scopeCode = (src, id, localLines, vc) => `<div class="code"${id?` id="${id}"`:''}>` +
  src.split('\n').map((l,i)=>{ const n=i+1, cls = !l.trim() ? '' : localLines.includes(n) ? ' ls' : ' gs';
    return `<div class="ln${cls}" data-l="${n}"><i>${n}</i><span>${hl(l, w=>vc(n,w))||' '}</span></div>`; }).join('') + `</div>`;

/* ---------------- python runner (Skulpt) ---------------- */
const TEST = '\u00a7T\u00a7';
function friendly(err){
  if(/IndentationError|unexpected indent|expected an indented block/i.test(err)) return 'Check your indentation: lines inside a function need 4 spaces.';
  if(/NameError/.test(err)) return 'Python doesn\'t recognise a name. Check your spelling, or whether the variable only exists inside the function.';
  if(/SyntaxError/.test(err)) return 'Check for a missing colon after def, missing brackets or quotes, or a line inside the function that needs 4 spaces of indentation.';
  if(/TypeError.*argument/i.test(err)) return 'The number of arguments in the call doesn\'t match the number of parameters.';
  if(/TypeError/.test(err)) return 'You may be mixing text and numbers, for example "5" + 5.';
  if(/TimeLimit|time limit|too long/i.test(err)) return 'The program ran for too long. Is there a loop that never ends? Check the loop variable changes each time.';
  if(/No more inputs/.test(err)) return 'Your loop asked for more inputs than there are in the Inputs box. Is the loop stopping when it should?';
  if(/invalid literal for int/.test(err)) return 'int() can only turn digits into a number. Check the Inputs box.';
  return '';
}
function runPython(code, inputs){
  return new Promise(resolve => {
    if(!window.Sk){ resolve({ok:false, out:'', err:'The Python runner could not load. Check the internet connection.'}); return; }
    let out = '', lines = 0;
    const queue = Array.isArray(inputs) ? inputs.slice() : null;
    Sk.configure({
      output: t => { if(lines > 2000) return; out += t; lines += (t.match(/\n/g)||[]).length; if(lines > 2000) out += '\n… (output stopped after 2000 lines)\n'; },
      read: x => { if(Sk.builtinFiles === undefined || Sk.builtinFiles.files[x] === undefined) throw "File not found: '"+x+"'"; return Sk.builtinFiles.files[x]; },
      __future__: Sk.python3, execLimit: 3000, yieldLimit: 100,
      inputfunTakesPrompt: false,
      inputfun: () => {
        if(!queue) throw new Sk.builtin.RuntimeError('input() is not used here — give the function arguments instead.');
        if(!queue.length) throw new Sk.builtin.RuntimeError('No more inputs. Add another value to the Inputs box.');
        const v = String(queue.shift()); out += v + '\n'; return v;
      }
    });
    Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, code, true))
      .then(() => resolve({ok:true, out}), e => resolve({ok:false, out, err:String(e)}));
  });
}
function showResult(pre, r){
  const lines = r.out.split('\n');
  const shown = lines.filter(l => !l.startsWith(TEST)).join('\n');
  let html = esc(shown.replace(/\n$/,''));
  if(!r.ok){ html += (html?'\n':'') + `<span class="err">${esc(r.err)}</span>`; const f = friendly(r.err); if(f) html += `<span class="hint">Hint: ${esc(f)}</span>`; }
  if(!html) html = '<span style="color:var(--code-muted)">(no output)</span>';
  pre.innerHTML = html;
  return lines.filter(l => l.startsWith(TEST)).map(l => { const p = l.slice(TEST.length).split('\u00a7'); return {name:p[0], pass:p[1] === 'True'}; });
}
const outText = raw => raw.split('\n').filter(l => !l.startsWith(TEST)).join('\n').replace(/[ \t]+$/gm,'').trim();
const normOut = s => String(s).replace(/\r/g,'').split('\n').map(l => l.trim().replace(/\s+/g,' ')).join('\n').trim().toLowerCase();
function outCheck(printed, t){
  const p = normOut(printed);
  if(t.output !== undefined) return p === normOut(t.output);
  if(t.contains !== undefined) return [].concat(t.contains).every(c => p.includes(normOut(c)));
  if(t.lines !== undefined) return p.split('\n').length === t.lines;
  return false;
}
const testCode = tests => '\n\n' + tests.map(t =>
  `try:\n    __ok = bool(${t.expr})\nexcept Exception:\n    __ok = False\nprint("${TEST}${t.label.replace(/"/g,'\\"')}\u00a7" + str(__ok))`).join('\n');

/* ---------------- code editor ---------------- */
function editor(sel, start, opts){
  const h = host(sel); opts = opts || {};
  h.innerHTML = `
    <div class="editor"><div class="gutter" aria-hidden="true"></div><textarea spellcheck="false" autocapitalize="off" autocomplete="off"${opts.id?` id="${opts.id}"`:''} aria-label="Python code editor"></textarea></div>
    ${opts.inputs !== undefined ? `<label class="inbox"><span>⌨ Inputs <small>typed in order, separated by commas</small></span><input class="inputs" value="${esc(opts.inputs)}" spellcheck="false" autocomplete="off"></label>` : ''}
    <div class="bar"><button class="btn primary run">▶ Run</button>${opts.tests?'<button class="btn mark check">✓ Check my code</button>':''}<button class="btn reset">Reset code</button><span class="status"></span></div>
    <div class="out-label">Output</div><pre class="out" aria-live="polite"></pre>
    ${opts.tests?'<ul class="tests" aria-live="polite"></ul>':''}`;
  const ta = $('textarea', h), gut = $('.gutter', h), pre = $('pre', h), st = $('.status', h);
  const inputList = () => { const i = $('.inputs', h); return i ? i.value.split(',').map(x => x.trim()).filter(x => x !== '') : null; };
  let original = start;
  const sync = () => { const n = ta.value.split('\n').length; gut.textContent = Array.from({length:n},(_,i)=>i+1).join('\n'); gut.scrollTop = ta.scrollTop; };
  ta.value = start; sync();
  ta.addEventListener('input', sync);
  ta.addEventListener('scroll', () => gut.scrollTop = ta.scrollTop);
  ta.addEventListener('keydown', e => {
    if(e.key === 'Tab'){ e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); sync(); }
    if(e.key === 'Enter'){ const s = ta.selectionStart, line = ta.value.slice(0, s).split('\n').pop(); let ind = (line.match(/^ */)||[''])[0]; if(/:\s*$/.test(line)) ind += '    '; e.preventDefault(); ta.setRangeText('\n'+ind, s, ta.selectionEnd, 'end'); sync(); }
  });
  const go = async withTests => {
    st.textContent = 'Running…';
    const t = withTests && opts.tests ? opts.tests() : null;
    const exprT = t ? t.filter(x => x.expr) : [];
    const r = await runPython(ta.value + (exprT.length ? testCode(exprT) : ''), inputList());
    let res = showResult(pre, r); st.textContent = '';
    if(t){ const ul = $('.tests', h);
      if(!r.ok && !t.some(x => x.inputs)){ ul.innerHTML = '<li class="fail">Fix the error first, then check again.</li>'; return; }
      const printed = outText(r.out);
      for(const x of t.filter(x => !x.expr)){
        if(x.inputs){ st.textContent = 'Checking…'; const rr = await runPython(ta.value, x.inputs);
          res.push({name: x.label + (x.inputs.length ? `  (inputs: ${x.inputs.join(', ')})` : ''), pass: rr.ok && outCheck(outText(rr.out), x)}); }
        else res.push({name:x.label, pass: r.ok && outCheck(printed, x)});
      }
      st.textContent = '';
      ul.innerHTML = res.map(x => `<li class="${x.pass?'pass':'fail'}">${x.pass?'✓':'✗'} ${esc(x.name)}</li>`).join('');
      if(res.length && res.every(x => x.pass)) ul.insertAdjacentHTML('beforeend', '<li class="pass">All tests passed.</li>');
    }
  };
  $('.run', h).onclick = () => go(false);
  if(opts.tests) $('.check', h).onclick = () => go(true);
  $('.reset', h).onclick = () => { ta.value = original; sync(); pre.textContent = ''; const ul = $('.tests', h); if(ul) ul.innerHTML = ''; };
  return { set(code){ original = code; ta.value = code; sync(); pre.textContent=''; const ul = $('.tests', h); if(ul) ul.innerHTML=''; }, get value(){ return ta.value; } };
}

/* ---------------- ask widget: choice / check-in / typed ---------------- */
const CHECKIN = ['All correct','Partly done','Stuck'];
const WIDGETS = {};
const norm = (t, mono) => { let s = String(t).trim().toLowerCase().replace(/\s+/g,' '); return mono ? s.replace(/\s+/g,'') : s; };
function askWidget(sel, id, q){
  const h = host(sel);
  const type = q.type || 'choice';
  const opts = type === 'checkin' ? CHECKIN : (q.opts || []);
  const correct = type === 'checkin' ? -1 : (q.correct === undefined ? -1 : q.correct);
  const L = i => 'ABCDEF'[i];
  const marked = type === 'text' ? !!(q.accept && q.accept.length) : correct >= 0;
  const openLabel = 'Open on devices';
  const revealLabel = type === 'text' ? 'Show answers' : 'Reveal answer';

  h.innerHTML = type === 'text' ? `
    <div class="hidden-until" id="veil-${id}"><b class="rcount">0</b><span>answers in · hidden until you show them</span></div>
    <div class="resp" hidden></div>
    <div class="accepted" hidden></div>
    <div class="bar">${marked?`<button class="btn mark reveal">${revealLabel}</button>`:''}<button class="btn peek">Peek</button><button class="btn resetv">Clear answers</button><span class="pct"></span></div>
    <div class="livebar"><button class="btn primary lopen">${openLabel}</button><button class="btn lclose">Close</button><span class="pill closed lstate">Not open</span><span class="small muted"><span class="count lcount">0</span> answers</span></div>`
  : `
    <div class="options">${opts.map((o,i)=>`
      <div class="opt-wrap"><button class="opt" data-i="${i}" aria-label="Add a hand-count vote for option ${L(i)}"><span class="letter">${L(i)}</span><pre>${esc(o)}</pre><span class="tally">0<span class="split"></span></span><span class="votebar"><i></i></span></button><button class="minus" data-i="${i}" aria-label="Remove a hand-count vote from ${L(i)}">−</button></div>`).join('')}</div>
    <div class="bar">${marked?`<button class="btn mark reveal">${revealLabel}</button>`:''}<button class="btn peek">Peek</button><button class="btn resetv">Reset votes</button><span class="pct"></span><span class="status handhint"><span class="rcount">0</span> in · numbers stay hidden until you reveal</span></div>
    <div class="livebar"><button class="btn primary lopen">${openLabel}</button><button class="btn lclose">Close</button><span class="pill closed lstate">Not open</span><span class="small muted"><span class="count lcount">0</span> device votes</span></div>`;

  const manual = opts.map(()=>0);
  let live = opts.map(()=>0), texts = {}, revealed = false, peek = false;

  function totals(){ return manual.map((m,i)=>m+live[i]); }
  function textGroups(){
    const g = {};
    Object.entries(texts).forEach(([u,t]) => { const k = norm(t, q.mono); (g[k] = g[k] || {text:t, n:0, uids:[]}); g[k].n++; g[k].uids.push(u); });
    return Object.values(g).sort((a,b)=>b.n-a.n);
  }
  const isRight = t => (q.accept||[]).some(a => norm(a, q.mono) === norm(t, q.mono));

  function draw(){
    const show = revealed || peek;
    if(type === 'text'){
      const groups = textGroups(), all = Object.keys(texts).length;
      $('.rcount', h).textContent = all;
      $('.lcount', h).textContent = all;
      $('#veil-'+id, h).hidden = show;
      const box = $('.resp', h); box.hidden = !show;
      box.innerHTML = groups.map(g => `<div class="rcard ${marked ? (isRight(g.text)?'ok':'no') : ''}" data-k="${esc(g.uids.join(','))}"><span>${esc(g.text)||'(blank)'}</span><span>${g.n>1?`<span class="cnt">×${g.n}</span>`:''}<button class="x" title="Hide this answer" aria-label="Hide this answer">✕</button></span></div>`).join('') || '<p class="small muted">No answers yet.</p>';
      $$('.rcard .x', h).forEach(b => b.onclick = () => { const uids = b.closest('.rcard').dataset.k.split(','); uids.forEach(u => { delete texts[u]; Live.deleteAnswer(id, u); }); draw(); });
      const acc = $('.accepted', h);
      acc.hidden = !(marked && revealed); acc.innerHTML = marked ? `Accepted: ${q.accept.map(a=>`<code>${esc(a)}</code>`).join(' · ')}` : '';
      if(marked && show && all){ const right = Object.values(texts).filter(isRight).length; $('.pct', h).textContent = `${Math.round(right/all*100)}% correct (${right} of ${all})`; }
      else $('.pct', h).textContent = '';
    } else {
      const tot = totals(), all = tot.reduce((a,b)=>a+b,0), max = Math.max(1, ...tot);
      $$('.opt', h).forEach((b,i) => {
        const t = $('.tally', b);
        t.classList.toggle('veiled', !show);
        t.firstChild.textContent = show ? tot[i] : '';
        $('.split', t).textContent = (show && document.body.classList.contains('live') && manual[i]) ? `${live[i]} + ${manual[i]} hands` : '';
        $('.votebar i', b).style.width = show ? (tot[i]/max*100)+'%' : '0%';
      });
      $('.rcount', h).textContent = all;
      $('.lcount', h).textContent = live.reduce((a,b)=>a+b,0);
      $('.pct', h).textContent = (show && correct >= 0 && all) ? `${Math.round(tot[correct]/all*100)}% correct (${tot[correct]} of ${all})` : '';
    }
    if(window.Results) Results.refresh();
  }

  if(type !== 'text'){
    $$('.opt', h).forEach(b => b.onclick = () => { manual[+b.dataset.i]++; draw(); });
    $$('.minus', h).forEach(b => b.onclick = () => { const i = +b.dataset.i; manual[i] = Math.max(0, manual[i]-1); draw(); });
  }
  const peekBtn = $('.peek', h);
  peekBtn.onclick = () => { peek = !peek; peekBtn.setAttribute('aria-pressed', peek); peekBtn.textContent = peek ? 'Hide' : 'Peek'; draw(); };
  if(marked) $('.reveal', h).onclick = () => {
    revealed = true;
    if(type !== 'text') $$('.opt', h).forEach((b,i) => b.classList.add(i === correct ? 'right' : 'wrong'));
    draw();
    Live.reveal(id, type === 'text' ? {a:q.accept, mono:!!q.mono} : {c:correct});
  };
  $('.resetv', h).onclick = () => {
    manual.fill(0); texts = {}; revealed = false; peek = false; peekBtn.textContent = 'Peek'; peekBtn.setAttribute('aria-pressed', false);
    if(type !== 'text') $$('.opt', h).forEach(b => b.classList.remove('right','wrong'));
    draw(); Live.clear(id);
  };
  $('.lopen', h).onclick = () => Live.open(id, {id, title:q.title, code:q.code||'', type, options:opts, placeholder:q.placeholder||'', mono:!!q.mono, marked});
  $('.lclose', h).onclick = () => Live.close();

  WIDGETS[id] = {
    setLive(arr, txt){ if(type === 'text'){ texts = txt || {}; } else { live = opts.map((_,i)=>arr[i]||0); } draw(); },
    setState(active, open){ const me = active === id, st = $('.lstate', h);
      st.className = 'pill lstate ' + (me&&open ? 'open' : 'closed');
      st.textContent = me&&open ? (type==='text' ? 'Open: students can type' : 'Open: students can vote') : me ? 'Closed' : 'Not open';
      $('.lopen', h).disabled = me&&open; $('.lclose', h).disabled = !(me&&open); },
    redraw: draw,
    meta: {id, title:q.title, opts, correct, type, marked, host:h, accept:q.accept, mono:q.mono},
    totals,
    texts(){ return texts; },
    isRight
  };
  WIDGETS[id].setState('', false);
  draw();
}

/* ---------------- trace ---------------- */
function trace(sel, cfg){
  const h = host(sel);
  h.innerHTML = `
    <div class="cols">
      <div class="panel">
        ${cfg.legend !== false ? `<div class="scopekey"><span class="chip g">global · main program</span><span class="chip l">local · ${esc(cfg.localLabel||'inside the function')}</span></div>` : ''}
        ${cfg.vc ? scopeCode(cfg.code, null, cfg.localLines||[], cfg.vc) : codeBlock(cfg.code)}
        <div class="bar"><button class="btn primary trun">▶ Run program</button></div>
        <div class="out-label">Output</div><pre class="out trout"></pre>
      </div>
      <div class="panel">
        <h3>Step through (trace)</h3>
        <div class="bar"><button class="btn tback">← Back</button><button class="btn mark tstep">Next step →</button><button class="btn treset">Restart</button><span class="status tpos"></span></div>
        <div class="trace">
          <div><div class="out-label g">Global variables · main program</div><table class="vars g tG"></table></div>
          <div><div class="out-label l">Local variables · ${esc(cfg.localLabel||'inside the function')}</div><table class="vars l tL"></table></div>
        </div>
        <div class="out-label">Output so far</div><pre class="out tout"></pre>
        <div class="out-label">What is happening</div>
        <div class="say tsay" aria-live="polite">Press <b>Next step</b> to follow Python line by line.</div>
      </div>
    </div>`;
  const code = $('.code', h), steps = cfg.steps;
  let i = -1;
  const table = (obj, nw) => { if(!obj) return '<tr><td style="font-family:var(--body);color:var(--muted)">(not running)</td></tr>';
    const k = Object.keys(obj); if(!k.length) return '<tr><td style="font-family:var(--body);color:var(--muted)">(none yet)</td></tr>';
    return '<tr><th>name</th><th>value</th></tr>' + k.map(n => `<tr><td${(nw||[]).includes(n)?' class="new"':''}>${n}</td><td${(nw||[]).includes(n)?' class="new"':''}>${obj[n]}</td></tr>`).join(''); };
  function drawT(){
    $$('.ln', code).forEach(x => x.classList.remove('hl'));
    if(i < 0){ $('.tsay', h).innerHTML = 'Press <b>Next step</b> to follow Python line by line.'; $('.tG', h).innerHTML = table({}); $('.tL', h).innerHTML = table(null); $('.tout', h).textContent = ''; $('.tpos', h).textContent = ''; $('.tback', h).disabled = true; $('.tstep', h).disabled = false; return; }
    const s = steps[i];
    const line = $(`.ln[data-l="${s.l}"]`, code); if(line) line.classList.add('hl');
    $('.tsay', h).innerHTML = `<b>Line ${s.l}:</b> ${s.say}`;
    $('.tG', h).innerHTML = table(s.g, s.nw); $('.tL', h).innerHTML = table(s.loc, s.nw);
    $('.tout', h).textContent = s.out; $('.tpos', h).textContent = `Step ${i+1} of ${steps.length}`;
    $('.tstep', h).disabled = i >= steps.length-1; $('.tback', h).disabled = i <= 0;
  }
  $('.tstep', h).onclick = () => { if(i < steps.length-1){ i++; drawT(); } };
  $('.tback', h).onclick = () => { if(i > 0){ i--; drawT(); } };
  $('.treset', h).onclick = () => { i = -1; drawT(); };
  $('.trun', h).onclick = async () => { const o = $('.trout', h); o.textContent = 'Running…'; showResult(o, await runPython(cfg.code)); };
  drawT();
}

/* ---------------- parsons ---------------- */
function parsons(sel, cfg){
  const h = host(sel);
  h.innerHTML = `
    <div class="parsons">
      <div class="zone bankz" aria-label="Line bank"><h3>Line bank</h3></div>
      <div class="zone progz" aria-label="Your program"><h3>Your program</h3></div>
    </div>
    <div class="bar"><button class="btn mark pcheck">✓ Check order</button><button class="btn primary prun">▶ Run my program</button><button class="btn pshuffle">Start again</button></div>
    <div class="pfb" aria-live="polite"></div>
    <pre class="out pout" hidden></pre>`;
  let state = {bank:[], prog:[]};
  function setup(){
    const lv = document.body.dataset.level;
    let pool = cfg.lines.map(l => ({...l}));
    if(lv === 'stretch' && cfg.distract) pool = pool.concat(cfg.distract.map(l => ({...l})));
    pool.forEach(l => l.cur = (lv === 'support') ? l.ind : 0);
    for(let i = pool.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [pool[i],pool[j]] = [pool[j],pool[i]]; }
    if(pool.map(p=>p.id).join('') === cfg.order.join('')) pool.reverse();
    state = {bank:pool, prog:[]};
    $('.pfb', h).innerHTML = ''; $('.pout', h).hidden = true; draw();
  }
  function draw(){
    const lv = document.body.dataset.level, bank = $('.bankz', h), prog = $('.progz', h);
    bank.innerHTML = '<h3>Line bank</h3>' + (state.bank.length ? '' : '<p class="small muted">All lines used.</p>');
    state.bank.forEach((l,i) => { const b = document.createElement('button'); b.className = 'pline bank';
      b.innerHTML = `<span class="txt">${hl(' '.repeat(lv==='support'?l.ind*4:0) + l.t)}</span>`;
      b.setAttribute('aria-label', 'Add line: ' + l.t);
      b.onclick = () => { state.prog.push(state.bank.splice(i,1)[0]); $('.pfb', h).innerHTML=''; draw(); };
      bank.appendChild(b); });
    prog.innerHTML = '<h3>Your program</h3>' + (state.prog.length ? '' : '<p class="small muted">Tap lines in the bank to add them here.</p>');
    state.prog.forEach((l,i) => {
      const d = document.createElement('div'); d.className = 'pline';
      d.innerHTML = `<span class="txt">${hl(' '.repeat(l.cur*4) + l.t)}</span>
        ${lv!=='support'?'<button data-a="out" aria-label="Remove indent">⇤</button><button data-a="in" aria-label="Indent">⇥</button>':''}
        <button data-a="up" aria-label="Move up">↑</button><button data-a="down" aria-label="Move down">↓</button><button data-a="del" aria-label="Back to bank">✕</button>`;
      d.onclick = e => { const a = e.target.dataset.a; if(!a) return;
        if(a === 'in') l.cur = Math.min(2, l.cur+1); if(a === 'out') l.cur = Math.max(0, l.cur-1);
        if(a === 'up' && i > 0) [state.prog[i-1], state.prog[i]] = [state.prog[i], state.prog[i-1]];
        if(a === 'down' && i < state.prog.length-1) [state.prog[i+1], state.prog[i]] = [state.prog[i], state.prog[i+1]];
        if(a === 'del') state.bank.push(state.prog.splice(i,1)[0]);
        $('.pfb', h).innerHTML = ''; draw(); };
      prog.appendChild(d); });
  }
  const source = () => state.prog.map(l => ' '.repeat(l.cur*4) + l.t).join('\n');
  $('.pcheck', h).onclick = () => {
    const els = $$('.progz .pline', h); let right = 0, indBad = 0;
    state.prog.forEach((l,i) => { const want = cfg.order[i], e = els[i]; e.classList.remove('ok','bad','indent-bad');
      if(l.id === want && l.cur === l.ind){ e.classList.add('ok'); right++; }
      else if(l.id === want){ e.classList.add('indent-bad'); indBad++; }
      else e.classList.add('bad'); });
    const n = cfg.order.length, fb = $('.pfb', h);
    if(right === n && state.prog.length === n) fb.innerHTML = '<div class="feedback good">Correct! Now run it to see the output.</div>';
    else if(state.prog.length < n) fb.innerHTML = `<div class="feedback mid">${right} of ${n} lines are correct so far. Keep adding lines.</div>`;
    else fb.innerHTML = `<div class="feedback ${right>=3?'mid':'bad'}">${right} of ${n} lines are in the right place${indBad?` · ${indBad} ${indBad>1?'lines need':'line needs'} the indentation fixing (amber)`:''}${state.prog.length>n?' · there are extra lines in your program':''}.</div>`;
  };
  $('.prun', h).onclick = async () => { const o = $('.pout', h); o.hidden = false; o.textContent = 'Running…'; showResult(o, await runPython(source())); };
  $('.pshuffle', h).onclick = setup;
  onLevel(setup); setup();
}

/* ---------------- fill the gaps ---------------- */
function gaps(sel, cfg){
  const h = host(sel);
  const rendered = cfg.template.split('\n').map(line => {
    let out = hl(line);
    cfg.gaps.forEach((g,i) => { out = out.replace(`__G${i}__`, `<input data-g="${i}" aria-label="Gap ${i+1}" autocomplete="off" autocapitalize="off" spellcheck="false">`); });
    return out;
  }).join('\n');
  h.innerHTML = `
    <div class="gapcode">${rendered}</div>
    ${cfg.bank ? `<div data-show="support"><p class="small" style="margin-bottom:6px"><span class="tier support">Support</span>Tap a gap, then tap a word. Some words are not needed.</p><div class="bank-words">${cfg.bank.slice().sort().map(w=>`<button class="word" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>` : ''}
    <div class="bar"><button class="btn mark gcheck">✓ Check answers</button><button class="btn primary grun">▶ Run it</button><button class="btn ghint" data-show="core">Show a hint</button><button class="btn gclear">Clear</button></div>
    <div class="gfb" aria-live="polite"></div>
    <pre class="out gout" hidden></pre>`;
  const ins = $$('.gapcode input', h);
  let selected = null;
  ins.forEach(inp => { inp.addEventListener('focus', () => { ins.forEach(x => x.classList.remove('sel')); inp.classList.add('sel'); selected = inp; });
    inp.addEventListener('input', () => inp.classList.remove('ok','bad')); });
  $$('.word', h).forEach(b => b.onclick = () => { const t = selected || ins.find(x => !x.value); if(!t) return; t.value = b.dataset.w; t.classList.remove('ok','bad'); const nx = ins.find(x => !x.value); if(nx) nx.focus(); });
  $('.gcheck', h).onclick = () => { let r = 0;
    ins.forEach((inp,i) => { const ok = inp.value.trim() === cfg.gaps[i].a; inp.classList.toggle('ok', ok); inp.classList.toggle('bad', !ok); if(ok) r++; });
    $('.gfb', h).innerHTML = `<div class="feedback ${r===ins.length?'good':r>=ins.length/2?'mid':'bad'}">${r} of ${ins.length} correct${r===ins.length?'. Now run it!':'. Red gaps need another look.'}</div>`; };
  $('.ghint', h).onclick = () => { const i = ins.findIndex((inp,k) => inp.value.trim() !== cfg.gaps[k].a);
    $('.gfb', h).innerHTML = i < 0 ? '<div class="feedback good">All the gaps are correct.</div>' : `<div class="feedback mid">Gap ${i+1}: ${esc(cfg.gaps[i].hint)}</div>`; };
  $('.gclear', h).onclick = () => { ins.forEach(x => { x.value=''; x.classList.remove('ok','bad'); }); $('.gfb', h).innerHTML=''; $('.gout', h).hidden = true; };
  $('.grun', h).onclick = async () => { const o = $('.gout', h); o.hidden = false; o.textContent = 'Running…';
    showResult(o, await runPython(cfg.build(ins.map(x => x.value.trim() || '___')))); };
}

/* ---------------- annotate ---------------- */
function annotate(sel, cfg){
  const h = host(sel);
  h.innerHTML = `
    <div class="annot">
      <div class="panel"><h3>The code</h3><div class="alist arows"></div></div>
      <div class="panel"><h3>Annotations</h3><div class="alist abank"></div>
        <div class="bar"><button class="btn mark acheck">✓ Check</button><button class="btn areveal">Reveal answers</button><button class="btn areset">Start again</button></div>
        <div class="afb" aria-live="polite"></div>
      </div>
    </div>`;
  let st = {slots:{}, bank:[], sel:null, given:[], all:[]};
  function setup(){
    const lv = document.body.dataset.level;
    const base = lv === 'stretch' && cfg.stretch ? cfg.stretch : cfg.items.filter(a => !a.lv || a.lv.includes(lv));
    let cards = base.map((a,i) => ({...a, id:'a'+i}));
    if(lv === 'stretch' && cfg.distract) cards = cards.concat(cfg.distract.map((d,i) => ({...d, line:0, id:'d'+i})));
    const givenLines = (lv === 'support' && cfg.given) ? cfg.given : [];
    const given = cards.filter(c => givenLines.includes(c.line));
    st = {slots:{}, sel:null, given:given.map(g=>g.line), bank:[], all:cards};
    given.forEach(g => st.slots[g.line] = g);
    let bank = cards.filter(c => !given.includes(c));
    for(let i = bank.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [bank[i],bank[j]] = [bank[j],bank[i]]; }
    st.bank = bank; $('.afb', h).innerHTML = ''; draw();
  }
  function draw(){
    const lines = cfg.code.split('\n'), needed = new Set(st.all.filter(c => c.line).map(c => c.line));
    $('.arows', h).innerHTML = lines.map((l,i) => { const n = i+1;
      if(!l.trim()) return `<div class="arow"><div class="acode"><i>${n}</i><span> </span></div><div></div></div>`;
      const c = st.slots[n], given = st.given.includes(n);
      const slot = !needed.has(n) ? '<div></div>' : `<button class="aslot ${c?(given?'given':'filled'):'empty'}${st.sel&&!c?' target':''}" data-line="${n}" ${given?'disabled':''} aria-label="Annotation for line ${n}">${c?c.text:'Tap to place an annotation'}</button>`;
      return `<div class="arow"><div class="acode"><i>${n}</i><span>${hl(l)}</span></div>${slot}</div>`; }).join('');
    $('.abank', h).innerHTML = st.bank.length ? st.bank.map(c => `<button class="acard" data-id="${c.id}" aria-pressed="${st.sel===c.id}"><span>${c.text}</span></button>`).join('') : '<p class="small muted">All annotations placed. Press Check.</p>';
    $$('.abank .acard', h).forEach(b => b.onclick = () => { st.sel = st.sel === b.dataset.id ? null : b.dataset.id; draw(); });
    $$('.arows .aslot', h).forEach(b => b.onclick = () => { const n = +b.dataset.line, cur = st.slots[n];
      if(st.sel){ const k = st.bank.findIndex(c => c.id === st.sel); const card = st.bank.splice(k,1)[0]; if(cur) st.bank.push(cur); st.slots[n] = card; st.sel = null; }
      else if(cur){ st.bank.push(cur); delete st.slots[n]; }
      $('.afb', h).innerHTML = ''; draw(); });
  }
  $('.acheck', h).onclick = () => { let r = 0, t = 0;
    $$('.arows .aslot', h).forEach(b => { const n = +b.dataset.line; if(st.given.includes(n)) return; t++;
      const c = st.slots[n]; b.classList.remove('ok','bad'); if(!c) return; if(c.line === n){ b.classList.add('ok'); r++; } else b.classList.add('bad'); });
    const left = st.bank.filter(c => c.line).length;
    $('.afb', h).innerHTML = `<div class="feedback ${r===t?'good':r>=t/2?'mid':'bad'}">${r} of ${t} correct${r===t?'. Well done!':left?'. Some annotations still need placing.':'. The red ones need to be swapped.'}</div>`; };
  $('.areveal', h).onclick = () => { st.bank = st.all.filter(c => !c.line); st.slots = {}; st.all.filter(c => c.line).forEach(c => st.slots[c.line] = c); st.sel = null; draw(); $('.acheck', h).click(); };
  $('.areset', h).onclick = setup;
  onLevel(setup); setup();
}

/* ---------------- sorter (two categories) ---------------- */
function sorter(sel, cfg){
  const h = host(sel);
  h.innerHTML = `<div class="srows"></div>
    <div class="bar" style="margin-top:8px"><button class="btn mark scheck">✓ Check</button><button class="btn sreset">Start again</button></div>
    <div class="sfb" aria-live="polite"></div>`;
  function setup(){
    const lv = document.body.dataset.level;
    const items = cfg.items.filter(x => !x.lv || x.lv === lv);
    $('.srows', h).innerHTML = items.map(x => `<div class="sortrow${cfg.plain?' plain':''}" data-n="${esc(x.name)}">${cfg.plain?`<span class="sname">${esc(x.name)}</span>`:`<code>${esc(x.name)}</code>`}<div class="seg" role="group" aria-label="Category for ${esc(x.name)}">${cfg.cats.map(c=>`<button data-s="${c.id}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div><span class="why"></span></div>`).join('');
    $$('.srows .seg button', h).forEach(b => b.onclick = () => { $$('button', b.parentElement).forEach(x => x.setAttribute('aria-pressed', x === b)); const r = b.closest('.sortrow'); r.classList.remove('ok','bad'); $('.why', r).textContent = ''; });
    $('.sfb', h).innerHTML = '';
  }
  $('.scheck', h).onclick = () => { let r = 0, n = 0;
    $$('.srows .sortrow', h).forEach(row => { n++; const it = cfg.items.find(x => x.name === row.dataset.n); const p = $('button[aria-pressed="true"]', row); row.classList.remove('ok','bad');
      if(!p){ $('.why', row).textContent = 'Choose an answer.'; return; }
      const ok = p.dataset.s === it.cat; row.classList.add(ok ? 'ok' : 'bad'); if(ok) r++;
      $('.why', row).textContent = ok ? it.why : (cfg.wrongHint || 'Not quite. Look at where it is created.'); });
    $('.sfb', h).innerHTML = `<div class="feedback ${r===n?'good':r>=n/2?'mid':'bad'}">${r} of ${n} correct${r===n?'!':''}</div>`; };
  $('.sreset', h).onclick = setup;
  onLevel(setup); setup();
}

/* ---------------- bug hunt ---------------- */
/* cfg: {code, bugs:[{line, what}], tests:[{label, output|contains}], fixed} */
function bugHunt(sel, cfg){
  const h = host(sel);
  const lines = cfg.code.split('\n');
  h.innerHTML = `
    <p class="small"><b>1.</b> Tap every line you think has a mistake. <b>2.</b> Press <b>Check</b>. <b>3.</b> Fix the code below and run it.</p>
    <div class="code bugcode">${lines.map((l,i)=>`<button class="ln bugln" data-l="${i+1}" aria-pressed="false"><i>${i+1}</i><span>${hl(l)||' '}</span><em class="flag" aria-hidden="true"></em></button>`).join('')}</div>
    <div class="bar"><button class="btn mark bcheck">✓ Check</button><button class="btn breveal">Show the bugs</button><button class="btn breset">Clear</button><span class="status bcount"></span></div>
    <div class="bfb" aria-live="polite"></div>
    <div class="bfix"></div>`;
  const bugLines = cfg.bugs.map(b => b.line);
  $$('.bugln', h).forEach(b => b.onclick = () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); b.classList.remove('found','missed','wrongflag'); $('.bfb', h).innerHTML=''; count(); });
  const count = () => { const n = $$('.bugln[aria-pressed="true"]', h).length; $('.bcount', h).textContent = `${n} line${n===1?'':'s'} flagged · ${cfg.bugs.length} bug${cfg.bugs.length===1?'':'s'} to find`; };
  function mark(reveal){
    let found = 0, wrong = 0;
    $$('.bugln', h).forEach(b => { const n = +b.dataset.l, on = b.getAttribute('aria-pressed') === 'true', isBug = bugLines.includes(n);
      b.classList.remove('found','missed','wrongflag');
      if(isBug && (on || reveal)){ b.classList.add('found'); if(on) found++; }
      else if(isBug) b.classList.add('missed');
      else if(on){ b.classList.add('wrongflag'); wrong++; } });
    const list = cfg.bugs.filter(b => reveal || $(`.bugln[data-l="${b.line}"]`, h).getAttribute('aria-pressed') === 'true')
      .map(b => `<li><b>Line ${b.line}:</b> ${b.what}</li>`).join('');
    $('.bfb', h).innerHTML = (reveal ? '' : `<div class="feedback ${found===cfg.bugs.length&&!wrong?'good':found?'mid':'bad'}">You found ${found} of ${cfg.bugs.length} bugs${wrong?` · ${wrong} line${wrong>1?'s were':' was'} fine (grey)`:''}${found<cfg.bugs.length?'. Keep looking!':'!'}</div>`)
      + (list ? `<ul class="buglist">${list}</ul>` : '');
  }
  $('.bcheck', h).onclick = () => mark(false);
  $('.breveal', h).onclick = () => mark(true);
  $('.breset', h).onclick = () => { $$('.bugln', h).forEach(b => { b.setAttribute('aria-pressed', false); b.classList.remove('found','missed','wrongflag'); }); $('.bfb', h).innerHTML=''; count(); };
  count();
  editor($('.bfix', h), cfg.code, {id: cfg.id, tests: cfg.tests ? () => cfg.tests : null});
}

/* ---------------- loop trace table ---------------- */
/* cfg: {code, cols:['i','total'], steps:[{l, say, set:{col:val}, row:true, out:'text'}]}
   row:true starts a new row in the table; set fills cells in the current row; out adds to the output column. */
function loopTrace(sel, cfg){
  const h = host(sel);
  const cols = cfg.cols.concat(['output']);
  h.innerHTML = `
    <div class="cols">
      <div class="panel">
        ${codeBlock(cfg.code)}
        <div class="bar"><button class="btn primary lrun">▶ Run program</button></div>
        <div class="out-label">Output</div><pre class="out lout"></pre>
      </div>
      <div class="panel">
        <h3>Trace table</h3>
        <div class="bar"><button class="btn lback">← Back</button><button class="btn mark lstep">Next step →</button><button class="btn lreset">Restart</button><button class="btn lall">Fill it in</button><span class="status lpos"></span></div>
        <div class="ttwrap"><table class="ttable"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
        <div class="out-label">What is happening</div>
        <div class="say lsay" aria-live="polite">Press <b>Next step</b>. Each loop adds a new row to the table.</div>
      </div>
    </div>`;
  const code = $('.code', h), steps = cfg.steps;
  let i = -1;
  function build(upto){
    const rows = []; let cur = null, lastCell = null;
    for(let k = 0; k <= upto; k++){ const s = steps[k];
      if(s.row || !cur){ cur = {}; rows.push(cur); }
      lastCell = null;
      Object.entries(s.set || {}).forEach(([c,v]) => { cur[c] = v; lastCell = [rows.length-1, c]; });
      if(s.out !== undefined){ cur.output = (cur.output ? cur.output + ' / ' : '') + s.out; lastCell = [rows.length-1, 'output']; }
    }
    return {rows, lastCell};
  }
  function draw(){
    $$('.ln', code).forEach(x => x.classList.remove('hl'));
    const tb = $('tbody', h);
    if(i < 0){ tb.innerHTML = `<tr>${cols.map(()=>'<td>&nbsp;</td>').join('')}</tr>`; $('.lsay', h).innerHTML = 'Press <b>Next step</b>. Each loop adds a new row to the table.'; $('.lpos', h).textContent=''; $('.lback', h).disabled = true; $('.lstep', h).disabled = false; return; }
    const s = steps[i], {rows, lastCell} = build(i);
    const ln = $(`.ln[data-l="${s.l}"]`, code); if(ln) ln.classList.add('hl');
    tb.innerHTML = rows.map((r,ri) => `<tr${ri===rows.length-1?' class="currow"':''}>${cols.map(c => `<td${lastCell && lastCell[0]===ri && lastCell[1]===c ? ' class="new"' : ''}>${r[c]!==undefined ? esc(String(r[c])) : ''}</td>`).join('')}</tr>`).join('');
    $('.lsay', h).innerHTML = `<b>Line ${s.l}:</b> ${s.say}`;
    $('.lpos', h).textContent = `Step ${i+1} of ${steps.length}`;
    $('.lback', h).disabled = i <= 0; $('.lstep', h).disabled = i >= steps.length-1;
  }
  $('.lstep', h).onclick = () => { if(i < steps.length-1){ i++; draw(); } };
  $('.lback', h).onclick = () => { if(i > 0){ i--; draw(); } };
  $('.lreset', h).onclick = () => { i = -1; draw(); };
  $('.lall', h).onclick = () => { i = steps.length-1; draw(); };
  $('.lrun', h).onclick = async () => { const o = $('.lout', h); o.textContent = 'Running…'; showResult(o, await runPython(cfg.code)); };
  draw();
}

/* ---------------- range() explorer ---------------- */
function rangeExplorer(sel, cfg){
  const h = host(sel); cfg = cfg || {};
  h.innerHTML = `
    <div class="rx">
      <div class="rxcode" aria-live="polite"></div>
      <div class="rxin">
        <label>start <input type="number" class="rstart" value="${cfg.start ?? 0}"></label>
        <label>stop <input type="number" class="rstop" value="${cfg.stop ?? 5}"></label>
        <label>step <input type="number" class="rstep" value="${cfg.step ?? 1}"></label>
        <span class="seg rxmode" role="group" aria-label="How many numbers to write in range()">
          <button data-m="1">range(stop)</button><button data-m="2">range(start, stop)</button><button data-m="3">range(start, stop, step)</button></span>
      </div>
      <div class="rxboxes" aria-live="polite"></div>
      <p class="rxnote small"></p>
    </div>`;
  let mode = cfg.mode || 1;
  function draw(){
    const sEl = $('.rstart', h), eEl = $('.rstop', h), pEl = $('.rstep', h);
    sEl.closest('label').hidden = mode < 2; pEl.closest('label').hidden = mode < 3;
    $$('.rxmode button', h).forEach(b => b.setAttribute('aria-pressed', +b.dataset.m === mode));
    const start = mode >= 2 ? parseInt(sEl.value || '0', 10) : 0;
    const stop = parseInt(eEl.value || '0', 10);
    let step = mode >= 3 ? parseInt(pEl.value || '1', 10) : 1;
    const args = mode === 1 ? `${stop}` : mode === 2 ? `${start}, ${stop}` : `${start}, ${stop}, ${step}`;
    $('.rxcode', h).innerHTML = codeBlock(`for i in range(${args}):\n    print(i)`);
    if(step === 0){ $('.rxboxes', h).innerHTML = ''; $('.rxnote', h).innerHTML = '<b>step can\'t be 0</b> — Python would give an error.'; return; }
    const vals = [];
    for(let v = start; step > 0 ? v < stop : v > stop; v += step){ vals.push(v); if(vals.length > 60) break; }
    $('.rxboxes', h).innerHTML = vals.length ? vals.slice(0,60).map((v,k)=>`<span class="rxbox" style="animation-delay:${Math.min(k,20)*40}ms"><small>loop ${k+1}</small><b>${v}</b></span>`).join('') + (vals.length > 60 ? '<span class="rxbox more">…</span>' : '') : '<span class="rxempty">No numbers — the loop never runs!</span>';
    $('.rxnote', h).innerHTML = vals.length
      ? `The loop runs <b>${vals.length > 60 ? '60+' : vals.length} time${vals.length===1?'':'s'}</b>. It starts at <b>${start}</b> and stops <b>before</b> ${stop}${step!==1?`, counting in steps of <b>${step}</b>`:''}.`
      : (step > 0 ? `start (${start}) is not smaller than stop (${stop}), so there is nothing to count.` : `With a negative step, start must be bigger than stop.`);
  }
  $$('input', h).forEach(x => x.addEventListener('input', draw));
  $$('.rxmode button', h).forEach(b => b.onclick = () => { mode = +b.dataset.m; draw(); });
  draw();
  return { set(o){ if(o.mode) mode = o.mode; if(o.start !== undefined) $('.rstart', h).value = o.start; if(o.stop !== undefined) $('.rstop', h).value = o.stop; if(o.step !== undefined) $('.rstep', h).value = o.step; draw(); } };
}

/* ---------------- live session (Firebase) ---------------- */
const Live = (() => {
  const st = {on:false, code:'', db:null, uid:'', active:'', open:false, joined:0, refs:[]};
  const cfgOK = () => !!(window.firebase && window.FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !/PASTE/i.test(FIREBASE_CONFIG.apiKey) && FIREBASE_CONFIG.databaseURL);
  const body = () => $('#liveBody');
  const joinURL = () => new URL(ROOT.replace(/\/?$/, '/') + 'vote.html', location.href).href.split(/[?#]/)[0] + '?room=' + st.code;
  function panel(msg){
    if(!cfgOK()){ body().innerHTML = '<p class="lmsg">Live answering isn\'t set up on this copy. Follow README.md to connect a free Firebase project. You can still count hands by tapping the options.</p>'; return; }
    if(!st.on){
      body().innerHTML = `${msg?`<p class="lmsg">${msg}</p>`:''}<p>Start a session so students can answer on their own devices. They join with a room code or QR code, and no names are collected.</p><div class="bar" style="margin-top:10px"><button class="btn primary" id="liveStart">Start a live session</button></div>`;
      $('#liveStart').onclick = start; return; }
    body().innerHTML = `<p class="small muted" style="text-align:center">Students go to the link or scan the code</p>
      <div class="roomcode">${st.code}</div><div class="qr" id="qr"></div><div class="joinurl">${esc(joinURL())}</div>
      <p style="text-align:center;margin-top:8px"><b id="joinedN">${st.joined}</b> devices joined</p>
      <p class="small muted" style="margin-top:8px">Press <b>Open on devices</b> on a question. Only one is open at a time. Students see how they did when you reveal; nobody sees the tallies before that.</p>
      <div class="bar" style="margin-top:10px;justify-content:center"><button class="btn" id="liveEnd">End session</button></div>`;
    try{ new QRCode($('#qr'), {text: joinURL(), width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M}); }catch(e){ const q = $('#qr'); if(q) q.remove(); }
    $('#liveEnd').onclick = end;
  }
  const makeCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for(let i=0;i<5;i++) c += A[Math.floor(Math.random()*A.length)]; return c; };
  async function start(){
    body().innerHTML = '<p>Connecting…</p>';
    try{
      if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const cred = await firebase.auth().signInAnonymously();
      st.uid = cred.user.uid; st.db = firebase.database();
      let code = '';
      for(let i=0;i<6;i++){ code = makeCode(); const snap = await st.db.ref('rooms/'+code).get(); if(!snap.exists()) break; }
      await st.db.ref('rooms/'+code).set({owner: st.uid, created: Date.now(), active:'', open:false, reveal:-1, lesson: (document.title||'')});
      st.code = code; st.on = true; document.body.classList.add('live'); $('#liveBtn').setAttribute('aria-pressed', true);
      const vref = st.db.ref(`rooms/${code}/votes`);
      const vcb = vref.on('value', snap => { const v = snap.val() || {};
        Object.keys(WIDGETS).forEach(q => { const raw = v[q] || {}; const arr = [0,0,0,0,0,0]; const txt = {};
          Object.entries(raw).forEach(([u,x]) => { if(typeof x === 'number'){ if(arr[x] !== undefined) arr[x]++; } else if(typeof x === 'string') txt[u] = x; });
          WIDGETS[q].setLive(arr, txt); }); });
      const jref = st.db.ref(`rooms/${code}/joined`);
      const jcb = jref.on('value', snap => { st.joined = snap.exists() ? Object.keys(snap.val()).length : 0; const n = $('#joinedN'); if(n) n.textContent = st.joined; dockLabel(); });
      st.refs = [[vref,vcb],[jref,jcb]];
      panel(); dockLabel(); Object.values(WIDGETS).forEach(w => w.redraw());
    }catch(e){ console.error(e); st.on = false; panel(`Couldn't start a session: ${esc(e.message||String(e))}. Check the Firebase setup in README.md.`); }
  }
  async function end(){
    st.refs.forEach(([r,cb]) => r.off('value', cb)); st.refs = [];
    try{ await st.db.ref('rooms/'+st.code).remove(); }catch(e){}
    st.on = false; st.code = ''; st.active = ''; st.open = false;
    document.body.classList.remove('live'); $('#liveBtn').setAttribute('aria-pressed', false);
    Object.values(WIDGETS).forEach(w => { w.setLive([], {}); w.setState('', false); }); panel(); dockLabel();
  }
  const states = () => Object.keys(WIDGETS).forEach(q => WIDGETS[q].setState(st.active, st.open));
  const dockLabel = () => { $('#dLive').textContent = st.on ? `Room ${st.code} · ${st.joined}` : ''; };
  const upd = obj => st.on ? st.db.ref('rooms/'+st.code).update(obj).catch(e => console.error(e)) : Promise.resolve();
  return {
    panel, get on(){ return st.on; },
    open(id, q){ if(!st.on){ togglePanel(true); return; } st.active = id; st.open = true; states(); upd({active:id, open:true, reveal:-1, revealed:false, question:q}); },
    close(){ if(!st.on) return; st.open = false; states(); upd({open:false}); },
    reveal(id, payload){ if(!st.on) return; const o = {['answers/'+id]: payload};
      if(st.active === id){ st.open = false; states(); o.open = false; o.revealed = true; if(payload.c !== undefined) o.reveal = payload.c; }
      upd(o); },
    clear(id){ if(!st.on) return; st.db.ref(`rooms/${st.code}/votes/${id}`).remove().catch(()=>{});
      const o = {['answers/'+id]: null}; if(st.active === id){ o.reveal = -1; o.revealed = false; } upd(o); },
    deleteAnswer(id, uid){ if(!st.on) return; st.db.ref(`rooms/${st.code}/votes/${id}/${uid}`).remove().catch(()=>{}); }
  };
})();

/* ---------------- results ---------------- */
const Results = (() => {
  let STAGES = [];
  const order = () => Object.values(WIDGETS)
    .map(w => ({w, st: STAGES.findIndex(s => w.meta.host.closest('#st-'+s.key))}))
    .sort((a,b) => a.st - b.st);
  function build(){
    let sumPct = 0, nq = 0; const lines = [];
    const rows = order().map(({w,st}) => {
      const m = w.meta, stage = STAGES[st] ? STAGES[st].label : '';
      if(m.type === 'text'){
        const txt = w.texts(), all = Object.keys(txt).length;
        if(!m.marked){ lines.push(`${stage} – ${m.title}: ${all} answers`);
          return `<div class="res-row${all?'':' empty'}"><span class="t">${esc(stage)} · ${esc(m.title)}</span><span class="m">${all} typed answer${all===1?'':'s'}</span></div>`; }
        const right = Object.values(txt).filter(w.isRight).length, pct = all ? Math.round(right/all*100) : 0;
        if(all){ sumPct += pct; nq++; }
        lines.push(`${stage} – ${m.title}: ${all?pct+'% correct ('+right+'/'+all+')':'no answers'}`);
        return `<div class="res-row${all?'':' empty'}"><span class="t">${esc(stage)} · ${esc(m.title)}</span><div class="res-bar"><i class="c" style="width:${pct}%"></i><i class="w" style="width:${all?100-pct:0}%"></i></div><span class="m">${all?`${pct}% correct · ${right} of ${all} typed`:'No answers yet'}</span></div>`;
      }
      const t = w.totals(), all = t.reduce((a,b)=>a+b,0);
      if(m.type === 'checkin'){
        lines.push(`${stage} check-in: ${t.map((c,i)=>CHECKIN[i]+' '+c).join(', ')}`);
        return `<div class="res-row${all?'':' empty'}"><span class="t">${esc(m.title)}</span><div class="res-bar">${t.map((c,i)=>`<i class="ci${i}" style="width:${all?c/all*100:0}%"></i>`).join('')}</div><span class="m">${all?t.map((c,i)=>`${CHECKIN[i]}: ${c}`).join(' · '):'No responses yet'}</span></div>`;
      }
      const c = t[m.correct], pct = all ? Math.round(c/all*100) : 0; if(all){ sumPct += pct; nq++; }
      lines.push(`${stage} – ${m.title}: ${all?pct+'% correct ('+c+'/'+all+')':'no responses'}`);
      return `<div class="res-row${all?'':' empty'}"><span class="t">${esc(stage)} · ${esc(m.title)}</span><div class="res-bar"><i class="c" style="width:${pct}%"></i><i class="w" style="width:${all?100-pct:0}%"></i></div><span class="m">${all?`${pct}% correct · ${c} of ${all}`:'No responses yet'}</span></div>`;
    }).join('');
    const avg = nq ? Math.round(sumPct/nq) : null;
    api.text = `${document.title} results (${new Date().toLocaleDateString()})\n` + (avg!==null?`Average correct: ${avg}% across ${nq} questions\n`:'') + lines.join('\n');
    return `<p class="small muted">Includes device answers and hand counts.</p>
      <p style="margin:8px 0"><span class="res-sum">${avg===null?'–':avg+'%'}</span> <span class="muted">average correct${nq?` across ${nq} question${nq>1?'s':''}`:''}</span></p>
      ${rows}<div class="bar" style="margin-top:10px"><button class="btn" id="resCopy">Copy summary</button><span class="status" id="resMsg"></span></div>`;
  }
  function bindCopy(){ const b = $('#resCopy'); if(b) b.onclick = async () => { try{ await navigator.clipboard.writeText(api.text); $('#resMsg').textContent = 'Copied.'; }catch(e){ $('#resMsg').textContent = 'Copy not allowed here. Select the text instead.'; } }; }
  let t = null;
  const api = { text:'',
    setStages(s){ STAGES = s; },
    refresh(){ if($('#resPanel').hidden) return; clearTimeout(t); t = setTimeout(() => { const sc = $('#resPanel').scrollTop; $('#resBody').innerHTML = build(); $('#resPanel').scrollTop = sc; bindCopy(); }, 60); },
    show(){ $('#resBody').innerHTML = build(); bindCopy(); } };
  return api;
})();
window.Results = Results;

/* ---------------- level ---------------- */
const levelSubs = [];
const onLevel = fn => levelSubs.push(fn);
function setLevel(lv){
  document.body.dataset.level = lv;
  $$('.seg[data-levels] button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lv === lv));
  levelSubs.forEach(fn => { try{ fn(lv); }catch(e){ console.error(e); } });
}

/* ---------------- shell ---------------- */
let ROOT = './', STAGES = [], cur = 0;
function togglePanel(force){
  const d = $('#livePanel'); const show = force === undefined ? d.hidden : force;
  if(show){ ['gloss','picker','resPanel'].forEach(x => $('#'+x).hidden = true); $('#glossBtn').setAttribute('aria-pressed', false); $('#pickBtn').setAttribute('aria-pressed', false); $('#resBtn').setAttribute('aria-pressed', false); Live.panel(); }
  d.hidden = !show;
}
function go(i){
  cur = Math.max(0, Math.min(STAGES.length-1, i));
  $$('.stage').forEach((s,k) => s.hidden = k !== cur);
  $$('.step').forEach((b,k) => { if(k === cur) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current'); });
  $('#prev').disabled = cur === 0; $('#next').disabled = cur === STAGES.length-1;
  $('#pos').textContent = `Stage ${cur+1} of ${STAGES.length}`;
  $('#dLabel').innerHTML = `${esc(STAGES[cur].label)} <span>${cur+1}/${STAGES.length}</span>`;
  $('#dPrev').disabled = cur === 0; $('#dNext').disabled = cur === STAGES.length-1;
  window.scrollTo({top:0});
}
function setPresent(on){
  document.body.classList.toggle('present', on);
  $('#presentBtn').setAttribute('aria-pressed', on);
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if(on && !fsEl){ const r = document.documentElement, f = r.requestFullscreen || r.webkitRequestFullscreen; if(f){ try{ const p = f.call(r); if(p && p.catch) p.catch(()=>{}); }catch(e){} } }
  if(!on && fsEl){ const x = document.exitFullscreen || document.webkitExitFullscreen; if(x){ try{ const p = x.call(document); if(p && p.catch) p.catch(()=>{}); }catch(e){} } }
  if(on) wakeDock();
  window.scrollTo({top:0});
}
let dockT; function wakeDock(){ const d = $('#dock'); d.classList.add('wake'); clearTimeout(dockT); dockT = setTimeout(() => d.classList.remove('wake'), 2500); }

function shell(cfg){
  const glossary = (cfg.glossary||[]).map(g => `<div><dt>${g.term}</dt><span class="ko">${esc(g.ko||'')}</span><dd>${g.def}</dd></div>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="top"><div class="wrap">
    <div class="top-row">
      <div class="brand"><h1>${esc(cfg.title)}</h1><span>${esc(cfg.subtitle||'')}</span></div>
      <div class="tools">
        <a class="tbtn" href="${ROOT}index.html" title="All lessons">☰ Lessons</a>
        <div class="seg" data-levels role="group" aria-label="Challenge level">
          <button data-lv="support" aria-pressed="false">Support</button><button data-lv="core" aria-pressed="true">Core</button><button data-lv="stretch" aria-pressed="false">Stretch</button>
        </div>
        <div class="timer" aria-label="Timer"><output id="tOut">3:00</output>
          <button data-min="1">1m</button><button data-min="3">3m</button><button data-min="5">5m</button><button id="tGo" aria-label="Start or pause timer">▶</button></div>
        <button class="tbtn" id="glossBtn" aria-pressed="false">Key words</button>
        <button class="tbtn" id="pickBtn" aria-pressed="false">Pick a student</button>
        <button class="tbtn" id="notesBtn" aria-pressed="false">Teacher notes</button>
        <button class="tbtn" id="resBtn" aria-pressed="false">Results</button>
        <button class="tbtn live-btn" id="liveBtn" aria-pressed="false">Live answers</button>
        <button class="tbtn" id="aMinus" aria-label="Smaller text">A−</button>
        <button class="tbtn" id="aPlus" aria-label="Larger text">A+</button>
        <button class="tbtn present-btn" id="presentBtn" title="Present mode (P)">⛶ Present</button>
      </div>
    </div>
    <nav class="steps" id="steps" aria-label="Lesson stages"></nav>
  </div></div>

  <aside class="drawer" id="gloss" hidden aria-label="Key words">
    <div class="bar" style="justify-content:space-between;margin-bottom:10px"><h3>Key words · 핵심 용어</h3><button class="tbtn" data-close="gloss">Close</button></div>
    <dl class="gl">${glossary}</dl>
  </aside>
  <aside class="drawer" id="picker" hidden aria-label="Pick a student">
    <div class="bar" style="justify-content:space-between;margin-bottom:6px"><h3>Pick a student number</h3><button class="tbtn" data-close="picker">Close</button></div>
    <div class="picker" id="pickNum">–</div>
    <div class="bar" style="justify-content:center"><label class="small" for="classSize">Class size</label>
      <input id="classSize" type="number" min="2" max="40" value="24" style="width:4.5em;border:1px solid var(--line);border-radius:8px;padding:4px 6px;background:var(--surface-2)">
      <button class="btn primary" id="pickGo">Pick</button></div>
    <p class="small muted" style="text-align:center;margin-top:8px">Numbers aren't picked again until everyone has had a turn.</p>
  </aside>
  <aside class="drawer" id="resPanel" hidden aria-label="Lesson results">
    <div class="bar" style="justify-content:space-between;margin-bottom:6px"><h3>Lesson results</h3><button class="tbtn" data-close="resPanel">Close</button></div>
    <div id="resBody"></div>
  </aside>
  <aside class="drawer livepanel" id="livePanel" hidden aria-label="Live answers">
    <div class="bar" style="justify-content:space-between;margin-bottom:6px"><h3>Live answers</h3><button class="tbtn" data-close="livePanel">Close</button></div>
    <div id="liveBody"></div>
  </aside>

  <div class="dock" id="dock" role="toolbar" aria-label="Presenter controls">
    <button class="dbtn" id="dPrev" aria-label="Previous stage">←</button><span class="dlabel" id="dLabel"></span><button class="dbtn" id="dNext" aria-label="Next stage">→</button>
    <span class="sep"></span>
    <div class="seg" data-levels role="group" aria-label="Challenge level"><button data-lv="support" aria-pressed="false">Support</button><button data-lv="core" aria-pressed="true">Core</button><button data-lv="stretch" aria-pressed="false">Stretch</button></div>
    <span class="sep"></span>
    <output id="dTime">3:00</output><button class="dbtn" id="dGo" aria-label="Start or pause timer">▶</button>
    <button class="dbtn" id="dGloss">Key words</button><button class="dbtn" id="dPick">Pick</button><button class="dbtn" id="dRes">Results</button><button class="dbtn" id="dA" aria-label="Larger text">A+</button>
    <button class="dbtn dlive" id="dLive" aria-label="Show room code"></button>
    <span class="sep"></span><button class="dbtn" id="dExit">Exit (Esc)</button>
  </div>
  <main class="wrap" id="main"></main>`);

  $('#main').innerHTML = STAGES.map((s,i) => `<section class="stage" id="st-${s.key}" ${i?'hidden':''} aria-labelledby="h-${s.key}">${typeof s.html === 'function' ? s.html() : s.html}</section>`).join('')
    + '<div class="nav"><button class="btn" id="prev">← Back</button><span class="status" id="pos"></span><button class="btn primary" id="next">Next →</button></div>';
  $('#steps').innerHTML = STAGES.map((s,i) => `<button class="step${s.primm?' primm':''}" data-i="${i}"><b>${i+1}</b>${esc(s.label)}</button>`).join('');
  $$('.step').forEach(b => b.onclick = () => go(+b.dataset.i));
  $('#prev').onclick = () => go(cur-1); $('#next').onclick = () => go(cur+1);
  $('#dPrev').onclick = () => go(cur-1); $('#dNext').onclick = () => go(cur+1);

  /* questions */
  $$('[data-vote]').forEach(hostEl => {
    const id = hostEl.dataset.vote, q = (cfg.questions||{})[id]; if(!q) return;
    const isCheck = q.type === 'checkin';
    hostEl.className = 'panel hinge';
    hostEl.innerHTML = `<div class="eyebrow">${isCheck ? 'Class check-in' : q.type === 'text' ? 'Type your answer' : 'Class vote'}</div>
      <p class="big-q" style="font-size:${isCheck?'1.25rem':'1.45rem'}">${esc(q.title)}</p>
      ${q.code ? codeBlock(q.code) : ''}<div class="vw"></div>`;
    askWidget($('.vw', hostEl), id, q);
  });

  /* tools */
  let tLeft = 180, tRun = null;
  const tDraw = () => { const m = Math.floor(tLeft/60), s = tLeft%60, txt = `${m}:${String(s).padStart(2,'0')}`;
    ['#tOut','#dTime'].forEach(i => { const o = $(i); o.textContent = txt; o.classList.toggle('done', tLeft === 0); }); };
  $$('.timer [data-min]').forEach(b => b.onclick = () => { clearInterval(tRun); tRun = null; tLeft = +b.dataset.min*60; $('#tGo').textContent = '▶'; $('#dGo').textContent = '▶'; tDraw(); });
  const toggleTimer = () => { if(tRun){ clearInterval(tRun); tRun = null; $('#tGo').textContent = '▶'; $('#dGo').textContent = '▶'; return; }
    if(tLeft === 0) return; $('#tGo').textContent = '❚❚'; $('#dGo').textContent = '❚❚';
    tRun = setInterval(() => { tLeft--; tDraw(); if(tLeft <= 0){ clearInterval(tRun); tRun = null; $('#tGo').textContent = '▶'; $('#dGo').textContent = '▶'; } }, 1000); };
  $('#tGo').onclick = toggleTimer; $('#dGo').onclick = toggleTimer;

  function toggleDrawer(id, btn){ const d = $('#'+id); const show = d.hidden;
    ['gloss','picker','livePanel','resPanel'].forEach(x => $('#'+x).hidden = true);
    ['#glossBtn','#pickBtn','#resBtn'].forEach(x => $(x).setAttribute('aria-pressed', false));
    d.hidden = !show; if(btn) btn.setAttribute('aria-pressed', show);
    if(show && id === 'resPanel') Results.show(); if(show && id === 'livePanel') Live.panel(); }
  $('#glossBtn').onclick = () => toggleDrawer('gloss', $('#glossBtn'));
  $('#pickBtn').onclick = () => toggleDrawer('picker', $('#pickBtn'));
  $('#resBtn').onclick = () => toggleDrawer('resPanel', $('#resBtn'));
  $('#liveBtn').onclick = () => toggleDrawer('livePanel', $('#liveBtn'));
  $('#dGloss').onclick = () => toggleDrawer('gloss', $('#glossBtn'));
  $('#dPick').onclick = () => toggleDrawer('picker', $('#pickBtn'));
  $('#dRes').onclick = () => toggleDrawer('resPanel', $('#resBtn'));
  $('#dLive').onclick = () => toggleDrawer('livePanel', $('#liveBtn'));
  $$('[data-close]').forEach(b => b.onclick = () => { $('#'+b.dataset.close).hidden = true; ['#glossBtn','#pickBtn','#resBtn','#liveBtn'].forEach(x => $(x).setAttribute('aria-pressed', false)); });

  let used = [];
  $('#pickGo').onclick = () => { const n = Math.max(2, Math.min(40, +$('#classSize').value || 24));
    let pool = []; for(let i=1;i<=n;i++) if(!used.includes(i)) pool.push(i);
    if(!pool.length){ used = []; pool = Array.from({length:n},(_,i)=>i+1); }
    const pick = pool[Math.floor(Math.random()*pool.length)]; used.push(pick);
    let k = 0; const e = $('#pickNum'); const spin = setInterval(() => { e.textContent = 1 + Math.floor(Math.random()*n); if(++k > 10){ clearInterval(spin); e.textContent = pick; } }, 45); };
  $('#classSize').onchange = () => { used = []; };
  $('#notesBtn').onclick = () => { const on = document.body.classList.toggle('show-notes'); $('#notesBtn').setAttribute('aria-pressed', on); };
  let fs = 17;
  $('#aPlus').onclick = () => { fs = Math.min(26, fs+1); document.documentElement.style.setProperty('--fs', fs+'px'); };
  $('#dA').onclick = () => $('#aPlus').click();
  $('#aMinus').onclick = () => { fs = Math.max(13, fs-1); document.documentElement.style.setProperty('--fs', fs+'px'); };
  $$('.seg[data-levels] button').forEach(b => b.onclick = () => setLevel(b.dataset.lv));
  $('#presentBtn').onclick = () => setPresent(true);
  $('#dExit').onclick = () => setPresent(false);
  document.addEventListener('fullscreenchange', () => { if(!document.fullscreenElement && document.body.classList.contains('present')) setPresent(false); });
  document.addEventListener('mousemove', e => { if(document.body.classList.contains('present') && e.clientY > window.innerHeight - 140) wakeDock(); });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.body.classList.contains('present')){ setPresent(false); return; }
    if(/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if(e.key === 'ArrowRight' || e.key === 'PageDown') go(cur+1);
    if(e.key === 'ArrowLeft' || e.key === 'PageUp') go(cur-1);
    if(e.key === 'p' || e.key === 'P') setPresent(!document.body.classList.contains('present'));
  });
  window.addEventListener('beforeunload', e => { if(Live.on){ e.preventDefault(); e.returnValue = ''; } });
  if(!window.firebase) $('#liveBtn').hidden = true;
}

/* ---------------- entry point ---------------- */
function start(cfg){
  const tag = document.currentScript || $('script[data-root]');
  ROOT = (cfg.root !== undefined) ? cfg.root : ((tag && tag.dataset.root) ? tag.dataset.root : './');
  if(ROOT && !ROOT.endsWith('/')) ROOT += '/';
  STAGES = cfg.stages;
  Results.setStages(STAGES);
  shell(cfg);
  if(cfg.ready) cfg.ready();
  setLevel(cfg.level || 'core');
  go(0);
}

return { start, editor, trace, parsons, gaps, annotate, sorter, askWidget, bugHunt, loopTrace, rangeExplorer,
  code: codeBlock, scopeCode, hl, run: runPython, showResult, onLevel, setLevel,
  $, $$, esc, CHECKIN, WIDGETS, Live, Results, get root(){ return ROOT; } };
})();
