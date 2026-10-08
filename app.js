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
const md = k => { const d=parseKey(k); return (d.getMonth()+1)+"/"+d.getDate(); };
const wd = k => WD[parseKey(k).getDay()];
const nowHM = () => { const d=new Date(); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const toMin = hm => { if(!hm) return null; const [h,m]=hm.split(":").map(Number); return h*60+m; };
const uid = () => "w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const stamp = () => todayKey()+" "+nowHM();
const dayDiff = (a,b) => Math.round((parseKey(b)-parseKey(a))/864e5);
function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function svg(name){ const s=document.createElement("span"); s.innerHTML=ICON[name]; return s.firstChild; }
const IC = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
const ICON = {
  check: IC('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  plus: IC('<path d="M12 5v14M5 12h14"/>'),
  repeat: IC('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  clock: IC('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  cal: IC('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 3v3M16 3v3"/>'),
  tag: IC('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  note: IC('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: IC('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  more: IC('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  left: IC('<path d="m15 18-6-6 6-6"/>'),
  right: IC('<path d="m9 18 6-6-6-6"/>'),
  down: IC('<path d="m6 9 6 6 6-6"/>'),
  ifthen: IC('<path d="M4 6h7l3 6-3 6H4"/><path d="M14 12h6"/>'),
  back: IC('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  sun: IC('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')
};

const TAG_COLORS = {"仕事":"var(--work)","ライフ":"var(--life)"};
const tagColor = t => TAG_COLORS[t] || "var(--other)";
const extraTags=new Set();
function allTags(){ const set=["仕事","ライフ"]; [...S.events,...S.life].forEach(x=>{ if(x.tag && !set.includes(x.tag)) set.push(x.tag); }); extraTags.forEach(t=>{ if(!set.includes(t)) set.push(t); }); return set; }
let lastTag = (()=>{ try{ return localStorage.getItem("last-tag")||"仕事"; }catch(e){ return "仕事"; } })();
function setLastTag(t){ lastTag=t; try{ localStorage.setItem("last-tag",t); }catch(e){} }

const DEFAULT_ITEMS = [
  {id:"g", name:"声門閉鎖", ifText:"歌の練習を始めたら", thenText:"最初の10分は声門閉鎖", freq:"daily"},
  {id:"r", name:"リール", ifText:"", thenText:"リールを1本撮る", freq:"daily"},
  {id:"m", name:"薬", ifText:"寝る前に洗顔したら", thenText:"薬を塗る", freq:"daily"},
  {id:"p", name:"写真", ifText:"薬を塗ったら", thenText:"肌の写真を1枚撮る", freq:"weekly"}
];

/* ================= データ ================= */
// events：日付のついたタスク（予定タブ）。習慣も繰り返しも、その日の分はここに1行として入る
//   rule が "h:習慣ID" → 習慣の分（ID は h_習慣ID_日付）／ rule が繰り返しID → 繰り返しの分（ID は r_ルールID_日付）
//   done が "スキップ" → その日の分は飛ばした
let S = { items: DEFAULT_ITEMS.map(x=>({...x})), days:{}, events:[], life:[] };
let pending = [];
let syncState = "ok";

function loadLocal(){
  try{ const s=JSON.parse(localStorage.getItem("app3-state")||"null"); if(s) S={...S,...s}; }catch(e){}
  try{ pending=JSON.parse(localStorage.getItem("app3-pending")||"[]")||[]; }catch(e){}
}
function saveLocal(){
  try{ localStorage.setItem("app3-state", JSON.stringify(S)); localStorage.setItem("app3-pending", JSON.stringify(pending)); }catch(e){}
}
function setSync(s){ syncState=s; const d=$("syncdot"); if(d) d.className="sync"+(s==="ok"?"":s==="wait"?" wait":" err"); }

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
  applyOp(op); saveLocal(); setSync("wait");
  clearTimeout(flushTimer); flushTimer=setTimeout(flush, 500);
}
async function api(body){
  const res = await fetch(CFG.API_URL, {method:"POST", body: JSON.stringify({...body, key: CFG.KEY})});
  const j = await res.json();
  if(!j.ok) throw new Error(j.error||"error");
  return j;
}
let flushing=false;
async function flush(){
  if(!ONLINE){ setSync("err"); return; }
  if(flushing) return; flushing=true;
  try{
    while(pending.length){
      const op=pending[0];
      try{ await api({action:op.a, ...op.p}); }
      catch(e){ setSync("err"); setTimeout(flush, 15000); return; }
      pending = pending.filter(x=>x!==op);
      saveLocal();
    }
    setSync("ok");
  } finally { flushing=false; }
}
let lastLoad=0;
async function pull(){
  if(!ONLINE){ setSync("err"); dailyMaintenance(); update(); return; }
  try{
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
    if(!pending.length) setSync("ok");
    if(!drag) update();
    flush();
  }catch(e){ setSync("err"); }
}

/* ================= タスクのヘルパー ================= */
const isTimed = e => !!e.start;
const isSkip = e => e.done==="スキップ";
const isDone = e => !!e.done && !isSkip(e);
const isHabit = e => String(e.rule||"").startsWith("h:");
const habitOf = e => isHabit(e) ? S.items.find(x=>x.id===e.rule.slice(2)) : null;
const ruleOf = e => (e.rule && !isHabit(e)) ? S.life.find(x=>x.id===e.rule) : null;
const doneDay = e => { if(!isDone(e)) return null; const m=String(e.done).match(/^\d{4}-\d{2}-\d{2}/); return m?m[0]:e.date; };
const ord = e => (e.order===""||e.order==null||isNaN(Number(e.order))) ? 1e9 : Number(e.order);
function sortTasks(a){ return a.slice().sort((x,y)=> (ord(x)-ord(y)) || ((x.start||"99")<(y.start||"99")?-1:1)); }
const on = k => S.events.filter(e=>e.date===k && !isSkip(e));
function saveEv(e){ queue("ev|"+e.id,"saveEvent",{item:{...e}}); }
function nextOrder(k){ const xs=S.events.filter(e=>e.date===k).map(ord).filter(x=>x<1e9); return xs.length? Math.max(...xs)+10 : 10; }
function firstOrder(k){ const xs=S.events.filter(e=>e.date===k).map(ord).filter(x=>x<1e9); return xs.length? Math.min(...xs)-10 : 10; }
function toggleDone(e){
  const nd = isDone(e) ? "" : stamp();
  saveEv({...e, done:nd});
  if(isHabit(e)){ const h=habitOf(e); queue("rec|"+e.date+"|"+e.rule.slice(2),"upsert",{date:e.date,id:e.rule.slice(2),name:h?h.name:e.title,mark:nd?"o":"",note:e.note||""}); }
  if(nd && navigator.vibrate) navigator.vibrate(8);
  update();
}

/* ---- 習慣・繰り返しの毎日の分 ---- */
const WDN = ["日","月","火","水","木","金","土"];
const habitInst = (hid,k) => "h_"+hid+"_"+k;
const ruleInst = (rid,k) => "r_"+rid+"_"+k;
function habitDoneOn(hid,k){ if((S.days[k]||{})[hid]==="o") return true; const e=S.events.find(x=>x.id===habitInst(hid,k)); return !!(e && isDone(e)); }
function habitTag(hid){ const xs=S.events.filter(e=>e.rule==="h:"+hid && e.tag).sort((a,b)=>a.date<b.date?1:-1); return xs.length? xs[0].tag : "ライフ"; }
function habitDue(h,k){
  if(h.freq!=="weekly") return true;
  for(let i=1;i<=6;i++) if(habitDoneOn(h.id,addDays(k,-i))) return false;
  return true;
}
function streak(hid){ let n=0, k=todayKey(); if(!habitDoneOn(hid,k)) k=addDays(k,-1); while(habitDoneOn(hid,k) && n<400){ n++; k=addDays(k,-1); } return n; }
function ruleRuleText(it){ return it.kind==="weekly" ? (it.weekdays||"").split(",").filter(Boolean).join("・") : (it.every+"日ごと"); }
function ruleLastDone(rid){ let best=null; S.events.forEach(e=>{ if(e.rule===rid && isDone(e)){ const d=doneDay(e); if(!best||d>best) best=d; } }); return best; }
function ruleOpen(rid){ return S.events.find(e=>e.rule===rid && !e.done); }
function ruleDueOn(it, k, assumeTodayDone){
  if(S.events.some(e=>e.id===ruleInst(it.id,k))) return false;
  const open=ruleOpen(it.id); if(open && !(assumeTodayDone && open.date<=todayKey())) return false;
  if(it.kind==="weekly") return (it.weekdays||"").split(",").includes(WDN[parseKey(k).getDay()]);
  let last=ruleLastDone(it.id); if(assumeTodayDone && open) last=todayKey();
  return !last || dayDiff(last,k)>=(Number(it.every)||7);
}
function ensureDaily(){
  const T=todayKey();
  S.items.forEach(h=>{
    if(S.events.some(e=>e.id===habitInst(h.id,T))) return;
    if(!habitDue(h,T)) return;
    const rec=S.days[T]||{};
    saveEv({id:habitInst(h.id,T), date:T, start:"", end:"", title:h.name, tag:habitTag(h.id), note:rec["n_"+h.id]||"", color:"", done:rec[h.id]==="o"?stamp():"", steps:"", order:nextOrder(T), rule:"h:"+h.id});
  });
  S.life.forEach(it=>{ if(ruleDueOn(it,T)) saveEv({id:ruleInst(it.id,T), date:T, start:"", end:"", title:it.name, tag:it.tag||"ライフ", note:it.note||"", color:"", done:"", steps:"", order:nextOrder(T), rule:it.id}); });
}
// 前の日に終わらなかった「時間なし」のタスクは今日の先頭へ（習慣・時間の予定は移さない）
function rollover(){
  const T=todayKey(), lim=dayAt(-14);
  const xs=S.events.filter(e=>!e.done && !e.start && !isHabit(e) && e.date<T && e.date>=lim).sort((a,b)=>a.date<b.date?-1:1);
  if(!xs.length) return;
  let o=firstOrder(T)-10*xs.length;
  xs.forEach(e=>{ saveEv({...e, date:T, order:o, carried:e.carried||e.date}); o+=10; });
}
function dailyMaintenance(){ rollover(); ensureDaily(); }
function previewTomorrow(){
  const K=dayAt(1), out=[];
  S.items.forEach(h=>{ if(S.events.some(e=>e.id===habitInst(h.id,K))) return; if(h.freq==="weekly"){ for(let i=0;i<=6;i++){ const d=addDays(K,-1-i); if(habitDoneOn(h.id,d)) return; } } out.push({title:h.thenText||h.name, tag:habitTag(h.id), habit:true}); });
  S.life.forEach(it=>{ if(ruleDueOn(it,K,true)) out.push({title:splitIT({title:it.name}).then, tag:it.tag||"ライフ", rule:true}); });
  return out;
}

/* ---- IF-THEN ----
   習慣：設定タブの IF / THEN を使う。
   それ以外：タイトルが「IF → THEN」（→ ⇒ -> のどれか）なら分けて表示する。 */
function splitIT(e){
  if(isHabit(e)){ const h=habitOf(e); if(h) return {if:(h.ifText||"").trim(), then:(h.thenText||h.name||e.title).trim()}; }
  const parts=String(e.title||"").split(/\s*(?:→|⇒|->)\s*/);
  if(parts.length>=2 && parts[0] && parts.slice(1).join("")) return {if:parts[0], then:parts.slice(1).join(" → ")};
  return {if:"", then:e.title||""};
}
const joinIT = (i,t) => i ? i+" → "+t : t;
function titleBox(e){
  const it=splitIT(e), box=el("div","t");
  if(it.if){ const l=el("div","if"); l.append(el("b",null,"IF"), document.createTextNode(it.if)); box.appendChild(l);
    const m=el("div","then"); m.append(el("b",null,"THEN"), document.createTextNode(it.then)); box.appendChild(m); }
  else box.textContent=it.then;
  return box;
}

/* ================= 画面の切り替え ================= */
let R = "todo";
const calState = { view:"day", date: todayKey() };
let openDone = false;
let drag = null;
function parseRoute(){ const h=location.hash.replace(/^#\/?/,"").split("/")[0]; R = ["todo","cal","past"].includes(h)? h : "todo"; }
window.addEventListener("hashchange", ()=>{ parseRoute(); openDone=false; render(); window.scrollTo(0,0); });

let updater=null;
function render(){
  const app=$("app"); app.innerHTML=""; $("fab").hidden=true; updater=null;
  document.querySelectorAll("#tabs a").forEach(a=>a.classList.toggle("on", a.dataset.r===R));
  ({todo:viewTodo, cal:viewCal, past:viewPast}[R])(app);
}
function update(){ if(updater) updater(); else render(); }

/* ================= 行 ================= */
function row(e, opts={}){
  const r=el("div","row"+(isDone(e)?" done":"")); r.dataset.id=e.id; r.style.setProperty("--tc", tagColor(e.tag));
  if(opts.now) r.classList.add("now");
  const c=el("button","chk"); c.appendChild(svg("check")); c.setAttribute("aria-label","完了");
  c.onclick=ev=>{ ev.stopPropagation(); toggleDone(e); };
  r.appendChild(c);
  if(isTimed(e)) r.appendChild(el("span","time", e.start));
  r.appendChild(titleBox(e));
  const ic=el("span","ico");
  if(isHabit(e)){ const n=streak(e.rule.slice(2)); if(n>=2) ic.appendChild(el("span",null,"🔥"+n)); else ic.appendChild(svg("repeat")); }
  else if(e.rule) ic.appendChild(svg("repeat"));
  if(e.carried && !e.done) ic.appendChild(svg("back"));
  if(e.note) ic.appendChild(svg("note"));
  if(ic.childNodes.length) r.appendChild(ic);
  r.onclick=()=>{ if(r._dragged) return; openItem(e.id); };
  return r;
}
function previewRow(p){
  const r=el("div","row preview"); r.style.setProperty("--tc", tagColor(p.tag));
  const c=el("button","chk"); c.disabled=true; r.appendChild(c);
  r.appendChild(el("div","t",p.title));
  const ic=el("span","ico"); ic.appendChild(svg("repeat")); r.appendChild(ic);
  return r;
}
function emptyBox(text){ const b=el("div","empty"); b.appendChild(svg("sun")); b.appendChild(el("span",null,text)); return b; }

/* ================= やること（今日＋明日） ================= */
function viewTodo(app){
  const top=el("div","top"); const dt=el("div","date"); const tb=el("b"), ts=el("span");
  dt.append(tb,ts);
  const ring=el("div","ring"); ring.innerHTML='<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--soft)" stroke-width="6"/><circle class="arc" cx="26" cy="26" r="22" fill="none" stroke="var(--ok)" stroke-width="6" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="138.2"/></svg><div class="n"></div>';
  const sd=el("span","sync"); sd.id="syncdot";
  top.append(dt, ring, sd); app.appendChild(top);

  // 追加欄（再描画しても消えないように、ここで1回だけ作る）
  const form=el("form","add"); form.setAttribute("autocomplete","off");
  const tagb=el("button","tagdot"); tagb.type="button";
  const paintTag=()=>{ tagb.style.background=tagColor(lastTag); tagb.textContent=lastTag.slice(0,2); };
  tagb.onclick=()=>{ const t=allTags(); setLastTag(t[(t.indexOf(lastTag)+1)%t.length]); paintTag(); };
  paintTag();
  const inp=el("input"); inp.type="text"; inp.placeholder="今日やることを追加"; inp.enterKeyHint="send";
  const more=el("button","more"); more.type="button"; more.appendChild(svg("more"));
  more.onclick=()=>{ const v=inp.value.trim(); inp.value=""; openItem(null,{date:todayKey(), title:v}); };
  const go=el("button","go"); go.type="submit"; go.appendChild(svg("plus")); go.setAttribute("aria-label","追加");
  form.append(tagb, inp, more, go);
  const addNow=()=>{ const title=inp.value.trim(); if(!title){ inp.focus(); return; }
    const T=todayKey();
    saveEv({id:uid(), date:T, start:"", end:"", title, tag:lastTag, note:"", color:"", done:"", steps:"", order:nextOrder(T), rule:""});
    inp.value=""; update(); inp.focus(); };
  form.onsubmit=ev=>{ ev.preventDefault(); addNow(); };
  inp.addEventListener("keydown", ev=>{ if(ev.key==="Enter" && !ev.isComposing){ ev.preventDefault(); addNow(); } });
  app.appendChild(form);

  const body=el("div"); app.appendChild(body);
  updater=()=>{
    const T=todayKey(), K=dayAt(1);
    tb.textContent=md(T)+" "+wd(T); ts.textContent="今日";
    const all=on(T), open=sortTasks(all.filter(e=>!e.done)), dn=all.filter(isDone);
    const total=all.length, done=dn.length;
    ring.querySelector(".arc").setAttribute("stroke-dashoffset", String(138.2*(1-(total?done/total:0))));
    ring.querySelector(".n").textContent = total ? done+"/"+total : "0";
    setSync(syncState);
    body.innerHTML="";
    const now=nowHM();
    const lt=el("div","list"); lt.dataset.date=T;
    open.forEach(e=>lt.appendChild(row(e,{now: isTimed(e) && e.start<=now && (e.end||e.start)>now})));
    body.appendChild(lt);
    if(!open.length) body.appendChild(emptyBox(done? "今日の分は全部終わった" : "上の欄から追加"));
    if(dn.length){
      const b=el("button","donebtn"); b.appendChild(svg(openDone?"down":"check")); b.appendChild(document.createTextNode(String(dn.length)));
      b.onclick=()=>{ openDone=!openDone; update(); }; body.appendChild(b);
      if(openDone){ const dl=el("div","list"); dl.style.marginTop="10px"; dn.sort((a,b)=>(a.done<b.done?-1:1)).forEach(e=>dl.appendChild(row(e))); body.appendChild(dl); }
    }
    // 明日
    const tm=sortTasks(on(K).filter(e=>!e.done)), pv=previewTomorrow();
    const sec=el("div","sec"); sec.append(document.createTextNode("明日 "+md(K)+" "+wd(K)), el("span","cnt",String(tm.length+pv.length)));
    const plus=el("button","plus"); plus.appendChild(svg("plus")); plus.onclick=()=>openItem(null,{date:K}); sec.appendChild(plus);
    body.appendChild(sec);
    const lm=el("div","list"); lm.dataset.date=K;
    tm.forEach(e=>lm.appendChild(row(e)));
    body.appendChild(lm);
    if(pv.length){ const pl=el("div","pvs"); pl.appendChild(svg("repeat")); pv.forEach(p=>{ const c=el("span","pv",p.title); c.style.setProperty("--tc",tagColor(p.tag)); pl.appendChild(c); }); body.appendChild(pl); }
    enableDrag([lt,lm]);
  };
  updater();
}

/* ================= 長押しで並べ替え（今日⇄明日もOK） ================= */
function enableDrag(lists){
  lists.forEach(list=>{
    list.querySelectorAll(":scope > .row[data-id]").forEach(r=>{
      r.addEventListener("touchstart", ev=>startPress(ev, r, lists, ev.touches[0]), {passive:true});
      r.addEventListener("mousedown", ev=>{ if(ev.button===0) startPress(ev, r, lists, ev); });
    });
  });
}
function startPress(ev, r, lists, pt){
  if(ev.target.closest(".chk")) return;
  const sx=pt.clientX, sy=pt.clientY;
  let timer=setTimeout(()=>beginDrag(r, lists, sx, sy), 280);
  const cancel=()=>{ clearTimeout(timer); window.removeEventListener("touchmove",mv); window.removeEventListener("mousemove",mv); window.removeEventListener("touchend",cancel); window.removeEventListener("mouseup",cancel); };
  const mv=e=>{ const p=e.touches?e.touches[0]:e; if(Math.abs(p.clientX-sx)>8||Math.abs(p.clientY-sy)>8) cancel(); };
  window.addEventListener("touchmove",mv,{passive:true}); window.addEventListener("mousemove",mv);
  window.addEventListener("touchend",cancel); window.addEventListener("mouseup",cancel);
}
function beginDrag(r, lists, sx, sy){
  const e0=S.events.find(x=>x.id===r.dataset.id); if(!e0) return;
  const rect=r.getBoundingClientRect();
  const lift=r.cloneNode(true); lift.classList.add("lift"); lift.style.width=rect.width+"px"; lift.style.left=rect.left+"px"; lift.style.top=rect.top+"px";
  document.body.appendChild(lift);
  r.classList.add("ghost"); r._dragged=true;
  if(navigator.vibrate) navigator.vibrate(15);
  drag={r, lift, offY:sy-rect.top, lastY:sy, raf:0};
  const move=y=>{
    drag.lastY=y;
    lift.style.top=(y-drag.offY)+"px";
    // どのリストのどこに入るか
    let target=null;
    for(const l of lists){ const b=l.getBoundingClientRect(); if(y>=b.top-30 && y<=b.bottom+30){ target=l; break; } }
    if(!target){ const ds=lists.map(l=>{ const b=l.getBoundingClientRect(); return Math.min(Math.abs(y-b.top),Math.abs(y-b.bottom)); }); target=lists[ds.indexOf(Math.min(...ds))]; }
    if(isHabit(e0) && target.dataset.date!==e0.date) target=r.parentElement.dataset.date===e0.date? r.parentElement : lists.find(l=>l.dataset.date===e0.date);
    const others=[...target.querySelectorAll(":scope > .row[data-id]")].filter(x=>x!==r);
    let before=null; for(const o of others){ const b=o.getBoundingClientRect(); if(y < b.top+b.height/2){ before=o; break; } }
    if(r.parentElement!==target || r.nextSibling!==before) target.insertBefore(r, before);
  };
  const auto=()=>{ if(!drag) return; const y=drag.lastY, h=window.innerHeight; let dy=0; if(y<90) dy=-8; else if(y>h-130) dy=8; if(dy){ window.scrollBy(0,dy); move(y); } drag.raf=requestAnimationFrame(auto); };
  drag.raf=requestAnimationFrame(auto);
  const tmove=e=>{ e.preventDefault(); move(e.touches[0].clientY); };
  const mmove=e=>{ move(e.clientY); };
  const end=()=>{
    window.removeEventListener("touchmove",tmove); window.removeEventListener("mousemove",mmove); window.removeEventListener("touchend",end); window.removeEventListener("mouseup",end); window.removeEventListener("touchcancel",end);
    cancelAnimationFrame(drag.raf); lift.remove(); r.classList.remove("ghost");
    const list=r.parentElement, date=list.dataset.date;
    const ids=[...list.querySelectorAll(":scope > .row[data-id]")].map(x=>x.dataset.id);
    drag=null;
    ids.forEach((id,i)=>{ const e=S.events.find(x=>x.id===id); if(!e) return; const o=(i+1)*10; if(ord(e)!==o || e.date!==date) saveEv({...e, order:o, date}); });
    setTimeout(()=>{ r._dragged=false; update(); }, 30);
  };
  window.addEventListener("touchmove",tmove,{passive:false}); window.addEventListener("mousemove",mmove);
  window.addEventListener("touchend",end); window.addEventListener("mouseup",end); window.addEventListener("touchcancel",end);
}

/* ================= 編集シート ================= */
function openSheet(){
  const root=$("sheet"); root.innerHTML="";
  const bg=el("div","sheet-bg"); const sh=el("div","sheet");
  bg.appendChild(sh); root.appendChild(bg);
  bg.onclick=e=>{ if(e.target===bg) closeSheet(); };
  sh.appendChild(el("div","grab"));
  return sh;
}
function closeSheet(){ $("sheet").innerHTML=""; }
function ln(icon){ const l=el("div","ln"); l.appendChild(svg(icon)); return l; }
function chipGroup(options, cur, onPick){
  const box=el("div","chips");
  const paint=()=>{ box.innerHTML=""; options().forEach(o=>{ const b=el("button","chip"+(o.v===cur?" on":"")); b.type="button"; if(o.dot){ const i=el("i"); i.style.background=o.dot; b.appendChild(i); } b.appendChild(document.createTextNode(o.t)); b.onclick=()=>{ if(o.v==="__new"){ const t=(prompt("新しいタグ")||"").trim(); if(!t) return; cur=t; extraTags.add(t); onPick(t); } else { cur=o.v; onPick(o.v); } paint(); }; box.appendChild(b); }); };
  paint(); return {box, repaint:paint};
}
function openItem(id, preset={}){
  const ex=id?S.events.find(e=>e.id===id):null;
  const T=todayKey();
  let e=ex?{...ex}:{id:uid(), date:preset.date||T, start:"", end:"", title:preset.title||"", tag:lastTag, note:"", color:"", done:"", steps:"", order:"", rule:""};
  if(!ex && preset.start){ e.start=preset.start; e.end=preset.end||""; }
  const h=ex?habitOf(ex):null, ru=ex?ruleOf(ex):null;
  // くり返し：none / daily / interval / weekly
  let rep = h ? (h.freq==="weekly"?"interval":"daily") : ru ? ru.kind : "none";
  let every = h ? 7 : ru && ru.kind==="interval" ? (Number(ru.every)||7) : 7;
  let wds = new Set(ru && ru.kind==="weekly" ? (ru.weekdays||"").split(",").filter(Boolean) : []);
  const it0 = ex ? splitIT(ex) : splitIT({title:e.title});
  let timed=!!e.start;

  const sh=openSheet();
  const ifRow=el("div","ifrow"); const ifB=el("b",null,"IF"); const ifIn=el("input"); ifIn.type="text"; ifIn.placeholder="いつ？（例：風呂から出たら）※なくてもいい"; ifIn.value=it0.if; ifRow.append(ifB, ifIn); sh.appendChild(ifRow);
  const ttlRow=el("div","ttlrow"); const thB=el("b",null,"THEN"); const ttl=el("input","ttl"); ttl.placeholder="やること"; ttl.value=it0.then; ttlRow.append(thB, ttl); sh.appendChild(ttlRow);
  const paintIT=()=>{ const has=!!ifIn.value.trim(); thB.hidden=!has; }; ifIn.oninput=paintIT; paintIT();

  const b1=el("div","blk");
  // タグ
  const l1=ln("tag"); const tg=chipGroup(()=>[...allTags().map(t=>({v:t,t,dot:tagColor(t)})),{v:"__new",t:"＋"}], e.tag, v=>{ e.tag=v; }); l1.appendChild(tg.box); b1.appendChild(l1);
  // 日付
  const l2=ln("cal"); const dIn=el("input"); dIn.type="date"; dIn.value=e.date;
  const dg=chipGroup(()=>[{v:T,t:"今日"},{v:dayAt(1),t:"明日"}], e.date, v=>{ e.date=v; dIn.value=v; });
  dIn.onchange=()=>{ e.date=dIn.value||e.date; dg.repaint(); };
  dg.box.appendChild(dIn); l2.appendChild(dg.box); b1.appendChild(l2);
  // 時間
  const l3=ln("clock"); const tbox=el("div","chips");
  const tOn=el("button","chip"+(timed?" on":""),timed?"時間あり":"時間なし"); tOn.type="button";
  const sIn=el("input"); sIn.type="time"; sIn.value=e.start||"09:00";
  const eIn=el("input"); eIn.type="time"; eIn.value=e.end||"";
  const paintT=()=>{ tOn.className="chip"+(timed?" on":""); tOn.textContent=timed?"時間あり":"時間なし"; sIn.hidden=eIn.hidden=!timed; };
  tOn.onclick=()=>{ timed=!timed; if(timed && !eIn.value){ const s=toMin(sIn.value)||540; const x=Math.min(s+60,1439); eIn.value=pad(Math.floor(x/60))+":"+pad(x%60); } paintT(); };
  sIn.onchange=()=>{ const s=toMin(sIn.value), en=toMin(eIn.value); if(s!=null && (en==null||en<=s)){ const x=Math.min(s+60,1439); eIn.value=pad(Math.floor(x/60))+":"+pad(x%60); } };
  tbox.append(tOn, sIn, eIn); l3.appendChild(tbox); b1.appendChild(l3); paintT();
  sh.appendChild(b1);

  // くり返し
  const b2=el("div","blk");
  const l4=ln("repeat"); const rbox=el("div","chips"); l4.appendChild(rbox); b2.appendChild(l4);
  const l5=el("div","ln"); l5.style.paddingLeft="32px"; b2.appendChild(l5);
  const paintR=()=>{
    rbox.innerHTML="";
    [["none","なし"],["daily","毎日"],["interval","◯日ごと"],["weekly","曜日"]].forEach(([v,t])=>{ const b=el("button","chip"+(rep===v?" on":""),t); b.type="button"; b.onclick=()=>{ rep=v; paintR(); }; rbox.appendChild(b); });
    l5.innerHTML=""; l5.hidden = !(rep==="interval"||rep==="weekly");
    if(rep==="interval"){ const n=el("input"); n.type="number"; n.min="1"; n.inputMode="numeric"; n.value=every; n.oninput=()=>{ every=Math.max(1,parseInt(n.value,10)||1); }; l5.append(n, el("span","lab","日ごと（前回やった日から）")); }
    if(rep==="weekly"){ const c=el("div","chips"); WDN.forEach(d=>{ const b=el("button","chip"+(wds.has(d)?" on":""),d); b.type="button"; b.onclick=()=>{ wds.has(d)?wds.delete(d):wds.add(d); paintR(); }; c.appendChild(b); }); l5.appendChild(c); }
  };
  paintR(); sh.appendChild(b2);

  // メモ
  const b3=el("div","blk"); const l7=ln("note"); const nIn=el("textarea"); nIn.placeholder="メモ"; nIn.value=e.note||""; l7.appendChild(nIn); b3.appendChild(l7); sh.appendChild(b3);

  const acts=el("div","acts");
  if(ex){ const del=el("button","del"); del.appendChild(svg("trash")); del.onclick=()=>{
      if(e.rule){ if(!confirm("この日の分を消す？（くり返しは続く）")) return; saveEv({...ex, done:"スキップ"}); }
      else { if(!confirm("消す？")) return; queue("ev|"+e.id,"delEvent",{id:e.id}); }
      closeSheet(); update(); }; acts.appendChild(del); }
  const save=el("button","save","保存"); acts.appendChild(save); sh.appendChild(acts);
  if(!ex) setTimeout(()=>ttl.focus(),60);

  save.onclick=()=>{
    const then=ttl.value.trim(); if(!then){ closeSheet(); return; }
    const ifv=ifIn.value.trim();
    setLastTag(e.tag||lastTag);
    const title=joinIT(ifv, then);
    let item={...e, title, start:timed?sIn.value:"", end:timed?eIn.value:"", note:nIn.value};
    if(!ex || ex.date!==item.date) item.order = ex ? nextOrder(item.date) : (item.date===T||item.date===dayAt(1) ? nextOrder(item.date) : "");
    const oldKind = h ? "habit" : ru ? "rule" : "none";
    const wantHabit = rep==="daily" || (rep==="interval" && h && h.freq==="weekly" && every===7);
    const wantRule = !wantHabit && (rep==="interval"||rep==="weekly");
    // くり返しの定義を更新
    if(wantHabit){
      const hid = h ? h.id : "h"+Date.now().toString(36);
      const freq = (h && h.freq==="weekly" && rep==="interval") ? "weekly" : "daily";
      const items=S.items.slice(); const i=items.findIndex(x=>x.id===hid);
      const def={id:hid, name:(h&&h.name)||then, ifText:ifv, thenText:then, freq};
      if(i>=0) items[i]={...items[i],...def}; else items.push(def);
      queue("items","saveItems",{items});
      if(oldKind==="rule") saveLife(S.life.filter(x=>x.id!==ru.id));
      item.title=(h&&h.name)||then;
      if(oldKind!=="habit"){ if(ex) queue("ev|"+ex.id,"delEvent",{id:ex.id}); item={...item, id:habitInst(hid,item.date), rule:"h:"+hid}; }
    } else if(wantRule){
      const rid = ru ? ru.id : "l"+Date.now().toString(36);
      const def={id:rid, name:title, tag:item.tag, kind:rep, every, weekdays:WDN.filter(d=>wds.has(d)).join(","), note:item.note};
      const list=S.life.slice(); const i=list.findIndex(x=>x.id===rid); if(i>=0) list[i]={...list[i],...def}; else list.push(def);
      saveLife(list);
      if(oldKind==="habit") queue("items","saveItems",{items:S.items.filter(x=>x.id!==h.id)});
      if(oldKind!=="rule"){ if(ex) queue("ev|"+ex.id,"delEvent",{id:ex.id}); item={...item, id:ruleInst(rid,item.date), rule:rid}; }
    } else {
      if(oldKind==="habit") queue("items","saveItems",{items:S.items.filter(x=>x.id!==h.id)});
      if(oldKind==="rule") saveLife(S.life.filter(x=>x.id!==ru.id));
      item.rule="";
    }
    saveEv(item);
    if(isHabit(item) && (item.note||"")!==(ex&&ex.note||"")){ const hid=item.rule.slice(2); queue("rec|"+item.date+"|"+hid,"upsert",{date:item.date,id:hid,name:title,mark:isDone(item)?"o":"",note:item.note}); }
    closeSheet(); dailyMaintenance(); update();
  };
}
function saveLife(list){ queue("life","saveLife",{life:list.map((x,i)=>({...x, order:(i+1)*10}))}); }

/* ================= カレンダー ================= */
const calItems = k => on(k).filter(e=>!isHabit(e));
function viewCal(app){
  const v=calState.view, k=calState.date, d=parseKey(k);
  const top=el("div","cal-top");
  const prev=el("button","ib"); prev.appendChild(svg("left"));
  const next=el("button","ib"); next.appendChild(svg("right"));
  const tb=el("button","ib wide","今日");
  const step = v==="month"?0 : v==="week"?7 : v==="3day"?3 : 1;
  const go=n=>{ calState.date = step? addDays(k,n*step) : keyOf(new Date(d.getFullYear(), d.getMonth()+n, 1, 12)); render(); scrollTimeline(); };
  prev.onclick=()=>go(-1); next.onclick=()=>go(1);
  tb.onclick=()=>{ calState.date=todayKey(); render(); scrollTimeline(); };
  top.append(el("b",null,(d.getMonth()+1)+"月"), tb, prev, next);
  app.appendChild(top);
  const seg=el("div","seg");
  [["day","日"],["3day","3日"],["week","週"],["month","月"]].forEach(([id,label])=>{ const b=el("button",v===id?"on":null,label); b.onclick=()=>{ calState.view=id; render(); scrollTimeline(); }; seg.appendChild(b); });
  app.appendChild(seg);
  if(v==="month") app.appendChild(monthView(k));
  else {
    let days=[];
    if(v==="day") days=[k];
    else if(v==="3day") days=[k,addDays(k,1),addDays(k,2)];
    else { const s=addDays(k,-parseKey(k).getDay()); for(let i=0;i<7;i++) days.push(addDays(s,i)); }
    app.appendChild(timeline(days));
  }
  const f=$("fab"); f.hidden=false; f.innerHTML=""; f.appendChild(svg("plus")); f.onclick=()=>openItem(null,{date:k});
  updater=()=>{ const sc=$("tlscroll"); const top=sc?sc.scrollTop:null; render(); const n=$("tlscroll"); if(n&&top!=null) n.scrollTop=top; };
  scrollTimeline();
}
function monthView(k){
  const d=parseKey(k), first=new Date(d.getFullYear(), d.getMonth(), 1, 12);
  const start=addDays(keyOf(first), -first.getDay());
  const wrap=el("div","month");
  const w=el("div","wd"); WD.forEach(x=>w.appendChild(el("div",null,x))); wrap.appendChild(w);
  const grid=el("div","grid"); const T=todayKey();
  for(let i=0;i<42;i++){
    const kk=addDays(start,i), dd=parseKey(kk);
    const cell=el("div","cell"+(dd.getMonth()!==d.getMonth()?" other":"")+(kk===T?" today":""));
    const dn=el("div","dn"); dn.appendChild(el("span",null,String(dd.getDate()))); cell.appendChild(dn);
    const evs=sortTasks(calItems(kk)).sort((a,b)=>(a.start||"")<(b.start||"")?-1:1);
    evs.slice(0,3).forEach(e=>{ const ch=el("div","ech"+(isDone(e)?" done":""), (e.start?e.start+" ":"")+splitIT(e).then); ch.style.setProperty("--tc",tagColor(e.tag)); cell.appendChild(ch); });
    if(evs.length>3) cell.appendChild(el("div","more","+"+(evs.length-3)));
    cell.onclick=()=>{ calState.date=kk; calState.view="day"; render(); scrollTimeline(); };
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  return wrap;
}
const HOUR=52;
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
  const dh=el("div","tl-days");
  days.forEach(k=>{ const x=el("div","d"+(k===T?" today":"")); x.append(document.createTextNode(wd(k))); x.appendChild(el("b",null,String(parseKey(k).getDate()))); x.onclick=()=>{ calState.date=k; calState.view="day"; render(); scrollTimeline(); }; dh.appendChild(x); });
  wrap.appendChild(dh);
  const ad=el("div","tl-allday");
  const lim = calState.allOpen ? 99 : (days.length===1 ? 3 : 2);
  days.forEach(k=>{ const col=el("div","col"); const xs=sortTasks(calItems(k).filter(e=>!isTimed(e)));
    xs.slice(0,lim).forEach(e=>{ const ch=el("div","ech"+(isDone(e)?" done":""),splitIT(e).then); ch.style.setProperty("--tc",tagColor(e.tag)); ch.onclick=()=>openItem(e.id); col.appendChild(ch); });
    if(xs.length>lim){ const m=el("div","adm","+"+(xs.length-lim)); m.onclick=()=>{ calState.allOpen=true; render(); }; col.appendChild(m); }
    else if(calState.allOpen && xs.length>(days.length===1?3:2)){ const m=el("div","adm","▲"); m.onclick=()=>{ calState.allOpen=false; render(); }; col.appendChild(m); }
    ad.appendChild(col); });
  wrap.appendChild(ad);
  const sc=el("div","tl-scroll"); sc.id="tlscroll";
  const tl=el("div","tl");
  const hours=el("div","hours"); for(let i=0;i<24;i++) hours.appendChild(el("div",null,i?i+":00":""));
  tl.appendChild(hours);
  days.forEach(k=>{
    const col=el("div","col");
    for(let i=0;i<24;i++){ const hl=el("div","hl"); hl.onclick=()=>openItem(null,{date:k,start:pad(i)+":00",end:pad((i+1)%24)+":00"}); col.appendChild(hl); }
    layout(calItems(k).filter(isTimed)).forEach(it=>{
      const box=el("div","ev"+(isDone(it.e)?" done":"")); const w=100/it.lanes;
      box.style.top=(it.s*HOUR/60)+"px"; box.style.height=Math.max(22,(it.en-it.s)*HOUR/60-2)+"px";
      box.style.left="calc("+(it.lane*w)+"% + 1px)"; box.style.width="calc("+w+"% - 3px)";
      box.style.setProperty("--tc",tagColor(it.e.tag));
      box.appendChild(el("b",null,splitIT(it.e).then)); box.appendChild(document.createTextNode(it.e.start+(it.e.end?"–"+it.e.end:"")));
      box.onclick=ev=>{ ev.stopPropagation(); openItem(it.e.id); };
      col.appendChild(box);
    });
    if(k===T){ const nl=el("div","nowline"); nl.style.top=(toMin(nowHM())*HOUR/60)+"px"; col.appendChild(nl); }
    tl.appendChild(col);
  });
  sc.appendChild(tl); wrap.appendChild(sc);
  return wrap;
}
function scrollTimeline(){ requestAnimationFrame(()=>{ const sc=$("tlscroll"); if(!sc) return; sc.scrollTop=Math.max(0,toMin(nowHM())-90)*HOUR/60; }); }

/* ================= 過去やったこと ================= */
function doneOn(k){
  const evs=S.events.filter(e=>doneDay(e)===k).sort((a,b)=>a.done<b.done?-1:1);
  // 以前の記録（習慣の○だけ記録に残っているもの）
  const r=S.days[k]||{};
  const legacy=S.items.filter(h=>r[h.id]==="o" && !S.events.some(e=>e.id===habitInst(h.id,k) && isDone(e)))
    .map(h=>({id:"legacy_"+h.id+"_"+k, title:h.name, tag:habitTag(h.id), done:k, rule:"h:"+h.id, date:k, legacy:true}));
  return [...evs, ...legacy];
}
function viewPast(app){
  const top=el("div","top"); const dt=el("div","date"); dt.append(el("b",null,"やったこと"), el("span",null,"直近14日")); top.appendChild(dt); app.appendChild(top);
  const T=todayKey();
  const counts=[]; for(let i=13;i>=0;i--){ const k=dayAt(-i); counts.push({k, n:doneOn(k).length}); }
  const max=Math.max(1,...counts.map(c=>c.n));
  const bars=el("div","bars");
  counts.forEach(c=>{ const b=el("div","b"+(c.n?"":" zero")+(c.k===T?" today":"")); const i=el("i"); i.style.height=Math.max(4,c.n/max*100)+"%"; b.appendChild(i); b.appendChild(el("span",null,String(parseKey(c.k).getDate())));
    b.onclick=()=>{ const t=document.getElementById("d-"+c.k); if(t) t.scrollIntoView({behavior:"smooth",block:"start"}); }; bars.appendChild(b); });
  app.appendChild(bars);
  let any=false;
  for(let i=0;i<60;i++){
    const k=dayAt(-i), xs=doneOn(k); if(!xs.length) continue; any=true;
    const h=el("div","day-h"); h.id="d-"+k; h.append(el("b",null,(i===0?"今日":i===1?"昨日":md(k))+" "+wd(k)), el("span",null,"✓ "+xs.length)); app.appendChild(h);
    const l=el("div","list pastlist");
    xs.forEach(e=>{ const r=row({...e, done:e.done||k}); if(e.legacy){ r.onclick=null; r.querySelector(".chk").onclick=ev=>ev.stopPropagation(); } l.appendChild(r); });
    app.appendChild(l);
  }
  if(!any) app.appendChild(emptyBox("まだ記録がない"));
  updater=()=>render();
}

/* ================= 起動 ================= */
window.addEventListener("online", flush);
let lastDay=todayKey();
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible"){ flush(); if(lastDay!==todayKey()){ lastDay=todayKey(); dailyMaintenance(); update(); } if(Date.now()-lastLoad>20000) pull(); } });
setInterval(()=>{ if(document.visibilityState==="visible" && !drag && !$("sheet").innerHTML && document.activeElement.tagName!=="INPUT") update(); }, 60000);
document.addEventListener("touchmove", ev=>{ if(drag) ev.preventDefault(); }, {passive:false});
document.addEventListener("contextmenu", ev=>{ if(ev.target.closest(".row")) ev.preventDefault(); });
loadLocal(); parseRoute(); if(!location.hash) history.replaceState(null,"","#/todo");
render();
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
pull();
