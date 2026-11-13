# 紙上世界（網站版）

流程：平面地圖點地標 → 進入場景 → 開鏡頭 AR 看別人的速寫，或拍自己的速寫剪下來貼進去。

## 部署步驟（約 15 分鐘）
1. 到 supabase.com 建立免費專案。
2. SQL Editor 貼上 `schema.sql` 並執行（建立資料表、權限、圖片儲存空間）。
3. Authentication → Providers → 開啟 **Anonymous sign-ins**。
4. Project Settings → API，把 Project URL 與 anon public key 填進 `config.js`。
5. 把整個資料夾上傳到任一靜態網站服務（Netlify Drop、Vercel、GitHub Pages、Cloudflare Pages）。**必須是 HTTPS**，否則鏡頭、定位、動態感應器都不能用。
6. 用手機開網址測試。

## 本機測試
`python3 -m http.server 8000` 後開 http://localhost:8000（localhost 可用鏡頭；手機測試仍需 HTTPS）。

## AR 運作原理
- 每個作品存的是「相對於對準方向的水平角 az、仰角 el、視角大小 size」，不是 GPS 座標。
- 進入場景先把鏡頭對準地標正面按「對準了」，之後所有人以同一個方向為基準。
- 手機方向感應器約有 10–20 度誤差，轉久會漂移，重新按對準即可。
- `config.js` 的 `GATE_RADIUS_M` 可限制必須人在地標附近才能進入。

## 已知限制 / 之後可加
- 沒有審核後台：檢舉只寫入 `reports` 表，請在 Supabase 後台查看並刪除。
- 匿名登入無法跨裝置保留身分；正式上線建議改 Email／Google 登入。
- 類別目前手動選擇。要自動辨識，可建 Supabase Edge Function 呼叫 Claude API（API 金鑰不能放在前端）。
- 每日定時提醒需要推播，網頁版做不到，需做成 App 或用 Web Push + 後端排程。
- 免費 OpenStreetMap 圖磚不適合大流量，上線後請換 Mapbox／MapTiler 等服務。
- 全部程式未在真機實測，請先在你的手機上測試並調整 `HFOV`（app.js）。
