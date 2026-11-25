// Free RealCryptoCap endpoints (open CORS, cached server-side). Top 50 only.
const BASE = 'https://realcryptocap.com';
export const SITE = BASE;
export const TOP500_URL = `${BASE}/top-500`;

async function getJSON(path) {
  const r = await fetch(BASE + path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export async function loadCoins() {
  const j = await getJSON('/api/cg?topCoins=1&limit=50');
  return (j.coins || []).slice(0, 50).map((c) => ({
    id: c.id,
    symbol: String(c.symbol || '').toUpperCase(),
    name: c.name,
    rank: c.market_cap_rank,
    price: c.current_price,
    change24h: c.price_change_percentage_24h,
    marketCap: c.market_cap,
    volume: c.total_volume,
    high: c.high_24h,
    low: c.low_24h,
    ath: c.ath,
    athChange: c.ath_change_percentage,
    url: `${BASE}/coin/${c.id}`,
  }));
}

export async function loadNews() {
  const j = await getJSON('/api/news');
  return (j.items || []).slice(0, 20).map((n) => ({
    id: n.id || n.url,
    title: n.title,
    url: n.url,
    source: n.source,
    date: n.date,
    description: n.description || '',
  }));
}

export async function loadArticles() {
  const j = await getJSON('/articles.json');
  return (Array.isArray(j) ? j : []).slice(0, 8).map((a) => ({
    id: 'art:' + a.slug,
    title: a.title,
    url: `${BASE}/articles/${a.slug}`,
    source: 'RealCryptoCap',
    date: a.date,
    description: a.excerpt || '',
  }));
}

// Headline numbers that the free home page already shows, computed the same way the home page does:
// real cap = sum of market caps of the real top-500 list, BTC dominance = BTC / real cap,
// longs vs shorts = latest account ratio when available, otherwise ratio / (1 + ratio).
export async function loadStats() {
  const [fg, rm, dv, all] = await Promise.allSettled([
    getJSON('/api/market-data?section=fearGreed'),
    getJSON('/api/market-data?section=reportedMarket'),
    getJSON('/api/market-data?section=derivativesPulse'),
    getJSON('/api/cg?topCoins=1&limit=500'),
  ]);
  const s = {};
  if (fg.status === 'fulfilled' && fg.value.latest) {
    s.fearGreed = fg.value.latest.value;
    s.fearGreedLabel = fg.value.latest.classification;
  }
  if (rm.status === 'fulfilled') {
    s.reportedCap = rm.value.reportedMarketCapUsd;
    s.excludedCap = rm.value.excludedMarketCapUsd;
  }
  if (all.status === 'fulfilled') {
    // Only the aggregate is used here; individual coins beyond the top 50 are never displayed.
    const list = all.value.coins || [];
    const sum = list.reduce((a, c) => a + (c.market_cap || 0), 0);
    const btc = list.find((c) => c.id === 'bitcoin');
    if (sum > 0) {
      s.realCap = sum;
      if (btc && btc.market_cap) s.btcDominance = (btc.market_cap / sum) * 100;
    }
  }
  if (dv.status === 'fulfilled') {
    const series = Array.isArray(dv.value.longShort24h) ? dv.value.longShort24h : [];
    const latest = series.length ? series.reduce((a, b) => (b.ts > a.ts ? b : a)) : null;
    if (latest && Number.isFinite(latest.longAccountPct) && Number.isFinite(latest.shortAccountPct)) {
      s.longPct = latest.longAccountPct * 100;
      s.shortPct = latest.shortAccountPct * 100;
    } else if (dv.value.longShortRatio > 0) {
      const r = dv.value.longShortRatio;
      s.longPct = (r / (1 + r)) * 100;
      s.shortPct = 100 - s.longPct;
    }
  }
  return s;
}

export function fmtPrice(n) {
  if (n == null) return '-';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(3);
}
export function fmtBig(n) {
  if (n == null) return '-';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  return n.toFixed(0);
}
