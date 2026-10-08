/**
 * 習慣・予定・やることアプリのデータ保存用（Googleスプレッドシートに紐づけて使う）
 * KEY は config.js の KEY と同じ文字列にする。
 */
const KEY = 'L7Zh18wU-gmXnFLytFlX3tRn';

const T = {
  REC: { name: '記録', h: ['日付', '項目ID', '項目名', '結果', 'メモ', '更新日時'] },
  SET: { name: '設定', h: ['項目ID', '名前', 'IF', 'THEN', '頻度', '並び順'] },
  EV: { name: '予定', h: ['ID', '日付', '開始', '終了', 'タイトル', 'タグ', 'メモ', '色', '完了', 'ステップ', '並び順', '繰り返しID', 'もとの日付', '更新日時'],
        f: ['id', 'date', 'start', 'end', 'title', 'tag', 'note', 'color', 'done', 'steps', 'order', 'rule', 'carried', 'updated'] },
  LIFE: { name: '繰り返し', h: ['ID', '名前', 'タグ', '種類', '間隔（日）', '曜日', 'メモ', '並び順'] },
  HELP: { name: 'AI向けの説明', h: ['項目', '内容'] }
};

const HELP_ROWS = [
  ['このシート', '習慣・予定・やることアプリのデータ。アプリ：https://stormforce-cell.github.io/habit-app/'],
  ['予定・やることを足す', '「予定」タブの一番下に行を足す。予定とやることは同じもの（日付のついたタスク）。ID は空でよい（アプリが自動で付ける）。日付は 2026-10-09 の形で必須'],
  ['2つの形式', '開始・終了が空なら「イベント形式」（時間なし、その日にやること）。開始・終了を 09:00 の形で入れると「時間の形式」（カレンダーの時間割に出る）'],
  ['タグ', '「仕事」か「ライフ」（ほかの言葉でもよい）。仕事のことなら仕事、掃除・買い物など暮らしのことならライフ'],
  ['ほかの列', '完了は空（やったら日時が入る）。色・ステップ・並び順・繰り返しID・もとの日付は空でよい。ステップは1行に1つ「[ ] 内容」。色はトマト/ミカン/バナナ/バジル/ピーコック/ブドウ/グラファイト'],
  ['繰り返し', '「繰り返し」タブ：掃除・買い物など繰り返すこと。種類は「間隔」（間隔（日）ごと、前回やった日から数える）か「曜日」（曜日に 月,木 のように書く）。やる日になるとアプリが「予定」タブにその日の分を作る。足すときはIDを空にして一番下に行を足してよい'],
  ['習慣を読む', '「記録」タブ：1日×1項目で1行。結果は ○ か ×。「設定」タブ：IF-THENの中身'],
  ['書かないこと', '「記録」「設定」はアプリが管理するので、AIは読むだけにする。既存行の ID は変えない']
];

function doGet(e) { return handle_(e.parameter || {}); }
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return handle_(p);
}

function handle_(p) {
  if (p.key !== KEY) return out_({ ok: false, error: 'bad key' });
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    ensure_();
    switch (p.action) {
      case 'load': return out_({ ok: true, items: loadItems_(), records: loadRecords_(p.since),
        events: readTable_(T.EV), life: loadLife_() });
      case 'upsert': upsertRecord_(p); break;
      case 'saveItems': saveItems_(p.items || []); break;
      case 'saveEvent': upsertRow_(T.EV, p.item); break;
      case 'delEvent': deleteRow_(T.EV, p.id); break;
      case 'saveLife': saveLife_(p.life || []); break;
      default: return out_({ ok: false, error: 'unknown action' });
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- シートの用意 ---------- */
function ensure_() {
  sheet_(T.REC); sheet_(T.SET);
  const ev = sheet_(T.EV);
  sheet_(T.LIFE);
  const help = sheet_(T.HELP);
  if (help.getLastRow() < 2) help.getRange(2, 1, HELP_ROWS.length, 2).setValues(HELP_ROWS);
  const r = ev.getRange(1, 1, ev.getMaxRows(), ev.getMaxColumns());
  if (r.getNumberFormat() !== '@') r.setNumberFormat('@');
}

function sheet_(t) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(t.name);
  if (!sh) {
    const first = ss.getSheets()[0];
    const a1 = String(first.getRange(1, 1).getValue());
    if (t === T.REC && ss.getSheets().length === 1 && first.getLastRow() <= 1 && (a1 === '' || a1 === t.h[0])) {
      sh = first.setName(t.name);
    } else {
      sh = ss.insertSheet(t.name);
    }
  }
  if (sh.getLastRow() === 0) { sh.appendRow(t.h); sh.setFrozenRows(1); }
  return sh;
}

/* ---------- 形式の正規化（AIが書いた行も読めるように） ---------- */
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }
function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const m = String(v || '').trim().replace(/[\/.年月]/g, '-').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}
function hm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  const m = String(v || '').trim().match(/(\d{1,2})[:：時](\d{2})?/);
  return m ? ('0' + m[1]).slice(-2) + ':' + (m[2] || '00') : '';
}
function bool_(v) { return /^(true|1|はい|yes|★|○|y)$/i.test(String(v || '').trim()); }

function norm_(t, o) {
  if (t === T.EV) {
    o.date = ymd_(o.date); o.start = hm_(o.start); o.end = hm_(o.end);
    if (!o.start) o.end = '';
    o.done = String(o.done || '').trim();
    if (o.done && /^(true|1|はい|済|完了|○|x)$/i.test(o.done)) o.done = now_();
    o.order = o.order === '' || o.order == null || isNaN(Number(o.order)) ? '' : Number(o.order);
  }
  return o;
}

/* ---------- 予定・TODO（汎用） ---------- */
function readTable_(t) {
  const sh = sheet_(t);
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  const rng = sh.getRange(2, 1, n, t.h.length);
  const vals = rng.getDisplayValues();
  const out = [];
  let fixed = false;
  vals.forEach((r, i) => {
    const o = {};
    t.f.forEach((k, j) => { o[k] = r[j]; });
    const titleCol = t.f.indexOf('title');
    if (!o.title && !o.id) return;
    if (!o.id) { o.id = 'a' + Utilities.getUuid().slice(0, 8); r[0] = o.id; fixed = true; }
    if (titleCol >= 0 && !o.title) return;
    out.push(norm_(t, o));
  });
  if (fixed) rng.setValues(vals);
  return out;
}

function findRow_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n <= 0 || !id) return -1;
  const ids = sh.getRange(2, 1, n, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function upsertRow_(t, item) {
  if (!item || !item.id) throw new Error('id required');
  const sh = sheet_(t);
  const o = norm_(t, Object.assign({}, item));
  o.updated = now_();
  const row = t.f.map(k => (o[k] == null ? '' : String(o[k])));
  const r = findRow_(sh, o.id);
  if (r > 0) sh.getRange(r, 1, 1, row.length).setValues([row]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function deleteRow_(t, id) {
  const sh = sheet_(t);
  const r = findRow_(sh, id);
  if (r > 0) sh.deleteRow(r);
}

/* ---------- 繰り返し ---------- */
function loadLife_() {
  const sh = sheet_(T.LIFE);
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  const rng = sh.getRange(2, 1, n, 8);
  const vals = rng.getDisplayValues();
  let fixed = false;
  const out = [];
  vals.forEach((r, i) => {
    if (!r[1]) return;
    if (!r[0]) { r[0] = 'l' + Utilities.getUuid().slice(0, 8); fixed = true; }
    out.push({ id: r[0], name: r[1], tag: r[2] || 'ライフ', kind: /曜/.test(r[3]) ? 'weekly' : 'interval', every: Number(r[4]) || 7,
      weekdays: String(r[5] || '').replace(/[、\s]/g, ',').split(',').filter(Boolean).join(','), note: r[6], order: Number(r[7]) || (i + 1) * 10 });
  });
  if (fixed) rng.setValues(vals);
  return out.sort((a, b) => a.order - b.order);
}
function saveLife_(list) {
  const sh = sheet_(T.LIFE);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 8).clearContent();
  if (!list.length) return;
  const rows = list.map((x, i) => [x.id, x.name || '', x.tag || '', x.kind === 'weekly' ? '曜日' : '間隔', x.kind === 'weekly' ? '' : String(x.every || 7), x.kind === 'weekly' ? (x.weekdays || '') : '', x.note || '', String((i + 1) * 10)]);
  sh.getRange(2, 1, rows.length, 8).setNumberFormat('@').setValues(rows);
}

/* ---------- 習慣 ---------- */
function loadRecords_(since) {
  const sh = sheet_(T.REC);
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, 1, n, 5).getValues()
    .map(r => ({ date: ymd_(r[0]), id: String(r[1]), mark: r[3] === '○' ? 'o' : r[3] === '×' ? 'x' : '', note: String(r[4] || '') }))
    .filter(r => !since || r.date >= since);
}

function upsertRecord_(p) {
  const sh = sheet_(T.REC);
  const n = sh.getLastRow() - 1;
  const mark = p.mark === 'o' ? '○' : p.mark === 'x' ? '×' : '';
  const note = p.note || '';
  let row = -1;
  if (n > 0) {
    const vals = sh.getRange(2, 1, n, 2).getValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      if (ymd_(vals[i][0]) === p.date && String(vals[i][1]) === p.id) { row = i + 2; break; }
    }
  }
  if (!mark && !note) { if (row > 0) sh.deleteRow(row); return; }
  const values = [[p.date, p.id, p.name || '', mark, note, new Date()]];
  if (row > 0) sh.getRange(row, 1, 1, 6).setValues(values);
  else sh.appendRow(values[0]);
}

function loadItems_() {
  const sh = sheet_(T.SET);
  const n = sh.getLastRow() - 1;
  if (n <= 0) return null;
  return sh.getRange(2, 1, n, 6).getValues()
    .filter(r => r[0] !== '')
    .sort((a, b) => a[5] - b[5])
    .map(r => ({ id: String(r[0]), name: String(r[1]), ifText: String(r[2]), thenText: String(r[3]), freq: r[4] === '週1' ? 'weekly' : 'daily' }));
}

function saveItems_(items) {
  const sh = sheet_(T.SET);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 6).clearContent();
  if (!items.length) return;
  const rows = items.map((it, i) => [it.id, it.name || '', it.ifText || '', it.thenText || '', it.freq === 'weekly' ? '週1' : '毎日', i + 1]);
  sh.getRange(2, 1, rows.length, 6).setValues(rows);
}

/** エディタでこれを実行するとタブがそろう */
function setup() { ensure_(); }
