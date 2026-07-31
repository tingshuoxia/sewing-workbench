/* ==========================================================
   聼说的缝纫工作台 — 应用逻辑
   ========================================================== */

(function() {
'use strict';

/* ---------- 工具 ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const STORAGE_KEY = 'ting_said_sewing_v1';

/* ---------- 防清零保护：IndexedDB 镜像备份 ----------
   localStorage 属于"尽力而为"存储，iOS/安卓在空间紧张或长期未访问时
   可能整体清除。这里把数据同步镜像一份到 IndexedDB；
   启动时若发现 localStorage 被清而镜像还在，自动恢复。 */
const BAK_DB = 'ting_said_sewing_backup';
const BAK_STORE = 'kv';
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BAK_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(BAK_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbSet(key, val) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(BAK_STORE, 'readwrite');
    tx.objectStore(BAK_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  })).catch(() => {});
}
function idbGet(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(BAK_STORE, 'readonly');
    const rq = tx.objectStore(BAK_STORE).get(key);
    rq.onsuccess = () => { db.close(); resolve(rq.result); };
    rq.onerror = () => { db.close(); reject(rq.error); };
  })).catch(() => undefined);
}

const CATEGORY_META = {
  fabric: { label: '布料', icon: '🧵' },
  lining: { label: '里布', icon: '🪡' },
  zipper: { label: '拉链', icon: '🤐' },
  button: { label: '扣子', icon: '⚪' },
  tool: { label: '工具', icon: '✂️' },
  buckle: { label: '辅料', icon: '🔗' },
};

const STAGE_META = {
  queue:  { label: '排队中', cls: 'stage-queue' },
  cut:    { label: '裁剪',   cls: 'stage-cut' },
  sew:    { label: '缝制',   cls: 'stage-sew' },
  pack:   { label: '包装',   cls: 'stage-pack' },
  done:   { label: '已完成', cls: 'stage-done' },
};
const STAGE_ORDER = ['queue', 'cut', 'sew', 'pack', 'done'];

const ORDER_CATEGORY = {
  bag:     '包包',
  clothes: '服饰',
  home:    '家居',
  toy:     '玩偶',
};

const PLATFORM_META = {
  douyin: { label: '抖音', emoji: '🎵', tag: '抖音' },
  xhs:    { label: '小红书', emoji: '📕', tag: '小红书' },
  bili:   { label: 'B 站', emoji: '📺', tag: 'B 站' },
  other:  { label: '其他', emoji: '🔗', tag: '其他' },
};

/* ---------- 种子数据 ---------- */
function seedData() {
  return {
    inventory: [
      { id: 'm1', category: 'fabric', name: '日系格子棉布', material: '纯棉', color: '藏青格子',
        tags: ['棉布', '格纹', '外套'], total: 5, remaining: 2.5, unit: '米', price: 120,
        threshold: 1, photo: '', note: '柔软，适合做围裙和亲子装。' },
      { id: 'm2', category: 'lining', name: '米白涤棉里布', material: '涤棉', color: '米白',
        tags: ['里布'], total: 3, remaining: 1, unit: '米', price: 30,
        threshold: 0.5, photo: '', note: '' },
      { id: 'm3', category: 'zipper', name: 'YKK 5号金属拉链', material: '金属', color: '银色',
        tags: ['拉链', 'YKK'], total: 20, remaining: 14, unit: '条', price: 80,
        threshold: 5, photo: '', note: '' },
      { id: 'm4', category: 'button', name: '木质感纽扣 12mm', material: '木质', color: '原木',
        tags: ['扣子'], total: 60, remaining: 32, unit: '颗', price: 18,
        threshold: 10, photo: '', note: '' },
      { id: 'm5', category: 'tool', name: '兄弟牌缝纫线 - 米白', material: '涤纶', color: '米白',
        tags: ['线', '缝纫'], total: 10, remaining: 7, unit: '卷', price: 45,
        threshold: 2, photo: '', note: '' },
    ],
    orders: [
      { id: 'o1', name: '一字拉链卡包', category: 'bag', size: '12×8cm', qty: 2,
        customer: '小红', income: 120, stage: 'queue', cover: '',
        fabrics: [], buckles: [], note: '自己设计的版型，第一次做。' },
      { id: 'o2', name: '碎花法式抱枕套', category: 'home', size: '45×45cm', qty: 1,
        customer: '自用', income: 0, stage: 'cut', cover: '',
        fabrics: [], buckles: [], note: '' },
      { id: 'o3', name: '棉麻亲子围裙', category: 'clothes', size: '均码', qty: 2,
        customer: '小米', income: 180, stage: 'sew', cover: '',
        fabrics: [], buckles: [], note: '' },
    ],
    inspirations: [
      { id: 'i1', title: '一字拉链卡包', desc: '新手友好，零基础也能 hold 住的版型，先练手很合适。',
        cover: '', tags: ['拉链', '卡包', '入门'] },
      { id: 'i2', title: '碎花棉布改造法式抱枕', desc: '把旧床单变温柔抱枕，颜色搭配是关键。',
        cover: '', tags: ['改造', '家居', '碎花'] },
      { id: 'i3', title: '棉麻亲子围裙', desc: '均码围裙的裁剪与缝制，适合做礼物或自用。',
        cover: '', tags: ['围裙', '亲子', '衣物'] },
      { id: 'i4', title: '布艺玩偶小熊', desc: '一块布十分钟变一只熊，送娃神器。',
        cover: '', tags: ['玩偶', '礼物'] },
      { id: 'i5', title: '日系棉布手提袋', desc: '温柔米白 + 棉麻质感，拎着出街很 chill。',
        cover: '', tags: ['包包', '日系'] },
      { id: 'i6', title: '金属拉链隐藏缝法', desc: '让拉链藏起来的小技巧，颜值翻倍。',
        cover: '', tags: ['拉链', '技巧'] },
    ],
    fabricInspirations: [
      { id: 'f1', name: '奶油色亚麻', note: '垂感好、透气，适合做夏日罩衫和抱枕。',
        photo: '', makePhotos: [], createdAt: Date.now() - 86400000 },
      { id: 'f2', name: '小碎花棉布', note: '柔软亲肤，做儿童裙或发带都很可。',
        photo: '', makePhotos: [], createdAt: Date.now() },
    ],
    wishlist: [
      { id: 'w1', fromInspirationId: 'i1', name: '一字拉链卡包', source: 'record',
        tags: ['拉链', '卡包'], note: '' },
    ],
    portfolio: [
      { id: 'p1', name: '棉麻亲子围裙（第一单）', size: '均码',
        income: 180, photos: [], note: '第一次做围裙，下摆有点歪，下次注意对齐。' },
      { id: 'p2', name: '复古灯芯绒托特包', size: '38×32 cm',
        income: 260, photos: [], note: '内袋加了拉链暗袋，容量超大。' },
      { id: 'p3', name: '小碎花儿童连衣裙', size: '110 码',
        income: 150, photos: [], note: '后背缝了纽扣开口，方便穿脱。' },
    ],
    purchases: [
      { id: 'pu1', name: '米白亚麻布', category: 'fabric', qty: 3, unit: '米', price: 28,
        linkedOrder: '', done: false },
    ],
    weights: [
      { id: 'wt1', date: '2026-07-22', weight: 58.5, note: '空腹' },
      { id: 'wt2', date: '2026-07-23', weight: 58.2, note: '空腹' },
      { id: 'wt3', date: '2026-07-24', weight: 58.0, note: '空腹·运动后' },
      { id: 'wt4', date: '2026-07-25', weight: 57.8, note: '空腹' },
      { id: 'wt5', date: '2026-07-26', weight: 57.9, note: '饭后' },
      { id: 'wt6', date: '2026-07-27', weight: 57.6, note: '空腹' },
    ],
    thoughts: [
      { id: 'th1', date: '2026-07-26', mood: 'happy', content: '今天完成了一个碎花抱枕，配色超出预期，果然莫兰迪色系永远不会让人失望。' },
      { id: 'th2', date: '2026-07-27', mood: 'calm', content: '想在围裙上加一个刺绣小标，下次试试用缝纫机的绣花功能。' },
    ],
    travels: [
      { id: 'tr1', destination: '大理', startDate: '2026-08-15', endDate: '2026-08-20',
        status: 'planning', budget: 5000, days: 6, note: '想逛古城、环洱海骑行、去喜洲看稻田' },
      { id: 'tr2', destination: '京都', startDate: '', endDate: '',
        status: 'dreaming', budget: 12000, days: 7, note: '想看樱花季、体验友禅染、逛锦市场' },
    ],
    memos: {},
    settings: { reminderTime: '09:00' }
  };
}

function emptyData() {
  return {
    inventory: [], orders: [], inspirations: [], wishlist: [], portfolio: [],
    purchases: [], weights: [], thoughts: [], travels: [], memos: {}, fabricInspirations: [], settings: { reminderTime: '09:00' }
  };
}

/* 旧主页链接 → 具体搜索/视频链接（迁移数据；须定义在 loadState 调用之前，避免暂时性死区 TDZ） */
const INSP_URL_MIGRATION = {
  'i1': 'https://www.douyin.com/search/拉链卡包手工缝纫教程',
  'i2': 'https://www.xiaohongshu.com/search_result?keyword=碎花棉布抱枕手工制作',
  'i3': 'https://www.bilibili.com/video/BV1B94y1B7wY/',
  'i4': 'https://www.douyin.com/search/布艺小熊玩偶制作教程',
  'i5': 'https://www.xiaohongshu.com/search_result?keyword=棉布手提袋手工缝制',
  'i6': 'https://www.bilibili.com/video/BV1bF3M6vEHs/',
};
const OLD_INSP_HOMEPAGES = [
  'https://www.douyin.com', 'https://www.douyin.com/discover',
  'https://www.xiaohongshu.com', 'https://www.bilibili.com',
];
function migrateInspirationUrls(data) {
  if (!data.inspirations) return;
  let changed = false;
  data.inspirations.forEach(it => {
    if (INSP_URL_MIGRATION[it.id] && OLD_INSP_HOMEPAGES.includes(it.url)) {
      it.url = INSP_URL_MIGRATION[it.id];
      changed = true;
    }
  });
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = loadState();

/* ---------- 启动自愈：以 IndexedDB 为主存储，localStorage 仅作缓存 ----------
   修复：原先先写 localStorage，配额超限会抛错导致 IndexedDB 镜像也写不进，
   PWA 退出后数据被清空、重开只剩种子数据。现改为优先写 IndexedDB，并以
   _savedAt 时间戳比较，确保两者中较新的一份成为真相来源。 */
(function boot() {
  if (!('indexedDB' in window)) return;
  const lsRaw = localStorage.getItem(STORAGE_KEY);
  let lsTime = 0;
  try { const p = JSON.parse(lsRaw); if (p && p._savedAt) lsTime = p._savedAt; } catch (e) {}
  idbGet(STORAGE_KEY).then(idbJson => {
    let idbTime = 0;
    try { const p = JSON.parse(idbJson); if (p && p._savedAt) idbTime = p._savedAt; } catch (e) {}
    if (idbTime && idbTime > lsTime) {
      // IndexedDB 更新 → 以它为准，刷新缓存并重载
      localStorage.setItem(STORAGE_KEY, idbJson);
      localStorage.setItem(STORAGE_KEY + '_restored', '1');
      location.reload();
      return;
    }
    if (!idbJson && lsRaw) {
      // 仅 localStorage 有 → 补写镜像
      idbSet(STORAGE_KEY, lsRaw);
    }
  }).catch(() => {});
})();

/* 恢复成功后的提示（在 reload 后的这一轮显示） */
if (localStorage.getItem(STORAGE_KEY + '_restored')) {
  localStorage.removeItem(STORAGE_KEY + '_restored');
  setTimeout(() => toast('检测到数据曾被系统清除，已从内置备份自动恢复 ✓'), 800);
}

/* 申请持久化存储权限，降低系统在空间紧张时清数据的概率 */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw);
    if (!parsed.settings) parsed.settings = { reminderTime: '09:00' };
    if (!parsed.weights) parsed.weights = [];
    if (!parsed.thoughts) parsed.thoughts = [];
    if (!parsed.travels) parsed.travels = [];
    if (!parsed.memos) parsed.memos = {};
    if (!parsed.fabricInspirations) parsed.fabricInspirations = [];
    // 迁移：将旧的灵感主页链接更新为具体的搜索/视频链接
    migrateInspirationUrls(parsed);
    // 迁移：排单物料由 [id] 兼容为 [{id,qty}]
    migrateMaterials(parsed);
    return parsed;
  } catch (e) { return seedData(); }
}

// 旧格式 fabrics/buckles: ["id1","id2"] → 新格式: [{id,qty:1}]
function migrateMaterials(data) {
  if (!data.orders) return;
  ['fabrics', 'buckles'].forEach(key => {
    data.orders.forEach(o => {
      if (Array.isArray(o[key])) {
        o[key] = o[key]
          .map(x => typeof x === 'string'
            ? { id: x, qty: 1 }
            : (x && x.id ? { id: x.id, qty: Number(x.qty) || 1 } : null))
          .filter(Boolean);
      }
    });
  });
}

function saveState() {
  state._savedAt = Date.now();
  const json = JSON.stringify(state);
  // IndexedDB 配额大、PWA 下更持久，作为主存储优先写入（不依赖 localStorage 成功）
  idbSet(STORAGE_KEY, json);
  // localStorage 仅作快速缓存；配额超限（布料大图常触发）时忽略，不影响主存储
  try { localStorage.setItem(STORAGE_KEY, json); }
  catch (e) { /* 配额超限：数据已存入 IndexedDB，无需处理 */ }
}

const uid = () => 'id_' + Math.random().toString(36).slice(2, 9);

/* 读取图片并等比压缩到 maxDim 以内，输出 JPEG base64，显著减小存储体积
   （布料灵感 1:1 大图若不压缩，几张就会撑爆 localStorage 5MB 配额） */
function fileToDataURLScaled(file, maxDim, quality) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const iw = img.width || maxDim, ih = img.height || maxDim;
        const scale = Math.min(1, maxDim / Math.max(iw, ih));
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', quality || 0.82)); }
        catch (e) { resolve(ev.target.result); } // 回退原图
      };
      img.onerror = () => resolve(ev.target.result);
      img.src = ev.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- Tab 切换 & 视图 ---------- */
const NAV_HISTORY = ['workbench'];

let suppressHashRoute = false;
function syncHash(viewName) {
  // 同步 hash，让系统返回手势 / 浏览器返回键在应用内正确回退
  const target = viewName === 'wellness' ? `wellness/${wellnessTab}` : viewName;
  if ((location.hash || '').slice(1) !== target) {
    suppressHashRoute = true;
    location.hash = target;
  }
}

function go(viewName, opts = {}) {
  if (opts.push !== false) NAV_HISTORY.push(viewName);
  if (opts.syncHash !== false) syncHash(viewName);
  $$('.view').forEach(v => v.classList.remove('active'));
  const v = $(`.view[data-view="${viewName}"]`);
  if (v) v.classList.add('active');

  // tab 状态
  const tabMap = { workbench:'workbench', inventory:'inventory', orders:'orders', inspiration:'inspiration', more:'more' };
  $$('.tab').forEach(t => {
    t.classList.toggle('tab-active', t.dataset.tab === tabMap[viewName]);
  });

  if (viewName === 'workbench') refreshDashboard();
  if (viewName === 'inventory') refreshInventory();
  if (viewName === 'orders') refreshOrders();
  if (viewName === 'inspiration') refreshInspiration();
  if (viewName === 'purchase') refreshPurchase();
  if (viewName === 'wellness') refreshWellness();
  if (viewName === 'wishlist') refreshWishlist();
  if (viewName === 'portfolio') refreshPortfolio();
  if (viewName === 'more') refreshMore();
}

function back() {
  if (NAV_HISTORY.length > 1) NAV_HISTORY.pop();
  go(NAV_HISTORY[NAV_HISTORY.length - 1], { push: false });
}

/* ---------- 动态时间 & 问候 ---------- */
function refreshTimeAndGreeting() {
  const now = new Date();
  const h = now.getHours();
  const greeting = h < 6 ? '凌晨好' :
                   h < 11 ? '早上好' :
                   h < 14 ? '中午好' :
                   h < 18 ? '下午好' :
                   h < 22 ? '晚上好' : '夜深啦';
  $('#greetingLine').textContent = `${greeting}，小裁缝 👋`;

  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  $('#dateLine').textContent = `${now.getMonth()+1}月${now.getDate()}日`;
  $('#weekdayLine').textContent = weekdays[now.getDay()];
  const statusTime = $('#statusTime');
  if (statusTime) statusTime.textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const dateLineFull = `${now.getMonth()+1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
  $('#invDateLine').textContent = dateLineFull;
  $('#ordDateLine').textContent = dateLineFull;
  $('#moreDateLine').textContent = dateLineFull;
  const wdl = $('#wellnessDateLine');
  if (wdl) wdl.textContent = dateLineFull;
}

/* ---------- 工作台 Dashboard ---------- */
/* ---------- 成品轮播 ---------- */
let carouselIndex = 0;
let carouselTimer = null;

function refreshHeroCarousel() {
  const el = $('#heroCarousel');
  if (!el) return;

  const items = state.portfolio;
  carouselIndex = 0;

  if (items.length === 0) {
    el.innerHTML = `<div class="hero-carousel-empty">
      <span class="empty-icon">🧵</span>
      <span>还没有成品，完成第一件作品后这里会自动展示</span>
    </div>`;
    if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; }
    return;
  }

  const slides = items.map(p => {
    const img = (p.photos && p.photos[0])
      ? `<img src="${p.photos[0]}" alt="${escapeHtml(p.name)}">`
      : `<div class="slide-placeholder">🧵</div>`;
    return `<div class="hero-carousel-slide">
      ${img}
      <div class="hero-carousel-caption">
        <span>${escapeHtml(p.name)}</span>
        <span class="slide-income">${p.size || ''} ${p.income ? '· ¥' + p.income : ''}</span>
      </div>
    </div>`;
  }).join('');

  const dots = items.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`).join('');

  el.innerHTML = `<div class="hero-carousel-track" id="heroCarouselTrack">${slides}</div>
    <div class="hero-carousel-dots">${dots}</div>`;

  if (items.length > 1) {
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(() => {
      carouselIndex = (carouselIndex + 1) % items.length;
      const track = $('#heroCarouselTrack');
      if (track) track.style.transform = `translateX(-${carouselIndex * 100}%)`;
      el.querySelectorAll('.hero-carousel-dots .dot').forEach((d, i) => {
        d.classList.toggle('active', i === carouselIndex);
      });
    }, 3000);
  } else if (carouselTimer) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }
}

function refreshDashboard() {
  refreshTimeAndGreeting();
  refreshHeroCarousel();

  const inProgress = state.orders.filter(o => o.stage !== 'done').length;
  const pending    = state.orders.filter(o => o.stage === 'done').length;
  const inspTodo   = state.wishlist.filter(w => !state.portfolio.find(p => p.name === w.name)).length;
  $('#statInProgress').textContent = inProgress;
  $('#statPending').textContent     = pending;
  // 有任务进入"已完成"后，文案从"待交单"变为"已交单"
  const pendingLabel = $('#statPendingLabel');
  if (pendingLabel) pendingLabel.textContent = pending > 0 ? '已交单' : '待交单';
  $('#statInspiration').textContent = inspTodo;

  $('#wbInventoryCount').textContent   = state.inventory.length;
  $('#wbOrderCount').textContent       = inProgress;
  $('#wbInspirationCount').textContent = state.inspirations.length;
  $('#wbWishlistCount').textContent    = state.wishlist.length;
  $('#wbPortfolioCount').textContent   = state.portfolio.length;
}

/* ---------- 库存 ---------- */
let invFilter = 'all';
function refreshInventory() {
  refreshTimeAndGreeting();

  const totalKinds = state.inventory.length;
  const totalQty = state.inventory.reduce((s, m) => s + (Number(m.remaining)||0), 0);
  const lowCount = state.inventory.filter(m => Number(m.remaining) <= Number(m.threshold||0)).length;
  $('#invTotalKinds').textContent = totalKinds;
  $('#invTotalQty').textContent = totalQty.toFixed(1).replace(/\.0$/, '');
  $('#invLowCount').textContent = lowCount;

  const list = state.inventory.filter(m => invFilter === 'all' || m.category === invFilter);

  const html = list.map(m => {
    const meta = CATEGORY_META[m.category] || { icon: '📦' };
    const pct = m.total > 0 ? Math.max(0, Math.min(100, (m.remaining / m.total) * 100)) : 0;
    const low = Number(m.remaining) <= Number(m.threshold||0);
    const photo = m.photo
      ? `<img src="${m.photo}" alt="">`
      : `<span>${meta.icon}</span>`;
    return `
      <div class="inv-item" data-id="${m.id}">
        <div class="inv-thumb">${photo}</div>
        <div class="inv-body">
          <div class="inv-name">${escapeHtml(m.name)}${low ? '<span class="low-tag">待补</span>' : ''}</div>
          <div class="inv-meta">
            ${m.material ? `<span>${escapeHtml(m.material)}</span>` : ''}
            ${m.color ? `<span>${escapeHtml(m.color)}</span>` : ''}
            <span>${meta.label}</span>
          </div>
          <div class="inv-progress">
            <div class="inv-bar"><div class="inv-bar-fill ${low?'low':''}" style="width:${pct}%"></div></div>
            <span>${m.remaining}/${m.total} ${escapeHtml(m.unit||'')}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="act-btn act-edit" data-edit-material="${m.id}" aria-label="编辑">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="act-btn act-del" data-del-material="${m.id}" aria-label="删除">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('') || `<div class="kanban-empty">这里还没有物料，点右上角「登记」开始记录 📝</div>`;

  $('#invList').innerHTML = html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ---------- 排单 ---------- */
function refreshOrders() {
  refreshTimeAndGreeting();

  // 看板
  const wrap = $('#kanbanWrap');
  const cols = STAGE_ORDER.map((stg, i) => {
    const items = state.orders.filter(o => o.stage === stg);
    const next  = STAGE_ORDER[i+1];
    const isLast = i === STAGE_ORDER.length - 1;
    const cards = items.map(o => `
      <div class="kanban-card" draggable="true" data-id="${o.id}" data-stage="${stg}">
        <div class="kanban-card-title">${escapeHtml(o.name)}</div>
        <div class="kanban-card-meta">
          ${o.size ? `<span>${escapeHtml(o.size)}</span>` : ''}
          ${o.qty ? `<span>×${o.qty}</span>` : ''}
          ${o.income ? `<span>¥${o.income}</span>` : ''}
        </div>
        ${materialSummary(o)}
        <div class="kanban-card-actions">
          <button class="act-btn act-edit" data-edit-order="${o.id}" aria-label="编辑">
            <svg viewBox="0 0 24 24"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="act-btn act-del" data-del-order="${o.id}" aria-label="删除">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `).join('') || `<div class="kanban-empty">长按添加卡片…</div>`;
    return `
      <div class="kanban-col ${next ? 'next' : ''}" data-stage="${stg}">
        <div class="kanban-col-head">
          <span>${STAGE_META[stg].label}</span>
          <span class="col-count">${items.length}</span>
        </div>
        <div class="kanban-col-body" data-stage="${stg}">
          ${cards}
        </div>
      </div>
    `;
  }).join('');
  wrap.innerHTML = cols;

  bindKanbanDnd();

  // 列表排序
  const listHtml = state.orders
    .slice()
    .sort((a,b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    .map(o => `
      <div class="order-row" data-id="${o.id}">
        <span class="stage-pill ${STAGE_META[o.stage].cls}">${STAGE_META[o.stage].label}</span>
        <div class="order-row-body">
          <div class="order-row-name">${escapeHtml(o.name)}</div>
          <div class="order-row-meta">
            ${o.size ? `<span>${escapeHtml(o.size)}</span>` : ''}
            ${o.customer ? `<span>${escapeHtml(o.customer)}</span>` : ''}
            ${o.income ? `<span>¥${o.income}</span>` : ''}
          </div>
          ${materialSummary(o)}
        </div>
        <div class="order-row-actions">
          <button class="act-btn act-edit" data-edit-order="${o.id}" aria-label="编辑">
            <svg viewBox="0 0 24 24"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="act-btn act-del" data-del-order="${o.id}" aria-label="删除">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `).join('') || `<div class="kanban-empty">还没有排单，点 + 添加 ✂️</div>`;
  $('#orderList').innerHTML = listHtml;

  // 想做清单
  const wishHtml = state.wishlist.map(w => `
    <div class="wishlist-card" data-id="${w.id}">
      <button class="wl-check" data-wl-complete="${w.id}" aria-label="完成">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="wl-body">
        <div class="wl-name">${escapeHtml(w.name)}</div>
        <div class="wl-source">
          <span class="tag">${(PLATFORM_META[w.source]||{}).label || '灵感'}</span>
          ${(w.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
      <div class="wl-actions">
        <button class="act-btn act-edit" data-edit-wishlist="${w.id}" aria-label="编辑">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="act-btn act-del" data-del-wishlist="${w.id}" aria-label="删除">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `).join('') || `<div class="kanban-empty">记录灵感空空的，去记一条试试 ✏️</div>`;
  $('#wishList').innerHTML = wishHtml;
}

function bindKanbanDnd() {
  let dragId = null;
  $$('.kanban-card').forEach(c => {
    c.addEventListener('dragstart', e => {
      dragId = c.dataset.id;
      c.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  $$('.kanban-col-body').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop-active'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop-active'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drop-active');
      const id = e.dataTransfer.getData('text/plain') || dragId;
      const newStage = col.dataset.stage;
      const order = state.orders.find(o => o.id === id);
      if (order) {
        const prev = order.stage;
        order.stage = newStage;
        // 完成时自动归档
        if (newStage === 'done' && prev !== 'done') {
          autoArchiveDone(order);
        }
        saveState();
        refreshOrders();
        toast(`已移到「${STAGE_META[newStage].label}」`);
      }
    });
  });
}

function autoArchiveDone(order) {
  const exists = state.portfolio.find(p => p.name === order.name);
  if (exists) return;
  state.portfolio.unshift({
    id: uid(),
    name: order.name,
    size: order.size || '',
    income: order.income || 0,
    photos: [],
    note: order.note || ''
  });
  // 从想做清单移除
  state.wishlist = state.wishlist.filter(w => w.name !== order.name);
}

/* ---------- 记录灵感（个人灵感记录，1:1 大图 + 标题，支持编辑/删除） ---------- */
let inspSearch = '';
let editingInspId = null;
let inspBlueprintsDraft = [];   // 记录灵感时上传的图纸（dataURL 数组），保存时写入 it.blueprints
let inspSubTab = 'make';        // 灵感库子标签：make=制作灵感 / fabric=布料灵感
let currentFabricId = null;     // 当前查看的布料灵感
let editingFabricId = null;     // 正在编辑的布料灵感（null=新增）

function findInspiration(id) {
  return state.inspirations.find(i => i.id === id) || null;
}

function renderInspCards(items) {
  const feed = $('#inspFeed');
  if (!feed) return;
  if (items.length === 0) {
    feed.innerHTML = `<div class="kanban-empty">还没有灵感记录，点右下角「+ 记一条」开始吧 ✏️</div>`;
    return;
  }
  const wishIds = new Set(state.wishlist.map(w => w.fromInspirationId));
  feed.innerHTML = items.map(it => {
    const fav = wishIds.has(it.id);
    const cover = it.cover
      ? `<img src="${it.cover}" alt="${escapeHtml(it.title)}" />`
      : `<span class="stub-illu">✏️</span>`;
    return `
      <div class="insp-card" data-id="${it.id}">
        <div class="insp-cover">
          ${cover}
          <button class="insp-edit" data-insp-edit="${it.id}" aria-label="编辑">✎</button>
          <button class="insp-del" data-insp-del="${it.id}" aria-label="删除">🗑</button>
        </div>
        <div class="insp-body">
          <div class="insp-title">${escapeHtml(it.title)}</div>
          ${it.desc ? `<div class="insp-desc">${escapeHtml(it.desc)}</div>` : ''}
          <div class="insp-actions">
            ${it.source ? `<button class="insp-source" data-insp-source="${it.id}" title="来源" aria-label="来源">🔗</button>` : ''}
            ${(it.blueprints && it.blueprints.length) ? `<button class="insp-bp" data-insp-bp="${it.id}" title="图纸" aria-label="图纸">📐</button>` : ''}
            <button class="insp-wish ${fav ? 'on' : ''}" data-insp-fav="${it.id}" title="${fav ? '已收藏，点击取消' : '收藏这条灵感'}">
              ${fav ? '★' : '☆'}
            </button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// 渲染记录灵感表单里的图纸预览（缩略图 + 删除）
function renderBpPreview() {
  const box = $('[data-bp-preview]');
  if (!box) return;
  if (!inspBlueprintsDraft.length) { box.innerHTML = ''; return; }
  box.innerHTML = inspBlueprintsDraft.map((src, i) => `
    <div class="bp-thumb">
      <img src="${src}" alt="图纸${i+1}" />
      <button type="button" class="bp-thumb-del" data-bp-remove="${i}" aria-label="删除图纸">✕</button>
    </div>`).join('');
}

// 图纸查看灯箱
let lbImages = [];
let lbIndex = 0;
function openBlueprintViewer(images, index) {
  if (!images || !images.length) return;
  lbImages = images;
  lbIndex = Math.max(0, Math.min(index || 0, images.length - 1));
  renderLightbox();
  $('#imgLightbox').classList.add('open');
}
function renderLightbox() {
  const img = $('#lbImg');
  if (!img) return;
  img.src = lbImages[lbIndex] || '';
  const count = $('#lbCount');
  if (count) count.textContent = lbImages.length > 1 ? `${lbIndex + 1} / ${lbImages.length}` : '';
  document.querySelector('.lb-prev').style.display = lbImages.length > 1 ? '' : 'none';
  document.querySelector('.lb-next').style.display = lbImages.length > 1 ? '' : 'none';
}
function closeLightbox() {
  $('#imgLightbox').classList.remove('open');
  lbImages = [];
  lbIndex = 0;
}

function refreshInspiration() {
  syncInspTabs();
  if (inspSubTab === 'fabric') { refreshFabric(); return; }
  refreshTimeAndGreeting();
  const countLine = $('#inspCountLine');
  const q = (inspSearch || '').toLowerCase().trim();
  let items = state.inspirations.slice();
  if (q) {
    items = items.filter(it =>
      (it.title || '').toLowerCase().includes(q) ||
      (it.desc || '').toLowerCase().includes(q) ||
      (it.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (countLine) {
    countLine.textContent = q
      ? `「${inspSearch}」 · ${items.length} 条`
      : `共 ${state.inspirations.length} 条灵感`;
  }
  renderInspCards(items);
}

// 同步灵感库子标签的选中态、面板可见性、FAB 与右上角按钮的行为
function syncInspTabs() {
  $$('.seg-tabs-insp .seg-tab').forEach(t => t.classList.toggle('seg-active', t.dataset.iseg === inspSubTab));
  $$('[data-ipane]').forEach(p => p.classList.toggle('seg-pane-active', p.dataset.ipane === inspSubTab));
  const fab = $('#inspFab');
  const btn = $('#inspNewBtn');
  if (inspSubTab === 'fabric') {
    if (fab) fab.dataset.action = 'new-fabric';
    if (btn) { btn.dataset.action = 'new-fabric'; btn.textContent = '+ 添加布料'; }
  } else {
    if (fab) fab.dataset.action = 'new-inspiration';
    if (btn) { btn.dataset.action = 'new-inspiration'; btn.textContent = '+ 记一条'; }
  }
}

/* ---------- 布料灵感（照片上传：1:1 大图 + 多张制作灵感照片） ---------- */
function renderFabricCards(items) {
  const feed = $('#fabricFeed');
  if (!feed) return;
  if (!items.length) {
    feed.innerHTML = `<div class="kanban-empty">还没有布料灵感，点右下角「+」添加第一块布料 🧵</div>`;
    return;
  }
  feed.innerHTML = items.map(f => `
    <div class="fabric-card" data-fab-id="${f.id}">
      <div class="fabric-thumb">
        ${f.photo ? `<img src="${f.photo}" alt="${escapeHtml(f.name || '')}" />` : `<span class="stub-illu">🧵</span>`}
      </div>
      <div class="fabric-name">${escapeHtml(f.name || '未命名布料')}</div>
      <div class="fabric-meta">${f.makePhotos && f.makePhotos.length ? `✨ ${f.makePhotos.length} 张制作灵感` : '点击添加制作灵感'}</div>
    </div>`).join('');
}

function refreshFabric() {
  renderFabricCards(state.fabricInspirations.slice());
}

function openFabricSheet(editId) {
  editingFabricId = editId || null;
  const sheet = $('#sheetFabric');
  if (!sheet) return;
  openSheet('Fabric');   // 先重置（会清掉 data-photo），随后再建立
  const wrap = sheet.querySelector('.photo-upload');
  wrap.style.backgroundImage = '';
  wrap.classList.remove('has-image');
  wrap.querySelector('span').style.display = '';
  wrap.dataset.photo = '';
  sheet.querySelector('[data-name="name"]').value = '';
  sheet.querySelector('[data-name="note"]').value = '';
  sheet.querySelector('.sheet-title').textContent = editId ? '编辑布料灵感 🧵' : '添加布料灵感 🧵';
  sheet.querySelector('[data-save="fabric"]').textContent = editId ? '保存修改' : '保存布料';
}

function saveFabricSheet() {
  const sheet = $('#sheetFabric');
  const name = (sheet.querySelector('[data-name="name"]').value || '').trim();
  const note = (sheet.querySelector('[data-name="note"]').value || '').trim();
  const photoWrap = sheet.querySelector('.photo-upload');
  const photo = photoWrap ? (photoWrap.dataset.photo || '') : '';
  if (!name && !photo) { toast('请填写名称或上传布料照片'); return; }
  if (editingFabricId) {
    const f = state.fabricInspirations.find(x => x.id === editingFabricId);
    if (f) { f.name = name; f.note = note; f.photo = photo; }
    editingFabricId = null;
    toast('已更新布料灵感 🧵');
  } else {
    state.fabricInspirations.unshift({
      id: uid(), name, note, photo,
      makePhotos: [], createdAt: Date.now()
    });
    toast('已添加布料灵感 🧵');
  }
  saveState();
  closeSheet();
  refreshFabric();
}

function openFabricDetail(id) {
  const f = state.fabricInspirations.find(x => x.id === id);
  if (!f) return;
  currentFabricId = id;
  const img = $('#fabMainImg');
  if (img) {
    if (f.photo) { img.src = f.photo; img.style.display = ''; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
  }
  const nameEl = $('#fabName'); if (nameEl) nameEl.textContent = f.name || '未命名布料';
  const noteEl = $('#fabNote'); if (noteEl) noteEl.textContent = f.note || '';
  renderFabricMakePhotos(f);
  openSheet('FabricDetail');
}

function renderFabricMakePhotos(f) {
  const grid = $('#fabMakeGrid');
  if (!grid) return;
  const count = $('#fabMakeCount');
  if (count) count.textContent = (f.makePhotos && f.makePhotos.length) ? `(${f.makePhotos.length})` : '';
  if (!f.makePhotos || !f.makePhotos.length) {
    grid.innerHTML = `<div class="fab-make-empty">还没有制作灵感照片，看到别人的成稿后传上来吧 ✨</div>`;
    return;
  }
  grid.innerHTML = f.makePhotos.map((src, i) => `
    <div class="fab-make-thumb" data-fab-make="${i}">
      <img src="${src}" alt="制作灵感${i + 1}" />
      <button type="button" class="fab-make-del" data-fab-make-del="${i}" aria-label="删除">✕</button>
    </div>`).join('');
}

function addFabricMakePhotos(files) {
  const f = state.fabricInspirations.find(x => x.id === currentFabricId);
  if (!f) return;
  const imgs = Array.from(files || []).filter(fi => fi && fi.type && fi.type.startsWith('image/'));
  if (!imgs.length) return;
  Promise.all(imgs.map(file => fileToDataURLScaled(file, 1000, 0.82))).then(results => {
    results.forEach(dataUrl => {
      if (!dataUrl) return;
      f.makePhotos = f.makePhotos || [];
      f.makePhotos.push(dataUrl);
    });
    saveState();
    renderFabricMakePhotos(f);
    refreshFabric();
    toast(`已添加 ${f.makePhotos.length} 张制作灵感照片 ✨`);
  });
}

function deleteFabricMakePhoto(idx) {
  const f = state.fabricInspirations.find(x => x.id === currentFabricId);
  if (!f) return;
  if (!confirm('删除这张制作灵感照片？')) return;
  f.makePhotos.splice(idx, 1);
  saveState();
  renderFabricMakePhotos(f);
  refreshFabric();
}

function deleteFabric(id) {
  if (!confirm('确定删除这块布料灵感？相关的制作灵感照片也会一起删除。')) return;
  state.fabricInspirations = state.fabricInspirations.filter(x => x.id !== id);
  saveState();
  closeSheet();
  refreshFabric();
}

// 点击来源链接：直接打开浏览器（iOS PWA 会唤起 Safari），失败则退回复制弹窗
function openBrowserLink(url, title) {
  if (!url) { toast('暂无可用链接'); return; }
  try {
    const w = window.open(url, '_blank');
    if (!w) throw new Error('blocked');
  } catch (e) {
    openExtLink('灵感来源', title || '外部链接', url, '📋 复制链接后，打开浏览器或对应 APP 去查看');
  }
}

/* ---------- 采购 ---------- */
function refreshPurchase() {
  // 采购清单视图已下线（改造为修身养性），DOM 不存在时直接返回，避免 null 崩溃
  if (!$('#purchaseSummary')) return;
  const pending = state.purchases.filter(p => !p.done);
  const done    = state.purchases.filter(p => p.done);
  const total   = state.purchases.reduce((s,p) => s + (Number(p.price)*Number(p.qty) || 0), 0);
  $('#purchaseSummary').innerHTML = `
    <div class="ps-card"><div class="ps-num">${pending.length}</div><div class="ps-label">待买项</div></div>
    <div class="ps-card"><div class="ps-num">¥${total}</div><div class="ps-label">预估总价</div></div>
    <div class="ps-card"><div class="ps-num">${done.length}</div><div class="ps-label">已买到</div></div>
  `;
  const html = state.purchases.map(p => `
    <div class="purchase-item" data-id="${p.id}">
      <button class="purchase-check ${p.done?'done':''}" data-purchase-toggle="${p.id}">
        <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="purchase-body">
        <div class="purchase-name ${p.done?'done':''}">${escapeHtml(p.name)}</div>
        <div class="purchase-meta">
          ${(CATEGORY_META[p.category]||{}).label || ''} · ${p.qty}${escapeHtml(p.unit||'')}
        </div>
      </div>
      <div class="purchase-price">¥${(Number(p.price)*Number(p.qty)||0)}</div>
      <div class="purchase-actions">
        <button class="act-btn act-edit" data-edit-purchase="${p.id}" aria-label="编辑">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="act-btn act-del" data-del-purchase="${p.id}" aria-label="删除">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `).join('') || `<div class="kanban-empty">采购单空空，先加一项吧 🛒</div>`;
  $('#purchaseList').innerHTML = html;
}

/* ==========================================================
   修身养性
   ========================================================== */
let wellnessTab = 'weight';

/* ---------- 体重记录 ---------- */
const MOOD_META = {
  happy: { label: '😊', name: '开心' },
  calm:  { label: '😌', name: '平静' },
  sad:   { label: '😢', name: '难过' },
  angry: { label: '😤', name: '愤怒' },
  tired: { label: '😴', name: '疲惫' },
};

const TRAVEL_STATUS = {
  dreaming: { label: '💭 想去', cls: 'travel-dreaming' },
  planning: { label: '📋 计划中', cls: 'travel-planning' },
  done:     { label: '✅ 已完成', cls: 'travel-done' },
};

/* 新闻数据源（百度 / 微博 真实热搜，含标题与概括内容，无外链）
   ⚠️ 由每日 17:00 自动化任务更新：只替换 NEWS_DATA_START 与 NEWS_DATA_END 之间的内容 */
/* NEWS_DATA_START */
const NEWS_UPDATED = '2026-07-28';
const NEWS_ITEMS = [
  // ===== 百度热搜 =====
  { plat: '百度', title: '习近平对侨务工作作出重要指示', summary: '习近平近日对侨务工作作出重要指示，肯定侨务战线成绩，强调团结动员广大海外侨胞和归侨侨眷共同奋斗。' },
  { plat: '百度', title: '日本熊本县附近发生7.1级地震', summary: '当地时间28日16时27分，日本熊本县附近发生7.1级地震，最大震度7，日本气象厅发布海啸预警。' },
  { plat: '百度', title: '“全款买房”的人在变多', summary: '今年以来多地楼市回暖，首付门槛降低、公积金政策松绑背景下，选择全款买房的购房者悄然增多。' },
  { plat: '百度', title: '六部门：禁止涉军队退役报废装备销售', summary: '中央军委有关部门联合公安部等六部门发文，明确禁止销售涉军队退役报废装备，规范相关市场秩序。' },
  { plat: '百度', title: '买大路灯护眼 孩子视力1年涨200度', summary: '宁波家长花近4000元买网红大路灯，孩子近视一年仍涨200度；专家称此类灯仅优化照明，无护眼临床证据。' },
  { plat: '百度', title: '携程被罚后内部全员信曝光', summary: '市场监管总局对携程滥用市场支配地位罚没51.79亿元，CEO孙洁随后发布内部全员信回应。' },
  { plat: '百度', title: '日本地震 上海、杭州网友称有震感', summary: '日本熊本7.1级地震波及范围广，上海、杭州等地网友称有明显震感，引发广泛关注。' },
  { plat: '百度', title: '女孩正颌手术被做反 当事医生已停诊', summary: '武汉大学口腔医院通报患者正颌手术被做反一事，已成立专项调查组核查，当事医生停诊配合调查。' },
  { plat: '百度', title: '周星驰不再演戏的原因', summary: '《功夫女足》票房口碑双收但周星驰未出演，他曾坦言年龄大了，拍《功夫》时已不再享受镜头。' },
  { plat: '百度', title: '日本熊本县再次发生地震 震级6.1级', summary: '当地时间28日17时08分，熊本县再发6.1级地震，最大震度5弱，震源极浅，此前刚发生7.1级强震。' },
  { plat: '百度', title: '6G相比5G不只是速度更快', summary: '6G不仅网速较5G提升百倍，还融合空天地一体化网络与环境感知能力，目标是实现真正的万物互联。' },
  { plat: '百度', title: '纽约中央公园“出轨门”男女身份曝光', summary: '纽约中央公园亲密视频引热议，两位主角被确认为知名律所律师，事件持续发酵。' },
  { plat: '百度', title: '“医科雪崩”？言重了', summary: '2026年高考多省临床医学录取位次大幅下滑，有人称“医科雪崩”，评论认为遇冷正常、不必夸大。' },
  { plat: '百度', title: '青海海南州兴海县发生5.0级地震', summary: '7月28日16时4分，青海海南州兴海县发生5.0级地震，震源深度10公里，暂无人员伤亡报告。' },
  { plat: '百度', title: '直击日本熊本地震：监控画面剧烈晃动', summary: '熊本7.1级地震现场监控画面显示剧烈晃动，部分地区出现建筑受损，救援与排查工作展开。' },

  // ===== 微博热搜 =====
  { plat: '微博', title: '日本地震', summary: '日本熊本县附近连发7.1级、6.1级地震，气象厅发布海啸预警，成为今日全网最热话题。' },
  { plat: '微博', title: '上海震感', summary: '日本强震波及我国东部沿海，上海多位网友表示高楼有明显晃动感，江浙沪震感话题刷屏。' },
  { plat: '微博', title: '改善脖子前倾最简单的动作', summary: '博主分享改善脖子前倾的简单拉伸动作，久坐低头族纷纷收藏跟练，健康话题热度居高。' },
  { plat: '微博', title: '熬夜时最恐怖的事', summary: '网友热议熬夜时最恐怖的瞬间，从心悸到脱发引发共鸣，医生提醒长期熬夜危害不可逆。' },
  { plat: '微博', title: '王菊一念江南古装路透', summary: '王菊新剧《一念江南》古装路透曝光，造型突破以往形象，网友评价两极引发讨论。' },
  { plat: '微博', title: 'C罗无世界杯冠军遭航空公司嘲讽', summary: '一家航空公司发文嘲讽C罗没有世界杯冠军，引发球迷争论，营销边界话题被推上热搜。' },
  { plat: '微博', title: '雷军回应小米汽车第二张牌还能不能赢', summary: '雷军回应外界对小米汽车后续产品的质疑，表示对第二款车型有信心，市场竞争话题受关注。' },
  { plat: '微博', title: '刘亦菲给员工送黄金', summary: '刘亦菲被曝给工作室员工送黄金礼物，网友感叹神仙老板，明星职场福利话题引热议。' },
  { plat: '微博', title: '泰国国家旅游局发文致歉', summary: '泰国国家旅游局就近期争议事件发文致歉，中国游客赴泰旅游安全与体验问题再受关注。' },
  { plat: '微博', title: '患癌妻子申请销毁婚外胚胎遭拒', summary: '患癌妻子申请销毁丈夫婚外胚胎被拒，案件涉及伦理与法律边界，引发全网激烈讨论。' },
  { plat: '微博', title: '詹姆斯引用中国名言却写错出处', summary: '詹姆斯社交平台引用中国名言却写错出处，中国网友善意纠错，中外文化交流话题走热。' },
  { plat: '微博', title: '英伟达微软反对禁止中国开源AI', summary: '英伟达、微软公开反对禁止中国开源AI模型的提案，称开源生态对全球技术进步至关重要。' },
  { plat: '微博', title: '功夫女足破20亿票房', summary: '周星驰执导的《功夫女足》票房突破20亿元，进入年度票房榜前二，成为暑期档最大赢家。' },
  { plat: '微博', title: '韩股暴跌逼近6000点', summary: '韩国股市大幅下挫逼近6000点关口，受全球芯片股暴跌拖累，亚太市场避险情绪升温。' },
];
/* NEWS_DATA_END */

/* 好书推荐库（每日推荐三本，含书本介绍 / 作者介绍 / 经典片段） */
const BOOK_LIBRARY = [
  { title: '断舍离', author: '山下英子', category: '生活',
    bookIntro: '一本关于“整理”的生活哲学书。作者提出以“自我·时间轴”为标准，只留下当下需要、适合自己的东西，通过放手不需要的物品，找回清爽的空间与轻盈的心境。',
    authorIntro: '山下英子，日本整理咨询顾问，“断舍离”理念创始人。早稻田大学文学部毕业，2000年起以杂物管理顾问身份推广断舍离，影响全球数百万读者。',
    excerpt: '断，是断绝不需要的东西；舍，是舍弃多余的废物；离，是脱离对物品的执着。当你学会放手，人生便开始了新的可能。' },
  { title: '一个人的村庄', author: '刘亮程', category: '散文',
    bookIntro: '刘亮程以新疆黄沙梁村为背景，用诗一般的语言书写村庄里的虫鸣、风声、牲畜与农人，把最平凡的乡野生活写成充满哲思的寓言。',
    authorIntro: '刘亮程，1962年生于新疆沙湾，被誉为“20世纪最后一位散文家”。代表作《一个人的村庄》以朴素而深邃的笔触展现乡土中国。',
    excerpt: '我们活一生，要记住的，不过是几场雪、几棵树、几个人。其余的，都随风去了。' },
  { title: '缝纫的基础', author: '高橋惠子', category: '手工',
    bookIntro: '系统讲解缝纫入门知识的工具书，从缝纫机结构、针线选择到基础针法、版型裁剪，配以清晰图解，是零基础学习做衣的可靠起点。',
    authorIntro: '高橋惠子，日本资深服装教育与手作达人，长期致力于缝纫普及教学，擅长把复杂的制衣流程拆解成普通人也能跟做的步骤。',
    excerpt: '缝纫不是与布料对抗，而是学会倾听它的性情——顺其纹理，针脚自然就稳了。' },
  { title: '小房子', author: '弗吉尼亚·李·伯顿', category: '绘本',
    bookIntro: '一座建在山坡上的小房子，见证了城市从田园渐渐长成钢筋森林。一个关于变迁、归属与初心的温柔故事，老少皆宜。',
    authorIntro: '弗吉尼亚·李·伯顿，美国著名绘本作家、插画家，1943年凭《小房子》荣获凯迪克金奖，作品以细腻画风与人文关怀著称。',
    excerpt: '她喜欢白天看太阳，夜晚看星星；可后来，月亮被霓虹灯遮住了，她再也看不见星星。' },
  { title: '人间草木', author: '汪曾祺', category: '散文',
    bookIntro: '汪曾祺写草木、写花鸟、写四季风物，字里行间是对生活微微的欢喜。一卷读来，如同在旧院子里晒太阳。',
    authorIntro: '汪曾祺，1920年生于江苏高邮，沈从文弟子，京派作家代表。文风淡雅冲和，被誉为“抒情的人道主义者”，亦精于美食与戏曲。',
    excerpt: '一定要爱着点什么，恰似草木对光阴的钟情。' },
  { title: '手作衣物', author: '水野佳子', category: '手工',
    bookIntro: '日本人气裁缝老师水野佳子，带你从一块布开始做出日常可穿的衣物。版型实用、讲解细致，适合想亲手做衣的人。',
    authorIntro: '水野佳子，日本服装制作教育者，常年开设手作衣物课程，主张“穿自己做的衣服”，让缝纫回归日常生活。',
    excerpt: '一件自己缝的衣服，会记得你手上的温度，也记得你当时的心情。' },
  { title: '慢煮生活', author: '汪曾祺', category: '散文',
    bookIntro: '收录汪曾祺谈吃、谈草木、谈故人、谈日子的散文。在快节奏时代，他教我们如何把寻常日子过得有滋有味。',
    authorIntro: '汪曾祺，中国当代文学大家，散文融学问、趣味与生活于一炉。他常说“生活，是很好玩的”，文字里满是人间烟火气。',
    excerpt: '四方食事，不过一碗人间烟火。' },
  { title: '窗边的小豆豆', author: '黑柳彻子', category: '文学',
    bookIntro: '作者童年真实经历：因“怪”被退学的豆豆，来到用电车做教室的巴学园，遇上台良先生。一段关于理解与爱的教育童话。',
    authorIntro: '黑柳彻子，日本著名主持人、作家、联合国儿童基金会亲善大使。《窗边的小豆豆》全球销量超千万，成为教育理念的经典之作。',
    excerpt: '世界上最可怕的事情，莫过于有眼睛却发现不了美，有耳朵却不懂欣赏音乐。' },
  { title: '雅活书系', author: '多人', category: '生活',
    bookIntro: '一套聚焦传统手工艺与生活美学的丛书，邀不同作者书写茶、器、布、木等日常之物，在慢与美中重新发现生活。',
    authorIntro: '“雅活”为生活美学书系，集结多位学者与手作人，主张以审美的眼光对待寻常日用，在器物里安放心意。',
    excerpt: '所谓雅活，不过是把日子过成自己喜欢的样子，一器一物，皆有情意。' },
  { title: '人间滋味', author: '汪曾祺', category: '散文',
    bookIntro: '汪曾祺的美食散文集，写四方吃食、家乡味道与食物里的记忆。读着读着，便饿了，也暖了。',
    authorIntro: '汪曾祺不仅是作家，更是出了名的“老饕”。他讲究“有味使之出，无味使之入”，把吃饭写成了一门学问。',
    excerpt: '一个人的口味要宽一点、杂一点，南甜北咸东辣西酸，都去尝尝。' },
  { title: '日本手工艺', author: '柳宗悦', category: '手工',
    bookIntro: '日本民艺运动之父柳宗悦的经典之作，系统阐述“用之美”——那些无名工匠为日常而作的器物，往往最接近真正的美。',
    authorIntro: '柳宗悦，1889年生于东京，日本民艺运动发起者，提出“民艺”概念，创办日本民艺馆，终生致力于发掘与保护日常之美。',
    excerpt: '真正的美，诞生于无用之心与有用之器之间。' },
  { title: '生活的模样', author: '近藤麻理惠', category: '生活',
    bookIntro: '整理收纳顾问近藤麻理惠的作品，不止教你怎么扔东西，更引导你思考“想为什么样的生活而留下什么”。',
    authorIntro: '近藤麻理惠，日本整理专家，“怦然心动整理法”创始人。其方法风靡全球，曾被《时代》评为最具影响力人物之一。',
    excerpt: '整理，是和每一件物品好好告别，也是和过去的自己温柔重逢。' },
  { title: '给孩子的诗', author: '北岛 选编', category: '诗歌',
    bookIntro: '诗人北岛为儿女及所有孩子编选的诗集，收录中外经典短诗，愿孩子在最美的语言里种下想象的种子。',
    authorIntro: '北岛，本名赵振开，中国当代诗人，“朦胧诗”代表之一。其诗以冷峻与清醒著称，亦以温情编选启蒙孩子们的诗心。',
    excerpt: '诗，是给童年的一扇窗——窗外有光，也有想象。' },
  { title: '布艺基础', author: '文化出版局', category: '手工',
    bookIntro: '面向初学者的布艺制作指南，涵盖布料认知、工具使用、基础针法与简单小物的制作，步骤图解详尽。',
    authorIntro: '由相关出版机构编纂的实用技法丛书，面向手工入门群体，强调规范操作与安全，是家庭布艺的稳妥参考资料。',
    excerpt: '针脚均匀，是布艺的门面；耐心，是手作的底色。' },
  { title: '山居笔记', author: '余秋雨', category: '散文',
    bookIntro: '余秋雨行走中国山水与人文遗迹的文化散文，从都江堰到苏东坡，于历史纵深中打量文明的来路。',
    authorIntro: '余秋雨，1946年生，当代文化学者、散文家。以《文化苦旅》《山居笔记》开创“文化散文”风潮，影响一代读者。',
    excerpt: '成熟是一种明亮而不刺眼的光辉，一种圆润而不腻耳的音响。' },
];

function setWellnessTab(tab) {
  wellnessTab = tab;
  $$('.seg-tabs-wellness .seg-tab').forEach(x => x.classList.toggle('seg-active', x.dataset.wseg === tab));
  $$('.view-wellness .seg-pane').forEach(p => p.classList.toggle('seg-pane-active', p.dataset.wpane === tab));
}

function refreshWellness() {
  refreshTimeAndGreeting();
  if (wellnessTab === 'weight') refreshWeight();
  if (wellnessTab === 'news') refreshNews();
  if (wellnessTab === 'book') refreshBook();
  if (wellnessTab === 'travel') refreshTravel();
  if (wellnessTab === 'memo') refreshMemo();
}

/* ---- 体重 ---- */
function refreshWeight() {
  const sorted = state.weights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const overview = $('#weightOverview');
  if (sorted.length === 0) {
    overview.innerHTML = `
      <div class="weight-empty">
        <span class="weight-empty-icon">⚖️</span>
        <span>还没有体重记录，点右下角 + 开始记录</span>
      </div>`;
    $('#weightChartWrap').innerHTML = '';
    $('#weightList').innerHTML = '';
    return;
  }

  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const minW = Math.min(...sorted.map(w => w.weight));
  const maxW = Math.max(...sorted.map(w => w.weight));
  const avgW = (sorted.reduce((s, w) => s + w.weight, 0) / sorted.length).toFixed(1);
  const change = (latest.weight - first.weight).toFixed(1);
  const trend = latest.weight < first.weight ? '↓' : latest.weight > first.weight ? '↑' : '→';
  const trendCls = latest.weight < first.weight ? 'good' : latest.weight > first.weight ? 'bad' : '';

  overview.innerHTML = `
    <div class="weight-stat-main">
      <div class="weight-now">${latest.weight}<span class="unit">kg</span></div>
      <div class="weight-date">${latest.date}</div>
    </div>
    <div class="weight-stat-grid">
      <div class="wstat"><div class="wstat-num">${minW}</div><div class="wstat-label">最低</div></div>
      <div class="wstat"><div class="wstat-num">${maxW}</div><div class="wstat-label">最高</div></div>
      <div class="wstat"><div class="wstat-num">${avgW}</div><div class="wstat-label">平均</div></div>
      <div class="wstat ${trendCls}"><div class="wstat-num">${trend}${Math.abs(change)}</div><div class="wstat-label">变化</div></div>
    </div>
  `;

  // 渲染 SVG 曲线图
  renderWeightChart(sorted);

  // 渲染列表
  const listHtml = sorted.slice().reverse().map(w => `
    <div class="weight-item">
      <div class="weight-item-date">${w.date}</div>
      <div class="weight-item-value">${w.weight} kg</div>
      <div class="weight-item-note">${escapeHtml(w.note || '')}</div>
      <button class="act-btn act-del" data-del-weight="${w.id}" aria-label="删除">
        <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `).join('');
  $('#weightList').innerHTML = listHtml;
}

function renderWeightChart(data) {
  const wrap = $('#weightChartWrap');
  if (!wrap || data.length < 2) { wrap.innerHTML = ''; return; }

  const W = 320, H = 140, padL = 36, padR = 12, padT = 16, padB = 28;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const yMin = minW - range * 0.15;
  const yMax = maxW + range * 0.15;
  const yRange = yMax - yMin;

  const n = data.length;
  const xStep = n > 1 ? chartW / (n - 1) : 0;

  const points = data.map((d, i) => {
    const x = padL + i * xStep;
    const y = padT + chartH - ((d.weight - yMin) / yRange) * chartH;
    return { x, y, ...d };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M ${padL},${padT + chartH} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${padL + (n-1)*xStep},${padT + chartH} Z`;

  // Y 轴刻度
  const yTicks = [yMax, (yMax + yMin) / 2, yMin].map(v => {
    const y = padT + chartH - ((v - yMin) / yRange) * chartH;
    return `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="rgba(42,31,26,0.08)" stroke-width="1"/>
            <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#8B7355">${v.toFixed(1)}</text>`;
  }).join('');

  // X 轴日期（最多显示5个）
  const xTickInterval = Math.max(1, Math.ceil(n / 5));
  const xTicks = points.filter((_, i) => i % xTickInterval === 0 || i === n - 1).map(p => {
    const dateStr = p.date.slice(5); // MM-DD
    return `<text x="${p.x}" y="${padT + chartH + 16}" text-anchor="middle" font-size="8" fill="#8B7355">${dateStr}</text>`;
  }).join('');

  // 数据点
  const dots = points.map(p => {
    const color = p === points[points.length - 1] ? '#C84B3F' : '#C84B3F';
    return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" stroke="#FBF6EE" stroke-width="1.5"/>`;
  }).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="weight-chart-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#C84B3F" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#C84B3F" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${yTicks}
      <path d="${areaPath}" fill="url(#weightGrad)"/>
      <polyline points="${polyline}" fill="none" stroke="#C84B3F" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xTicks}
    </svg>
  `;
}

/* ---- 新闻 ---- */
function refreshNews() {
  const newsHint = document.querySelector('.news-hint');
  if (newsHint) newsHint.textContent = `📋 每日 17:00 自动抓取百度 / 微博热点 · 数据更新于 ${NEWS_UPDATED}`;
  const groups = [
    { plat: '百度', items: NEWS_ITEMS.filter(n => n.plat === '百度') },
    { plat: '微博', items: NEWS_ITEMS.filter(n => n.plat === '微博') },
  ];
  const html = groups.map(g => `
    <div class="news-group">
      <div class="news-group-head">🔥 ${escapeHtml(g.plat)}热搜</div>
      ${g.items.map(n => `
        <div class="news-card">
          <div class="news-title">${escapeHtml(n.title)}</div>
          <div class="news-summary">${escapeHtml(n.summary)}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
  $('#newsList').innerHTML = html;
}

/* ---- 备忘 ---- */
let memoDate = todayStr(); // 当前查看的日期 YYYY-MM-DD
let editingMemoId = null;

const WEEKDAY = ['周日','周一','周二','周三','周四','周五','周六'];
function fmtDateLabel(dStr) {
  const d = new Date(dStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAY[d.getDay()]}`;
}
function todayStr() {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${n.getFullYear()}-${m}-${d}`;
}
function shiftDate(dStr, delta) {
  const [y, m, d] = dStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
function getMemos(dStr) {
  return (state.memos && state.memos[dStr]) ? state.memos[dStr] : [];
}
function setMemos(dStr, arr) {
  if (!state.memos) state.memos = {};
  if (arr && arr.length) state.memos[dStr] = arr;
  else delete state.memos[dStr];
}

function refreshMemo() {
  const label = $('#memoDateLabel');
  if (label) {
    const today = todayStr();
    label.textContent = (memoDate === today ? '今天 · ' : '') + fmtDateLabel(memoDate);
  }
  const list = $('#memoList');
  if (!list) return;
  const items = getMemos(memoDate);
  if (!items.length) {
    list.innerHTML = `<div class="memo-empty">🍃 这一天的备忘还空空的，写点什么吧</div>`;
  } else {
    const sorted = items.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.createdAt - b.createdAt);
    list.innerHTML = sorted.map(m => `
      <div class="memo-item ${m.done ? 'memo-done' : ''}" data-memo-id="${m.id}">
        <button class="memo-check" data-toggle-memo="${m.id}" aria-label="${m.done ? '标记为未完成' : '标记为完成'}">
          ${m.done ? '<span class="memo-check-on">✓</span>' : ''}
        </button>
        <div class="memo-text" data-edit-memo="${m.id}">${escapeHtml(m.text)}</div>
        <button class="act-btn act-del" data-del-memo="${m.id}" aria-label="删除">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `).join('');
  }
  const doneCount = items.filter(m => m.done).length;
  const clearBtn = $('#clearDoneMemo');
  if (clearBtn) clearBtn.textContent = doneCount ? `清除已完成（${doneCount}）` : '清除已完成';
}

function toggleMemo(id) {
  const arr = getMemos(memoDate);
  const m = arr.find(x => x.id === id);
  if (!m) return;
  m.done = !m.done;
  setMemos(memoDate, arr);
  saveState();
  refreshMemo();
}

function deleteMemo(id) {
  if (!confirm('确定要删除这条备忘吗？')) return;
  const arr = getMemos(memoDate).filter(x => x.id !== id);
  setMemos(memoDate, arr);
  saveState();
  toast('已删除');
  refreshMemo();
}

function openMemoComposer(editId) {
  editingMemoId = editId || null;
  const box = $('#memoComposer');
  const input = $('#memoComposerInput');
  if (!box || !input) return;
  const titleEl = box.querySelector('.memo-composer-title');
  if (editingMemoId) {
    const arr = getMemos(memoDate);
    const m = arr.find(x => x.id === editingMemoId);
    input.value = m ? m.text : '';
    if (titleEl) titleEl.textContent = '编辑备忘';
  } else {
    input.value = '';
    if (titleEl) titleEl.textContent = '记一笔';
  }
  box.classList.add('open');
  setTimeout(() => input.focus(), 50);
}

function closeMemoComposer() {
  const box = $('#memoComposer');
  if (box) box.classList.remove('open');
  editingMemoId = null;
}

function saveMemoComposer() {
  const input = $('#memoComposerInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) { toast('写点什么吧'); return; }
  if (editingMemoId) {
    const arr = getMemos(memoDate);
    const m = arr.find(x => x.id === editingMemoId);
    if (m) m.text = text;
    setMemos(memoDate, arr);
    toast('已更新');
  } else {
    const arr = getMemos(memoDate).slice();
    arr.push({ id: uid(), text, done: false, createdAt: Date.now() });
    setMemos(memoDate, arr);
    toast('已记下 ✏️');
  }
  saveState();
  closeMemoComposer();
  refreshMemo();
}

function clearDoneMemos() {
  let total = 0;
  Object.keys(state.memos || {}).forEach(d => {
    const kept = state.memos[d].filter(m => !m.done);
    total += (state.memos[d].length - kept.length);
    if (kept.length) state.memos[d] = kept; else delete state.memos[d];
  });
  if (total === 0) { toast('没有���完成的备忘'); return; }
  if (!confirm(`确定清除全部 ${total} 条已完成备忘吗？`)) return;
  saveState();
  toast(`已清除 ${total} 条已完成`);
  refreshMemo();
}

/* ---- 好书 ---- */
function renderBooks(books) {
  $('#bookCard').innerHTML = books.map(b => `
    <div class="book-item">
      <div class="book-item-head">
        <div class="book-cover-mini">📖</div>
        <div class="book-item-meta">
          <div class="book-category">${escapeHtml(b.category)}</div>
          <div class="book-title">${escapeHtml(b.title)}</div>
          <div class="book-author">${escapeHtml(b.author)}</div>
        </div>
      </div>
      <div class="book-block">
        <div class="book-block-label">📕 书本介绍</div>
        <div class="book-block-text">${escapeHtml(b.bookIntro)}</div>
      </div>
      <div class="book-block">
        <div class="book-block-label">✍️ 作者介绍</div>
        <div class="book-block-text">${escapeHtml(b.authorIntro)}</div>
      </div>
      <div class="book-block">
        <div class="book-block-label">💬 书中经典片段</div>
        <div class="book-excerpt">${escapeHtml(b.excerpt)}</div>
      </div>
    </div>
  `).join('');
}

function refreshBook() {
  // 每日推荐三本：按日期轮换
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  const len = BOOK_LIBRARY.length;
  const start = dayOfYear % len;
  const pick = [0, 1, 2].map(i => BOOK_LIBRARY[(start + i) % len]);
  renderBooks(pick);
}

/* ---- 树洞 ---- */
function refreshTreehole() {
  const sorted = state.thoughts.slice().sort((a, b) => b.date.localeCompare(a.date));
  const html = sorted.map(t => {
    const mood = MOOD_META[t.mood] || MOOD_META.calm;
    return `
      <div class="treehole-item">
        <div class="treehole-mood">${mood.label}</div>
        <div class="treehole-body">
          <div class="treehole-date">${t.date} · ${mood.name}</div>
          <div class="treehole-content">${escapeHtml(t.content)}</div>
        </div>
        <button class="act-btn act-del" data-del-thought="${t.id}" aria-label="删除">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;
  }).join('') || `<div class="kanban-empty">树洞还空空的，把想法写下来吧 🌳</div>`;
  $('#treeholeList').innerHTML = html;
}

/* ---- 旅行计划 ---- */
function refreshTravel() {
  const sorted = state.travels.slice().sort((a, b) => {
    const order = { planning: 0, dreaming: 1, done: 2 };
    return (order[a.status]||1) - (order[b.status]||1);
  });
  const html = sorted.map(t => {
    const st = TRAVEL_STATUS[t.status] || TRAVEL_STATUS.dreaming;
    return `
      <div class="travel-card ${st.cls}">
        <div class="travel-card-head">
          <div class="travel-destination">${escapeHtml(t.destination)}</div>
          <span class="travel-status ${st.cls}">${st.label}</span>
        </div>
        <div class="travel-meta">
          ${t.startDate ? `<span>📅 ${t.startDate}${t.endDate ? ' ~ ' + t.endDate : ''}</span>` : ''}
          ${t.days ? `<span>⏱ ${t.days}天</span>` : ''}
          ${t.budget ? `<span>💰 ¥${t.budget}</span>` : ''}
        </div>
        ${t.note ? `<div class="travel-note">${escapeHtml(t.note)}</div>` : ''}
        <div class="travel-actions">
          <button class="act-btn act-edit" data-edit-travel="${t.id}" aria-label="编辑">
            <svg viewBox="0 0 24 24" width="13" height="13"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="act-btn act-del" data-del-travel="${t.id}" aria-label="删除">
            <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('') || `<div class="kanban-empty">还没有旅行计划，添加一个想去的地方 ✈️</div>`;
  $('#travelList').innerHTML = html;
}

/* ---- 修身养性：保存/删除 ---- */
let editingTravelId = null;

function saveWeight(sheet) {
  const f = collectForm(sheet);
  if (!f.weight) { toast('请填写体重'); return; }
  state.weights.push({
    id: uid(),
    date: f.date || new Date().toISOString().slice(0, 10),
    weight: parseFloat(f.weight),
    note: f.note || ''
  });
  saveState();
  toast('已记录体重 ⚖️');
  closeSheet();
  refreshWeight();
}

function deleteWeight(id) {
  if (!confirm('确定要删除这条体重记录吗？')) return;
  state.weights = state.weights.filter(w => w.id !== id);
  saveState();
  toast('已删除');
  refreshWeight();
}

function saveThought(sheet) {
  const f = collectForm(sheet);
  if (!f.content) { toast('请写点什么'); return; }
  state.thoughts.unshift({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    mood: f.mood || 'calm',
    content: f.content
  });
  saveState();
  toast('已丢进树洞 🌳');
  closeSheet();
  refreshTreehole();
}

function deleteThought(id) {
  if (!confirm('确定要删除这条想法吗？')) return;
  state.thoughts = state.thoughts.filter(t => t.id !== id);
  saveState();
  toast('已删除');
  refreshTreehole();
}

function saveTravel(sheet) {
  const f = collectForm(sheet);
  if (!f.destination) { toast('请填写目的地'); return; }
  if (editingTravelId) {
    const t = state.travels.find(x => x.id === editingTravelId);
    if (t) {
      t.destination = f.destination;
      t.startDate = f.startDate || '';
      t.endDate = f.endDate || '';
      t.status = f.status || 'dreaming';
      t.budget = Number(f.budget) || 0;
      t.days = Number(f.days) || 0;
      t.note = f.note || '';
    }
    editingTravelId = null;
    toast('已更新旅行计划 ✏️');
  } else {
    state.travels.unshift({
      id: uid(),
      destination: f.destination,
      startDate: f.startDate || '',
      endDate: f.endDate || '',
      status: f.status || 'dreaming',
      budget: Number(f.budget) || 0,
      days: Number(f.days) || 0,
      note: f.note || ''
    });
    toast('已添加旅行计划 ✈️');
  }
  saveState();
  closeSheet();
  refreshTravel();
}

function editTravel(id) {
  const t = state.travels.find(x => x.id === id);
  if (!t) return;
  editingTravelId = id;
  openSheet('Travel');
  setTimeout(() => {
    const sheet = $('#sheetTravel');
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el && el.tagName !== 'DIV') el.value = val != null ? val : '';
    };
    set('destination', t.destination);
    set('startDate', t.startDate);
    set('endDate', t.endDate);
    set('budget', t.budget);
    set('days', t.days);
    set('note', t.note);
    const segRow = sheet.querySelector('.seg-row[data-name="status"]');
    if (segRow) {
      segRow.dataset.value = t.status;
      segRow.querySelectorAll('.seg-pill').forEach(p => {
        p.classList.toggle('seg-pill-active', p.dataset.pick === t.status);
      });
    }
    sheet.querySelector('.sheet-title').textContent = '编辑旅行计划 ✏️';
    sheet.querySelector('[data-save="travel"]').textContent = '保存修改';
  }, 50);
}

function deleteTravel(id) {
  const t = state.travels.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`确定要删除「${t.destination}」的旅行计划吗？`)) return;
  state.travels = state.travels.filter(x => x.id !== id);
  saveState();
  toast('已删除');
  refreshTravel();
}

/* ---------- 想做清单 ---------- */
function refreshWishlist() {
  const html = state.wishlist.map(w => `
    <div class="wishlist-card" data-id="${w.id}">
      <button class="wl-check" data-wl-complete="${w.id}">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 8l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="wl-body">
        <div class="wl-name">${escapeHtml(w.name)}</div>
        <div class="wl-source">
          <span class="tag">${(PLATFORM_META[w.source]||{}).label || '灵感'}</span>
          ${(w.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        ${w.note ? `<div class="wl-note">${escapeHtml(w.note)}</div>` : ''}
      </div>
      <div class="wl-actions">
        <button class="act-btn act-edit" data-edit-wishlist="${w.id}" aria-label="编辑">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="act-btn act-del" data-del-wishlist="${w.id}" aria-label="删除">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `).join('') || `<div class="kanban-empty">记录灵感空空的，去记一条试试 ✏️</div>`;
  $('#wishListFull').innerHTML = html;
}

/* ---------- 作品集 ---------- */
function refreshPortfolio() {
  $('#portCount').textContent = state.portfolio.length;
  $('#portIncome').textContent = '¥' + state.portfolio.reduce((s,p)=>s+(Number(p.income)||0), 0);

  const html = state.portfolio.map(p => {
    const img = (p.photos && p.photos[0])
      ? `<img src="${p.photos[0]}">`
      : `<span>🧵</span>`;
    return `
      <div class="portfolio-card" data-id="${p.id}">
        <div class="portfolio-img">${img}</div>
        <div class="portfolio-info">
          <div class="portfolio-name">${escapeHtml(p.name)}</div>
          <div class="portfolio-stats">
            <span>${escapeHtml(p.size||'—')}</span>
            <span>¥${p.income||0}</span>
          </div>
        </div>
        <div class="portfolio-card-actions">
          <button class="act-btn act-edit" data-edit-portfolio="${p.id}">
            <svg viewBox="0 0 24 24"><path d="M16 3l5 5L8 21H3v-5L16 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            编辑
          </button>
          <button class="act-btn act-del" data-del-portfolio="${p.id}">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            删除
          </button>
        </div>
      </div>
    `;
  }).join('') || `<div class="kanban-empty">还没有成品，先把一个灵感变成实物 ✂️</div>`;
  $('#portfolioGrid').innerHTML = html;
}

/* ---------- 更多 ---------- */
function refreshMore() {
  refreshTimeAndGreeting();
  refreshStats();
}

/* ---------- 收支统计 ---------- */
function refreshStats() {
  // 收入：已完成作品
  const portfolioIncome = state.portfolio.reduce((s, p) => s + (Number(p.income) || 0), 0);
  // 收入：进行中订单（预期）
  const orderIncome = state.orders
    .filter(o => o.stage !== 'done')
    .reduce((s, o) => s + (Number(o.income) || 0), 0);
  const totalIncome = portfolioIncome + orderIncome;

  // 支出：采购
  const purchaseExpense = state.purchases.reduce((s, p) => s + (Number(p.price) * Number(p.qty) || 0), 0);
  // 支出：库存物料购入价
  const inventoryExpense = state.inventory.reduce((s, m) => s + (Number(m.price) || 0), 0);
  const totalExpense = purchaseExpense + inventoryExpense;

  const profit = totalIncome - totalExpense;

  // 概览卡片
  $('#statsOverview').innerHTML = `
    <div class="stats-card income">
      <div class="stats-num">¥${totalIncome}</div>
      <div class="stats-label">总收入</div>
    </div>
    <div class="stats-card expense">
      <div class="stats-num">¥${totalExpense}</div>
      <div class="stats-label">总支出</div>
    </div>
    <div class="stats-card profit ${profit < 0 ? 'loss' : ''}">
      <div class="stats-num">${profit < 0 ? '-' : ''}¥${Math.abs(profit)}</div>
      <div class="stats-label">${profit < 0 ? '净亏损' : '净利润'}</div>
    </div>
  `;

  // 收入明细：按类别分组
  const incomeByCat = {};
  state.portfolio.forEach(p => {
    const name = p.name || '未命名';
    const amt = Number(p.income) || 0;
    if (amt > 0) {
      incomeByCat[name] = (incomeByCat[name] || 0) + amt;
    }
  });
  // 把进行中订单的预期收入也列出
  state.orders.filter(o => o.stage !== 'done').forEach(o => {
    const amt = Number(o.income) || 0;
    if (amt > 0) {
      const name = o.name + '（待完成）';
      incomeByCat[name] = (incomeByCat[name] || 0) + amt;
    }
  });

  const incomeEntries = Object.entries(incomeByCat).sort((a, b) => b[1] - a[1]);
  const maxIncome = incomeEntries.length ? incomeEntries[0][1] : 1;

  let incomeHtml = '';
  if (incomeEntries.length === 0) {
    incomeHtml = '<div class="stats-bd-empty">还没有收入记录</div>';
  } else {
    incomeHtml = incomeEntries.map(([name, amt]) => `
      <div class="stats-bd-row">
        <span class="bd-name">${escapeHtml(name)}</span>
        <span class="bd-amount">¥${amt}</span>
      </div>
      <div class="stats-bd-bar"><div class="stats-bd-bar-fill income" style="width:${(amt / maxIncome * 100).toFixed(0)}%"></div></div>
    `).join('');
  }

  // 支出明细：采购 + 库存
  const expenseByCat = {};
  // 采购按 category 分
  state.purchases.forEach(p => {
    const cat = (CATEGORY_META[p.category] || {}).label || '其他';
    const amt = (Number(p.price) * Number(p.qty)) || 0;
    if (amt > 0) expenseByCat['采购·' + cat] = (expenseByCat['采购·' + cat] || 0) + amt;
  });
  // 库存按 category 分
  state.inventory.forEach(m => {
    const cat = (CATEGORY_META[m.category] || {}).label || '其他';
    const amt = Number(m.price) || 0;
    if (amt > 0) expenseByCat['库存·' + cat] = (expenseByCat['库存·' + cat] || 0) + amt;
  });

  const expenseEntries = Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]);
  const maxExpense = expenseEntries.length ? expenseEntries[0][1] : 1;

  let expenseHtml = '';
  if (expenseEntries.length === 0) {
    expenseHtml = '<div class="stats-bd-empty">还没有支出记录</div>';
  } else {
    expenseHtml = expenseEntries.map(([name, amt]) => `
      <div class="stats-bd-row">
        <span class="bd-name">${escapeHtml(name)}</span>
        <span class="bd-amount">¥${amt}</span>
      </div>
      <div class="stats-bd-bar"><div class="stats-bd-bar-fill expense" style="width:${(amt / maxExpense * 100).toFixed(0)}%"></div></div>
    `).join('');
  }

  $('#statsBreakdown').innerHTML = `
    <div class="stats-bd-title">收支明细</div>
    <div class="stats-bd-section">
      <div class="stats-bd-header">
        <span class="bd-dot income"></span>收入来源
        <span class="bd-total">¥${totalIncome}</span>
      </div>
      ${incomeHtml}
    </div>
    <div class="stats-bd-section">
      <div class="stats-bd-header">
        <span class="bd-dot expense"></span>支出明细
        <span class="bd-total">¥${totalExpense}</span>
      </div>
      ${expenseHtml}
    </div>
  `;
}

/* ---------- 编辑 / 删除 ---------- */
let editingMaterialId = null;
let editingOrderId = null;
let editingPortfolioId = null;
let editingPurchaseId = null;
let editingWishlistId = null;

function editMaterial(id) {
  const m = state.inventory.find(x => x.id === id);
  if (!m) return;
  editingMaterialId = id;
  openSheet('Material');
  setTimeout(() => {
    const sheet = $('#sheetMaterial');
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el && el.tagName !== 'DIV') el.value = val != null ? val : '';
    };
    set('name', m.name);
    set('material', m.material);
    set('color', m.color);
    set('tags', (m.tags||[]).join('/'));
    set('total', m.total);
    set('remaining', m.remaining);
    set('unit', m.unit);
    set('price', m.price);
    set('threshold', m.threshold);
    set('note', m.note);
    // 类别选择
    const segRow = sheet.querySelector('.seg-row[data-name="category"]');
    if (segRow) {
      segRow.dataset.value = m.category;
      segRow.querySelectorAll('.seg-pill').forEach(p => {
        p.classList.toggle('seg-pill-active', p.dataset.pick === m.category);
      });
    }
    // 图片
    if (m.photo) {
      const photoUpload = sheet.querySelector('.photo-upload');
      if (photoUpload) {
        photoUpload.style.backgroundImage = `url(${m.photo})`;
        photoUpload.classList.add('has-image');
        photoUpload.querySelector('span').style.display = 'none';
        photoUpload.dataset.photo = m.photo;
      }
    }
    sheet.querySelector('.sheet-title').textContent = '编辑物料 ✏️';
    sheet.querySelector('[data-save="material"]').textContent = '保存修改';
  }, 50);
}

function deleteMaterial(id) {
  const m = state.inventory.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`确定要删除「${m.name}」吗？`)) return;
  state.inventory = state.inventory.filter(x => x.id !== id);
  saveState();
  toast('已删除');
  refreshInventory();
  refreshDashboard();
}

function editOrder(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  openSheet('Order');          // 先开弹窗（其复位逻辑会清空 editingOrderId）
  editingOrderId = id;         // 再设置当前编辑 id，避免被 openSheet 复位覆盖
  setTimeout(() => {
    const sheet = $('#sheetOrder');
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el && el.tagName !== 'DIV') el.value = val != null ? val : '';
    };
    set('name', o.name);
    set('size', o.size);
    set('qty', o.qty);
    set('customer', o.customer);
    set('income', o.income);
    set('note', o.note);
    // 类别选择
    const segRow = sheet.querySelector('.seg-row[data-name="category"]');
    if (segRow) {
      segRow.dataset.value = o.category;
      segRow.querySelectorAll('.seg-pill').forEach(p => {
        p.classList.toggle('seg-pill-active', p.dataset.pick === o.category);
      });
    }
    // 目前进度回填
    const stageRow = sheet.querySelector('.seg-row[data-name="stage"]');
    if (stageRow) {
      stageRow.dataset.value = o.stage;
      stageRow.querySelectorAll('.seg-pill').forEach(p => {
        p.classList.toggle('seg-pill-active', p.dataset.pick === o.stage);
      });
    }
    // 封面图
    if (o.cover) {
      const photoUpload = sheet.querySelector('.photo-upload');
      if (photoUpload) {
        photoUpload.style.backgroundImage = `url(${o.cover})`;
        photoUpload.classList.add('has-image');
        photoUpload.querySelector('span').style.display = 'none';
        photoUpload.dataset.photo = o.cover;
      }
    }
    // 物料多选（含用量）
    if (o.fabrics && o.fabrics.length) {
      const picker = sheet.querySelector('.picker[data-pick-list="fabrics"]');
      if (picker) {
        picker.dataset.value = JSON.stringify(o.fabrics);
        picker.innerHTML = renderMaterialTags(o.fabrics);
      }
    }
    if (o.buckles && o.buckles.length) {
      const picker = sheet.querySelector('.picker[data-pick-list="buckles"]');
      if (picker) {
        picker.dataset.value = JSON.stringify(o.buckles);
        picker.innerHTML = renderMaterialTags(o.buckles);
      }
    }
    sheet.querySelector('.sheet-title').textContent = '编辑排单 ✏️';
    sheet.querySelector('[data-save="order"]').textContent = '保存修改';
  }, 50);
}

function deleteOrder(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  if (!confirm(`确定要删除排单「${o.name}」吗？`)) return;
  // 还原该排单占用的物料库存
  adjustInventory(o.fabrics, 1);
  adjustInventory(o.buckles, 1);
  state.orders = state.orders.filter(x => x.id !== id);
  saveState();
  toast('已删除排单');
  refreshOrders();
  refreshInventory();
  refreshDashboard();
}

function editPortfolio(id) {
  const p = state.portfolio.find(x => x.id === id);
  if (!p) return;
  editingPortfolioId = id;
  openSheet('Complete');
  setTimeout(() => {
    const sheet = $('#sheetComplete');
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el && el.tagName !== 'DIV') el.value = val != null ? val : '';
    };
    set('name', p.name);
    set('size', p.size);
    set('income', p.income);
    set('note', p.note);
    sheet.querySelector('.sheet-title').textContent = '编辑作品 ✏️';
    sheet.querySelector('[data-save="complete"]').textContent = '保存修改';
  }, 50);
}

function deletePortfolio(id) {
  const p = state.portfolio.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`确定要删除作品「${p.name}」吗？`)) return;
  state.portfolio = state.portfolio.filter(x => x.id !== id);
  saveState();
  toast('已删除作品');
  refreshPortfolio();
  refreshDashboard();
  refreshHeroCarousel();
}

/* ---------- 采购 编辑/删除 ---------- */
function editPurchase(id) {
  const p = state.purchases.find(x => x.id === id);
  if (!p) return;
  editingPurchaseId = id;
  openSheet('Purchase');
  setTimeout(() => {
    const sheet = $('#sheetPurchase');
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el && el.tagName !== 'DIV') el.value = val != null ? val : '';
    };
    set('name', p.name);
    set('qty', p.qty);
    set('unit', p.unit);
    set('price', p.price);
    // 类别
    const segRow = sheet.querySelector('.seg-row[data-name="category"]');
    if (segRow) {
      segRow.dataset.value = p.category;
      segRow.querySelectorAll('.seg-pill').forEach(pp => {
        pp.classList.toggle('seg-pill-active', pp.dataset.pick === p.category);
      });
    }
    // 关联订单
    const sel = sheet.querySelector('select[data-name="linkedOrder"]');
    if (sel) sel.value = p.linkedOrder || '';
    sheet.querySelector('.sheet-title').textContent = '编辑采购项 ✏️';
    sheet.querySelector('[data-save="purchase"]').textContent = '保存修改';
  }, 50);
}

function deletePurchase(id) {
  const p = state.purchases.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`确定要删除采购项「${p.name}」吗？`)) return;
  state.purchases = state.purchases.filter(x => x.id !== id);
  saveState();
  toast('已删除采购项');
  refreshPurchase();
  refreshDashboard();
}

/* ---------- 想做清单 编辑/删除 ---------- */
function editWishlist(id) {
  const w = state.wishlist.find(x => x.id === id);
  if (!w) return;
  editingWishlistId = id;
  openSheet('Wishlist');
  setTimeout(() => {
    const sheet = $('#sheetWishlist');
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el) el.value = val != null ? val : '';
    };
    set('name', w.name);
    set('tags', (w.tags || []).join('/'));
    set('note', w.note);
  }, 50);
}

function deleteWishlist(id) {
  const w = state.wishlist.find(x => x.id === id);
  if (!w) return;
  if (!confirm(`确定要删除「${w.name}」吗？`)) return;
  state.wishlist = state.wishlist.filter(x => x.id !== id);
  saveState();
  toast('已删除');
  refreshWishlist();
  refreshOrders();
  refreshDashboard();
}

function saveWishlist(sheet) {
  const f = collectForm(sheet);
  if (!f.name) { toast('请填写名称'); return; }
  const w = state.wishlist.find(x => x.id === editingWishlistId);
  if (w) {
    w.name = f.name;
    w.tags = (f.tags||'').split(/[\/,]/).map(s=>s.trim()).filter(Boolean);
    w.note = f.note || '';
  }
  editingWishlistId = null;
  saveState();
  toast('已更新 ✏️');
  closeSheet();
  refreshWishlist();
  refreshOrders();
  refreshDashboard();
}

/* ---------- 抽屉（Sheet） ---------- */
function openSheet(name, prefill = {}) {
  $$(`.sheet`).forEach(s => s.classList.remove('open'));
  const sheet = $(`#sheet${name}`);
  if (!sheet) return;
  // 重置编辑状态
  editingMaterialId = null;
  editingOrderId = null;
  editingPortfolioId = null;
  editingPurchaseId = null;
  editingWishlistId = null;
  editingTravelId = null;
  editingInspId = null;
  // 重置表单
  sheet.querySelectorAll('.text-input, textarea').forEach(i => {
    if (i.type === 'file') return;
    i.value = '';
  });
  sheet.querySelectorAll('.photo-upload').forEach(p => {
    p.classList.remove('has-image');
    p.style.backgroundImage = '';
    p.querySelector('span').style.display = '';
    delete p.dataset.photo;
  });
  // 重置灵感图纸草稿与预览
  if (name === 'Inspiration') {
    inspBlueprintsDraft = [];
    const prev = sheet.querySelector('[data-bp-preview]');
    if (prev) prev.innerHTML = '';
  }
  sheet.querySelectorAll('.seg-row').forEach(r => {
    const dflt = r.dataset.value;
    r.dataset.value = dflt;
    r.querySelectorAll('.seg-pill').forEach(p => {
      p.classList.toggle('seg-pill-active', p.dataset.pick === dflt);
    });
  });
  sheet.querySelectorAll('.picker').forEach(p => {
    p.dataset.value = '[]';
    p.innerHTML = '<span class="picker-empty">点此选择</span>';
  });
  // 重置标题和按钮文字
  const titleMap = { Material: '登记新物料 🧶', Order: '新建排单 ✂️', Complete: '收工啦 🎉 上传成品照', Inspiration: '记录一条灵感 ✏️', Purchase: '添加采购项 🛒', Weight: '记录体重 ⚖️', Thought: '写进树洞 🌳', Travel: '旅行计划 ✈️' };
  if (titleMap[name]) sheet.querySelector('.sheet-title').textContent = titleMap[name];
  const saveBtn = sheet.querySelector('[data-save]');
  if (saveBtn) {
    const saveTextMap = { material: '保存物料', order: '加入排单', complete: '归入作品集', inspiration: '保存灵感', purchase: '保存', weight: '保存', thought: '丢进树洞', travel: '保存' };
    if (saveTextMap[saveBtn.dataset.save]) saveBtn.textContent = saveTextMap[saveBtn.dataset.save];
  }

  if (prefill.orderId) sheet.dataset.orderId = prefill.orderId;
  if (prefill.wishId)  sheet.dataset.wishId  = prefill.wishId;
  if (prefill.action)  sheet.dataset.action  = prefill.action;

  // 体重表单：默认今天日期
  if (name === 'Weight') {
    const dateInput = sheet.querySelector('#weightDateInput');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  }

  // 物料 / 采购表单关联选项
  if (name === 'Purchase') {
    const sel = sheet.querySelector('select[data-name="linkedOrder"]');
    if (sel) {
      sel.innerHTML = '<option value="">不关联</option>' +
        state.orders.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('');
    }
  }

  sheet.classList.add('open');
  // 阻止背景滚动
  $('.app').style.overflow = 'hidden';
}

function closeSheet() {
  $$('.sheet').forEach(s => {
    s.classList.remove('open');
    delete s.dataset.orderId;
    delete s.dataset.wishId;
    delete s.dataset.action;
  });
  $('.app').style.overflow = '';
}

/* ---------- 表单收集 ---------- */
function collectForm(sheet) {
  const out = {};
  sheet.querySelectorAll('.text-input, textarea').forEach(i => {
    if (i.type === 'file') return;
    const n = i.dataset.name;
    if (n) out[n] = i.value;
  });
  sheet.querySelectorAll('.seg-row').forEach(r => {
    out[r.dataset.name] = r.dataset.value;
  });
  sheet.querySelectorAll('.picker').forEach(p => {
    try {
      const arr = JSON.parse(p.dataset.value || '[]');
      out[p.dataset.pickList] = arr;
    } catch (e) { out[p.dataset.pickList] = []; }
  });
  sheet.querySelectorAll('.photo-upload').forEach(p => {
    const photo = p.dataset.photo || '';
    if (p.closest('#sheetMaterial')) out._photo = photo;
    if (p.closest('#sheetOrder'))    out._cover = photo;
    if (p.closest('#sheetInspiration')) out._inspCover = photo;
    if (p.closest('#sheetComplete')) out._photos = (out._photos||[]).concat(photo ? [photo] : []);
  });
  return out;
}

/* ---------- 保存动作 ---------- */
function saveMaterial(sheet) {
  const f = collectForm(sheet);
  if (!f.name) { toast('请填写名称'); return; }
  if (editingMaterialId) {
    const m = state.inventory.find(x => x.id === editingMaterialId);
    if (m) {
      m.category = f.category || 'fabric';
      m.name = f.name;
      m.material = f.material || '';
      m.color = f.color || '';
      m.tags = (f.tags||'').split(/[\/,]/).map(s=>s.trim()).filter(Boolean);
      m.total = Number(f.total) || 0;
      m.remaining = Number(f.remaining ?? f.total) || 0;
      m.unit = f.unit || '米';
      m.price = Number(f.price) || 0;
      m.threshold = Number(f.threshold) || 0;
      m.photo = f._photo || '';
      m.note = f.note || '';
    }
    editingMaterialId = null;
    toast('已更新物料 ✏️');
  } else {
    state.inventory.unshift({
      id: uid(),
      category: f.category || 'fabric',
      name: f.name,
      material: f.material || '',
      color: f.color || '',
      tags: (f.tags||'').split(/[\/,]/).map(s=>s.trim()).filter(Boolean),
      total: Number(f.total) || 0,
      remaining: Number(f.remaining ?? f.total) || 0,
      unit: f.unit || '米',
      price: Number(f.price) || 0,
      threshold: Number(f.threshold) || 0,
      photo: f._photo || '',
      note: f.note || ''
    });
    toast('已登记物料 🧶');
  }
  saveState();
  closeSheet();
  refreshInventory();
  refreshDashboard();
}

function savePurchase(sheet) {
  const f = collectForm(sheet);
  if (!f.name) { toast('请填写名称'); return; }
  if (editingPurchaseId) {
    const p = state.purchases.find(x => x.id === editingPurchaseId);
    if (p) {
      p.name = f.name;
      p.category = f.category || 'fabric';
      p.qty = Number(f.qty) || 1;
      p.unit = f.unit || '';
      p.price = Number(f.price) || 0;
      p.linkedOrder = f.linkedOrder || '';
    }
    editingPurchaseId = null;
    toast('已更新采购项 ✏️');
  } else {
    state.purchases.unshift({
      id: uid(),
      name: f.name,
      category: f.category || 'fabric',
      qty: Number(f.qty) || 1,
      unit: f.unit || '',
      price: Number(f.price) || 0,
      linkedOrder: f.linkedOrder || '',
      done: false
    });
    toast('已加入采购清单 🛒');
  }
  saveState();
  closeSheet();
  refreshPurchase();
  if (NAV_HISTORY[NAV_HISTORY.length-1] !== 'workbench') refreshDashboard();
}

/* ---------- 库存扣减 ---------- */
// factor = -1 扣除用量（消耗库存）；factor = 1 还原（编辑/删除排单时回补库存）
function adjustInventory(list, factor) {
  (list || []).forEach(({ id, qty }) => {
    const m = state.inventory.find(x => x.id === id);
    if (m) {
      m.remaining = Math.max(0, (Number(m.remaining) || 0) + factor * (Number(qty) || 0));
    }
  });
}
// 返回用量超出当前库存的物料名
function checkShortages(list) {
  const short = [];
  (list || []).forEach(({ id, qty }) => {
    const m = state.inventory.find(x => x.id === id);
    if (m && (Number(m.remaining) || 0) < (Number(qty) || 0)) short.push(m.name);
  });
  return short;
}
// 排单卡片用料摘要
function materialSummary(o) {
  const list = [...(o.fabrics || []), ...(o.buckles || [])];
  if (!list.length) return '';
  const names = list.map(x => {
    const id = typeof x === 'string' ? x : (x && x.id);
    const qty = typeof x === 'string' ? 1 : (x.qty || 1);
    const m = state.inventory.find(inv => inv.id === id);
    return m ? `${m.name}×${qty}${m.unit || ''}` : '';
  }).filter(Boolean);
  if (!names.length) return '';
  return `<div class="kanban-card-materials">🧶 ${escapeHtml(names.join('、'))}</div>`;
}

function saveOrder(sheet) {
  const f = collectForm(sheet);
  if (!f.name) { toast('请填写作品名'); return; }
  if (editingOrderId) {
    const o = state.orders.find(x => x.id === editingOrderId);
    if (o) {
      // 先还原旧用量，回补库存
      adjustInventory(o.fabrics, 1);
      adjustInventory(o.buckles, 1);
      o.name = f.name;
      o.category = f.category || 'bag';
      o.size = f.size || '';
      o.qty = Number(f.qty) || 1;
      o.customer = f.customer || '';
      o.income = Number(f.income) || 0;
      o.cover = f._cover || '';
      o.fabrics = f.fabrics || [];
      o.buckles = f.buckles || [];
      o.note = f.note || '';
      if (f.stage && STAGE_META[f.stage]) o.stage = f.stage;
      // 按新用量扣减库存
      const short = [...checkShortages(o.fabrics), ...checkShortages(o.buckles)];
      adjustInventory(o.fabrics, -1);
      adjustInventory(o.buckles, -1);
      if (short.length) toast('⚠️ 库存不足：' + short.join('、') + '（已按现有库存扣除）');
    }
    editingOrderId = null;
    toast('已更新排单 ✏️');
    saveState();
    closeSheet();
    refreshOrders();
    refreshInventory();
    refreshDashboard();
  } else {
    const stage = (f.stage && ['queue','cut','sew','pack'].includes(f.stage)) ? f.stage : 'queue';
    state.orders.unshift({
      id: uid(),
      name: f.name,
      category: f.category || 'bag',
      size: f.size || '',
      qty: Number(f.qty) || 1,
      customer: f.customer || '',
      income: Number(f.income) || 0,
      stage,
      cover: f._cover || '',
      fabrics: f.fabrics || [],
      buckles: f.buckles || [],
      note: f.note || ''
    });
    // 按用量扣减库存
    const short = [...checkShortages(f.fabrics), ...checkShortages(f.buckles)];
    adjustInventory(f.fabrics, -1);
    adjustInventory(f.buckles, -1);
    if (short.length) toast('⚠️ 库存不足：' + short.join('、') + '（已按现有库存扣除）');
    else toast(`已加入排单，进入「${STAGE_META[stage].label}」看板 ✂️`);
    saveState();
    closeSheet();
    refreshOrders();
    refreshInventory();
    refreshDashboard();
    // 直接进入排单看板并滚动到对应阶段列
    go('orders');
    setTimeout(() => {
      $$('.view-orders .seg-tab').forEach(x => x.classList.toggle('seg-active', x.dataset.seg === 'kanban'));
      $$('.view-orders .seg-pane').forEach(p => p.classList.toggle('seg-pane-active', p.dataset.pane === 'kanban'));
      const col = document.querySelector(`.kanban-col[data-stage="${stage}"]`);
      const wrap = $('#kanbanWrap');
      if (col && wrap) wrap.scrollTo({ left: Math.max(0, col.offsetLeft - 12), behavior: 'smooth' });
    }, 120);
  }
}

function saveInspiration(sheet) {
  const f = collectForm(sheet);
  if (!f.title) { toast('请填写标题'); return; }
  const tags = (f.tags||'').split(/[\/,]/).map(s=>s.trim()).filter(Boolean);
  if (editingInspId) {
    const it = state.inspirations.find(i => i.id === editingInspId);
    if (it) {
      it.title = f.title;
      it.desc  = f.desc || '';
      it.cover = f._inspCover || '';
      it.tags  = tags;
      it.source = (f.source || '').trim();
      it.blueprints = inspBlueprintsDraft.slice();
    }
    editingInspId = null;
    toast('已更新灵感 ✏️');
  } else {
    state.inspirations.unshift({
      id: uid(),
      title: f.title,
      desc: f.desc || '',
      cover: f._inspCover || '',
      tags,
      source: (f.source || '').trim(),
      blueprints: inspBlueprintsDraft.slice(),
      createdAt: Date.now()
    });
    toast('已记录灵感 ✏️');
  }
  saveState();
  closeSheet();
  refreshInspiration();
  refreshDashboard();
}

function editInspiration(id) {
  const it = state.inspirations.find(i => i.id === id);
  if (!it) return;
  openSheet('Inspiration');   // 先开弹窗（其复位逻辑会清空 editingInspId）
  editingInspId = id;         // 再设置当前编辑 id，避免被 openSheet 复位覆盖
  setTimeout(() => {
    const sheet = $('#sheetInspiration');
    if (!sheet) return;
    const set = (name, val) => {
      const el = sheet.querySelector(`[data-name="${name}"]`);
      if (el && el.tagName !== 'DIV') el.value = val != null ? val : '';
    };
    set('title', it.title);
    set('desc', it.desc);
    set('tags', (it.tags||[]).join('/'));
    set('source', it.source || '');
    inspBlueprintsDraft = (it.blueprints || []).slice();
    renderBpPreview();
    if (it.cover) {
      const photoUpload = sheet.querySelector('.photo-upload');
      if (photoUpload) {
        photoUpload.style.backgroundImage = `url(${it.cover})`;
        photoUpload.classList.add('has-image');
        photoUpload.querySelector('span').style.display = 'none';
        photoUpload.dataset.photo = it.cover;
      }
    }
    sheet.querySelector('.sheet-title').textContent = '编辑灵感 ✏️';
    sheet.querySelector('[data-save="inspiration"]').textContent = '保存修改';
  }, 50);
}

function deleteInspiration(id) {
  const it = state.inspirations.find(i => i.id === id);
  if (!it) return;
  if (!confirm(`确定要删除「${it.title}」吗？此操作不可撤销。`)) return;
  state.inspirations = state.inspirations.filter(i => i.id !== id);
  // 同步移除想做清单中的关联项
  state.wishlist = state.wishlist.filter(w => w.fromInspirationId !== id);
  saveState();
  toast('已删除灵感');
  refreshInspiration();
  refreshDashboard();
}

function saveComplete(sheet) {
  const f = collectForm(sheet);
  const name = f.name || (sheet.dataset.action ? state.wishlist.find(w=>w.id===sheet.dataset.wishId)?.name : '');
  if (!name) { toast('请填写作品名'); return; }
  if (editingPortfolioId) {
    const p = state.portfolio.find(x => x.id === editingPortfolioId);
    if (p) {
      p.name = name;
      p.size = f.size || '';
      p.income = Number(f.income) || 0;
      p.note = f.note || '';
    }
    editingPortfolioId = null;
    toast('已更新作品 ✏️');
  } else {
    state.portfolio.unshift({
      id: uid(),
      name,
      size: f.size || '',
      income: Number(f.income) || 0,
      photos: f._photos || [],
      note: f.note || ''
    });
    if (sheet.dataset.wishId) {
      state.wishlist = state.wishlist.filter(w => w.id !== sheet.dataset.wishId);
    }
    toast('🎉 归入作品集啦');
  }
  saveState();
  closeSheet();
  refreshDashboard();
  refreshPortfolio();
  refreshHeroCarousel();
  if (NAV_HISTORY[NAV_HISTORY.length-1] === 'wishlist') refreshWishlist();
}

/* ---------- 多选 picker ---------- */
let pickerState = null;
function openPicker(target) {
  const list = target.dataset.pickList;
  const title = list === 'fabrics' ? '选择布料（填用量）' : '选择辅料（填用量）';
  // 解析已有值：兼容 [id] 与 [{id,qty}] 两种格式
  let init = [];
  try { init = JSON.parse(target.dataset.value || '[]'); } catch (e) { init = []; }
  const selected = new Map();
  init.forEach(x => {
    if (typeof x === 'string') selected.set(x, 1);
    else if (x && x.id) selected.set(x.id, Number(x.qty) || 1);
  });
  pickerState = { list, target, selected };

  const source = list === 'fabrics'
    ? state.inventory.filter(m => m.category === 'fabric' || m.category === 'lining')
    : state.inventory.filter(m => ['zipper','button','buckle','tool'].includes(m.category));

  $('#pickerTitle').textContent = title;
  $('#pickerList').innerHTML = source.map(m => {
    const sel = selected.has(m.id);
    const qty = selected.get(m.id) || 1;
    const meta = CATEGORY_META[m.category] || {};
    return `
      <div class="picker-row ${sel?'selected':''}" data-id="${m.id}">
        <div class="picker-row-main">
          <span class="picker-row-name">${escapeHtml(m.name)}</span>
          <span class="picker-row-meta">${meta.label || ''} · 余 ${m.remaining}${escapeHtml(m.unit||'')}</span>
        </div>
        <div class="picker-qty">
          <span class="qty-label">用量</span>
          <input class="picker-qty-input" type="number" min="0" step="0.1" value="${qty}" data-qty-input />
          <span class="qty-unit">${escapeHtml(m.unit||'')}</span>
        </div>
      </div>
    `;
  }).join('') || `<div class="kanban-empty">还没物料可选</div>`;

  $('#sheetPicker').classList.add('open');
}

// 物料标签渲染：兼容 [id] 与 [{id,qty}]，展示「名称 ×用量单位」
function renderMaterialTags(list) {
  const names = (list || []).map(x => {
    const id = typeof x === 'string' ? x : (x && x.id);
    const qty = typeof x === 'string' ? 1 : (x.qty || 1);
    const m = state.inventory.find(inv => inv.id === id);
    return m ? `${m.name} ×${qty}${m.unit || ''}` : '';
  }).filter(Boolean);
  return names.length
    ? names.map(n => `<span class="picker-tag">${escapeHtml(n)}</span>`).join('')
    : '<span class="picker-empty">点此选择</span>';
}

function confirmPicker() {
  if (!pickerState) return;
  const arr = [];
  // 以输入框中的真实值为准，避免手动键入的用量被初始值覆盖
  $('#pickerList').querySelectorAll('.picker-row.selected').forEach(row => {
    const id = row.dataset.id;
    const qty = Math.max(0, Number(row.querySelector('[data-qty-input]').value) || 0);
    if (qty > 0) arr.push({ id, qty });
  });
  pickerState.target.dataset.value = JSON.stringify(arr);
  pickerState.target.innerHTML = renderMaterialTags(arr);
  closePickerSheet();
}

function closePickerSheet() {
  $('#sheetPicker').classList.remove('open');
  pickerState = null;
}

/* ---------- 灵感收藏 / 完成 ---------- */
function toggleWishlist(inspId) {
  const it = findInspiration(inspId);
  if (!it) return;
  const exists = state.wishlist.find(w => w.fromInspirationId === inspId);
  if (exists) {
    state.wishlist = state.wishlist.filter(w => w.fromInspirationId !== inspId);
    toast('已从想做清单移除');
  } else {
    state.wishlist.unshift({
      id: uid(),
      fromInspirationId: inspId,
      name: it.title,
      source: 'record',
      tags: it.tags || [],
      note: ''
    });
    toast('已加入想做清单 ⭐');
  }
  saveState();
  refreshInspiration();
  refreshDashboard();
}

function openInspiration(inspId) {
  const it = findInspiration(inspId);
  if (!it) return;
  if (!it.url) {
    toast('该灵感暂无外链，可在 + 中补充链接');
    return;
  }
  const pm = PLATFORM_META[it.platform] || PLATFORM_META.other;
  $('#linkPopPlat').textContent = pm.label;
  $('#linkPopTitle').textContent = it.title || '灵感链接';
  const urlInput = $('#linkPopUrl');
  urlInput.value = it.url;
  const copyBtn = $('#linkCopyBtn');
  copyBtn.textContent = '复制';
  copyBtn.classList.remove('copied');
  openSheetLink();
}

function openSheetLink() {
  const sheet = $('#sheetLink');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
}
function closeSheetLink() {
  const sheet = $('#sheetLink');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
}

function copyInspLink() {
  const urlInput = $('#linkPopUrl');
  const url = urlInput.value;
  const copyBtn = $('#linkCopyBtn');
  const done = () => {
    copyBtn.textContent = '✓ 已复制';
    copyBtn.classList.add('copied');
    toast('链接已复制，去 APP 粘贴吧 📋');
    setTimeout(() => { copyBtn.textContent = '复制'; copyBtn.classList.remove('copied'); }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(urlInput, done));
  } else {
    fallbackCopy(urlInput, done);
  }
}

/* 通用外链弹窗：新闻 / 好书 / 灵感 通用 */
function openExtLink(plat, title, url, tip) {
  if (!url) { toast('暂无可用链接'); return; }
  $('#linkPopPlat').textContent = plat || '链接';
  $('#linkPopTitle').textContent = title || '外部链接';
  const urlInput = $('#linkPopUrl');
  urlInput.value = url;
  $('#linkPopTip').textContent = tip || '📋 复制链接后，打开对应 APP 粘贴即可查看';
  const copyBtn = $('#linkCopyBtn');
  copyBtn.textContent = '复制';
  copyBtn.classList.remove('copied');
  openSheetLink();
}

function fallbackCopy(urlInput, cb) {
  urlInput.removeAttribute('readonly');
  urlInput.select();
  urlInput.setSelectionRange(0, 99999);
  try { document.execCommand('copy'); cb(); } catch(e) { toast('复制失败，请长按链接手动复制'); }
  urlInput.setAttribute('readonly', '');
  urlInput.blur();
}

function completeWishlist(wishId) {
  const w = state.wishlist.find(x => x.id === wishId);
  if (!w) return;
  openSheet('Complete', { wishId });
  // 预填名称
  setTimeout(() => {
    const sheet = $('#sheetComplete');
    const nameInput = sheet.querySelector('input[data-name="name"]');
    if (nameInput) nameInput.value = w.name;
  }, 30);
}

/* ---------- 备份 / 恢复 / 清空 ---------- */
function exportData() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `聼说的缝纫工作台-备份-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出，可保存到 iCloud Drive 📁');
}

function importDataFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      state = data;
      if (!state.settings) state.settings = { reminderTime: '09:00' };
      saveState();
      toast('已从文件恢复 ✅');
      refreshAll();
    } catch (err) {
      toast('文件解析失败');
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm('确定要清空全部数据吗？建议先备份。')) return;
  state = emptyData();
  saveState();
  refreshAll();
  toast('已清空');
}

function seedAll() {
  state = seedData();
  saveState();
  refreshAll();
  toast('已载入示例数据 ✨');
}

function refreshAll() {
  refreshDashboard();
  refreshInventory();
  refreshOrders();
  refreshInspiration();
  refreshWellness();
  refreshWishlist();
  refreshPortfolio();
  refreshMore();
}

/* ---------- 事件绑定 ---------- */
function bind() {

  // tab 切换
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    NAV_HISTORY.length = 0;
    NAV_HISTORY.push(t.dataset.tab === 'workbench' ? 'workbench'
                    : t.dataset.tab === 'inventory' ? 'inventory'
                    : t.dataset.tab === 'orders' ? 'orders'
                    : t.dataset.tab === 'inspiration' ? 'inspiration'
                    : 'more');
    go(NAV_HISTORY[0], { push: false });
  }));

  // 工作台六大工作台卡片
  $$('.wb-card').forEach(c => c.addEventListener('click', () => go(c.dataset.go)));
  $$('[data-back]').forEach(b => b.addEventListener('click', back));

  // 工作台快捷按钮
  $$('.quick-actions [data-action]').forEach(b => b.addEventListener('click', e => {
    const a = b.dataset.action;
    if (a === 'new-material') openSheet('Material');
    if (a === 'new-order') openSheet('Order');
    if (a === 'new-inspiration') openSheet('Inspiration');
  }));

  // 库存筛选
  $$('.chip').forEach(c => c.addEventListener('click', () => {
    $$('.chip').forEach(x => x.classList.remove('chip-active'));
    c.classList.add('chip-active');
    invFilter = c.dataset.filter;
    refreshInventory();
  }));

  // 排单 seg tabs
  $$('.seg-tab').forEach(t => t.addEventListener('click', () => {
    $$('.seg-tab').forEach(x => x.classList.remove('seg-active'));
    t.classList.add('seg-active');
    const seg = t.dataset.seg;
    $$('.seg-pane').forEach(p => p.classList.toggle('seg-pane-active', p.dataset.pane === seg));
  }));

  // 灵感搜索
  const inspSearchInput = $('#inspSearchInput');
  const inspSearchClear = $('#inspSearchClear');
  if (inspSearchInput) {
    let searchDebounce;
    inspSearchInput.addEventListener('input', () => {
      const val = inspSearchInput.value.trim();
      inspSearchClear.classList.toggle('show', val.length > 0);
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        inspSearch = val;
        refreshInspiration();
      }, 250);
    });
  }
  if (inspSearchClear) {
    inspSearchClear.addEventListener('click', () => {
      inspSearchInput.value = '';
      inspSearch = '';
      inspSearchClear.classList.remove('show');
      refreshInspiration();
    });
  }

  // 灵感库子标签（制作灵感 / 布料灵感）
  $$('.seg-tabs-insp .seg-tab').forEach(t => t.addEventListener('click', () => {
    inspSubTab = t.dataset.iseg;
    syncInspTabs();
    refreshInspiration();
  }));

  // 布料灵感：制作灵感照片多图上传
  const fabMakeInput = $('#fabMakeInput');
  if (fabMakeInput) fabMakeInput.addEventListener('change', e => {
    if (!e.target.files || !e.target.files.length) return;
    addFabricMakePhotos(e.target.files);
    e.target.value = '';
  });

  // FAB
  $$('.fab').forEach(f => f.addEventListener('click', () => {
    const a = f.dataset.action;
    if (a === 'new-material') openSheet('Material');
    if (a === 'new-order') openSheet('Order');
    if (a === 'new-inspiration') openSheet('Inspiration');
    if (a === 'new-fabric') openFabricSheet();
    if (a === 'new-purchase') openSheet('Purchase');
    if (a === 'new-weight') openSheet('Weight');
    if (a === 'new-thought') openSheet('Thought');
    if (a === 'new-travel') openSheet('Travel');
    if (a === 'new-memo') openMemoComposer();
  }));

  // Sheet 关闭
  $$('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
  // 链接弹窗复制按钮
  const linkCopyBtn = $('#linkCopyBtn');
  if (linkCopyBtn) linkCopyBtn.addEventListener('click', copyInspLink);
  const linkPopOpen = $('#linkPopOpen');
  if (linkPopOpen) linkPopOpen.addEventListener('click', () => {
    const url = $('#linkPopUrl').value;
    if (!url) return;
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 300);
      toast('正在打开…若未自动打开，请复制链接');
    } catch (e) {
      toast('已为你复制链接，去浏览器粘贴吧');
      copyInspLink();
    }
  });

  // 修身养性 seg-tabs：通过 hash 子路由切换（#wellness/news），保证系统返回手势可回到修身养性
  $$('.seg-tabs-wellness .seg-tab').forEach(t => t.addEventListener('click', () => {
    const tab = t.dataset.wseg;
    setWellnessTab(tab);
    refreshWellness();
    const target = `wellness/${tab}`;
    if ((location.hash || '').slice(1) !== target) {
      suppressHashRoute = true;
      location.hash = target;
    }
  }));

  // 备忘：左右滑动切换日期
  const memoEl = $('#memoList');
  if (memoEl) {
    let sx = 0, sy = 0;
    memoEl.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    memoEl.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        memoDate = shiftDate(memoDate, dx < 0 ? 1 : -1); // 左滑→后一天，右滑→前一天
        refreshMemo();
      }
    }, { passive: true });
  }

  // 备忘：编辑框回车保存（textarea 用 Cmd/Ctrl+Enter 或单纯 Enter 保存）
  const memoInput = $('#memoComposerInput');
  if (memoInput) {
    memoInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveMemoComposer(); }
    });
  }

  // 新闻/好书刷新
  const refreshNewsBtn = $('#refreshNewsBtn');
  if (refreshNewsBtn) refreshNewsBtn.addEventListener('click', () => { refreshNews(); toast('已刷新新闻列表'); });
  const refreshBookBtn = $('#refreshBookBtn');
  if (refreshBookBtn) refreshBookBtn.addEventListener('click', () => {
    // 随机换一批（三本不重复）
    const pool = BOOK_LIBRARY.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    renderBooks(pool.slice(0, 3));
    toast('已为你换一批好书 📚');
  });

  $$('[data-save]').forEach(b => b.addEventListener('click', () => {
    const sheet = b.closest('.sheet');
    const t = b.dataset.save;
    if (t === 'material')    saveMaterial(sheet);
    if (t === 'purchase')    savePurchase(sheet);
    if (t === 'order')       saveOrder(sheet);
    if (t === 'inspiration') saveInspiration(sheet);
    if (t === 'complete')    saveComplete(sheet);
    if (t === 'fabric')      saveFabricSheet(sheet);
    if (t === 'weight')      saveWeight(sheet);
    if (t === 'thought')     saveThought(sheet);
    if (t === 'travel')      saveTravel(sheet);
  }));

  // seg-pill 切换
  document.addEventListener('click', e => {
    const pill = e.target.closest('.seg-pill');
    if (!pill) return;
    const row = pill.closest('.seg-row');
    row.querySelectorAll('.seg-pill').forEach(p => p.classList.remove('seg-pill-active'));
    pill.classList.add('seg-pill-active');
    row.dataset.value = pill.dataset.pick;
  });

  // 照片上传（等比压缩，避免大图撑爆 localStorage 配额）
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-photo-input]')) return;
    const wrap = e.target.closest('.photo-upload');
    const files = e.target.files;
    if (!files || !files[0]) return;
    fileToDataURLScaled(files[0], 1000, 0.82).then(dataUrl => {
      if (!dataUrl) return;
      wrap.style.backgroundImage = `url(${dataUrl})`;
      wrap.classList.add('has-image');
      wrap.querySelector('span').style.display = 'none';
      wrap.dataset.photo = dataUrl;
    });
  });

  // 记录灵感：图纸多图上传（等比压缩）
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-bp-input]')) return;
    const input = e.target;
    const files = Array.from(input.files || []).filter(f => f && f.type && f.type.startsWith('image/'));
    input.value = '';   // 允许重复选同一张
    if (!files.length) return;
    Promise.all(files.map(file => fileToDataURLScaled(file, 1280, 0.82))).then(results => {
      results.forEach(d => { if (d) inspBlueprintsDraft.push(d); });
      renderBpPreview();
    });
  });

  // 灵感卡片按钮（事件委托）
  document.addEventListener('click', e => {
    // 编辑/删除物料
    const editMat = e.target.closest('[data-edit-material]');
    if (editMat) { e.stopPropagation(); editMaterial(editMat.dataset.editMaterial); return; }
    const delMat = e.target.closest('[data-del-material]');
    if (delMat) { e.stopPropagation(); deleteMaterial(delMat.dataset.delMaterial); return; }

    // 编辑/删除排单
    const editOrd = e.target.closest('[data-edit-order]');
    if (editOrd) { e.stopPropagation(); editOrder(editOrd.dataset.editOrder); return; }
    const delOrd = e.target.closest('[data-del-order]');
    if (delOrd) { e.stopPropagation(); deleteOrder(delOrd.dataset.delOrder); return; }

    // 编辑/删除作品
    const editPort = e.target.closest('[data-edit-portfolio]');
    if (editPort) { e.stopPropagation(); editPortfolio(editPort.dataset.editPortfolio); return; }
    const delPort = e.target.closest('[data-del-portfolio]');
    if (delPort) { e.stopPropagation(); deletePortfolio(delPort.dataset.delPortfolio); return; }

    // 编辑/删除采购
    const editPur = e.target.closest('[data-edit-purchase]');
    if (editPur) { e.stopPropagation(); editPurchase(editPur.dataset.editPurchase); return; }
    const delPur = e.target.closest('[data-del-purchase]');
    if (delPur) { e.stopPropagation(); deletePurchase(delPur.dataset.delPurchase); return; }

    // 编辑/删除想做清单
    const editWl = e.target.closest('[data-edit-wishlist]');
    if (editWl) { e.stopPropagation(); editWishlist(editWl.dataset.editWishlist); return; }
    const delWl = e.target.closest('[data-del-wishlist]');
    if (delWl) { e.stopPropagation(); deleteWishlist(delWl.dataset.delWishlist); return; }

    // 删除体重记录
    const delWt = e.target.closest('[data-del-weight]');
    if (delWt) { e.stopPropagation(); deleteWeight(delWt.dataset.delWeight); return; }

    // 删除树洞记录
    const delTh = e.target.closest('[data-del-thought]');
    if (delTh) { e.stopPropagation(); deleteThought(delTh.dataset.delThought); return; }

    // 编辑/删除旅行计划
    const editTr = e.target.closest('[data-edit-travel]');
    if (editTr) { e.stopPropagation(); editTravel(editTr.dataset.editTravel); return; }
    const delTr = e.target.closest('[data-del-travel]');
    if (delTr) { e.stopPropagation(); deleteTravel(delTr.dataset.delTravel); return; }

    // ===== 备忘 =====
    const tgMemo = e.target.closest('[data-toggle-memo]');
    if (tgMemo) { e.stopPropagation(); toggleMemo(tgMemo.dataset.toggleMemo); return; }
    const delMemo = e.target.closest('[data-del-memo]');
    if (delMemo) { e.stopPropagation(); deleteMemo(delMemo.dataset.delMemo); return; }
    const editMemo = e.target.closest('[data-edit-memo]');
    if (editMemo) { e.stopPropagation(); openMemoComposer(editMemo.dataset.editMemo); return; }
    const prevMemo = e.target.closest('[data-memo-prev]');
    if (prevMemo) { e.stopPropagation(); memoDate = shiftDate(memoDate, -1); refreshMemo(); return; }
    const nextMemo = e.target.closest('[data-memo-next]');
    if (nextMemo) { e.stopPropagation(); memoDate = shiftDate(memoDate, 1); refreshMemo(); return; }
    const actMemo = e.target.closest('[data-action]');
    if (actMemo) {
      const a = actMemo.dataset.action;
      if (a === 'clear-done-memo') { e.stopPropagation(); clearDoneMemos(); return; }
      if (a === 'memo-save') { e.stopPropagation(); saveMemoComposer(); return; }
      if (a === 'memo-cancel') { e.stopPropagation(); closeMemoComposer(); return; }
    }

    // 编辑 / 删除灵感
    const editInsp = e.target.closest('[data-insp-edit]');
    if (editInsp) { e.stopPropagation(); editInspiration(editInsp.dataset.inspEdit); return; }
    const delInsp = e.target.closest('[data-insp-del]');
    if (delInsp) { e.stopPropagation(); deleteInspiration(delInsp.dataset.inspDel); return; }

    const fav = e.target.closest('[data-insp-fav]');
    if (fav) { e.stopPropagation(); toggleWishlist(fav.dataset.inspFav); return; }

    // 灵感来源链接：直接打开浏览器（失败退回复制弹窗）
    const srcInsp = e.target.closest('[data-insp-source]');
    if (srcInsp) {
      e.stopPropagation();
      const it = findInspiration(srcInsp.dataset.inspSource);
      if (it && it.source) openBrowserLink(it.source, it.title);
      return;
    }

    // 灵感图纸查看
    const bpInsp = e.target.closest('[data-insp-bp]');
    if (bpInsp) {
      e.stopPropagation();
      const it = findInspiration(bpInsp.dataset.inspBp);
      if (it && it.blueprints && it.blueprints.length) openBlueprintViewer(it.blueprints, 0);
      return;
    }

    // ===== 布料灵感：列表 → 详情 =====
    const fabCard = e.target.closest('[data-fab-id]');
    if (fabCard) { e.stopPropagation(); openFabricDetail(fabCard.dataset.fabId); return; }

    // 布料详情：编辑 / 删除
    const fabEdit = e.target.closest('[data-fab-edit]');
    if (fabEdit) { e.stopPropagation(); closeSheet(); openFabricSheet(currentFabricId); return; }
    const fabDel = e.target.closest('[data-fab-del]');
    if (fabDel) { e.stopPropagation(); deleteFabric(currentFabricId); return; }

    // 布料详情：添加制作灵感照片
    const fabAddMake = e.target.closest('[data-fab-add-make]');
    if (fabAddMake) { e.stopPropagation(); const inp = $('#fabMakeInput'); if (inp) inp.click(); return; }

    // 布料详情：删除某张制作灵感照片（需在“查看”之前判断，避免被父级缩略图拦截）
    const fabMakeDel = e.target.closest('[data-fab-make-del]');
    if (fabMakeDel) { e.stopPropagation(); deleteFabricMakePhoto(Number(fabMakeDel.dataset.fabMakeDel)); return; }
    // 布料详情：查看某张制作灵感照片（灯箱）
    const fabMake = e.target.closest('[data-fab-make]');
    if (fabMake) {
      e.stopPropagation();
      const f = state.fabricInspirations.find(x => x.id === currentFabricId);
      if (f && f.makePhotos && f.makePhotos.length) openBlueprintViewer(f.makePhotos, Number(fabMake.dataset.fabMake));
      return;
    }

    // 记录灵感表单：添加图纸 / 删除某张图纸
    const bpAdd = e.target.closest('[data-bp-add]');
    if (bpAdd) { e.preventDefault(); bpAdd.parentElement.querySelector('[data-bp-input]').click(); return; }
    const bpDel = e.target.closest('[data-bp-remove]');
    if (bpDel) {
      const i = Number(bpDel.dataset.bpRemove);
      inspBlueprintsDraft.splice(i, 1);
      renderBpPreview();
      return;
    }

    // 图纸灯箱：关闭 / 翻页
    if (e.target.closest('[data-lb-close]')) { closeLightbox(); return; }
    const lbNav = e.target.closest('[data-lb-nav]');
    if (lbNav && lbImages.length) {
      lbIndex = (lbIndex + Number(lbNav.dataset.lbNav) + lbImages.length) % lbImages.length;
      renderLightbox();
      return;
    }

    // 新闻 / 好书 外链统一弹窗（避免 PWA 全屏下跳出应用无法返回 / 链接被拦截）
    const ext = e.target.closest('[data-ext-url]');
    if (ext) {
      e.stopPropagation();
      const plat = ext.dataset.extPlat || '链接';
      const title = ext.dataset.extTitle || '外部链接';
      const url = ext.dataset.extUrl;
      let tip = '📋 复制链接后，打开对应 APP 粘贴即可查看';
      if (plat === '微信读书') tip = '📋 复制链接后，打开「微信读书」APP 粘贴即可阅读';
      else if (plat === '澎湃' || plat === '微博' || plat === '知乎' || plat === '百度') tip = '📋 复制链接后，打开浏览器粘贴即可查看新闻原文';
      openExtLink(plat, title, url, tip);
      return;
    }

    // 多选 picker 触发
    const pick = e.target.closest('.picker');
    if (pick) { openPicker(pick); return; }

    // 想做清单完成
    const wlc = e.target.closest('[data-wl-complete]');
    if (wlc) { completeWishlist(wlc.dataset.wlComplete); return; }

    // 采购勾选
    const pt = e.target.closest('[data-purchase-toggle]');
    if (pt) {
      const item = state.purchases.find(x => x.id === pt.dataset.purchaseToggle);
      if (item) { item.done = !item.done; saveState(); refreshPurchase(); refreshDashboard(); }
      return;
    }

    // 更多页按钮
    const ma = e.target.closest('[data-action]');
    if (ma) {
      const a = ma.dataset.action;
      if (a === 'backup')  exportData();
      if (a === 'restore') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = () => input.files[0] && importDataFromFile(input.files[0]);
        input.click();
      }
      if (a === 'clear')   clearAll();
      if (a === 'seed')    seedAll();
      return;
    }

    // 更多页跳页
    const mr = e.target.closest('[data-go]');
    if (mr) { go(mr.dataset.go); return; }
  });

  // picker 多选行
  $('#sheetPicker').addEventListener('click', e => {
    const row = e.target.closest('.picker-row');
    if (!row) return;
    const id = row.dataset.id;
    // 点的是用量输入框本身 → 仅确保选中，取值由 input 事件实时处理
    if (e.target.closest('[data-qty-input]')) {
      pickerState.selected.set(id, Math.max(0, Number(row.querySelector('[data-qty-input]').value) || 0));
      row.classList.add('selected');
      return;
    }
    if (pickerState.selected.has(id)) pickerState.selected.delete(id);
    else pickerState.selected.set(id, Number(row.querySelector('[data-qty-input]').value) || 1);
    row.classList.toggle('selected');
  });
  // 实时同步手动输入的用量（键入/微调箭头都会触发 input）
  $('#sheetPicker').addEventListener('input', e => {
    const qtyInput = e.target.closest('[data-qty-input]');
    if (!qtyInput || !pickerState) return;
    const row = qtyInput.closest('.picker-row');
    const id = row.dataset.id;
    pickerState.selected.set(id, Math.max(0, Number(qtyInput.value) || 0));
    row.classList.add('selected');
  });
  $('[data-picker-confirm]').addEventListener('click', confirmPicker);
}

/* ---------- 启动 ---------- */
function init() {
  refreshAll();
  bind();
  // 渲染后再次绑定看板 dnd 与长按
  setTimeout(bindKanbanDnd, 100);
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  bind();

  // hash 路由：#inventory / #orders / … / #wellness/news（修身养性子页签）
  const WELLNESS_TABS = ['weight','book','travel','memo'];
  function applyHashRoute() {
    if (suppressHashRoute) { suppressHashRoute = false; return; }
    const raw = (location.hash || '#workbench').slice(1);
    const [base, sub] = raw.split('/');
    if (!['workbench','inventory','orders','inspiration','more','purchase','wellness','wishlist','portfolio'].includes(base)) return;
    if (base === 'wellness') {
      setWellnessTab(WELLNESS_TABS.includes(sub) ? sub : 'weight');
    }
    NAV_HISTORY.length = 0;
    NAV_HISTORY.push(base);
    go(base, { push: false, syncHash: false });
  }
  setTimeout(applyHashRoute, 50);
  window.addEventListener('hashchange', applyHashRoute);

  // ?sheet=material / order / inspiration / purchase / complete / time
  const params = new URLSearchParams(location.search);
  const sheetName = params.get('sheet');
  if (sheetName) {
    setTimeout(() => openSheet(sheetName.charAt(0).toUpperCase() + sheetName.slice(1)), 200);
  }

  setTimeout(bindKanbanDnd, 100);
});

/* ---------- PWA: 注册 Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[SW] registered:', reg.scope);
        // 检测到新 SW 激活后自动刷新一次，确保加载最新资源
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch(err => console.error('[SW] registration failed:', err));
  });
}

})();