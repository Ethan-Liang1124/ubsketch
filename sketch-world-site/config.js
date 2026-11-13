// 1) 到 supabase.com 建立專案，把下面兩個值換成你專案的設定（Project Settings → API）
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_8QNKlXyS-eACmazxiYO5bw_3u_dc37X';
// 地圖初始中心與縮放（會先嘗試改用使用者目前位置）
export const MAP_CENTER = [23.7, 121.0];
export const MAP_ZOOM = 8;
// 進入地標的距離限制（公尺）。0 = 不限制，大家在家也能逛；例如 300 = 必須人在地標 300 公尺內
export const GATE_RADIUS_M = 0;
