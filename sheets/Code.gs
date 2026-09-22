/**
 * CS Lesson Results — saves live lesson sessions into Google Sheets.
 *
 * Creates, in your Google Drive:
 *   CS Lesson Results / Year 9 / 9C results   (one spreadsheet per class)
 *     ├ Progress                 one row per student, one column per session (% score)
 *     └ 22 Sep · While Loops     one tab per session: every answer, class totals, code
 *
 * Setup: see SHEETS-SETUP.md. Deploy as a Web app, Execute as: Me, Who has access: Anyone.
 * The lesson page does all the working out; this script only writes what it is sent,
 * so you never need to update or redeploy it when the lessons change.
 */
const ROOT_FOLDER = 'CS Lesson Results';

function doGet() {
  return out({ ok: true, message: 'CS lesson results saver is running' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (!d || !d.cls || !Array.isArray(d.rows) || !Array.isArray(d.columns)) throw new Error('No session data received');
    const ss = classBook(String(d.yearLabel || 'Other'), String(d.cls));
    const sh = sessionTab(ss, d);
    progress(ss, d, sh.getName());
    return out({ ok: true, url: ss.getUrl() + '#gid=' + sh.getSheetId(), tab: sh.getName(), book: ss.getName() });
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function subFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* Find or create the spreadsheet for a class, e.g. "9C results" in CS Lesson Results / Year 9 */
function classBook(yearLabel, cls) {
  const folder = subFolder(subFolder(DriveApp.getRootFolder(), ROOT_FOLDER), yearLabel);
  const name = cls + ' results';
  const files = folder.getFilesByName(name);
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  const ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  const p = ss.getSheets()[0].setName('Progress');
  p.getRange(1, 1, 1, 3).setValues([['Student', 'Email', 'Average %']]).setFontWeight('bold').setBackground('#EEF2F1');
  p.setFrozenRows(1);
  p.setFrozenColumns(3);
  p.setColumnWidth(1, 180);
  p.setColumnWidth(2, 230);
  p.setColumnWidth(3, 90);
  return ss;
}

function ensureColumns(sh, n) {
  const max = sh.getMaxColumns();
  if (n > max) sh.insertColumnsAfter(max, n - max);
}
function ensureRows(sh, n) {
  const max = sh.getMaxRows();
  if (n > max) sh.insertRowsAfter(max, n - max);
}

/* One tab per session. Saving again from the same session replaces its tab. */
function sessionTab(ss, d) {
  const clean = s => String(s).replace(/[\[\]\*\?\/\\:']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Session';
  let sh = null;
  if (d.replace) {
    const old = ss.getSheetByName(clean(d.replace));
    if (old) { const idx = old.getIndex(); ss.deleteSheet(old); sh = ss.insertSheet(clean(d.replace), idx - 1); }
  }
  if (!sh) {
    const base = clean(d.tabName);
    let name = base, n = 2;
    while (ss.getSheetByName(name)) name = base + ' (' + (n++) + ')';
    sh = ss.insertSheet(name, 1); // newest session straight after Progress
  }
  const H = d.columns.length, width = 2 + H + 2;
  ensureColumns(sh, Math.max(width, 4));
  ensureRows(sh, 10 + d.rows.length + (d.code ? d.code.length : 0));

  sh.getRange(1, 1).setValue(d.title || '').setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue(d.subtitle || '').setFontColor('#56676C');

  const r0 = 4;
  const head = ['Student', 'Email'].concat(d.columns.map(c => c.h)).concat(['Score', '%']);
  sh.getRange(r0, 1, 1, width).setValues([head]).setFontWeight('bold').setWrap(true)
    .setVerticalAlignment('top').setBackground('#EEF2F1');
  d.columns.forEach((c, i) => { if (c.note) sh.getRange(r0, 3 + i).setNote(c.note); });

  if (d.rows.length) {
    const vals = d.rows.map(r => [r.name, r.email || ''].concat(r.cells.map(c => c.v)).concat([r.score, r.pct]));
    const bg = d.rows.map(r => [null, null].concat(r.cells.map(c => c.s === 'ok' ? '#DDF1E4' : c.s === 'bad' ? '#F8DEDC' : null)).concat([null, null]));
    const rg = sh.getRange(r0 + 1, 1, vals.length, width);
    rg.setValues(vals);
    rg.setBackgrounds(bg);
  }
  const rc = r0 + 1 + d.rows.length;
  sh.getRange(rc, 1, 1, width).setValues([['Class', ''].concat(d.classRow).concat(['', d.classAvg])])
    .setFontWeight('bold').setBackground('#FFF3C7');

  sh.setFrozenRows(r0);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 170);
  sh.setColumnWidth(2, 210);
  for (let i = 0; i < H; i++) sh.setColumnWidth(3 + i, 140);

  if (d.code && d.code.length) {
    let r = rc + 3;
    sh.getRange(r, 1).setValue('Code sent by students').setFontWeight('bold').setFontSize(12);
    r++;
    sh.getRange(r, 1, 1, 4).setValues([['Student', 'Task', 'Tests passed', 'Code']]).setFontWeight('bold').setBackground('#EEF2F1');
    r++;
    const cv = d.code.map(c => [c.name, c.task, c.tests, c.code]);
    sh.getRange(r, 1, cv.length, 4).setValues(cv).setVerticalAlignment('top');
    sh.getRange(r, 4, cv.length, 1).setFontFamily('Roboto Mono').setWrapStrategy(SpreadsheetApp.WrapStrategy.OVERFLOW);
  }
  return sh;
}

/* Progress tab: one row per signed-in student, one column per session, average in column C */
function progress(ss, d, tabName) {
  const withEmail = d.rows.filter(r => r.email && r.pct !== '' && r.pct !== null);
  if (!withEmail.length) return;
  const p = ss.getSheetByName('Progress') || ss.insertSheet('Progress', 0);
  const lastCol = Math.max(3, p.getLastColumn());
  const headers = p.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  let col = headers.indexOf(tabName) + 1;
  if (col < 1) { col = lastCol + 1; ensureColumns(p, col); p.getRange(1, col).setValue(tabName).setFontWeight('bold').setWrap(true).setBackground('#EEF2F1'); p.setColumnWidth(col, 110); }

  const n = Math.max(0, p.getLastRow() - 1);
  const keys = n ? p.getRange(2, 2, n, 1).getValues().map(r => String(r[0]).toLowerCase()) : [];
  withEmail.forEach(r => {
    let i = keys.indexOf(String(r.email).toLowerCase()), row;
    if (i < 0) {
      row = keys.length + 2; ensureRows(p, row);
      p.getRange(row, 1, 1, 2).setValues([[r.name, r.email]]);
      keys.push(String(r.email).toLowerCase());
    } else row = i + 2;
    p.getRange(row, col).setValue(r.pct);
  });

  const rows = keys.length;
  if (rows > 1) p.getRange(2, 1, rows, p.getLastColumn()).sort(1);
  const f = [];
  for (let i = 0; i < rows; i++) { const r = i + 2; f.push(['=IFERROR(ROUND(AVERAGE(D' + r + ':' + r + '),0),"")']); }
  p.getRange(2, 3, rows, 1).setFormulas(f).setFontWeight('bold');

  const rule = SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#F4B6B0', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMidpointWithValue('#FFE8A3', SpreadsheetApp.InterpolationType.NUMBER, '50')
    .setGradientMaxpointWithValue('#9FD9B4', SpreadsheetApp.InterpolationType.NUMBER, '100')
    .setRanges([p.getRange(2, 3, p.getMaxRows() - 1, p.getMaxColumns() - 2)])
    .build();
  p.setConditionalFormatRules([rule]);
}
