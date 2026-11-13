import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { extract } from './cutout.js';
import * as C from './config.js';

const $ = s => document.querySelector(s);
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const CATS = ['鳥', '人', '車', '樹', '貓', '其他'];
const AN = { 鳥: 'fly', 人: 'walk', 車: 'drive', 樹: 'sway', 貓: 'bob', 其他: 'bob' };
const SZ = { 鳥: 10, 人: 28, 車: 18, 樹: 36, 貓: 12, 其他: 20 };     // 預設物件高度（視角，度）
const HFOV = 55;                                                      // 鏡頭水平視角（度），可依實測調整
let me = null, lms = [], cur = null, items = [], draft = [], sel = 0, offset = 0, heading = 0, pitch = 0;
let mode = 'view', aligned = false, sensor = false, stream = null, here = null, srcImg = null, filter = 'all', adding = false, ed = null;

let tt; const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('on'), 3000); };
const night = () => { const h = new Date().getHours(); return h < 5 || h >= 18; };
const hav = (a, b) => { const r = Math.PI / 180, R = 6371000, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const d2b = u => { const [m, b] = u.split(','), s = atob(b), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type: 'image/png' }); };
const pubUrl = p => sb.storage.from('cutouts').getPublicUrl(p).data.publicUrl;
const dist = lm => here ? hav(here, lm) : null;
const fmt = d => d == null ? '' : d < 1000 ? Math.round(d) + ' 公尺' : (d / 1000).toFixed(1) + ' 公里';

/* ---------- 地圖 ---------- */
const map = L.map('map', { zoomControl: false }).setView(C.MAP_CENTER, C.MAP_ZOOM);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
const group = L.layerGroup().addTo(map);
function drawMarkers() { group.clearLayers(); lms.forEach(lm => L.marker([lm.lat, lm.lng], { title: lm.name }).addTo(group).on('click', () => openSheet(lm))); }
function locate(fly) { navigator.geolocation?.getCurrentPosition(p => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; if (fly) map.setView([here.lat, here.lng], 16); }, () => fly && toast('無法取得位置，請檢查定位權限'), { timeout: 8000, maximumAge: 60000 }); }
$('#locate').onclick = () => locate(true);
$('#addLm').onclick = () => { adding = true; toast('在地圖上點一下，選擇新地標的位置'); };
map.on('click', async e => {
  if (!adding) return; adding = false;
  const name = (prompt('替這個地標取個名字') || '').trim(); if (!name) return;
  const { data, error } = await sb.from('landmarks').insert({ name, lat: e.latlng.lat, lng: e.latlng.lng }).select().single();
  if (error) return toast('新增失敗：' + error.message);
  lms.push(data); drawMarkers(); openSheet(data);
});
function openSheet(lm) {
  cur = lm; const d = dist(lm); $('#shName').textContent = lm.name;
  $('#shInfo').textContent = d == null ? '' : '距離 ' + fmt(d) + (d < 300 ? '・📍 就在你附近' : '');
  $('#sheet').hidden = false; map.panTo([lm.lat, lm.lng]);
}
$('#shClose').onclick = () => $('#sheet').hidden = true;
function gate() { if (!C.GATE_RADIUS_M) return true; const d = dist(cur); if (d != null && d <= C.GATE_RADIUS_M) return true;
  toast(d == null ? '需要開啟定位才能進入' : '要在地標 ' + C.GATE_RADIUS_M + ' 公尺內才能進入（你距離 ' + fmt(d) + '）'); return false; }
$('#btnView').onclick = () => { if (gate()) enterAR('view'); };
$('#btnAdd').onclick = () => { if (gate()) $('#file').click(); };

/* ---------- 剪下物件 ---------- */
$('#file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const i = new Image();
  i.onload = () => { srcImg = i; ed = []; runEd(); $('#editor').showModal(); }; i.onerror = () => toast('無法讀取這張圖片'); i.src = URL.createObjectURL(f); };
let tm; $('#thr').oninput = () => { clearTimeout(tm); tm = setTimeout(runEd, 150); };
function runEd() {
  const r = extract(srcImg, $('#thr').value / 100), old = ed || [];
  ed = r.objs.map((o, i) => ({ img: o.img, cat: old[i]?.cat || '其他', on: true }));
  const pv = $('#pv'); pv.width = r.preview.width; pv.height = r.preview.height; pv.getContext('2d').drawImage(r.preview, 0, 0);
  const l = $('#list'); l.innerHTML = ed.length ? '' : '<p class="sub">沒有找到物件，請調整靈敏度，或換一張光線均勻的照片。</p>';
  ed.forEach((o, i) => { const r = document.createElement('div'); r.className = 'it'; const im = new Image(); im.src = o.img; im.alt = '物件 ' + (i + 1);
    const d = document.createElement('div'); d.innerHTML = '<b>物件 ' + (i + 1) + '</b><br>'; const s = document.createElement('select');
    CATS.forEach(c => { const op = document.createElement('option'); op.textContent = c; op.selected = c === o.cat; s.appendChild(op); }); s.onchange = () => o.cat = s.value; d.appendChild(s);
    const b = document.createElement('button'); b.textContent = '移除'; b.onclick = () => { o.on = !o.on; r.style.opacity = o.on ? 1 : .4; b.textContent = o.on ? '移除' : '加回'; };
    r.append(im, d, b); l.appendChild(r); });
}
$('#edCancel').onclick = () => $('#editor').close();
$('#edOk').onclick = () => { draft = (ed || []).filter(o => o.on).map(o => ({ ...o, placed: false })); if (!draft.length) return toast('沒有可放置的物件');
  $('#editor').close(); enterAR('place'); };

/* ---------- AR ---------- */
async function enterAR(m) {
  mode = m; aligned = false; sensor = false;
  // iOS 必須在使用者點擊時要求動態感應器權限
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') toast('未允許動態感應器，改用手指拖曳轉動視角'); } catch { }
  }
  $('#ar').hidden = false; $('#arName').textContent = cur.name; $('#align').hidden = false;
  $('#placeBar').hidden = m !== 'place'; $('#arFilter').hidden = m === 'place'; $('#layer').innerHTML = ''; items = [];
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); $('#cam').srcObject = stream; }
  catch { toast('無法開啟鏡頭，改用純色背景'); }
  addEventListener('deviceorientation', onOri);
  if (m === 'view') loadPieces(); else { sel = 0; drawChips(); }
}
function exitAR() { $('#ar').hidden = true; removeEventListener('deviceorientation', onOri); stream?.getTracks().forEach(t => t.stop()); stream = null; if (mode === 'place') draft = []; }
$('#arExit').onclick = exitAR;
function onOri(e) {
  if (e.alpha == null) return; sensor = true;
  const t = Math.PI / 180, a = e.alpha * t, b = e.beta * t, g = e.gamma * t, cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  // 後鏡頭方向向量（東、北、上）
  const E = -cA * sG - sA * cG * sB, N = -sA * sG + cA * cG * sB, U = -cG * cB;
  heading = (Math.atan2(E, N) / t + 360) % 360; pitch = Math.asin(Math.max(-1, Math.min(1, U))) / t; render();
}
// 沒有感應器（例如電腦）時，用手指／滑鼠拖曳轉動視角
let drag = null; $('#ar').addEventListener('pointerdown', e => { if (!sensor && e.target.closest('#layer,#cam,#ar')) drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => { if (!drag || sensor) return; heading = (heading - (e.clientX - drag.x) * .2 + 360) % 360; pitch = Math.max(-80, Math.min(80, pitch + (e.clientY - drag.y) * .2)); drag = { x: e.clientX, y: e.clientY }; render(); });
addEventListener('pointerup', () => drag = null);
$('#btnAlign').onclick = () => { offset = heading; aligned = true; $('#align').hidden = true; render(); toast(mode === 'place' ? '對準完成，轉動手機找位置，按「放這裡」' : '對準完成，轉動手機看看周圍'); };

function mk(it) {
  const n = document.createElement('div'); n.className = 'pc' + (it.mine ? ' me' : ''); const a = document.createElement('div'); a.className = AN[it.cat] || 'bob';
  const im = new Image(); im.src = it.src; im.alt = it.cat; im.draggable = false; a.appendChild(im); n.appendChild(a); $('#layer').appendChild(n); it.node = n; it.im = im; return it;
}
function render() {
  if (!aligned) return; const w = innerWidth, h = innerHeight, vf = HFOV * h / w, rel = heading - offset;
  for (const it of items) { const d = (((it.az - rel) % 360) + 540) % 360 - 180, vis = Math.abs(d) < HFOV && (filter === 'all' || it.period === filter || mode === 'place');
    it.node.style.display = vis ? 'block' : 'none'; if (!vis) continue;
    it.node.style.transform = `translate(${w / 2 + d / HFOV * w}px,${h / 2 - (it.el - pitch) / vf * h}px) translate(-50%,-100%)`; it.im.style.height = it.size / vf * h + 'px'; }
}
async function loadPieces() {
  const { data, error } = await sb.from('pieces').select('*').eq('landmark_id', cur.id).order('created_at'); if (error) return toast('讀取作品失敗：' + error.message);
  items = data.map(p => mk({ ...p, src: pubUrl(p.path), mine: p.owner === me })); items.forEach(it => it.node.onclick = () => {
    const m = Math.round((Date.now() - new Date(it.created_at)) / 60000), t = m < 60 ? m + ' 分鐘前' : m < 1440 ? Math.round(m / 60) + ' 小時前' : Math.round(m / 1440) + ' 天前';
    if (confirm((it.mine ? '你的作品' : '他人的作品') + '・' + t + '・' + (it.period === 'night' ? '晚上' : '早上') + '\n\n要檢舉這件作品嗎？')) sb.from('reports').insert({ piece_id: it.id }).then(r => toast(r.error ? '檢舉失敗' : '已收到檢舉')); });
  toast(items.length ? items.length + ' 件作品' : '這個地標還沒有作品，來當第一個吧！'); render();
}
document.querySelectorAll('#arFilter button').forEach(b => b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('#arFilter button').forEach(x => x.classList.toggle('on', x === b)); render(); });

/* ---------- 擺放與發佈 ---------- */
function drawChips() { const c = $('#chips'); c.innerHTML = ''; draft.forEach((o, i) => { const im = new Image(); im.src = o.img; im.alt = o.cat; im.className = i === sel ? 'on' : ''; im.onclick = () => { sel = i; drawChips(); }; c.appendChild(im); }); }
$('#bPlace').onclick = () => {
  if (!aligned) return toast('請先對準地標'); const o = draft[sel]; if (!o) return;
  const rel = (heading - offset + 360) % 360, az = rel > 180 ? rel - 360 : rel;
  if (!o.item) { o.item = mk({ src: o.img, cat: o.cat, mine: true, az, el: pitch, size: SZ[o.cat], period: 'day' }); items.push(o.item); }
  else Object.assign(o.item, { az, el: pitch });
  render();
};
const resize = f => { const o = draft[sel]; if (o?.item) { o.item.size = Math.max(3, Math.min(90, o.item.size * f)); render(); } };
$('#bSm').onclick = () => resize(.85); $('#bBg').onclick = () => resize(1.18);
$('#bPub').onclick = async () => {
  const ps = draft.filter(o => o.item); if (!ps.length) return toast('先放置至少一個物件'); $('#bPub').disabled = true; const per = night() ? 'night' : 'day';
  try {
    for (const o of ps) {
      const path = `${cur.id}/${crypto.randomUUID()}.png`;
      let r = await sb.storage.from('cutouts').upload(path, d2b(o.img), { contentType: 'image/png' }); if (r.error) throw r.error;
      r = await sb.from('pieces').insert({ landmark_id: cur.id, path, cat: o.cat, az: o.item.az, el: o.item.el, size: o.item.size, period: per }); if (r.error) throw r.error;
    }
    toast('已發佈！'); exitAR(); enterAR('view');
  } catch (e) { toast('發佈失敗：' + (e.message || e)); }
  $('#bPub').disabled = false;
};

/* ---------- 啟動 ---------- */
(async () => {
  if (C.SUPABASE_URL.includes('YOUR-PROJECT')) return toast('請先在 config.js 填入 Supabase 設定');
  let { data: { session } } = await sb.auth.getSession();
  if (!session) { const r = await sb.auth.signInAnonymously(); if (r.error) toast('登入失敗：' + r.error.message); session = r.data?.session; }
  me = session?.user?.id ?? null;
  const { data, error } = await sb.from('landmarks').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) return toast('讀取地標失敗：' + error.message);
  lms = data; drawMarkers(); locate(true);
  if (!lms.length) toast('還沒有地標，按右上角「＋」新增第一個');
})();
