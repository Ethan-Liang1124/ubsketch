// 速寫去背與物件分割：純瀏覽器運算，不需要 AI 模型
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function dil(a, w, h, r) {
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) { const s = new Int32Array(w + 1); for (let x = 0; x < w; x++) s[x + 1] = s[x] + a[y * w + x];
    for (let x = 0; x < w; x++) t[y * w + x] = s[Math.min(w, x + r + 1)] - s[Math.max(0, x - r)] > 0 ? 1 : 0; }
  for (let x = 0; x < w; x++) { const s = new Int32Array(h + 1); for (let y = 0; y < h; y++) s[y + 1] = s[y] + t[y * w + x];
    for (let y = 0; y < h; y++) o[y * w + x] = s[Math.min(h, y + r + 1)] - s[Math.max(0, y - r)] > 0 ? 1 : 0; }
  return o;
}
// src: Image；thr: 0.70~0.95；回傳 { preview: canvas, objs: [{img:dataURL, box}] }
export function extract(src, thr = 0.86) {
  const k = Math.min(1, 900 / Math.max(src.width, src.height)), W = Math.round(src.width * k), H = Math.round(src.height * k);
  const c = cv(W, H), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H), p = d.data;
  // 估計紙張底色（縮小後取區域最大值，再放大），用來消除光影不均
  const sw = Math.max(8, W >> 4), sh = Math.max(8, H >> 4), s = cv(sw, sh), sx = s.getContext('2d'); sx.drawImage(c, 0, 0, sw, sh);
  const sd = sx.getImageData(0, 0, sw, sh).data, mx = new Uint8ClampedArray(sd.length);
  for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) for (let ch = 0; ch < 3; ch++) {
    let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = sd[(Math.min(sh - 1, Math.max(0, y + dy)) * sw + Math.min(sw - 1, Math.max(0, xx + dx))) * 4 + ch]; if (v > m) m = v; }
    mx[(y * sw + xx) * 4 + ch] = m; mx[(y * sw + xx) * 4 + 3] = 255; }
  sx.putImageData(new ImageData(mx, sw, sh), 0, 0);
  const b = cv(W, H), bx = b.getContext('2d'); bx.imageSmoothingEnabled = true; bx.drawImage(s, 0, 0, W, H); const bp = bx.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H), A = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const j = i * 4, r = p[j] / Math.max(bp[j], 1), g = p[j + 1] / Math.max(bp[j + 1], 1), bl = p[j + 2] / Math.max(bp[j + 2], 1);
    const a = Math.min(1, Math.max(0, (thr - Math.min(r, g, bl, 1)) / .22)); A[i] = a; ink[i] = a > .25 ? 1 : 0;
    p[j] = Math.min(255, r * 255); p[j + 1] = Math.min(255, g * 255); p[j + 2] = Math.min(255, bl * 255); }
  // 填補封閉圖形內部，並加上白邊（貼紙效果）
  const D = dil(ink, W, H, 3), out = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0;
  const push = n => { if (!D[n] && !out[n]) { out[n] = 1; q[qt++] = n; } };
  for (let i = 0; i < W; i++) { push(i); push((H - 1) * W + i); } for (let i = 0; i < H; i++) { push(i * W); push(i * W + W - 1); }
  while (qh < qt) { const i = q[qh++], cx = i % W; if (cx > 0) push(i - 1); if (cx < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < W * (H - 1)) push(i + W); }
  const gw = Math.ceil(W / 4), gh = Math.ceil(H / 4), cell = new Uint8Array(gw * gh);
  for (let i = 0; i < W * H; i++) { const j = i * 4;
    if (out[i]) p[j + 3] = 0; else { const a = A[i]; for (let t = 0; t < 3; t++) p[j + t] = p[j + t] * a + 255 * (1 - a); p[j + 3] = 255; cell[(((i / W) | 0) >> 2) * gw + ((i % W) >> 2)] = 1; } }
  // 找出彼此分開的物件
  const DG = dil(cell, gw, gh, 3), L = new Int32Array(gw * gh); let n = 0;
  for (let i = 0; i < gw * gh; i++) if (DG[i] && !L[i]) { n++; L[i] = n; const st = [i];
    while (st.length) { const e = st.pop(), ex = e % gw, nb = []; if (ex > 0) nb.push(e - 1); if (ex < gw - 1) nb.push(e + 1); if (e >= gw) nb.push(e - gw); if (e < gw * (gh - 1)) nb.push(e + gw);
      for (const z of nb) if (DG[z] && !L[z]) { L[z] = n; st.push(z); } } }
  let cs = []; for (let i = 1; i <= n; i++) cs.push({ id: i, n: 0, x0: W, y0: H, x1: 0, y1: 0 });
  for (let i = 0; i < W * H; i++) { if (out[i]) continue; const px = i % W, py = (i / W) | 0, l = L[(py >> 2) * gw + (px >> 2)]; if (!l) continue; const o = cs[l - 1]; o.n++; if (px < o.x0) o.x0 = px; if (px > o.x1) o.x1 = px; if (py < o.y0) o.y0 = py; if (py > o.y1) o.y1 = py; }
  cs = cs.filter(o => o.n >= W * H * .0012).sort((a, b) => b.n - a.n).slice(0, 8).sort((a, b) => a.x0 - b.x0);
  x.putImageData(d, 0, 0);
  const objs = cs.map(o => { const w = o.x1 - o.x0 + 1, h = o.y1 - o.y0 + 1, t = cv(w, h), tx = t.getContext('2d'), id = tx.createImageData(w, h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const si = (o.y0 + yy) * W + o.x0 + xx, dj = (yy * w + xx) * 4;
      if (L[((o.y0 + yy) >> 2) * gw + ((o.x0 + xx) >> 2)] === o.id && !out[si]) { id.data[dj] = p[si * 4]; id.data[dj + 1] = p[si * 4 + 1]; id.data[dj + 2] = p[si * 4 + 2]; id.data[dj + 3] = 255; } }
    tx.putImageData(id, 0, 0); const sc = Math.min(1, 256 / Math.max(w, h)), f = cv(Math.max(1, Math.round(w * sc)), Math.max(1, Math.round(h * sc))); f.getContext('2d').drawImage(t, 0, 0, f.width, f.height);
    return { img: f.toDataURL('image/png'), box: o }; });
  const pv = cv(W, H), px = pv.getContext('2d'); px.drawImage(c, 0, 0); px.lineWidth = Math.max(2, W / 300); px.font = 'bold ' + Math.round(W / 22) + 'px sans-serif';
  objs.forEach((o, i) => { px.strokeStyle = '#2547d0'; px.strokeRect(o.box.x0, o.box.y0, o.box.x1 - o.box.x0, o.box.y1 - o.box.y0); px.fillStyle = '#2547d0'; px.fillText(i + 1, o.box.x0 + 4, o.box.y0 + Math.round(W / 22)); });
  return { preview: pv, objs };
}
