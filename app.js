/* ================= 共通 ================= */
const CFG = window.HABIT_CONFIG || {};
const ONLINE = !!(CFG.API_URL && CFG.KEY);
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const keyOf = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseKey = k => { const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d,12); };
const addDays = (k,n) => { const d=parseKey(k); d.setDate(d.getDate()+n); return keyOf(d); };
const todayKey = () => keyOf(new Date());
const dayAt = off => addDays(todayKey(), off);
const WD = ["日","月","火","水","木","金","土"];
const md = k => { const d=parseKey(k); return (d.getMonth()+1)+"/"+d.getDate()+"（"+WD[d.getDay()]+"）"; };
const nowHM = () => { const d=new Date(); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const toMin = hm => { if(!hm) return null; const [h,m]=hm.split(":").map(Number); return h*60+m; };
const uid = () => "w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const stamp = () => todayKey()+" "+nowHM();
function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

const COLORS = {"トマト":"#d50000","ミカン":"#f4511e","バナナ":"#e4a400","バジル":"#0b8043","ピーコック":"#039be5","ブドウ":"#8e24aa","グラファイト":"#616161"};
const colorOf = c => COLORS[c] || COLORS["ピーコック"];

const DEFAULT_ITEMS = [
  {id:"g", name:"声門閉鎖", ifText:"歌の練習を始めたら", thenText:"最初の10分は声門閉鎖", freq:"daily"},
  {id:"r", name:"リール", ifText:"", thenText:"リールを1本撮る", freq:"daily"},
  {id:"m", name:"薬", ifText:"寝る前に洗顔したら", thenText:"薬を塗る", freq:"daily"},
  {id:"p", name:"写真", ifText:"薬を塗ったら", thenText:"肌の写真を1枚撮る", freq:"weekly"}
];

/* ================= データ ================= */
// events = 日付のついたタスク。開始が空なら「イベント形式」、あれば「時間の形式」
let S = { items: DEFAULT_ITEMS.map(x=>({...x})), days:{}, events:[], life:[] };
let pending = [];
let syncMsg = "";

function loadLocal(){
  try{ const s=JSON.parse(localStorage.getItem("app2-state")||"null"); if(s) S={...S,...s}; }catch(e){}
  try{ pending=JSON.parse(localStorage.getItem("app2-pending")||"[]")||[]; }catch(e){}
  try{ if(!Object.keys(S.days).length){ const d=JSON.parse(localStorage.getItem("habit-days")||"null"); if(d) S.days=d; } }catch(e){}
}
function saveLocal(){
  try{ localStorage.setItem("app2-state", JSON.stringify(S)); localStorage.setItem("app2-pending", JSON.stringify(pending)); }catch(e){}
}
function setStatus(t){ syncMsg=t; const s=$("status"); if(s) s.textContent=t; }

function applyOp(op){
  const p=op.p;
  if(op.a==="saveEvent"){ const i=S.events.findIndex(x=>x.id===p.item.id); if(i>=0) S.events[i]=p.item; else S.events.push(p.item); }
  else if(op.a==="delEvent"){ S.events=S.events.filter(x=>x.id!==p.id); }
  else if(op.a==="saveItems"){ S.items=p.items.slice(); }
  else if(op.a==="saveLife"){ S.life=p.life.slice(); }
  else if(op.a==="upsert"){ const r={...(S.days[p.date]||{})}; if(p.mark) r[p.id]=p.mark; else delete r[p.id]; if(p.note) r["n_"+p.id]=p.note; else delete r["n_"+p.id]; S.days[p.date]=r; }
}
let flushTimer=null;
function queue(k, a, p){
  const op={k,a,p};
  pending = pending.filter(x=>x.k!==k); pending.push(op);
  applyOp(op); saveLocal();
  clearTimeout(flushTimer); flushTimer=setTimeout(flush, 600);
}
async function api(body){
  const res = await fetch(CFG.API_URL, {method:"POST", body: JSON.stringify({...body, key: CFG.KEY})});
  const j = await res.json();
  if(!j.ok) throw new Error(j.error||"error");
  return j;
}
let flushing=false;
async function flush(){
  if(!ONLINE){ setStatus("この端末にだけ保存中（config.js未設定）"); return; }
  if(flushing) return; flushing=true;
  try{
    while(pending.length){
      const op=pending[0];
      setStatus("保存中…");
      try{ await api({action:op.a, ...op.p}); }
      catch(e){ setStatus("未送信あり（電波が戻ったら自動で送る）"); setTimeout(flush, 15000); return; }
      pending = pending.filter(x=>x!==op);
      saveLocal();
    }
    setStatus("保存済み");
  } finally { flushing=false; }
}
let lastLoad=0;
async function pull(){
  if(!ONLINE){ setStatus("この端末にだけ保存中（config.js未設定）"); return; }
  try{
    setStatus("同期中…");
    const url = CFG.API_URL+"?action=load&key="+encodeURIComponent(CFG.KEY)+"&since="+dayAt(-120);
    const j = await (await fetch(url)).json();
    if(!j.ok) throw new Error(j.error);
    const days={};
    (j.records||[]).forEach(r=>{ days[r.date]=days[r.date]||{}; if(r.mark) days[r.date][r.id]=r.mark; if(r.note) days[r.date]["n_"+r.id]=r.note; });
    S.days=days; S.events=j.events||[]; S.life=j.life||[];
    const needItems = !(Array.isArray(j.items)&&j.items.length);
    if(!needItems) S.items=j.items;
    pending.forEach(applyOp);
    if(needItems && !pending.some(x=>x.a==="saveItems")) queue("items","saveItems",{items:S.items});
    saveLocal(); lastLoad=Date.now();
    dailyMaintenance();
    setStatus("同期済み"); if(!dragging) render(); flush();
  }catch(e){ setStatus("同期できませんでした（圏外？）"); }
}

/* ================= ルーティング ================= */
let R = { name:"home", arg:"" };
const calState = { view:"day", date: todayKey() };
let openDone = false;
let habitOffset = 0;
let dragging = false;
function parseRoute(){
  const hsh = location.hash.replace(/^#\/?/,"");
  const [name, ...rest] = hsh.split("/");
  R = { name: name||"home", arg: decodeURIComponent(rest.join("/")) };
}
window.addEventListener("hashchange", ()=>{ parseRoute(); openDone=false; render(); window.scrollTo(0,0); if(R.name==="today"||R.name==="cal") scrollTimeline(); });

function render(){
  const app=$("app"); app.innerHTML="";
  $("addbar").hidden=true; $("fab").hidden=true; document.body.classList.remove("has-add");
  document.querySelectorAll("#tabs a").forEach(a=>a.classList.toggle("on", a.dataset.r===R.name));
  ({home:viewHome, today:viewToday, cal:viewCal, todo:viewTodo, habit:viewHabit, repeat:viewRepeat}[R.name]||viewHome)(app);
  const st=el("div","status",syncMsg); st.id="status"; app.appendChild(st);
}

/* ================= タスク（予定）のヘルパー ================= */
const isTimed = e => !!e.start;
const timeLabel = e => e.start ? (e.start+(e.end?"–"+e.end:"")) : "イベント";
const doneDay = e => { if(!e.done) return null; const m=String(e.done).match(/^\d{4}-\d{2}-\d{2}/); return m?m[0]:e.date; };
const ord = e => (e.order===""||e.order==null||isNaN(Number(e.order))) ? 1e9 : Number(e.order);
function sortTasks(a){ return a.slice().sort((x,y)=> (ord(x)-ord(y)) || ((x.start||"99")<(y.start||"99")?-1:1)); }
function sortTime(a){ return a.slice().sort((x,y)=>(x.start||"")<(y.start||"")?-1:1); }
const on = k => S.events.filter(e=>e.date===k);
function saveEv(e){ queue("ev|"+e.id,"saveEvent",{item:{...e}}); }
function toggleDone(e){ saveEv({...e, done: e.done? "" : stamp()}); render(); }
function nextOrder(k){ const xs=on(k).map(ord).filter(x=>x<1e9); return xs.length? Math.max(...xs)+10 : 10; }
function parseSteps(s){ return String(s||"").split("\n").filter(x=>x.trim()).map(x=>{ const m=x.match(/^\s*\[( |x|X)\]\s*(.*)$/); return m?{done:m[1]!==" ", text:m[2]}:{done:false,text:x.trim()}; }); }
function fmtSteps(a){ return a.filter(s=>s.text.trim()).map(s=>"["+(s.done?"x":" ")+"] "+s.text).join("\n"); }

/* 習慣のヘルパー */
function lastDone(id){ for(let off=0; off>-120; off--){ const r=S.days[dayAt(off)]; if(r && r[id]==="o") return {label:md(dayAt(off)).replace(/（.）/,""), ago:-off}; } return null; }
function streakX(id){ let n=0; for(let off=0; off>-60; off--){ const r=S.days[dayAt(off)]; if(off===0 && !(r&&r[id])) continue; if(r&&r[id]==="x") n++; else break; } return n; }
function habitWarnings(){
  const msgs=[]; S.items.forEach(it=>{ if(it.freq==="daily"){ const s=streakX(it.id); if(s>=3) msgs.push(it.name+"が"+s+"日続けて×"); } });
  return msgs.length? msgs.join("、")+"。何が重い？ 習慣のメモに書いて。" : "";
}
function habitsDue(k){ // その日にやる習慣（週1は前回から6日以上空いたら）
  return S.items.filter(it=>{ if(it.freq!=="weekly") return true; const r=S.days[k]||{}; if(r[it.id]) return true;
    for(let i=1;i<=6;i++){ const rr=S.days[addDays(k,-i)]; if(rr&&rr[it.id]==="o") return false; } return true; });
}
function habitMark(k,id,v){ const r=S.days[k]||{}; const nv=r[id]===v?"":v; const it=S.items.find(x=>x.id===id)||{};
  queue("rec|"+k+"|"+id,"upsert",{date:k,id,name:it.name||"",mark:nv,note:r["n_"+id]||""}); render(); }


/* ================= タグ ================= */
const TAG_COLORS = {"仕事":"#2563c9","ライフ":"#c06a00"};
function allTags(){ const set=["仕事","ライフ"]; [...S.events,...S.life].forEach(x=>{ if(x.tag && !set.includes(x.tag)) set.push(x.tag); }); return set; }
function tagBadge(t){ const b=el("span","badge tag",t); const c=TAG_COLORS[t]||"var(--sub)"; b.style.color=c; b.style.borderColor=c; return b; }
let lastTag = (()=>{ try{ return localStorage.getItem("last-tag")||"仕事"; }catch(e){ return "仕事"; } })();
function setLastTag(t){ lastTag=t; try{ localStorage.setItem("last-tag",t); }catch(e){} }
function tagPicker(cur, onPick){
  const box=el("div","tagpick");
  const paint=()=>{ box.innerHTML=""; allTags().forEach(t=>{ const b=el("button",t===cur?"on":null,t); b.type="button"; b.onclick=()=>{ cur=t; onPick(t); paint(); }; box.appendChild(b); });
    const add=el("button",null,"＋"); add.type="button"; add.onclick=()=>{ const t=(prompt("新しいタグ")||"").trim(); if(t){ cur=t; onPick(t); if(!allTags().includes(t)) TAG_COLORS[t]=TAG_COLORS[t]; paint(); const nb=el("button","on",t); box.insertBefore(nb, add); } }; box.appendChild(add); };
  paint(); return box;
}

/* ================= 繰り返し（掃除・買い物など） ================= */
// ルールは S.life。やる日になると、その日の分を普通のタスク（予定タブの1行）として作る。ID は r_ルールID_日付
const WDN = ["日","月","火","水","木","金","土"];
const dayDiff = (a,b) => Math.round((parseKey(b)-parseKey(a))/864e5);
const instId = (rid,k) => "r_"+rid+"_"+k;
function ruleRule(it){ return it.kind==="weekly" ? ("毎週 "+(it.weekdays||"（曜日なし）").split(",").join("・")) : (it.every+"日ごと"); }
function ruleLastDone(rid){ let best=null; S.events.forEach(e=>{ if(e.rule===rid && e.done){ const d=doneDay(e); if(!best||d>best) best=d; } }); return best; }
function ruleOpen(rid){ return S.events.find(e=>e.rule===rid && !e.done); }
function ruleDueOn(it, k, assumeTodayDone){
  if(S.events.some(e=>e.id===instId(it.id,k))) return false;
  const open=ruleOpen(it.id); if(open && !(assumeTodayDone && open.date<=todayKey())) return false; // 残っている分があれば新しく作らない
  if(it.kind==="weekly") return (it.weekdays||"").split(",").includes(WDN[parseKey(k).getDay()]);
  let last=ruleLastDone(it.id); if(assumeTodayDone && open) last=todayKey();
  return !last || dayDiff(last,k)>=it.every;
}
function ensureRecurring(){
  const T=todayKey();
  S.life.forEach(it=>{ if(ruleDueOn(it,T)) saveEv({id:instId(it.id,T), date:T, start:"", end:"", title:it.name, tag:it.tag||"ライフ", note:it.note||"", color:"", done:"", steps:"", order:nextOrder(T), rule:it.id}); });
}
// 前の日に終わらなかった「イベント形式」のタスクは今日に移す（時間の予定は移さない）
function rollover(){
  const T=todayKey(), lim=dayAt(-14);
  const xs=S.events.filter(e=>!e.done && !e.start && e.date<T && e.date>=lim);
  if(!xs.length) return;
  let o=Math.min(10, ...on(T).map(ord))-10*xs.length;
  xs.sort((a,b)=>a.date<b.date?-1:1).forEach(e=>{ saveEv({...e, date:T, order:o, carried: e.carried||e.date}); o+=10; });
}
function dailyMaintenance(){ rollover(); ensureRecurring(); }
function rulePreview(k){ return S.life.filter(it=>ruleDueOn(it,k,true)); }
function ruleNext(it){ const T=todayKey(); const inst=S.events.find(e=>e.id===instId(it.id,T)); if(inst && !inst.done) return T; if(ruleOpen(it.id)) return ruleOpen(it.id).date;
  for(let i=1;i<60;i++){ const k=addDays(T,i); if(ruleDueOn(it,k,true)) return k; } return null; }
function ruleToggleToday(it){
  const T=todayKey(), id=instId(it.id,T); const ex=S.events.find(e=>e.id===id) || ruleOpen(it.id);
  if(ex) toggleDone(ex);
  else { saveEv({id, date:T, start:"", end:"", title:it.name, tag:it.tag||"ライフ", note:it.note||"", color:"", done:stamp(), steps:"", order:nextOrder(T), rule:it.id}); render(); }
}
function saveLife(list){ queue("life","saveLife",{life:list.map((x,i)=>({...x, order:(i+1)*10}))}); }
function previewRow(it){
  const row=el("div","task");
  const c=el("button","circ"); c.disabled=true; c.style.opacity=".4";
  const tx=el("div","tx"); tx.appendChild(el("div","tt",it.name));
  const meta=el("div","meta"); meta.appendChild(tagBadge(it.tag||"ライフ")); meta.appendChild(el("span",null,"↻ "+ruleRule(it)));
  tx.appendChild(meta); row.append(el("span","cbar"),c,tx); row.onclick=()=>location.hash="#/repeat";
  return row;
}

function viewRepeat(app){
  const hd=el("div","head"); const back=el("button","icon-btn","‹"); back.onclick=()=>location.hash="#/todo/today";
  hd.append(back, el("h1",null,"繰り返し")); app.appendChild(hd);
  app.appendChild(el("div","dash-sub","掃除・買い物など、繰り返すこと。やる日になると「今日やること」に普通のタスクとして入る。"));
  const T=todayKey();
  const list=el("div");
  S.life.forEach(it=>{
    const inst=S.events.find(e=>e.id===instId(it.id,T)); const doneToday=inst&&inst.done;
    const last=ruleLastDone(it.id), nx=ruleNext(it);
    const row=el("div","task"+(doneToday?" done":"")); row.dataset.id=it.id;
    const c=el("button","circ", doneToday?"✓":""); c.onclick=ev=>{ ev.stopPropagation(); ruleToggleToday(it); };
    const tx=el("div","tx"); tx.appendChild(el("div","tt",it.name));
    const meta=el("div","meta"); meta.appendChild(tagBadge(it.tag||"ライフ")); meta.appendChild(el("span",null,ruleRule(it)));
    meta.appendChild(el("span",null,"前回 "+(last? md(last).replace(/（.）/,"")+"（"+dayDiff(last,T)+"日前）" : "なし")));
    if(doneToday) meta.appendChild(el("span","today","今日やった"));
    else if(nx===T || (nx && nx<T)) meta.appendChild(el("span","today","今日"));
    else if(nx) meta.appendChild(el("span",null,"次 "+md(nx).replace(/（.）/,"")));
    tx.appendChild(meta);
    const hdl=el("span","handle","≡"); hdl.onclick=ev=>ev.stopPropagation();
    row.append(el("span","cbar"),c,tx,hdl); row.onclick=()=>openRule(it.id);
    list.appendChild(row);
  });
  app.appendChild(list);
  sortable(list, ids=>{ saveLife(ids.map(id=>S.life.find(x=>x.id===id)).filter(Boolean)); render(); });
  if(!S.life.length) app.appendChild(el("div","empty","まだない。下の「＋ 追加」から、掃除する場所や買い物を入れる。"));
  const add=el("button","edit-open","＋ 追加"); add.onclick=()=>openRule(null); app.appendChild(add);
}
function openRule(id){
  const ex=id?S.life.find(x=>x.id===id):null;
  let it=ex?{...ex}:{id:"l"+Date.now().toString(36), name:"", tag:"ライフ", kind:"interval", every:7, weekdays:"", note:""};
  const sh=openSheet();
  sh.innerHTML=`<div class="grab"></div>
    <input class="title-inp" id="lfName" placeholder="例：トイレ掃除、買い出し">
    <div class="fld"><label>タグ</label><div id="lfTag"></div></div>
    <div class="seg" id="lfKind"><button data-k="interval">◯日ごと</button><button data-k="weekly">曜日で決める</button></div>
    <div class="fld" id="lfEveryBox"><label>何日ごと？（前回やった日から数える）</label><input class="inp" type="number" min="1" inputmode="numeric" id="lfEvery"></div>
    <div class="fld" id="lfWdBox"><label>曜日</label><div class="seg" id="lfWd"></div></div>
    <div class="fld"><label>メモ</label><input class="inp" id="lfNote" placeholder="例：洗剤が切れそう"></div>
    <div class="btnrow">${ex?'<button class="danger" id="lfDel">削除</button>':''}<button id="lfCancel">やめる</button><button class="primary" id="lfSave">保存</button></div>`;
  $("lfTag").appendChild(tagPicker(it.tag||"ライフ", t=>{ it.tag=t; }));
  let wd=new Set((it.weekdays||"").split(",").filter(Boolean));
  const paint=()=>{
    $("lfKind").querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.k===it.kind));
    $("lfEveryBox").hidden=it.kind!=="interval"; $("lfWdBox").hidden=it.kind!=="weekly";
    const w=$("lfWd"); w.innerHTML="";
    WDN.forEach(d=>{ const b=el("button",wd.has(d)?"on":null,d); b.onclick=()=>{ wd.has(d)?wd.delete(d):wd.add(d); paint(); }; w.appendChild(b); });
  };
  $("lfName").value=it.name; $("lfEvery").value=it.every||7; $("lfNote").value=it.note||"";
  paint();
  $("lfKind").querySelectorAll("button").forEach(b=>b.onclick=()=>{ it.kind=b.dataset.k; paint(); });
  if(!ex) setTimeout(()=>$("lfName").focus(),50);
  $("lfCancel").onclick=closeSheet;
  $("lfSave").onclick=()=>{
    const name=$("lfName").value.trim(); if(!name){ closeSheet(); return; }
    const item={...it, name, every:Math.max(1,parseInt($("lfEvery").value,10)||7), weekdays:WDN.filter(d=>wd.has(d)).join(","), note:$("lfNote").value.trim()};
    const list=S.life.slice(); const i=list.findIndex(x=>x.id===item.id); if(i>=0) list[i]=item; else list.push(item);
    saveLife(list);
    // 今日の分の名前・タグも合わせる
    const inst=S.events.find(e=>e.id===instId(item.id,todayKey())); if(inst && !inst.done) saveEv({...inst, title:item.name, tag:item.tag, note:item.note});
    ensureRecurring(); closeSheet(); render();
  };
  if(ex) $("lfDel").onclick=()=>{ if(confirm("「"+it.name+"」の繰り返しを削除する？（作られた分のタスクは残る）")){ saveLife(S.life.filter(x=>x.id!==it.id)); closeSheet(); render(); } };
}

/* ================= 行の部品 ================= */
function taskRow(e, opts={}){
  const row=el("div","task"+(e.done?" done":"")); row.dataset.id=e.id;
  const bar=el("span","cbar"); bar.style.background=colorOf(e.color);
  const c=el("button","circ", e.done?"✓":""); c.onclick=ev=>{ ev.stopPropagation(); toggleDone(e); };
  const tx=el("div","tx"); tx.appendChild(el("div","tt",e.title));
  const meta=el("div","meta");
  if(e.tag) meta.appendChild(tagBadge(e.tag));
  if(isTimed(e)) meta.appendChild(el("span","badge time", timeLabel(e)));
  if(e.rule) meta.appendChild(el("span",null,"↻"));
  if(e.carried && !e.done) meta.appendChild(el("span","carry", md(e.carried).replace(/（.）/,"")+"から持ち越し"));
  if(opts.showDate) meta.appendChild(el("span","carry", md(e.date)+"の分"));
  const st=parseSteps(e.steps); if(st.length) meta.appendChild(el("span",null,st.filter(s=>s.done).length+" / "+st.length));
  if(e.note) meta.appendChild(el("span",null,"✎ メモ"));
  tx.appendChild(meta);
  row.append(bar,c,tx);
  if(opts.sortable){ const hd=el("span","handle","≡"); hd.onclick=ev=>ev.stopPropagation(); row.appendChild(hd); }
  row.onclick=()=>openItem(e.id);
  return row;
}
function habitRow(it, k){
  const r=S.days[k]||{}; const m=r[it.id];
  const row=el("div","task"+(m==="o"?" done":""));
  const c=el("button","hab-circ", m==="o"?"✓":""); c.onclick=ev=>{ ev.stopPropagation(); habitMark(k,it.id,"o"); };
  const tx=el("div","tx"); tx.appendChild(el("div","tt",it.name));
  const meta=el("div","meta"); meta.appendChild(el("span","badge","習慣"));
  if(it.ifText) meta.appendChild(el("span",null,"IF "+it.ifText));
  if(r["n_"+it.id]) meta.appendChild(el("span",null,"✎ "+r["n_"+it.id]));
  tx.appendChild(meta); row.append(c,tx);
  row.onclick=()=>location.hash="#/habit";
  return row;
}

/* 並べ替え（≡ をつかんで上下に動かす） */
function sortable(container, onDrop){
  container.classList.add("sortable");
  container.querySelectorAll(":scope > [data-id] .handle").forEach(hd=>{
    hd.addEventListener("pointerdown", e=>{
      e.preventDefault(); e.stopPropagation();
      const row=hd.closest("[data-id]");
      const rows=[...container.querySelectorAll(":scope > [data-id]")];
      const idx=rows.indexOf(row); if(idx<0) return;
      const rects=rows.map(r=>r.getBoundingClientRect());
      const gap = rows.length>1 ? Math.max(0, rects[1].top-rects[0].bottom) : 6;
      const hgt=rects[idx].height+gap, startY=e.clientY;
      let target=idx; dragging=true;
      row.classList.add("dragging");
      hd.setPointerCapture(e.pointerId);
      const move=ev=>{
        const dy=ev.clientY-startY; row.style.transform="translateY("+dy+"px)";
        const cy=rects[idx].top+rects[idx].height/2+dy;
        let t=0; rects.forEach((rc,i)=>{ if(i!==idx && cy > rc.top+rc.height/2) t++; });
        target=t;
        rows.forEach((r,i)=>{ if(i===idx) return; let s=0; if(idx<i && i<=target) s=-hgt; if(target<=i && i<idx) s=hgt; r.style.transform=s?"translateY("+s+"px)":""; });
      };
      const up=()=>{
        hd.removeEventListener("pointermove",move); hd.removeEventListener("pointerup",up); hd.removeEventListener("pointercancel",up);
        rows.forEach(r=>r.style.transform=""); row.classList.remove("dragging"); dragging=false;
        if(target!==idx){ const ids=rows.map(r=>r.dataset.id); const [m]=ids.splice(idx,1); ids.splice(target,0,m); onDrop(ids); }
      };
      hd.addEventListener("pointermove",move); hd.addEventListener("pointerup",up); hd.addEventListener("pointercancel",up);
    });
  });
}
function reorder(ids){
  ids.forEach((id,i)=>{ const e=S.events.find(x=>x.id===id); if(e && ord(e)!==(i+1)*10) saveEv({...e, order:(i+1)*10}); });
  render();
}

/* ================= ホーム ================= */
function viewHome(app){
  const T=todayKey(), d=new Date();
  app.appendChild(el("div","dash-date", (d.getMonth()+1)+"月"+d.getDate()+"日（"+WD[d.getDay()]+"）"));
  const tasks=on(T), hab=habitsDue(T), rec=S.days[T]||{};
  const total=tasks.length+hab.length, done=tasks.filter(e=>e.done).length+hab.filter(it=>rec[it.id]==="o").length;
  app.appendChild(el("div","dash-sub","今日やること "+done+" / "+total+" 完了"));
  const pg=el("div","progress"); const bar=el("i"); bar.style.width=(total?Math.round(done/total*100):0)+"%"; pg.appendChild(bar); app.appendChild(pg);
  const w=habitWarnings(); if(w) app.appendChild(el("div","warn",w));

  const q=el("div","quick");
  const b1=el("button",null,"＋ 今日やること"); b1.onclick=()=>openItem(null,{date:T});
  const b2=el("button",null,"＋ 時間の予定"); b2.onclick=()=>openItem(null,{date:T, timed:true});
  q.append(b1,b2); app.appendChild(q);

  const open=sortTasks(tasks.filter(e=>!e.done));
  // いまやる1つ
  const now=nowHM();
  const cur=open.find(e=>isTimed(e) && e.start<=now && (e.end||e.start)>now) || open.find(e=>!isTimed(e)) || open[0];
  if(cur){ const c=el("div","card focus"); c.appendChild(el("h2",null,"▶ 次にやる1つ")); c.appendChild(taskRow(cur)); app.appendChild(c); }

  const c1=el("div","card"); c1.appendChild(cardHead("☑ 今日やること","#/todo/today"));
  open.filter(e=>e!==cur).forEach(e=>c1.appendChild(taskRow(e)));
  hab.filter(it=>rec[it.id]!=="o").forEach(it=>c1.appendChild(habitRow(it,T)));
  if(!open.length && !hab.some(it=>rec[it.id]!=="o")) c1.appendChild(el("div","empty", total? "全部終わった" : "まだ何もない"));
  app.appendChild(c1);

  const tm=on(dayAt(1)), tmp=rulePreview(dayAt(1));
  const c2=el("div","card"); c2.appendChild(cardHead("→ 明日やること（"+(tm.length+tmp.length)+"）","#/todo/tomorrow"));
  sortTasks(tm).slice(0,4).forEach(e=>c2.appendChild(taskRow(e)));
  tmp.slice(0,3).forEach(it=>c2.appendChild(previewRow(it)));
  if(!tm.length && !tmp.length) c2.appendChild(el("div","empty","まだない"));
  app.appendChild(c2);

  const yd=yesterdayDone();
  const c3=el("div","card"); c3.appendChild(cardHead("✓ 昨日やったこと（"+yd.count+"）","#/todo/yesterday"));
  c3.appendChild(el("div","empty", yd.count? yd.names.slice(0,6).join("、")+(yd.count>6?" ほか":"") : "記録なし"));
  app.appendChild(c3);

  const rf=el("button","edit-open","↻ 最新にする"); rf.onclick=pull; app.appendChild(rf);
}
function cardHead(title, href){ const h2=el("h2",null,title); const a=el("a","more","開く ›"); a.href=href; h2.appendChild(a); return h2; }
function yesterdayDone(){
  const Y=dayAt(-1);
  const evs=S.events.filter(e=>doneDay(e)===Y);
  const r=S.days[Y]||{}; const hab=S.items.filter(it=>r[it.id]==="o");
  return {evs, hab, count:evs.length+hab.length, names:[...evs.map(e=>e.title), ...hab.map(it=>it.name)]};
}

/* ================= やること（今日・明日・昨日） ================= */
function viewTodo(app){
  const mode=R.arg||"today";
  const hd=el("div","head"); hd.appendChild(el("h1",null,"やること"));
  const rp=el("a","icon-btn","↻ 繰り返し"); rp.href="#/repeat"; rp.style.display="flex"; rp.style.alignItems="center"; rp.style.textDecoration="none"; rp.style.fontSize="13px"; hd.appendChild(rp);
  app.appendChild(hd);
  const seg=el("div","seg");
  [["today","今日やること"],["tomorrow","明日やること"],["yesterday","昨日やったこと"]].forEach(([id,label])=>{ const b=el("button",mode===id?"on":null,label); b.onclick=()=>location.hash="#/todo/"+id; seg.appendChild(b); });
  app.appendChild(seg);

  if(mode==="yesterday"){
    const Y=dayAt(-1), yd=yesterdayDone();
    app.appendChild(el("div","dash-sub", md(Y)+" ・ "+yd.count+"件"));
    if(!yd.count) app.appendChild(el("div","empty","昨日やったことの記録はない"));
    const list=el("div");
    yd.evs.sort((a,b)=>(a.done||"")<(b.done||"")?-1:1).forEach(e=>list.appendChild(taskRow(e,{showDate:e.date!==Y})));
    yd.hab.forEach(it=>list.appendChild(habitRow(it,Y)));
    app.appendChild(list);
    return;
  }
  const k = mode==="tomorrow" ? dayAt(1) : todayKey();
  app.appendChild(el("div","dash-sub", md(k)));
  const all=on(k), open=sortTasks(all.filter(e=>!e.done)), dn=all.filter(e=>e.done);
  if(open.length){ const box=el("div"); open.forEach(e=>box.appendChild(taskRow(e,{sortable:true}))); app.appendChild(box); sortable(box, reorder); }
  let habDone=[];
  if(mode==="tomorrow"){
    const pv=rulePreview(k);
    if(pv.length){ app.appendChild(el("div","grp","繰り返し（明日になると入る）")); const box=el("div"); pv.forEach(it=>box.appendChild(previewRow(it))); app.appendChild(box); }
    if(!open.length && !pv.length) app.appendChild(el("div","empty","まだ何もない。下から追加する。"));
  } else {
    const r=S.days[k]||{}; const hab=habitsDue(k);
    const ho=hab.filter(it=>r[it.id]!=="o"); habDone=hab.filter(it=>r[it.id]==="o");
    if(!open.length) app.appendChild(el("div","empty", dn.length?"タスクは全部終わった":"まだ何もない。下から追加する。"));
    if(ho.length){ app.appendChild(el("div","grp","習慣")); const box=el("div"); ho.forEach(it=>box.appendChild(habitRow(it,k))); app.appendChild(box); }
  }
  const nd=dn.length+habDone.length;
  if(nd){
    const b=el("button","donehead",(openDone?"▾":"▸")+" 完了 "+nd); b.onclick=()=>{ openDone=!openDone; render(); }; app.appendChild(b);
    if(openDone){ dn.forEach(e=>app.appendChild(taskRow(e))); habDone.forEach(it=>app.appendChild(habitRow(it,k))); }
  }
  // 追加欄（タグを付けて追加）
  const ab=$("addbar"); ab.hidden=false; ab.innerHTML=""; document.body.classList.add("has-add");
  const f=el("form");
  const tg=el("button","tagbtn",lastTag); tg.type="button";
  tg.onclick=()=>{ const ts=allTags(); const i=ts.indexOf(lastTag); setLastTag(ts[(i+1)%ts.length]); tg.textContent=lastTag; paintTg(); };
  const paintTg=()=>{ const c=TAG_COLORS[lastTag]||"var(--sub)"; tg.style.color=c; tg.style.borderColor=c; }; paintTg();
  const inp=el("input"); inp.placeholder="＋ "+(mode==="tomorrow"?"明日":"今日")+"やることを追加"; inp.enterKeyHint="done";
  f.append(tg,inp); ab.appendChild(f);
  f.onsubmit=ev=>{ ev.preventDefault(); const title=inp.value.trim(); if(!title) return;
    saveEv({id:uid(), date:k, start:"", end:"", title, tag:lastTag, note:"", color:"", done:"", steps:"", order:nextOrder(k), rule:""});
    inp.value=""; render(); setTimeout(()=>{ const i=document.querySelector("#addbar input"); if(i) i.focus(); },30); };
}

/* ================= 今日（時間割） ================= */
function viewToday(app){
  const T=todayKey();
  const hd=el("div","head"); hd.appendChild(el("h1",null,"今日 "+md(T))); app.appendChild(hd);
  app.appendChild(timeline([T]));
  fab(()=>openItem(null,{date:T, timed:true}));
  scrollTimeline();
}

/* ================= カレンダー ================= */
function viewCal(app){
  const v=calState.view, k=calState.date, d=parseKey(k);
  const hd=el("div","cal-head");
  const prev=el("button","icon-btn","‹"), next=el("button","icon-btn","›"), tb=el("button","icon-btn","今日");
  const step = v==="month"?0 : v==="week"?7 : v==="3day"?3 : 1;
  prev.onclick=()=>{ calState.date = step? addDays(k,-step) : keyOf(new Date(d.getFullYear(), d.getMonth()-1, 1, 12)); render(); scrollTimeline(); };
  next.onclick=()=>{ calState.date = step? addDays(k,step) : keyOf(new Date(d.getFullYear(), d.getMonth()+1, 1, 12)); render(); scrollTimeline(); };
  tb.onclick=()=>{ calState.date=todayKey(); render(); scrollTimeline(); };
  hd.append(el("h1",null,d.getFullYear()+"年"+(d.getMonth()+1)+"月"), tb, prev, next);
  app.appendChild(hd);
  const seg=el("div","seg");
  [["day","日"],["3day","3日"],["week","週"],["month","月"]].forEach(([id,label])=>{
    const b=el("button",v===id?"on":null,label); b.onclick=()=>{ calState.view=id; render(); scrollTimeline(); }; seg.appendChild(b);
  });
  app.appendChild(seg);
  if(v==="month") app.appendChild(monthView(k));
  else {
    let days=[];
    if(v==="day") days=[k];
    else if(v==="3day") days=[k,addDays(k,1),addDays(k,2)];
    else { const start=addDays(k,-parseKey(k).getDay()); for(let i=0;i<7;i++) days.push(addDays(start,i)); }
    app.appendChild(timeline(days));
  }
  fab(()=>openItem(null,{date:k}));
}
function monthView(k){
  const d=parseKey(k), first=new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const start=addDays(keyOf(first), -first.getDay());
  const wrap=el("div","month");
  const wd=el("div","wd"); WD.forEach(w=>wd.appendChild(el("div",null,w))); wrap.appendChild(wd);
  const grid=el("div","grid"); const T=todayKey();
  for(let i=0;i<42;i++){
    const kk=addDays(start,i), dd=parseKey(kk);
    const cell=el("div","cell"+(dd.getMonth()!==d.getMonth()?" other":"")+(kk===T?" today":""));
    const dn=el("div","dn"); dn.appendChild(el("span",null,String(dd.getDate()))); cell.appendChild(dn);
    const evs=[...sortTasks(on(kk).filter(e=>!isTimed(e))), ...sortTime(on(kk).filter(isTimed))];
    evs.slice(0,3).forEach(e=>{
      const ch=el("div","ech"+(isTimed(e)?" timed":"")+(e.done?" done":""), (e.start?e.start+" ":"")+e.title);
      ch.style.background=colorOf(e.color); ch.style.setProperty("--c",colorOf(e.color));
      cell.appendChild(ch);
    });
    if(evs.length>3) cell.appendChild(el("div","more","+"+(evs.length-3)));
    cell.onclick=()=>{ calState.date=kk; calState.view="day"; render(); scrollTimeline(); };
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  return wrap;
}
const HOUR=48;
function layout(evs){
  const items=evs.map(e=>{ const s=toMin(e.start); let en=toMin(e.end); if(en==null||en<=s) en=s+60; return {e,s,en}; }).sort((a,b)=>a.s-b.s||b.en-a.en);
  let cluster=[], clusterEnd=-1; const out=[];
  const finish=()=>{ const lanes=[]; cluster.forEach(it=>{ let l=lanes.findIndex(end=>end<=it.s); if(l<0){ l=lanes.length; lanes.push(0);} lanes[l]=it.en; it.lane=l; }); cluster.forEach(it=>{ it.lanes=lanes.length; out.push(it); }); cluster=[]; };
  items.forEach(it=>{ if(it.s>=clusterEnd && cluster.length) finish(); cluster.push(it); clusterEnd=Math.max(clusterEnd,it.en); });
  if(cluster.length) finish();
  return out;
}
function timeline(days){
  const wrap=el("div","tl-wrap"); const T=todayKey();
  if(days.length>1){
    const dh=el("div","tl-days");
    days.forEach(k=>{ const d=parseKey(k); const x=el("div","d"+(k===T?" today":"")); x.append(document.createTextNode(WD[d.getDay()])); x.appendChild(el("b",null,String(d.getDate()))); x.onclick=()=>{ calState.date=k; calState.view="day"; if(R.name!=="cal") location.hash="#/cal"; else { render(); scrollTimeline(); } }; dh.appendChild(x); });
    wrap.appendChild(dh);
  }
  const ad=el("div","tl-allday");
  days.forEach(k=>{ const col=el("div","col"); sortTasks(on(k).filter(e=>!isTimed(e))).forEach(e=>{ const ch=el("div","ech"+(e.done?" done":""),(e.done?"✓ ":"")+e.title); ch.style.background=colorOf(e.color); ch.onclick=()=>openItem(e.id); col.appendChild(ch); }); ad.appendChild(col); });
  wrap.appendChild(ad);
  const sc=el("div","tl-scroll"); sc.id="tlscroll";
  const tl=el("div","tl");
  const hours=el("div","hours"); for(let i=0;i<24;i++) hours.appendChild(el("div",null,i?i+":00":""));
  tl.appendChild(hours);
  days.forEach(k=>{
    const col=el("div","col");
    for(let i=0;i<24;i++){ const hl=el("div","hl"); hl.onclick=()=>openItem(null,{date:k,timed:true,start:pad(i)+":00",end:pad((i+1)%24)+":00"}); col.appendChild(hl); }
    layout(on(k).filter(isTimed)).forEach(it=>{
      const box=el("div","ev"+(it.e.done?" done":"")); const w=100/it.lanes;
      box.style.top=(it.s*HOUR/60)+"px"; box.style.height=Math.max(20,(it.en-it.s)*HOUR/60-2)+"px";
      box.style.left="calc("+(it.lane*w)+"% + 1px)"; box.style.width="calc("+w+"% - 3px)";
      box.style.background=colorOf(it.e.color);
      box.appendChild(el("b",null,(it.e.done?"✓ ":"")+it.e.title)); box.appendChild(document.createTextNode(timeLabel(it.e)));
      box.onclick=ev=>{ ev.stopPropagation(); openItem(it.e.id); };
      col.appendChild(box);
    });
    if(k===T){ const nl=el("div","nowline"); nl.style.top=(toMin(nowHM())*HOUR/60)+"px"; col.appendChild(nl); }
    tl.appendChild(col);
  });
  sc.appendChild(tl); wrap.appendChild(sc);
  return wrap;
}
function scrollTimeline(){
  requestAnimationFrame(()=>{ const sc=$("tlscroll"); if(!sc) return; const m=Math.max(0,toMin(nowHM())-90); sc.scrollTop = m*HOUR/60; });
}
function fab(fn){ const f=$("fab"); f.hidden=false; f.onclick=fn; }

/* ================= 編集シート（イベント形式／時間の形式） ================= */
function openItem(id, preset={}){
  const ex=id?S.events.find(e=>e.id===id):null;
  let e=ex?{...ex}:{id:uid(), date:preset.date||todayKey(), start:"", end:"", title:"", tag:"", note:"", color:"", done:"", steps:"", order:"", rule:""};
  if(!ex && preset.timed){
    if(preset.start){ e.start=preset.start; e.end=preset.end; }
    else { const hh=(new Date().getHours()+1)%24; e.start=pad(hh)+":00"; e.end=pad((hh+1)%24)+":00"; }
  }
  let steps=parseSteps(e.steps);
  let timed=!!e.start;
  const sh=openSheet();
  sh.innerHTML=`<div class="grab"></div>
    <div style="display:flex;align-items:center;gap:10px"><button id="itDone" style="width:24px;height:24px;border-radius:50%;border:2px solid var(--sub);background:none;flex:none;padding:0"></button>
    <input class="title-inp" id="itTitle" placeholder="やること・予定の名前"></div>
    <div class="fld" style="margin-top:6px"><div id="itTag"></div></div>
    <div class="seg" id="itKind"><button data-k="ev">イベント（時間なし）</button><button data-k="tm">時間の形式</button></div>
    <div class="fld"><label>日付</label><input class="inp" type="date" id="itDate"></div>
    <div class="row2" id="itTimes"><div class="fld"><label>開始</label><input class="inp" type="time" id="itStart"></div><div class="fld"><label>終了</label><input class="inp" type="time" id="itEnd"></div></div>
    <div class="fld"><div id="itSteps"></div><input class="inp" id="itNewStep" placeholder="＋ ステップの追加" style="margin-top:6px"></div>
    <div class="fld"><label>色</label><div class="colors" id="itColors"></div></div>
    <div class="fld"><label>メモ</label><textarea class="inp" id="itNote" placeholder="メモ（うまくいった／詰まった など）"></textarea></div>
    <div class="btnrow">${ex?'<button class="danger" id="itDel">削除</button>':''}<button id="itCancel">やめる</button><button class="primary" id="itSave">保存</button></div>`;
  const paint=()=>{
    const d=$("itDone"); d.textContent=e.done?"✓":""; d.style.background=e.done?"var(--acc)":"none"; d.style.borderColor=e.done?"var(--acc)":"var(--sub)"; d.style.color="var(--card)";
    $("itKind").querySelectorAll("button").forEach(b=>b.classList.toggle("on",(b.dataset.k==="tm")===timed));
    $("itTimes").hidden=!timed;
    const box=$("itSteps"); box.innerHTML="";
    steps.forEach((s,i)=>{ const r=el("div","step"+(s.done?" done":"")); const c=el("button","circ",s.done?"✓":""); c.onclick=()=>{ s.done=!s.done; paint(); };
      const inp=el("input"); inp.value=s.text; inp.oninput=()=>{ s.text=inp.value; }; const x=el("button","x","×"); x.onclick=()=>{ steps.splice(i,1); paint(); };
      r.append(c,inp,x); box.appendChild(r); });
  };
  let tag=e.tag|| (ex? "" : lastTag);
  $("itTag").appendChild(tagPicker(tag, t=>{ tag=t; }));
  $("itTitle").value=e.title; $("itDate").value=e.date; $("itStart").value=e.start; $("itEnd").value=e.end; $("itNote").value=e.note||"";
  paint();
  $("itDone").onclick=()=>{ e.done=e.done?"":stamp(); paint(); };
  $("itKind").querySelectorAll("button").forEach(b=>b.onclick=()=>{ timed=b.dataset.k==="tm"; if(timed && !$("itStart").value){ $("itStart").value="09:00"; $("itEnd").value="10:00"; } paint(); });
  $("itStart").onchange=()=>{ const s=toMin($("itStart").value), en=toMin($("itEnd").value); if(s!=null && (en==null||en<=s)){ const x=Math.min(s+60,23*60+59); $("itEnd").value=pad(Math.floor(x/60))+":"+pad(x%60); } };
  $("itNewStep").onkeydown=ev=>{ if(ev.key==="Enter"){ ev.preventDefault(); const v=ev.target.value.trim(); if(v){ steps.push({done:false,text:v}); ev.target.value=""; paint(); } } };
  let color=e.color||"ピーコック";
  const cs=$("itColors");
  Object.entries(COLORS).forEach(([name,hex])=>{ const b=el("button",name===color?"on":null); b.style.background=hex; b.title=name; b.onclick=()=>{ color=name; cs.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b)); }; cs.appendChild(b); });
  if(!ex) setTimeout(()=>$("itTitle").focus(),50);
  $("itCancel").onclick=closeSheet;
  $("itSave").onclick=()=>{
    const ns=$("itNewStep").value.trim(); if(ns) steps.push({done:false,text:ns});
    const title=$("itTitle").value.trim(); if(!title){ closeSheet(); return; }
    const date=$("itDate").value||e.date;
    if(tag) setLastTag(tag);
    const item={...e, title, date, tag, start:timed?$("itStart").value:"", end:timed?$("itEnd").value:"", note:$("itNote").value, color:color==="ピーコック"?"":color, steps:fmtSteps(steps)};
    if(!ex || ex.date!==date) item.order=nextOrder(date);
    saveEv(item); closeSheet(); render(); if(R.name==="cal"||R.name==="today") scrollTimeline();
  };
  if(ex) $("itDel").onclick=()=>{ if(confirm("これを削除する？")){ queue("ev|"+e.id,"delEvent",{id:e.id}); closeSheet(); render(); } };
}
function openSheet(){
  const root=$("sheet"); root.innerHTML="";
  const bg=el("div","sheet-bg"); const sh=el("div","sheet");
  bg.appendChild(sh); root.appendChild(bg);
  bg.onclick=e=>{ if(e.target===bg) closeSheet(); };
  return sh;
}
function closeSheet(){ $("sheet").innerHTML=""; }

/* ================= 習慣 ================= */
let habitEditing=null;
function viewHabit(app){
  if(habitEditing) return habitEditor(app);
  const k=dayAt(habitOffset);
  const hd=el("div","head"); hd.appendChild(el("h1",null,md(k)));
  const sw=el("div","switch"); const y=el("button",habitOffset===-1?"on":null,"昨日"), t=el("button",habitOffset===0?"on":null,"今日");
  y.onclick=()=>{ habitOffset=-1; render(); }; t.onclick=()=>{ habitOffset=0; render(); }; sw.append(y,t); hd.appendChild(sw); app.appendChild(hd);
  const w=habitWarnings(); if(w) app.appendChild(el("div","warn",w));
  const rec=S.days[k]||{};
  const list=el("div");
  S.items.forEach(it=>{
    const card=el("div","item"); card.dataset.id=it.id; const row=el("div","hrow"); const nm=el("div","name");
    const b=el("b",null,it.name||"（名前なし）"); if(it.freq==="weekly") b.appendChild(el("span","freq","週1")); nm.appendChild(b);
    const ift=el("div","ift");
    const l1=el("div"); l1.append(el("span","k","IF"), document.createTextNode(it.ifText||"（未設定）"));
    const l2=el("div"); l2.append(el("span","k","THEN"), document.createTextNode(it.thenText||"（未設定）"));
    ift.append(l1,l2); nm.appendChild(ift); row.appendChild(nm);
    const ok=el("button","mbtn ok"+(rec[it.id]==="o"?" on":""),"○"), ng=el("button","mbtn ng"+(rec[it.id]==="x"?" on":""),"×");
    ok.onclick=()=>habitMark(k,it.id,"o"); ng.onclick=()=>habitMark(k,it.id,"x"); row.append(ok,ng);
    const hdl=el("span","handle","≡"); row.appendChild(hdl);
    card.appendChild(row);
    if(it.freq==="weekly"){ const ld=lastDone(it.id); const lt=el("div","last"); if(!ld){ lt.textContent="まだ1回も記録なし"; lt.classList.add("late"); } else { lt.textContent="前回："+ld.label+"（"+ld.ago+"日前）"; if(ld.ago>=7) lt.classList.add("late"); } card.appendChild(lt); }
    const note=el("input","note"); note.placeholder="一言メモ"; note.value=rec["n_"+it.id]||"";
    note.oninput=()=>{ const r=S.days[k]||{}; queue("rec|"+k+"|"+it.id,"upsert",{date:k,id:it.id,name:it.name||"",mark:r[it.id]||"",note:note.value}); };
    card.appendChild(note); list.appendChild(card);
  });
  app.appendChild(list);
  sortable(list, ids=>{ const items=ids.map(id=>S.items.find(x=>x.id===id)).filter(Boolean); queue("items","saveItems",{items}); render(); });
  const eb=el("button","edit-open","IF-THENを編集する"); eb.onclick=()=>{ habitEditing=S.items.map(x=>({...x})); render(); }; app.appendChild(eb);
  app.appendChild(el("h3",null,"直近14日"));
  const gw=el("div","grid-wrap"); const tb=el("table"); const hr=el("tr"); hr.appendChild(el("th"));
  for(let o=-13;o<=0;o++) hr.appendChild(el("th",null,String(parseKey(dayAt(o)).getDate()))); tb.appendChild(hr);
  S.items.forEach(it=>{ const tr=el("tr"); tr.appendChild(el("td","l",it.name)); for(let o=-13;o<=0;o++){ const r=S.days[dayAt(o)]||{}; const td=el("td"); td.appendChild(el("span","dot "+(r[it.id]||""))); tr.appendChild(td); } tb.appendChild(tr); });
  gw.appendChild(tb); app.appendChild(gw);
}
function habitEditor(app){
  const hd=el("div","head"); hd.appendChild(el("h1",null,"IF-THEN")); app.appendChild(hd);
  const list=el("div");
  habitEditing.forEach((it,i)=>{
    const c=el("div","ed"); c.dataset.id=it.id;
    const top=el("div","hrow"); top.append(el("b",null,"項目 "+(i+1)), el("span","handle","≡")); top.firstChild.style.flex="1"; c.appendChild(top);
    const field=(label,key,ph)=>{ const f=el("div","fld"); f.appendChild(el("label",null,label)); const inp=el("input","inp"); inp.placeholder=ph; inp.value=it[key]||""; inp.oninput=()=>{ it[key]=inp.value; }; f.appendChild(inp); c.appendChild(f); };
    field("名前","name","例：声門閉鎖"); field("IF（いつ・何をしたら）","ifText","例：歌の練習を始めたら"); field("THEN（やること）","thenText","例：最初の10分は声門閉鎖");
    const f=el("div","fld"); f.appendChild(el("label",null,"頻度")); const sel=el("select","inp");
    [["daily","毎日"],["weekly","週1"]].forEach(([v,t])=>{ const o=el("option",null,t); o.value=v; if(it.freq===v) o.selected=true; sel.appendChild(o); });
    sel.onchange=()=>{ it.freq=sel.value; }; f.appendChild(sel); c.appendChild(f);
    const del=el("button","del","この項目を消す"); del.onclick=()=>{ habitEditing.splice(i,1); render(); }; c.appendChild(del);
    list.appendChild(c);
  });
  app.appendChild(list);
  sortable(list, ids=>{ habitEditing=ids.map(id=>habitEditing.find(x=>x.id===id)); render(); });
  const add=el("button","edit-open","＋ 追加"); add.onclick=()=>{ habitEditing.push({id:"h"+Date.now().toString(36),name:"",ifText:"",thenText:"",freq:"daily"}); render(); }; app.appendChild(add);
  const br=el("div","btnrow"); const cn=el("button",null,"やめる"), sv=el("button","primary","保存");
  cn.onclick=()=>{ habitEditing=null; render(); };
  sv.onclick=()=>{ const items=habitEditing.filter(x=>x.name||x.ifText||x.thenText); habitEditing=null; queue("items","saveItems",{items}); render(); };
  br.append(cn,sv); app.appendChild(br);
}

/* ================= 起動 ================= */
window.addEventListener("online", flush);
let lastDay=todayKey();
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible"){ flush(); if(lastDay!==todayKey()){ lastDay=todayKey(); dailyMaintenance(); render(); } if(Date.now()-lastLoad>20000) pull(); } });
setInterval(()=>{ if(document.visibilityState==="visible" && !dragging && !$("sheet").innerHTML && (R.name==="today"||R.name==="home"||R.name==="cal")){ const sc=$("tlscroll"); const top=sc?sc.scrollTop:null; render(); const n=$("tlscroll"); if(n&&top!=null) n.scrollTop=top; } }, 60000);
loadLocal(); if(!ONLINE) dailyMaintenance(); parseRoute(); render(); if(R.name==="today"||R.name==="cal") scrollTimeline();
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
pull();
