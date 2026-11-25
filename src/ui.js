import { loadCoins, loadNews, loadArticles, loadStats, fmtPrice, fmtBig, SITE } from './data.js';
import { summarizeNews, summarizeCoin, chat, prepareOnDevice } from './ai.js';
import { findUntracked, notTrackedMessage } from './guard.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const BAR_H = 38, PANEL_H = 262, SETTINGS_H = 250;

const S = { mode: 'both', pos: 'bottom', speedIdx: 2, paused: false, setupDone: false };
const D = { coins: [], news: [], stats: {}, history: [] };
const cache = new Map();

// ---------- storage ----------
async function loadSettings() {
  try { Object.assign(S, (await chrome.storage.local.get('rcc')).rcc || {}); } catch { /* ignore */ }
}
function saveSettings() { try { chrome.storage.local.set({ rcc: S }); } catch { /* ignore */ } }

// ---------- layout (tells content.js how tall the iframe should be) ----------
function layout(close = false) {
  const panelOpen = $('details').classList.contains('show') || $('chat').classList.contains('show');
  const extra = Math.max(panelOpen ? PANEL_H : 0, !$('settings').hidden ? SETTINGS_H : 0);
  $('app').className = S.pos;
  parent.postMessage({ rcc: 'layout', pos: S.pos, height: BAR_H + extra, close }, '*');
}
function openPane(id) { $(id).classList.add('show'); layout(); }
function closePane(id) { $(id).classList.remove('show'); layout(); }

// ---------- ticker ----------
function tickerHTML() {
  const s = D.stats;
  const stats = [];
  if (s.realCap) stats.push(`<button class="st" data-ask="Explain real vs reported market cap">Real cap <b>$${fmtBig(s.realCap)}</b></button>`);
  if (s.reportedCap) stats.push(`<button class="st" data-ask="Explain real vs reported market cap">Reported <b>$${fmtBig(s.reportedCap)}</b></button>`);
  if (s.fearGreed != null) stats.push(`<button class="st" data-ask="Is the market fearful?">Fear &amp; Greed <b class="${s.fearGreed < 45 ? 'dn' : s.fearGreed > 55 ? 'up' : ''}">${s.fearGreed} ${esc(s.fearGreedLabel)}</b></button>`);
  if (s.longPct) stats.push(`<button class="st" data-ask="What do longs vs shorts tell us?">Longs/Shorts <b><span class="up">${s.longPct.toFixed(1)}%</span> / <span class="dn">${s.shortPct.toFixed(1)}%</span></b></button>`);
  const items = D.news.slice(0, 12);
  let html = stats.join('') + (stats.length ? '<span class="sep">|</span>' : '');
  D.coins.forEach((c, i) => {
    const up = (c.change24h || 0) >= 0;
    html += `<button class="it" data-coin="${i}"><b>${esc(c.symbol)}</b> $${fmtPrice(c.price)} <span class="${up ? 'up' : 'dn'}">${up ? '+' : ''}${(c.change24h || 0).toFixed(2)}%</span></button>`;
    if (i % 3 === 2 && items.length) {
      const n = (i - 2) / 3 % items.length;
      html += `<button class="it news" data-news="${n}">${esc(items[n].title)}</button>`;
    }
  });
  return html;
}

let offset = 0, last = 0, hover = false;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000 || 0);
  last = t;
  const track = $('track');
  const half = track.scrollWidth / 2;
  if (!S.paused && !hover && half > 0) {
    offset -= 45 * SPEEDS[S.speedIdx] * dt;
    if (-offset >= half) offset += half;
    track.style.transform = `translateX(${offset}px)`;
  }
  requestAnimationFrame(frame);
}
function renderTicker() {
  if (S.mode === 'chat') { $('scroll').style.visibility = 'hidden'; return; }
  $('scroll').style.visibility = 'visible';
  const html = tickerHTML();
  $('track').innerHTML = html + html; // doubled for a seamless loop
}
function updateSpeedUI() {
  $('spdLabel').textContent = SPEEDS[S.speedIdx] + 'x';
  $('pause').innerHTML = S.paused ? '&#9654;' : '&#10074;&#10074;';
}

// ---------- details box ----------
function badge(src) {
  return src ? `<span class="badge ${src === 'cloud' ? 'cloud' : ''}">${esc(src)}</span>` : '';
}
async function showCoin(i) {
  const c = D.coins[i];
  const up = (c.change24h || 0) >= 0;
  $('details').innerHTML = `<button class="x" data-close="details">&#x2715;</button><h3>${esc(c.name)} (${esc(c.symbol)}) <span class="dim">#${c.rank}</span></h3>
    <div class="kv"><div><b>$${fmtPrice(c.price)}</b>price</div><div><b class="${up ? 'up' : 'dn'}">${(c.change24h || 0).toFixed(2)}%</b>24h</div><div><b>$${fmtBig(c.marketCap)}</b>market cap</div><div><b>$${fmtBig(c.volume)}</b>24h volume</div><div><b>$${fmtPrice(c.low)} - $${fmtPrice(c.high)}</b>24h range</div></div>
    <div class="sum" id="sum"><b>AI summary</b> <span class="dim">${S.mode === 'ticker' ? 'AI is off in ticker-only mode' : 'thinking...'}</span></div>
    <p>${S.mode !== 'ticker' ? `<button class="primary" data-ask="Why is ${esc(c.symbol)} moving?">Ask AI about ${esc(c.symbol)}</button> ` : ''}<a href="${esc(c.url)}" target="_blank" rel="noopener">View on realcryptocap.com &#8599;</a></p>`;
  openPane('details');
  if (S.mode === 'ticker') return;
  const key = 'coin:' + c.id + ':' + Math.round(c.price * 100);
  try {
    const r = cache.get(key) || (cache.set(key, await summarizeCoin(c, D)), cache.get(key));
    $('sum').innerHTML = `<b>AI summary</b>${badge(r.source)}<br>${esc(r.text)}`;
  } catch (e) { $('sum').innerHTML = `<b>AI summary</b><br><span class="dim">Unavailable right now (${esc(e.message || e)}).</span>`; }
}
async function showNews(n) {
  const item = D.news[n];
  $('details').innerHTML = `<button class="x" data-close="details">&#x2715;</button><h3>${esc(item.title)}</h3>
    <div class="kv"><div><b>${esc(item.source)}</b>source</div><div><b>${esc(item.date)}</b>date</div></div>
    <div class="sum" id="sum"><b>AI summary</b> <span class="dim">${S.mode === 'ticker' ? 'AI is off in ticker-only mode' : 'thinking...'}</span></div>
    <p>${S.mode !== 'ticker' ? `<button class="primary" data-ask="What does this headline mean for the market: ${esc(item.title)}">Ask AI about this</button> ` : ''}<a href="${esc(item.url)}" target="_blank" rel="noopener">Read the article at ${esc(item.source)} &#8599;</a></p>`;
  openPane('details');
  if (S.mode === 'ticker') return;
  try {
    const r = cache.get(item.id) || (cache.set(item.id, await summarizeNews(item)), cache.get(item.id));
    $('sum').innerHTML = `<b>AI summary</b>${badge(r.source)}<br>${esc(r.text)}`;
  } catch (e) { $('sum').innerHTML = `<b>AI summary</b><br><span class="dim">Unavailable right now (${esc(e.message || e)}).</span>`; }
}

// ---------- chat ----------
function linkify(text) {
  return esc(text).replace(/https:\/\/realcryptocap\.com[^\s<]*/g, (u) => `<a href="${u.replace(/[.,)]+$/, '')}" target="_blank" rel="noopener">${u.replace(/[.,)]+$/, '')}</a>`);
}
function addMsg(role, html) {
  const d = document.createElement('div');
  d.className = 'm ' + (role === 'user' ? 'u' : 'a');
  d.innerHTML = html;
  $('msgs').appendChild(d);
  $('chat').scrollTop = $('chat').scrollHeight;
  return d;
}
async function ask(text) {
  text = (text || '').trim();
  if (!text) return;
  openPane('chat');
  addMsg('user', esc(text));
  $('q').value = '';
  const pending = addMsg('a', '<span class="dim">thinking...</span>');
  try {
    const r = await chat(text, D.history, D);
    D.history.push({ role: 'user', text }, { role: 'assistant', text: r.text });
    pending.innerHTML = linkify(r.text) + (r.source === 'guard' ? '' : badge(r.source));
    if (r.source !== 'guard') { $('engine').hidden = false; $('engine').textContent = r.source; $('engine').className = 'badge' + (r.source === 'cloud' ? ' cloud' : ''); }
  } catch (e) {
    pending.innerHTML = `<span class="dim">Sorry, the AI is unavailable right now (${esc(e.message || e)}).</span>`;
  }
  $('chat').scrollTop = $('chat').scrollHeight;
}

// ---------- settings ----------
function openSettings() { $('setMode').value = S.mode; $('setPos').value = S.pos; $('settings').hidden = false; layout(); }
function closeSettings() { $('settings').hidden = true; S.setupDone = true; saveSettings(); layout(); }
function applyMode() {
  $('chatBtn').style.display = S.mode === 'ticker' ? 'none' : '';
  document.querySelector('.spd').style.display = S.mode === 'chat' ? 'none' : '';
  renderTicker();
  if (S.mode === 'chat') openPane('chat'); else if (S.mode === 'ticker') closePane('chat');
}

// ---------- wiring ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button,span,a'); if (!t) return;
  if (t.dataset.coin != null) return void showCoin(+t.dataset.coin);
  if (t.dataset.news != null) return void showNews(+t.dataset.news);
  if (t.dataset.ask) return void ask(t.dataset.ask);
  if (t.dataset.close) return void closePane(t.dataset.close);
  if (!e.target.closest('#settings') && !e.target.closest('#brand') && !$('settings').hidden) closeSettings();
});
$('brand').onclick = (e) => { e.stopPropagation(); $('settings').hidden ? openSettings() : closeSettings(); };
$('settingsDone').onclick = (e) => { e.stopPropagation(); closeSettings(); };
$('setMode').onchange = () => { S.mode = $('setMode').value; saveSettings(); applyMode(); closeSettings(); };
$('setPos').onchange = () => { S.pos = $('setPos').value; saveSettings(); closeSettings(); };
$('chatBtn').onclick = () => ($('chat').classList.contains('show') ? closePane('chat') : openPane('chat'));
$('hide').onclick = () => { closePane('details'); closePane('chat'); layout(true); };
$('slower').onclick = () => { S.speedIdx = Math.max(0, S.speedIdx - 1); updateSpeedUI(); saveSettings(); };
$('faster').onclick = () => { S.speedIdx = Math.min(SPEEDS.length - 1, S.speedIdx + 1); updateSpeedUI(); saveSettings(); };
$('pause').onclick = () => { S.paused = !S.paused; updateSpeedUI(); saveSettings(); };
$('scroll').addEventListener('mouseenter', () => (hover = true));
$('scroll').addEventListener('mouseleave', () => (hover = false));
$('chatForm').onsubmit = (e) => { e.preventDefault(); ask($('q').value); };
$('enableDevice').onclick = async () => {
  $('deviceStatus').textContent = 'starting...';
  const ok = await prepareOnDevice((p) => ($('deviceStatus').textContent = `downloading ${Math.round(p * 100)}%`));
  $('deviceStatus').textContent = ok ? 'on-device AI ready' : 'not available on this device, cloud will be used';
};

// ---------- data refresh ----------
async function refreshPrices() { try { D.coins = await loadCoins(); renderTicker(); } catch (e) { console.warn(e); } }
async function refreshNews() {
  try {
    const [n, a] = await Promise.allSettled([loadNews(), loadArticles()]);
    D.news = [...(n.value || []), ...(a.value || []).slice(0, 4)];
    renderTicker();
  } catch (e) { console.warn(e); }
}
async function refreshStats() { try { D.stats = await loadStats(); renderTicker(); } catch (e) { console.warn(e); } }

(async function init() {
  await loadSettings();
  updateSpeedUI();
  layout();
  requestAnimationFrame(frame);
  await Promise.all([refreshPrices(), refreshNews(), refreshStats()]);
  applyMode();
  if (!S.setupDone) openSettings(); // first run: let the user choose mode and position
  setInterval(refreshPrices, 60 * 1000);
  setInterval(refreshNews, 30 * 60 * 1000);
  setInterval(refreshStats, 5 * 60 * 1000);
})();

// exposed for the unit check script only
window.__rcc = { findUntracked, notTrackedMessage, SITE };
