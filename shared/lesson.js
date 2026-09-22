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

/* ---------------- activity tracking (auto check-ins from student laptops) ---------------- */
const ACTS = {};
const KIND = {code:'Code challenge', parsons:'Parsons problem', gaps:'Fill the gaps', annotate:'Annotate the code', sorter:'Sort it', bug:'Spot the bugs', fix:'Fix the bugs'};
function track(h, kind){
  const stg = h && h.closest ? h.closest('.stage') : null; if(!stg) return null;
  if(h.dataset.act && ACTS[h.dataset.act]) return h.dataset.act;
  const key = stg.id.replace(/^st-/,''), id = key + '-' + $$('[data-act]', stg).length;
  h.dataset.act = id;
  const lv = h.closest('[data-show]');
  ACTS[id] = {id, kind, stage:key, level: lv ? lv.dataset.show : ''};
  const pill = el(`<div class="donepill" data-for="${id}" hidden><span>✓ <b>0</b> finished on laptops</span></div>`);
  h.parentNode.insertBefore(pill, h);
  return id;
}
function done(id){ if(id && STUDENT) Student.done(id); }

/* ---------------- code editor ---------------- */
function editor(sel, start, opts){
  const h = host(sel); opts = opts || {};
  const act = (opts.tests && !opts.noTrack) ? track(h, opts.kind || 'code') : null;
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
      if(!r.ok && !t.some(x => x.inputs)){ ul.innerHTML = '<li class="fail">Fix the error first, then check again.</li>'; return t.map(x => ({name:x.label, pass:false})); }
      const printed = outText(r.out);
      for(const x of t.filter(x => !x.expr)){
        if(x.inputs){ st.textContent = 'Checking…'; const rr = await runPython(ta.value, x.inputs);
          res.push({name: x.label + (x.inputs.length ? `  (inputs: ${x.inputs.join(', ')})` : ''), pass: rr.ok && outCheck(outText(rr.out), x)}); }
        else res.push({name:x.label, pass: r.ok && outCheck(printed, x)});
      }
      st.textContent = '';
      ul.innerHTML = res.map(x => `<li class="${x.pass?'pass':'fail'}">${x.pass?'✓':'✗'} ${esc(x.name)}</li>`).join('');
      if(res.length && res.every(x => x.pass)){ ul.insertAdjacentHTML('beforeend', `<li class="pass">${esc(opts.passMsg || 'All tests passed.')}</li>`); done(act); }
      return res;
    }
    return [];
  };
  $('.run', h).onclick = () => go(false);
  if(opts.tests) $('.check', h).onclick = () => go(true);
  $('.reset', h).onclick = () => { ta.value = original; sync(); pre.textContent = ''; const ul = $('.tests', h); if(ul) ul.innerHTML = ''; };
  return { set(code){ original = code; ta.value = code; sync(); pre.textContent=''; const ul = $('.tests', h); if(ul) ul.innerHTML=''; }, get value(){ return ta.value; }, check: () => go(true), textarea: ta };
}

/* ---------------- ask widget: choice / check-in / typed ---------------- */
const CHECKIN = ['All correct','Partly done','Stuck'];
const WIDGETS = {};
const norm = (t, mono) => { let s = String(t).trim().toLowerCase().replace(/\s+/g,' '); return mono ? s.replace(/\s+/g,'') : s; };
function askWidget(sel, id, q){
  if(q.type === 'code') return codeTask(sel, id, q);
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

/* ---------------- live code task: students write code on their own laptops ---------------- */
const cleanTests = tests => (tests||[]).map(t => { const o = {label: String(t.label||'Test')};
  ['expr','output','contains','lines','inputs'].forEach(k => { if(t[k] !== undefined && t[k] !== null) o[k] = t[k]; }); return o; });
function codeTask(sel, id, q){
  const h = host(sel);
  const tests = cleanTests(q.tests), marked = tests.length > 0;
  h.innerHTML = `
    ${q.starter !== undefined ? `<details class="ctry"><summary>Model it on the board</summary><div class="cted"></div></details>` : ''}
    <div class="hidden-until" id="veil-${id}"><b class="rcount">0</b><span>programs sent · hidden until you show them</span></div>
    <div class="csum" hidden></div>
    <div class="cfilter" hidden role="group" aria-label="Filter programs"><button data-f="all" aria-pressed="true">All</button><button data-f="pass" aria-pressed="false">✓ All tests passed</button><button data-f="fail" aria-pressed="false">Not yet</button></div>
    <div class="cgrid" hidden></div>
    <div class="accepted cmodel" hidden></div>
    <div class="bar"><button class="btn mark reveal">${q.model ? 'Show results + model answer' : 'Show results'}</button><button class="btn peek">Peek</button><button class="btn resetv">Clear programs</button><span class="pct"></span></div>
    <div class="livebar"><button class="btn primary lopen">Open on laptops</button><button class="btn lclose">Close</button><span class="pill closed lstate">Not open</span><span class="small muted"><span class="count lcount">0</span> programs sent</span></div>`;
  if(q.starter !== undefined) editor($('.cted', h), q.starter, {inputs: q.inputs, tests: marked ? () => tests : null, noTrack:true});
  let subs = {}, revealed = false, peek = false, filter = 'all', order = [];
  const passed = x => x && x.of > 0 && x.pass === x.of;
  function draw(){
    const show = revealed || peek, ids = Object.keys(subs), all = ids.length;
    ids.forEach(u => { if(!order.includes(u)) order.push(u); });
    order = order.filter(u => subs[u]);
    $('.rcount', h).textContent = all; $('.lcount', h).textContent = all;
    $('#veil-'+id, h).hidden = show;
    const sum = $('.csum', h), grid = $('.cgrid', h), fl = $('.cfilter', h);
    sum.hidden = grid.hidden = fl.hidden = !show;
    if(show){
      const full = ids.filter(u => passed(subs[u])).length;
      sum.innerHTML = (marked ? tests.map((t,i) => { const n = ids.filter(u => (subs[u].r||'')[i] === '1').length, pc = all ? n/all*100 : 0;
        return `<div class="ctest"><span class="t">${esc(t.label)}</span><div class="res-bar"><i class="c" style="width:${pc}%"></i><i class="w" style="width:${all?100-pc:0}%"></i></div><span class="m">${n} of ${all}</span></div>`; }).join('') : '')
        + `<p class="cfull"><b>${full}</b> of ${all} passed every test</p>`;
      const list = order.map((u,i) => ({u, n:i+1, x:subs[u]})).filter(o => filter === 'all' || (filter === 'pass') === passed(o.x));
      grid.innerHTML = list.map(o => `<div class="ccard ${marked ? (passed(o.x)?'ok':'no') : ''}" data-u="${esc(o.u)}">
          <div class="chead"><b>Program ${o.n}</b><span>${marked ? (passed(o.x) ? '✓ ' : '✗ ') + `${o.x.pass}/${o.x.of} tests` : ''}</span><span><button class="zoom" title="Show this program large">Show big</button><button class="x" title="Hide this program" aria-label="Hide this program">✕</button></span></div>
          ${codeBlock(String(o.x.code||'').slice(0,4000))}</div>`).join('') || '<p class="small muted">No programs here yet.</p>';
      $$('.ccard .x', grid).forEach(b => b.onclick = () => { const u = b.closest('.ccard').dataset.u; delete subs[u]; Live.deleteAnswer(id, u); draw(); });
      $$('.ccard .zoom', grid).forEach(b => b.onclick = () => { const c = b.closest('.ccard'); zoom(c.querySelector('.chead b').textContent + ' ' + c.querySelector('.chead span').textContent, subs[c.dataset.u].code); });
    }
    const m = $('.cmodel', h); m.hidden = !(revealed && q.model);
    if(q.model) m.innerHTML = `<div>Model answer</div>${codeBlock(q.model)}`;
    $('.pct', h).textContent = (show && marked && all) ? `${Math.round(ids.filter(u => passed(subs[u])).length/all*100)}% passed every test` : '';
    if(window.Results) Results.refresh();
  }
  function zoom(title, src){
    const z = el(`<div class="czoom" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="czin"><div class="chead"><b>${esc(title)}</b><button class="btn zclose">Close (Esc)</button></div>${codeBlock(String(src||''))}<div class="bar"><button class="btn primary zrun">▶ Run it</button></div><pre class="out zout" hidden></pre></div></div>`);
    document.body.appendChild(z);
    const close = () => { z.remove(); document.removeEventListener('keydown', k, true); };
    const k = e => { if(e.key === 'Escape'){ e.stopPropagation(); close(); } };
    document.addEventListener('keydown', k, true);
    $('.zclose', z).onclick = close; z.onclick = e => { if(e.target === z) close(); };
    $('.zrun', z).onclick = async () => { const o = $('.zout', z); o.hidden = false; o.textContent = 'Running…';
      const ins = q.inputs !== undefined ? String(q.inputs).split(',').map(x => x.trim()).filter(Boolean) : null;
      showResult(o, await runPython(String(src||''), ins)); };
    $('.zclose', z).focus();
  }
  $$('.cfilter button', h).forEach(b => b.onclick = () => { filter = b.dataset.f; $$('.cfilter button', h).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  const peekBtn = $('.peek', h);
  peekBtn.onclick = () => { peek = !peek; peekBtn.setAttribute('aria-pressed', peek); peekBtn.textContent = peek ? 'Hide' : 'Peek'; draw(); };
  $('.reveal', h).onclick = () => { revealed = true; draw(); Live.reveal(id, {code:true, model: q.model || '', marked}); };
  $('.resetv', h).onclick = () => { subs = {}; order = []; revealed = false; peek = false; peekBtn.textContent = 'Peek'; peekBtn.setAttribute('aria-pressed', false); draw(); Live.clear(id); };
  $('.lopen', h).onclick = () => Live.open(id, {id, title:q.title, type:'code', code:q.code||'', starter:q.starter||'', tests, inputs: q.inputs !== undefined ? String(q.inputs) : '', hasInputs: q.inputs !== undefined, hint:q.hint||''});
  $('.lclose', h).onclick = () => Live.close();
  WIDGETS[id] = {
    setLive(arr, txt){ subs = {}; Object.entries(txt||{}).forEach(([u,x]) => { if(x && typeof x === 'object') subs[u] = x; }); draw(); },
    setState(active, open){ const me = active === id, st = $('.lstate', h);
      st.className = 'pill lstate ' + (me&&open ? 'open' : 'closed');
      st.textContent = me&&open ? 'Open: students are coding' : me ? 'Closed' : 'Not open';
      $('.lopen', h).disabled = me&&open; $('.lclose', h).disabled = !(me&&open); },
    redraw: draw,
    meta: {id, title:q.title, type:'code', marked, host:h},
    totals(){ return [0]; },
    subs(){ return subs; },
    passed
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
  const h = host(sel); const act = track(h, 'parsons');
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
    if(right === n && state.prog.length === n) { fb.innerHTML = '<div class="feedback good">Correct! Now run it to see the output.</div>'; done(act); }
    else if(state.prog.length < n) fb.innerHTML = `<div class="feedback mid">${right} of ${n} lines are correct so far. Keep adding lines.</div>`;
    else fb.innerHTML = `<div class="feedback ${right>=3?'mid':'bad'}">${right} of ${n} lines are in the right place${indBad?` · ${indBad} ${indBad>1?'lines need':'line needs'} the indentation fixing (amber)`:''}${state.prog.length>n?' · there are extra lines in your program':''}.</div>`;
  };
  $('.prun', h).onclick = async () => { const o = $('.pout', h); o.hidden = false; o.textContent = 'Running…'; showResult(o, await runPython(source())); };
  $('.pshuffle', h).onclick = setup;
  onLevel(setup); setup();
}

/* ---------------- fill the gaps ---------------- */
function gaps(sel, cfg){
  const h = host(sel); const act = track(h, 'gaps');
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
    $('.gfb', h).innerHTML = `<div class="feedback ${r===ins.length?'good':r>=ins.length/2?'mid':'bad'}">${r} of ${ins.length} correct${r===ins.length?'. Now run it!':'. Red gaps need another look.'}</div>`; if(r === ins.length) done(act); };
  $('.ghint', h).onclick = () => { const i = ins.findIndex((inp,k) => inp.value.trim() !== cfg.gaps[k].a);
    $('.gfb', h).innerHTML = i < 0 ? '<div class="feedback good">All the gaps are correct.</div>' : `<div class="feedback mid">Gap ${i+1}: ${esc(cfg.gaps[i].hint)}</div>`; };
  $('.gclear', h).onclick = () => { ins.forEach(x => { x.value=''; x.classList.remove('ok','bad'); }); $('.gfb', h).innerHTML=''; $('.gout', h).hidden = true; };
  $('.grun', h).onclick = async () => { const o = $('.gout', h); o.hidden = false; o.textContent = 'Running…';
    showResult(o, await runPython(cfg.build(ins.map(x => x.value.trim() || '___')))); };
}

/* ---------------- annotate ---------------- */
function annotate(sel, cfg){
  const h = host(sel); const act = track(h, 'annotate'); let revealing = false;
  h.innerHTML = `
    <div class="annot">
      <div class="panel"><h3>The code</h3><div class="alist arows"></div></div>
      <div class="panel"><h3>Annotations</h3><div class="alist abank"></div>
        <div class="bar"><button class="btn mark acheck">✓ Check</button><button class="btn areveal tonly">Reveal answers</button><button class="btn areset">Start again</button></div>
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
    $('.afb', h).innerHTML = `<div class="feedback ${r===t?'good':r>=t/2?'mid':'bad'}">${r} of ${t} correct${r===t?'. Well done!':left?'. Some annotations still need placing.':'. The red ones need to be swapped.'}</div>`; if(r === t && !revealing) done(act); };
  $('.areveal', h).onclick = () => { st.bank = st.all.filter(c => !c.line); st.slots = {}; st.all.filter(c => c.line).forEach(c => st.slots[c.line] = c); st.sel = null; draw(); revealing = true; $('.acheck', h).click(); revealing = false; };
  $('.areset', h).onclick = setup;
  onLevel(setup); setup();
}

/* ---------------- sorter (two categories) ---------------- */
function sorter(sel, cfg){
  const h = host(sel); const act = track(h, 'sorter');
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
    $('.sfb', h).innerHTML = `<div class="feedback ${r===n?'good':r>=n/2?'mid':'bad'}">${r} of ${n} correct${r===n?'!':''}</div>`; if(r === n && n) done(act); };
  $('.sreset', h).onclick = setup;
  onLevel(setup); setup();
}

/* ---------------- bug hunt ---------------- */
/* cfg: {code, bugs:[{line, what}], tests:[{label, output|contains}], fixed} */
function bugHunt(sel, cfg){
  const h = host(sel); const act = track(h, 'bug');
  const lines = cfg.code.split('\n');
  h.innerHTML = `
    <p class="small"><b>1.</b> Tap every line you think has a mistake. <b>2.</b> Press <b>Check</b>. <b>3.</b> Fix the code below and run it.</p>
    <div class="code bugcode">${lines.map((l,i)=>`<button class="ln bugln" data-l="${i+1}" aria-pressed="false"><i>${i+1}</i><span>${hl(l)||' '}</span><em class="flag" aria-hidden="true"></em></button>`).join('')}</div>
    <div class="bar"><button class="btn mark bcheck">✓ Check</button><button class="btn breveal tonly">Show the bugs</button><button class="btn breset">Clear</button><span class="status bcount"></span></div>
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
    if(!reveal && found === cfg.bugs.length && !wrong) done(act);
  }
  $('.bcheck', h).onclick = () => mark(false);
  $('.breveal', h).onclick = () => mark(true);
  $('.breset', h).onclick = () => { $$('.bugln', h).forEach(b => { b.setAttribute('aria-pressed', false); b.classList.remove('found','missed','wrongflag'); }); $('.bfb', h).innerHTML=''; count(); };
  count();
  editor($('.bfix', h), cfg.code, {id: cfg.id, tests: cfg.tests ? () => cfg.tests : null, kind:'fix'});
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
/* Classes: Years 5-9 A-H, Years 10-11 A-D, Years 12 and 13 IB */
const YEARS = [5,6,7,8,9,10,11,12,13];
const classLetters = y => y <= 9 ? 'ABCDEFGH'.split('') : y <= 11 ? 'ABCD'.split('') : ['IB'];
const yearLabel = y => y >= 12 ? `Year ${y} IB` : `Year ${y}`;
const SCHOOL_DOMAIN = window.SCHOOL_DOMAIN || 'nlcsjeju.kr';
const store = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ if(v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }catch(e){} } };
const safeCell = v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;

const Live = (() => {
  const st = {on:false, code:'', db:null, uid:'', active:'', open:false, joined:0, names:{}, refs:[], follow:true, done:{},
    cls: null, signin: store.get('lesson-signin') === 'google', saved:null, saving:false, msg:''};
  const cfgOK = () => !!(window.firebase && window.FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !/PASTE/i.test(FIREBASE_CONFIG.apiKey) && FIREBASE_CONFIG.databaseURL);
  const body = () => $('#liveBody');
  const joinURL = () => new URL(ROOT.replace(/\/?$/, '/') + 'vote.html', location.href).href.split(/[?#]/)[0] + '?room=' + st.code;
  const studentURL = () => location.origin + location.pathname + '?student&room=' + st.code;
  const shortURL = () => joinURL().replace(/^https?:\/\//, '').split('?')[0];
  const sheetsURL = () => store.get('lesson-sheets-url') || '';
  const lessonYear = () => { const m = location.pathname.match(/\/y(\d+)\//i); return m ? +m[1] : null; };
  /* default class: last used if it is in this lesson's year, otherwise just the year */
  (function(){ const last = store.get('lesson-last-class'), ly = lessonYear();
    const m = last && last.match(/^(\d+)(.+)$/);
    if(m && (!ly || +m[1] === ly)) st.cls = {y:+m[1], l:m[2]};
    else st.cls = ly ? {y:ly, l:''} : {y:7, l:''}; })();
  const clsId = () => st.cls && st.cls.l && st.cls.l !== 'none' ? `${st.cls.y}${st.cls.l}` : '';

  function classPicker(){
    const y = st.cls.y, letters = classLetters(y);
    return `<div class="clspick"><div class="clsrow"><label for="clsYear"><b>Class</b></label>
        <select id="clsYear">${YEARS.map(v => `<option value="${v}"${v===y?' selected':''}>${yearLabel(v)}</option>`).join('')}</select></div>
      <div class="clsbtns" role="group" aria-label="Class">${letters.map(l => `<button data-l="${l}" aria-pressed="${st.cls.l===l}">${y>=12?`${y} IB`:`${y}${l}`}</button>`).join('')}<button data-l="none" class="none" aria-pressed="${st.cls.l==='none'}">No class (don't save)</button></div></div>`;
  }
  function bindPicker(){
    $('#clsYear').onchange = e => { st.cls = {y:+e.target.value, l: classLetters(+e.target.value).length === 1 ? 'IB' : ''}; afterCls(); };
    $$('.clsbtns button').forEach(b => b.onclick = () => { st.cls.l = b.dataset.l; afterCls(); });
  }
  function afterCls(){ if(clsId()) store.set('lesson-last-class', clsId()); if(st.on) upd({cls: clsId()}); st.saved = null; panel(); }
  function sheetSetup(){
    const u = sheetsURL();
    return `<details class="sheetset"${u?'':' open'}><summary>${u ? '✓ Saving to Google Sheets is set up' : 'Set up saving to Google Sheets'}</summary>
      <p class="small muted">Paste the web app link from your Apps Script (see SHEETS-SETUP.md). It is kept on this computer only.</p>
      <div class="bar"><input id="sheetUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(u)}" spellcheck="false" autocomplete="off"><button class="btn" id="sheetSave">Save link</button><button class="btn" id="sheetTest">Test</button></div>
      <p class="small" id="sheetMsg" aria-live="polite"></p></details>`;
  }
  function bindSheet(){
    const msg = t => { const m = $('#sheetMsg'); if(m) m.textContent = t; };
    $('#sheetSave').onclick = () => { const v = $('#sheetUrl').value.trim();
      if(v && !/^https:\/\/script\.google(usercontent)?\.com\//.test(v)){ msg('That doesn\'t look like an Apps Script web app link.'); return; }
      store.set('lesson-sheets-url', v || null); msg(v ? 'Saved on this computer.' : 'Removed.'); };
    $('#sheetTest').onclick = async () => { const v = $('#sheetUrl').value.trim(); if(!v){ msg('Paste the link first.'); return; }
      msg('Testing…'); try{ const r = await fetch(v); const j = await r.json(); msg(j.ok ? '✓ Connected: ' + (j.message || 'OK') : 'The script answered with an error: ' + (j.error || '')); }
      catch(e){ msg('Could not reach the script. Check the link and that the deployment allows "Anyone".'); } };
  }
  function panel(msg){
    if(!cfgOK()){ body().innerHTML = '<p class="lmsg">Live answering isn\'t set up on this copy. Follow README.md to connect a free Firebase project. You can still count hands by tapping the options.</p>'; return; }
    if(!st.on){
      body().innerHTML = `${msg?`<p class="lmsg">${msg}</p>`:''}<p>Start a session so students can answer on their own devices.</p>
        ${classPicker()}
        <label class="followtog"><input type="checkbox" id="signinTog" ${st.signin?'checked':''}> <span><b>Students sign in with their school Google account</b><br><span class="small muted">Their names are saved with their answers. Untick for anonymous answers.</span></span></label>
        ${sheetSetup()}
        <div class="bar" style="margin-top:10px"><button class="btn primary" id="liveStart">Start a live session${clsId() ? ' for ' + clsId() : ''}</button></div>`;
      bindPicker(); bindSheet();
      $('#signinTog').onchange = e => { st.signin = e.target.checked; store.set('lesson-signin', st.signin ? 'google' : 'anon'); };
      $('#liveStart').onclick = start; return; }
    const cid = clsId(), su = sheetsURL();
    const names = Object.values(st.names).filter(Boolean).sort();
    body().innerHTML = `<p class="small muted" style="text-align:center">Students go to this address and type the room code</p>
      <div class="joinurl big">${esc(shortURL())}</div>
      <div class="roomcode">${st.code}</div><div class="qr" id="qr"></div>
      <p class="small muted" style="text-align:center">On a laptop, the code opens this lesson in student view. On a phone, it opens the answer page. The QR code opens the student view directly.</p>
      <p style="text-align:center;margin-top:8px"><b id="joinedN">${st.joined}</b> devices joined${st.signin ? ' · sign-in on' : ''}</p>
      ${names.length ? `<details class="whojoined"><summary>Who has joined (${names.length})</summary><p class="small">${names.map(esc).join(', ')}</p></details>` : ''}
      <label class="followtog"><input type="checkbox" id="followTog" ${st.follow?'checked':''}> <span><b>Students follow my screen</b><br><span class="small muted">Untick to let students move through the lesson at their own pace.</span></span></label>
      <div class="savebox">
        ${classPicker()}
        <div class="bar">${cid && su ? `<button class="btn mark" id="sheetGo"${st.saving?' disabled':''}>${st.saving ? 'Saving…' : st.saved ? 'Save again (updates the tab)' : 'Save to Google Sheet'}</button>` : ''}<button class="btn" id="csvGo">Download CSV</button></div>
        <p class="small" id="saveMsg" aria-live="polite">${st.msg || (!cid ? 'Choose a class to save results.' : !su ? 'Set up Google Sheets below to save automatically.' : `Results for <b>${esc(cid)}</b> are saved when you end the session.`)}</p>
        ${st.saved ? `<p class="small"><a href="${esc(st.saved.url)}" target="_blank" rel="noopener">Open ${esc(st.saved.book || cid + ' results')} ↗</a></p>` : ''}
        ${sheetSetup()}
      </div>
      <p class="small muted"><a href="${esc(studentURL())}" target="_blank" rel="noopener">Open the student view</a> to check what students see.</p>
      <div class="bar" style="margin-top:10px;justify-content:center"><button class="btn" id="liveEnd">End session</button></div>`;
    $('#followTog').onchange = e => follow(e.target.checked);
    bindPicker(); bindSheet();
    if($('#sheetGo')) $('#sheetGo').onclick = () => save();
    $('#csvGo').onclick = csv;
    try{ new QRCode($('#qr'), {text: studentURL(), width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M}); }catch(e){ const q = $('#qr'); if(q) q.remove(); }
    $('#liveEnd').onclick = end;
  }
  const makeCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; for(let i=0;i<5;i++) c += A[Math.floor(Math.random()*A.length)]; return c; };
  /* the teacher uses a separate Firebase app, so a student-view tab in the same browser can't sign the teacher out */
  const teacherApp = () => firebase.apps.find(a => a.name === 'teacher') || firebase.initializeApp(FIREBASE_CONFIG, 'teacher');
  async function start(){
    body().innerHTML = '<p>Connecting…</p>';
    try{
      const app = teacherApp(), auth = app.auth();
      const cred = await auth.signInAnonymously();
      st.uid = cred.user.uid; st.db = app.database();
      let code = '';
      for(let i=0;i<6;i++){ code = makeCode(); const snap = await st.db.ref('rooms/'+code).get(); if(!snap.exists()) break; }
      await st.db.ref('rooms/'+code).set({owner: st.uid, created: Date.now(), active:'', open:false, reveal:-1, lesson: (document.title||''), page: location.pathname,
        stage: STAGES[cur] ? STAGES[cur].key : '', follow: true, signin: st.signin ? 'google' : 'anon', cls: clsId()});
      st.follow = true; st.saved = null; st.msg = '';
      st.code = code; st.on = true; document.body.classList.add('live'); $('#liveBtn').setAttribute('aria-pressed', true);
      const vref = st.db.ref(`rooms/${code}/votes`);
      const vcb = vref.on('value', snap => { const v = snap.val() || {};
        Object.keys(WIDGETS).forEach(q => { const raw = v[q] || {}; const arr = [0,0,0,0,0,0]; const txt = {};
          Object.entries(raw).forEach(([u,x]) => { if(typeof x === 'number'){ if(arr[x] !== undefined) arr[x]++; } else if(x !== null && (typeof x === 'string' || typeof x === 'object')) txt[u] = x; });
          WIDGETS[q].setLive(arr, txt); }); });
      const jref = st.db.ref(`rooms/${code}/joined`);
      const jcb = jref.on('value', snap => { const v = snap.val() || {}; st.joined = Object.keys(v).length;
        const before = Object.values(st.names).join('|'); st.names = {}; Object.entries(v).forEach(([u,x]) => st.names[u] = (x && typeof x === 'object') ? String(x.name||'') : '');
        const n = $('#joinedN'); if(n) n.textContent = st.joined; dockLabel();
        if(Object.values(st.names).join('|') !== before && Object.values(st.names).some(Boolean) && !$('#livePanel').hidden && !(document.activeElement && document.activeElement.closest('#livePanel'))) panel(); });
      const dref = st.db.ref(`rooms/${code}/done`);
      const dcb = dref.on('value', snap => { const v = snap.val() || {}; st.done = {}; Object.keys(v).forEach(a => st.done[a] = Object.keys(v[a]||{}).length); pills(); if(window.Results) Results.refresh(); });
      st.refs = [[vref,vcb],[jref,jcb],[dref,dcb]];
      panel(); dockLabel(); Object.values(WIDGETS).forEach(w => w.redraw());
    }catch(e){ console.error(e); st.on = false; panel(`Couldn't start a session: ${esc(e.message||String(e))}. Check the Firebase setup in README.md.`); }
  }

  /* ---- build the session record: one row per student, one column per question/activity ---- */
  async function sessionData(){
    const snap = await st.db.ref('rooms/'+st.code).get(); const r = snap.val() || {};
    const joined = r.joined || {}, votes = r.votes || {}, dn = r.done || {};
    const uids = new Set(Object.keys(joined));
    Object.values(votes).forEach(v => Object.keys(v||{}).forEach(u => uids.add(u)));
    Object.values(dn).forEach(v => Object.keys(v||{}).forEach(u => uids.add(u)));
    const studs = [...uids].map(u => { const j = joined[u]; return (j && typeof j === 'object') ? {u, name:String(j.name||j.email||''), email:String(j.email||'')} : {u, name:'', email:''}; })
      .sort((a,b) => (a.name?0:1) - (b.name?0:1) || a.name.localeCompare(b.name));
    let an = 0; studs.forEach(s => { if(!s.name) s.name = 'Anonymous ' + (++an); });
    const si = key => STAGES.findIndex(s => s.key === key);
    const stageOf = h => { const g = h.closest('.stage'); return g ? g.id.replace(/^st-/,'') : ''; };
    const stageLabel = k => { const i = si(k); return i >= 0 ? STAGES[i].label : k; };
    const L = 'ABCDEF', cols = [], code = [];
    /* questions that were answered this session, in lesson order */
    Object.values(WIDGETS).map(w => ({w, k: stageOf(w.meta.host)})).sort((a,b) => si(a.k) - si(b.k))
      .forEach(({w, k}) => { const m = w.meta, v = votes[m.id]; if(!v || !Object.keys(v).length) return;
        const q = QUESTIONS[m.id] || {}, type = m.type || 'choice';
        const col = {h: `${stageLabel(k)}: ${m.title}`, marked:false, kind:'q', cell:{}};
        if(type === 'choice'){
          const opts = q.opts || [], c = q.correct === undefined ? -1 : q.correct; col.marked = c >= 0;
          col.note = opts.map((o,i) => `${L[i]}: ${o}${i===c?'  ✓':''}`).join('\n');
          Object.entries(v).forEach(([u,x]) => { if(typeof x !== 'number') return;
            col.cell[u] = col.marked ? {v:`${x===c?'✓':'✗'} ${L[x]}`, s: x===c?'ok':'bad', ok: x===c} : {v: String(opts[x] ?? L[x]).slice(0,60), s:''}; });
        } else if(type === 'checkin'){
          col.note = 'Check-in (not scored)';
          Object.entries(v).forEach(([u,x]) => { if(typeof x === 'number') col.cell[u] = {v: CHECKIN[x] || '', s: x===0?'ok':x===2?'bad':''}; });
        } else if(type === 'text'){
          col.marked = !!(q.accept && q.accept.length); col.note = col.marked ? 'Accepted: ' + q.accept.join(' | ') : 'Typed answer';
          Object.entries(v).forEach(([u,x]) => { if(typeof x !== 'string') return; const ok = col.marked && q.accept.some(a => norm(a, q.mono) === norm(x, q.mono));
            col.cell[u] = {v: (col.marked ? (ok?'✓ ':'✗ ') : '') + x, s: col.marked ? (ok?'ok':'bad') : '', ok}; });
        } else if(type === 'code'){
          col.marked = !!(q.tests && q.tests.length); col.note = 'Code task. Programs are listed below the table.';
          Object.entries(v).forEach(([u,x]) => { if(!x || typeof x !== 'object') return; const ok = x.of > 0 && x.pass === x.of;
            col.cell[u] = {v: x.of ? `${ok?'✓':'✗'} ${x.pass}/${x.of} tests` : 'sent', s: col.marked ? (ok?'ok':'bad') : '', ok};
            const sname = (studs.find(s => s.u === u) || {}).name || '';
            code.push({name: sname, task: m.title, tests: x.of ? `${x.pass}/${x.of}` : '', code: String(x.code||'')}); });
        }
        cols.push(col); });
    /* activities finished on laptops */
    Object.values(ACTS).map(a => ({a, i: si(a.stage)})).sort((x,y) => x.i - y.i || x.a.id.localeCompare(y.a.id, undefined, {numeric:true}))
      .forEach(({a}) => { const d = dn[a.id]; if(!d || !Object.keys(d).length) return;
        const kn = KIND[a.kind] || a.kind, sl = stageLabel(a.stage);
        const col = {h: `${sl.toLowerCase() === kn.toLowerCase() ? kn : sl + ': ' + kn}${a.level ? ' (' + a.level + ')' : ''} · finished`, marked:false, kind:'act', note:'✓ = completed correctly on a laptop', cell:{}};
        Object.keys(d).forEach(u => col.cell[u] = {v:'✓', s:'ok'}); cols.push(col); });
    const markedCols = cols.filter(c => c.marked);
    const rows = studs.map(s => {
      const right = markedCols.filter(c => c.cell[s.u] && c.cell[s.u].ok).length;
      return {name: safeCell(s.name), email: s.email, cells: cols.map(c => { const x = c.cell[s.u]; return x ? {v: safeCell(x.v), s: x.s} : {v:'', s:''}; }),
        score: markedCols.length ? `${right}/${markedCols.length}` : '', pct: markedCols.length ? Math.round(right/markedCols.length*100) : ''}; });
    const classRow = cols.map(c => { const xs = Object.values(c.cell), n = xs.length;
      if(c.marked){ const k = xs.filter(x => x.ok).length; return `${n ? Math.round(k/n*100) : 0}% (${k}/${n})`; }
      if(c.kind === 'act') return `${n} of ${studs.length}`;
      return `${n} answered`; });
    const pcts = rows.map(r => r.pct).filter(p => p !== '');
    const avg = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : '';
    const now = new Date(r.created || Date.now()), lesson = LESSON.title || document.title;
    const dShort = `${now.getDate()} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[now.getMonth()]}`, dLong = now.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'long', year:'numeric'}) + ' ' + now.toTimeString().slice(0,5);
    return { v:1, cls: clsId(), year: st.cls.y, yearLabel: yearLabel(st.cls.y), lesson, date: now.toISOString(),
      tabName: `${dShort} · ${lesson}`.slice(0, 90), replace: st.saved ? st.saved.tab : '',
      title: `${clsId()} · ${lesson}`, subtitle: `${dLong} · ${studs.length} students · room ${st.code}${avg !== '' ? ' · class average ' + avg + '%' : ''}`,
      columns: cols.map(c => ({h: safeCell(c.h), note: c.note || ''})), rows, classRow, classAvg: avg === '' ? '' : avg,
      code: code.map(c => ({name: safeCell(c.name), task: safeCell(c.task), tests: c.tests, code: safeCell(c.code)})) };
  }
  async function save(){
    const url = sheetsURL(), cid = clsId();
    if(!url || !cid || st.saving) return false;
    st.saving = true; st.msg = 'Saving to Google Sheets…'; if(!$('#livePanel').hidden) panel();
    let ok = false;
    try{
      const data = await sessionData();
      const res = await fetch(url, {method:'POST', body: JSON.stringify(data)});
      const j = await res.json();
      if(!j.ok) throw new Error(j.error || 'The script returned an error');
      st.saved = {url: j.url, tab: j.tab, book: j.book}; st.msg = `✓ Saved to “${j.book}”, tab “${j.tab}”.`; ok = true;
    }catch(e){ console.error(e); st.msg = 'Saving failed: ' + (e.message || e) + '. Try again, or download the CSV.'; }
    st.saving = false; if(!$('#livePanel').hidden) panel();
    return ok;
  }
  async function csv(){
    try{
      const d = await sessionData();
      const q = x => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
      const lines = [['Student','Email'].concat(d.columns.map(c => c.h)).concat(['Score','%'])]
        .concat(d.rows.map(r => [r.name, r.email].concat(r.cells.map(c => c.v)).concat([r.score, r.pct])))
        .concat([['Class',''].concat(d.classRow).concat(['', d.classAvg])]);
      const blob = new Blob(['﻿' + lines.map(l => l.map(q).join(',')).join('\r\n')], {type:'text/csv'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${d.cls || 'class'} ${d.tabName}.csv`.replace(/[\\/:*?"<>|]/g,' '); document.body.appendChild(a); a.click(); a.remove();
    }catch(e){ console.error(e); alert('Could not make the CSV: ' + (e.message || e)); }
  }
  async function end(){
    if(clsId() && sheetsURL()){
      const ok = await save();
      if(!ok && !confirm('The results could not be saved to Google Sheets.\n\nEnd the session anyway? Press Cancel to try again or download the CSV first.')) return;
    }
    st.refs.forEach(([r,cb]) => r.off('value', cb)); st.refs = [];
    try{ await st.db.ref('rooms/'+st.code).remove(); }catch(e){}
    st.on = false; st.code = ''; st.active = ''; st.open = false; st.names = {};
    document.body.classList.remove('live'); $('#liveBtn').setAttribute('aria-pressed', false);
    Object.values(WIDGETS).forEach(w => { w.setLive([], {}); w.setState('', false); }); st.done = {}; pills();
    const keep = st.saved; panel(keep ? `Session ended. ${esc(st.msg)} <a href="${esc(keep.url)}" target="_blank" rel="noopener">Open the sheet ↗</a>` : ''); dockLabel();
  }
  function pills(){ $$('.donepill').forEach(p => { p.hidden = !st.on; $('b', p).textContent = st.done[p.dataset.for] || 0; }); }
  function follow(on){ st.follow = !!on; upd({follow: st.follow, stage: STAGES[cur] ? STAGES[cur].key : ''}); }
  const states = () => Object.keys(WIDGETS).forEach(q => WIDGETS[q].setState(st.active, st.open));
  const dockLabel = () => { $('#dLive').textContent = st.on ? `Room ${st.code} · ${st.joined}` : ''; };
  const upd = obj => st.on ? st.db.ref('rooms/'+st.code).update(obj).catch(e => console.error(e)) : Promise.resolve();
  return {
    panel, get on(){ return st.on; }, get joined(){ return st.joined; }, get done(){ return st.done; },
    sessionData, save, csv,
    stage(key){ if(st.on) upd({stage:key}); },
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

/* ---------------- student view (?student): answering inside the lesson page ---------------- */
function studentAsk(sel, id, q){
  const h = host(sel), type = q.type || 'choice';
  const opts = type === 'checkin' ? CHECKIN : (q.opts || []);
  const L = i => 'ABCDEF'[i];
  h.innerHTML = `<p class="sstate" aria-live="polite"></p>` + (
    type === 'code' ? `<div class="sed"></div><div class="bar"><button class="btn send ssend">Send to teacher</button></div>` :
    type === 'text' ? `<div class="stext"><input class="sinput${q.mono?' mono':''}" maxlength="120" placeholder="${esc(q.placeholder||'Type your answer')}" aria-label="Your answer" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary ssend">Send</button></div>` :
    `<div class="sopts">${opts.map((o,i)=>`<button class="sopt" data-i="${i}" aria-pressed="false" disabled><span class="l">${L(i)}</span><span class="t">${esc(o)}</span></button>`).join('')}</div>`)
    + `<div class="ssent" hidden></div><div class="skey" hidden></div><div class="sres" aria-live="polite"></div>`;
  let ed = null, sending = false, pend;
  const tests = cleanTests(q.tests);
  const dkey = 'lesson-code:' + location.pathname + ':' + id;
  if(type === 'code'){
    let draft = null; try{ draft = sessionStorage.getItem(dkey); }catch(e){}
    ed = editor($('.sed', h), q.starter || '', {inputs: q.inputs, tests: tests.length ? () => tests : null, noTrack:true, passMsg:'All tests passed. Now send it to your teacher.'});
    if(draft !== null){ ed.textarea.value = draft; ed.textarea.dispatchEvent(new Event('input')); }
    ed.textarea.addEventListener('input', () => { try{ sessionStorage.setItem(dkey, ed.textarea.value); }catch(e){} });
  }
  const send = async v => { pend = v; update();
    try{ await Student.send(id, v); }catch(e){ $('.sstate', h).textContent = 'That did not send. It may have closed.'; }
    pend = undefined; update(); };
  if(type === 'code') $('.ssend', h).onclick = async () => {
    const src = ed.value;
    if(!src.trim()){ $('.sstate', h).textContent = 'Write some code first.'; return; }
    if(src.length > 4000){ $('.sstate', h).textContent = 'Your program is too long to send (4000 characters max).'; return; }
    sending = true; update();
    const res = tests.length ? await ed.check() : [];
    sending = false;
    send({code: src, pass: res.filter(x => x.pass).length, of: res.length, r: res.map(x => x.pass ? '1' : '0').join('')});
  };
  else if(type === 'text'){
    const inp = $('.sinput', h);
    $('.ssend', h).onclick = () => { const v = inp.value.trim().slice(0,120); if(v) send(v); };
    inp.addEventListener('keydown', e => { if(e.key === 'Enter') $('.ssend', h).click(); });
  } else $$('.sopt', h).forEach(b => b.onclick = () => send(+b.dataset.i));

  function update(){
    const r = Student.room, on = Student.on && !!r;
    const active = on && r.active === id, open = active && r.open === true;
    const saved = on && r.votes && r.votes[id] ? r.votes[id][Student.uid] : undefined;
    const mine = pend !== undefined ? pend : saved;
    let key = on && r.answers ? r.answers[id] : undefined; if(typeof key === 'number') key = {c:key};
    const shown = !!key;
    const marked = !!key && (key.code ? key.marked : (key.c !== undefined && key.c >= 0) || !!(key.a && key.a.length));
    $('.sstate', h).textContent = !Student.on ? 'Join your class at the top of the page to answer.'
      : open ? (type === 'code' ? (mine === undefined ? 'Open: write your code, Run it, then Send to teacher.' : 'Sent. You can improve it and send again.')
               : type === 'text' ? (mine === undefined ? 'Open: type your answer and press Send.' : 'Sent. You can change it until it closes.')
               : (mine === undefined ? 'Open: choose your answer.' : 'Sent. You can change it until it closes.'))
      : active ? (mine !== undefined ? 'Closed. Your answer was sent.' : 'Closed.')
      : shown ? 'Your teacher has shown the answers.'
      : (type === 'code' ? 'You can try the code now. Sending opens when your teacher is ready.' : 'Waiting for your teacher to open this question.');
    h.classList.toggle('sopen', open);
    if(type === 'code'){
      $('.ssend', h).disabled = !open || sending;
      $('.ssend', h).textContent = sending ? 'Checking…' : mine === undefined ? 'Send to teacher' : 'Send again';
    } else if(type === 'text'){
      const inp = $('.sinput', h);
      inp.disabled = !open; $('.ssend', h).disabled = !open;
      if(document.activeElement !== inp && mine !== undefined && !inp.value) inp.value = mine;
      $('.ssend', h).textContent = mine === undefined ? 'Send' : 'Change';
    } else {
      $$('.sopt', h).forEach((b,i) => { b.disabled = !open; b.setAttribute('aria-pressed', i === mine);
        b.classList.toggle('right', shown && key.c === i); b.classList.toggle('wrongpick', shown && key.c !== undefined && key.c >= 0 && i === mine && i !== key.c); });
    }
    const sent = $('.ssent', h);
    sent.hidden = mine === undefined || type === 'choice' || type === 'checkin';
    if(!sent.hidden) sent.textContent = type === 'code' ? (mine.of ? `Sent to your teacher · ${mine.pass} of ${mine.of} tests passed` : 'Sent to your teacher') : `Answer sent: ${mine}`;
    const k = $('.skey', h);
    if(shown && type === 'text' && key.a){ k.hidden = false; k.innerHTML = `Answer: ${key.a.map(a => `<code>${esc(a)}</code>`).join(' · ')}`; }
    else if(shown && type === 'code' && key.model){ k.hidden = false; k.innerHTML = `<div>Model answer</div>${codeBlock(key.model)}`; }
    else k.hidden = true;
    let right = false;
    if(marked && mine !== undefined){
      if(key.code) right = !!(mine && mine.of > 0 && mine.pass === mine.of);
      else if(key.c !== undefined) right = mine === key.c;
      else right = key.a.some(a => norm(a, key.mono) === norm(mine, key.mono));
    }
    $('.sres', h).innerHTML = (marked && mine !== undefined)
      ? (right ? `<div class="feedback good">${type === 'code' ? 'All tests passed! 잘했어요!' : 'Correct! 정답입니다!'}</div>` : `<div class="feedback bad">${type === 'code' ? 'Not all tests passed yet. Compare with the model answer.' : 'Not this time. Check the answer.'}</div>`) : '';
  }
  Student.widgets[id] = {update, q, type};
  update();
}

const Student = (() => {
  const st = {on:false, code:'', uid:'', db:null, room:null, off:null, ended:false, sent:new Set(), pendingDone:new Set(), pendingCode:'', name:''};
  const widgets = {};
  const cfgOK = () => !!(window.firebase && window.FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !/PASTE/i.test(FIREBASE_CONFIG.apiKey) && FIREBASE_CONFIG.databaseURL);
  const locked = () => !!(st.on && st.room && st.room.follow !== false);
  function bar(){
    const b = $('#sBar'); if(!b) return;
    if(!st.on && st.pendingCode){
      b.innerHTML = `<span class="room">Room ${esc(st.pendingCode)}</span><span>Your teacher wants you to sign in first.</span><button class="btn primary gbtn" id="sGoogle"><span class="g" aria-hidden="true">G</span> Sign in with your school Google account</button><span class="serr" id="sErr" aria-live="polite"></span>`;
      $('#sGoogle').onclick = googleSignIn; return;
    }
    if(!st.on){
      if(!cfgOK()){ b.innerHTML = '<span class="small muted">Working on your own</span>'; return; }
      b.innerHTML = `${st.ended ? '<span class="small muted">The session ended. You can keep working.</span>' : ''}<input id="sCode" class="scode" maxlength="5" placeholder="Room code" aria-label="Room code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn primary" id="sJoin">Join class</button><span class="serr" id="sErr" aria-live="polite"></span>`;
      const qp = new URLSearchParams(location.search).get('room'); if(qp && !st.ended) $('#sCode').value = qp.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
      $('#sJoin').onclick = () => join($('#sCode').value);
      $('#sCode').addEventListener('keydown', e => { if(e.key === 'Enter') join($('#sCode').value); });
      return;
    }
    b.innerHTML = `<span class="room">Room ${esc(st.code)}</span>${st.name ? `<span class="sname">👤 ${esc(st.name)}</span>` : ''}<span class="sfollow" id="sFollow"></span><span class="score" id="sScore" hidden></span>`;
    status();
  }
  function score(){
    const r = st.room, ans = (r && r.answers) || {}; let right = 0, marked = 0;
    Object.keys(ans).forEach(q => { let k = ans[q]; if(typeof k === 'number') k = {c:k};
      const mine = r.votes && r.votes[q] ? r.votes[q][st.uid] : undefined;
      if(k.code){ if(!k.marked) return; marked++; if(mine && mine.of > 0 && mine.pass === mine.of) right++; return; }
      if(k.c !== undefined){ if(k.c < 0) return; marked++; if(mine === k.c) right++; return; }
      if(k.a && k.a.length){ marked++; if(mine !== undefined && k.a.some(a => norm(a, k.mono) === norm(mine, k.mono))) right++; } });
    return {right, marked};
  }
  function status(){
    const f = $('#sFollow'); if(f) f.textContent = locked() ? '🔒 Following your teacher' : '🔓 Free to explore';
    const sc = $('#sScore'); if(sc){ const {right, marked} = score(); sc.hidden = !marked; sc.textContent = `✓ ${right} / ${marked}`; }
  }
  function toast(){
    const t = $('#sToast'); if(!t) return;
    const r = st.room;
    if(!st.on || !r || !r.open || !r.active){ t.hidden = true; return; }
    const hostEl = $(`[data-vote="${r.active}"]`), stg = hostEl && hostEl.closest('.stage');
    const i = stg ? STAGES.findIndex(s => 'st-' + s.key === stg.id) : -1;
    if(i < 0 || i === cur){ t.hidden = true; return; }
    t.hidden = false;
    t.innerHTML = `<span>Your teacher opened a question</span><button class="btn primary">Go to it →</button>`;
    $('button', t).onclick = () => { go(i, true); hostEl.scrollIntoView({block:'center'}); };
  }
  const schoolEmail = e => !!e && e.toLowerCase().endsWith('@' + SCHOOL_DOMAIN);
  async function googleSignIn(){
    const err = m => { const e = $('#sErr'); if(e) e.textContent = m; };
    try{
      const auth = firebase.auth(), prov = new firebase.auth.GoogleAuthProvider();
      prov.setCustomParameters({hd: SCHOOL_DOMAIN, prompt: 'select_account'});
      const cred = await auth.signInWithPopup(prov);
      if(!schoolEmail(cred.user.email)){ await auth.signOut(); err(`Please use your school account (…@${SCHOOL_DOMAIN}).`); return; }
      const c = st.pendingCode; st.pendingCode = ''; join(c);
    }catch(e){ console.error(e);
      err(/popup-blocked/.test(e.code||'') ? 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
        : /popup-closed|cancelled-popup/.test(e.code||'') ? 'The sign-in window was closed. Try again.'
        : /unauthorized-domain/.test(e.code||'') ? 'Sign-in is not set up for this website yet. Tell your teacher (authorised domains).'
        : /admin_policy|access_denied|disallowed/i.test(String(e.message||'')) ? 'Your school account is not allowed to sign in to this app yet. Tell your teacher.'
        : 'Sign-in did not work: ' + (e.message || e)); }
  }
  async function join(raw){
    const c = String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const err = m => { const e = $('#sErr'); if(e) e.textContent = m; };
    if(c.length !== 5){ err('The room code has 5 letters or numbers.'); return; }
    err(''); const btn = $('#sJoin'); if(btn){ btn.disabled = true; btn.textContent = 'Joining…'; }
    try{
      if(!firebase.apps.some(a => a.name === '[DEFAULT]')) firebase.initializeApp(FIREBASE_CONFIG);
      const auth = firebase.auth();
      if(auth.authStateReady) await auth.authStateReady();
      if(!auth.currentUser) await auth.signInAnonymously();
      st.db = firebase.database();
      const snap = await st.db.ref('rooms/'+c).get();
      if(!snap.exists()) throw new Error('Room not found. Check the code on the board.');
      const needGoogle = snap.val().signin === 'google';
      const u = auth.currentUser;
      if(needGoogle && (u.isAnonymous || !schoolEmail(u.email))){ st.pendingCode = c; bar(); return; }
      st.uid = u.uid;
      await st.db.ref(`rooms/${c}/joined/${st.uid}`).set(needGoogle ? {name: String(u.displayName || u.email).slice(0,80), email: u.email} : true);
      st.name = needGoogle ? String(u.displayName || u.email) : '';
      st.code = c; st.on = true; st.ended = false; st.sent = new Set();
      document.body.classList.add('joined');
      const ref = st.db.ref('rooms/'+c), cb = ref.on('value', s => onRoom(s.val()));
      st.off = () => ref.off('value', cb);
      try{ const u = new URL(location.href); u.searchParams.set('room', c); history.replaceState(null, '', u.pathname + '?student&room=' + c); }catch(e){}
      bar();
      st.pendingDone.forEach(id => api.done(id)); st.pendingDone.clear();
    }catch(e){
      console.error(e);
      bar(); const m = (e.message && !/permission/i.test(e.message)) ? e.message : 'Could not join. Check the code and try again.';
      const ee = $('#sErr'); if(ee) ee.textContent = m;
    }
  }
  function onRoom(r){
    if(!r){ leave(true); return; }
    st.room = r;
    document.body.classList.toggle('locked', locked());
    if(locked() && r.stage){ const i = STAGES.findIndex(s => s.key === r.stage); if(i >= 0 && i !== cur) go(i, true); }
    Object.values(widgets).forEach(w => w.update());
    status(); toast();
  }
  function leave(ended){
    if(st.off) st.off(); st.off = null; st.on = false; st.room = null; st.ended = !!ended;
    document.body.classList.remove('locked', 'joined');
    Object.values(widgets).forEach(w => w.update()); bar(); toast();
  }
  const api = {
    widgets, join, bar,
    get on(){ return st.on; }, get room(){ return st.room; }, get uid(){ return st.uid; }, get locked(){ return locked(); },
    send(id, v){ return st.db.ref(`rooms/${st.code}/votes/${id}/${st.uid}`).set(v); },
    done(id){ if(!id || st.sent.has(id)) return;
      if(!st.on){ st.pendingDone.add(id); return; }
      st.sent.add(id); st.db.ref(`rooms/${st.code}/done/${id}/${st.uid}`).set(true).catch(() => st.sent.delete(id)); },
    refresh(){ toast(); }
  };
  return api;
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
      if(m.type === 'code'){
        const sb = w.subs(), all = Object.keys(sb).length, right = Object.values(sb).filter(w.passed).length, pct = all ? Math.round(right/all*100) : 0;
        if(m.marked && all){ sumPct += pct; nq++; }
        lines.push(`${stage} – ${m.title}: ${all ? (m.marked ? pct+'% passed every test ('+right+'/'+all+')' : all+' programs') : 'no programs'}`);
        return `<div class="res-row${all?'':' empty'}"><span class="t">${esc(stage)} · ${esc(m.title)}</span>${m.marked?`<div class="res-bar"><i class="c" style="width:${pct}%"></i><i class="w" style="width:${all?100-pct:0}%"></i></div>`:''}<span class="m">${all ? (m.marked ? `${pct}% passed every test · ${right} of ${all} programs` : `${all} programs`) : 'No programs yet'}</span></div>`;
      }
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
    let acts = '';
    if(Live.on && Object.keys(ACTS).length){
      const J = Live.joined, dn = Live.done, cap = x => x ? ' (' + x[0].toUpperCase() + x.slice(1) + ')' : '';
      const list = Object.values(ACTS).map(a => ({a, si: STAGES.findIndex(s => s.key === a.stage)})).sort((x,y) => x.si - y.si || x.a.id.localeCompare(y.a.id, undefined, {numeric:true}));
      lines.push('', 'Finished on student laptops:');
      acts = `<h4 class="res-h">Finished on student laptops <span class="small muted">(${J} joined)</span></h4>` + list.map(({a,si}) => {
        const n = dn[a.id] || 0, pc = J ? Math.min(100, n/J*100) : 0, sl = STAGES[si] ? STAGES[si].label : a.stage, kn = KIND[a.kind] || a.kind, name = (sl.toLowerCase() === kn.toLowerCase() ? kn : `${sl} · ${kn}`) + cap(a.level);
        lines.push(`${name}: ${n} of ${J}`);
        return `<div class="res-row${n?'':' empty'}"><span class="t">${esc(name)}</span><div class="res-bar"><i class="c" style="width:${pc}%"></i></div><span class="m">${n} of ${J} finished</span></div>`; }).join('');
    }
    api.text = `${document.title} results (${new Date().toLocaleDateString()})\n` + (avg!==null?`Average correct: ${avg}% across ${nq} questions\n`:'') + lines.join('\n');
    return `<p class="small muted">Includes device answers and hand counts.</p>
      <p style="margin:8px 0"><span class="res-sum">${avg===null?'–':avg+'%'}</span> <span class="muted">average correct${nq?` across ${nq} question${nq>1?'s':''}`:''}</span></p>
      ${rows}${acts}<div class="bar" style="margin-top:10px"><button class="btn" id="resCopy">Copy summary</button><span class="status" id="resMsg"></span></div>`;
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
const STUDENT = new URLSearchParams(location.search).has('student');
let QUESTIONS = {}, LESSON = {};
function togglePanel(force){
  const d = $('#livePanel'); const show = force === undefined ? d.hidden : force;
  if(show){ ['gloss','picker','resPanel'].forEach(x => $('#'+x).hidden = true); $('#glossBtn').setAttribute('aria-pressed', false); $('#pickBtn').setAttribute('aria-pressed', false); $('#resBtn').setAttribute('aria-pressed', false); Live.panel(); }
  d.hidden = !show;
}
function go(i, fromTeacher){
  if(STUDENT && Student.locked && !fromTeacher) return;
  cur = Math.max(0, Math.min(STAGES.length-1, i));
  $$('.stage').forEach((s,k) => s.hidden = k !== cur);
  $$('.step').forEach((b,k) => { if(k === cur) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current'); });
  $('#prev').disabled = cur === 0; $('#next').disabled = cur === STAGES.length-1;
  $('#pos').textContent = `Stage ${cur+1} of ${STAGES.length}`;
  $('#dLabel').innerHTML = `${esc(STAGES[cur].label)} <span>${cur+1}/${STAGES.length}</span>`;
  $('#dPrev').disabled = cur === 0; $('#dNext').disabled = cur === STAGES.length-1;
  window.scrollTo({top:0});
  if(STUDENT) Student.refresh(); else if(Live.on) Live.stage(STAGES[cur].key);
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
    ${STUDENT ? '<div class="sbar" id="sBar"></div>' : ''}
    <nav class="steps" id="steps" aria-label="Lesson stages"></nav>
    ${STUDENT ? '<p class="sfollowbar">🔒 Your screen follows your teacher. Work on this page.</p>' : ''}
  </div></div>
  ${STUDENT ? '<div class="stoast" id="sToast" hidden role="status"></div>' : ''}

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
    hostEl.innerHTML = `<div class="eyebrow">${isCheck ? 'Class check-in' : q.type === 'text' ? 'Type your answer' : q.type === 'code' ? 'Code on your laptop' : 'Class vote'}</div>
      <p class="big-q" style="font-size:${isCheck?'1.25rem':'1.45rem'}">${esc(q.title)}</p>
      ${q.code ? codeBlock(q.code) : ''}<div class="vw"></div>`;
    if(STUDENT) studentAsk($('.vw', hostEl), id, q); else askWidget($('.vw', hostEl), id, q);
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
    if(!STUDENT && (e.key === 'p' || e.key === 'P')) setPresent(!document.body.classList.contains('present'));
  });
  window.addEventListener('beforeunload', e => { if(Live.on){ e.preventDefault(); e.returnValue = ''; } });
  if(!window.firebase) $('#liveBtn').hidden = true;
  if(STUDENT){ document.body.classList.add('student'); document.title = document.title + ' · student'; }
}

/* ---------------- entry point ---------------- */
function start(cfg){
  const tag = document.currentScript || $('script[data-root]');
  ROOT = (cfg.root !== undefined) ? cfg.root : ((tag && tag.dataset.root) ? tag.dataset.root : './');
  if(ROOT && !ROOT.endsWith('/')) ROOT += '/';
  STAGES = cfg.stages; QUESTIONS = cfg.questions || {}; LESSON = cfg;
  Results.setStages(STAGES);
  shell(cfg);
  if(cfg.ready) cfg.ready();
  setLevel(cfg.level || 'core');
  go(0);
  if(STUDENT){ Student.bar(); const r = new URLSearchParams(location.search).get('room'); if(r && window.firebase) Student.join(r); }
}

return { start, editor, codeTask, studentAsk, Student, ACTS, trace, parsons, gaps, annotate, sorter, askWidget, bugHunt, loopTrace, rangeExplorer,
  code: codeBlock, scopeCode, hl, run: runPython, showResult, onLevel, setLevel,
  $, $$, esc, CHECKIN, WIDGETS, Live, Results, get root(){ return ROOT; } };
})();
