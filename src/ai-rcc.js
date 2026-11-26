// Store edition AI: asks the RealCryptoCap assistant (the same AI as the footer chat on realcryptocap.com).
// No keys or tokens live in this extension. The server enforces the daily limit for the free tier.
import { fmtPrice, fmtBig } from './data.js';
import { findUntracked, notTrackedMessage } from './guard.js';

export { findUntracked, notTrackedMessage };
export const SUMMARY_LABEL = 'Summary';
export const HAS_DEVICE = false;
export const prepareOnDevice = async () => false;

const ENDPOINT = 'https://realcryptocap.com/api/chat';
const FREE_LIMIT = 5;
const dayKey = () => `rcc-ai-${new Date().toISOString().slice(0, 10)}`;
const used = () => { try { return Number(localStorage.getItem(dayKey())) || 0; } catch { return 0; } };
const bump = () => { try { localStorage.setItem(dayKey(), String(used() + 1)); } catch { /* ignore */ } };
export const questionsLeft = () => Math.max(0, FREE_LIMIT - used());

// Summaries are built from the data on screen so they never use up the daily AI questions.
export async function summarizeCoin(c, ctx) {
  const dir = (c.change24h || 0) >= 0 ? 'up' : 'down';
  const fg = ctx.stats?.fearGreed != null ? ` The market's Fear & Greed index reads ${ctx.stats.fearGreed} (${ctx.stats.fearGreedLabel}).` : '';
  return {
    text: `${c.name} is trading at $${fmtPrice(c.price)}, ${dir} ${Math.abs(c.change24h || 0).toFixed(2)}% over 24 hours, with a day range of $${fmtPrice(c.low)} to $${fmtPrice(c.high)}. ` +
      `It ranks #${c.rank} by real market cap ($${fmtBig(c.marketCap)}).${fg}`,
    source: '',
  };
}

export async function summarizeNews(item) {
  const raw = String(item.description || '').replace(/\s+/g, ' ').trim();
  const sentences = raw.match(/[^.!?]+[.!?]+/g) || [];
  const text = (sentences.slice(0, 2).join(' ').trim() || raw || item.title).slice(0, 320);
  return { text, source: '' };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mentioned(question, coins) {
  const q = question.toLowerCase();
  return coins.filter((c) => new RegExp(`\\b(${esc(c.symbol.toLowerCase())}|${esc(c.name.toLowerCase())})\\b`).test(q));
}

export async function chat(question, history, ctx) {
  const bad = findUntracked(question, ctx.coins);
  if (bad) return { text: notTrackedMessage(bad), source: 'guard' };
  if (used() >= FREE_LIMIT) {
    return { text: `You have used today's ${FREE_LIMIT} free AI questions. They reset every day. The ticker, prices and headlines keep working.`, source: 'guard', left: 0, limit: FREE_LIMIT };
  }
  const lines = (arr) => arr.map((c) => `${c.symbol} ${c.name}: $${fmtPrice(c.price)}, 24h ${c.change24h?.toFixed(2)}%, mcap $${fmtBig(c.marketCap)}, vol $${fmtBig(c.volume)}, range $${fmtPrice(c.low)}-$${fmtPrice(c.high)}`).join('\n');
  const s = ctx.stats || {};
  const statLine = [
    s.fearGreed != null && `Fear and greed ${s.fearGreed} (${s.fearGreedLabel})`,
    s.realCap && `Real market cap $${fmtBig(s.realCap)} vs reported $${fmtBig(s.reportedCap)}`,
    s.longPct && `Longs ${s.longPct.toFixed(1)}% / shorts ${s.shortPct.toFixed(1)}%`,
  ].filter(Boolean).join('. ');
  const focus = mentioned(question, ctx.coins).slice(0, 4);
  const context =
    `BROWSER EXTENSION CONTEXT (free tier covers the top 50 coins by real market cap). Answer briefly from this live data.\n` +
    (focus.length ? `Coins asked about:\n${lines(focus)}\n` : '') +
    `Top 10 by real market cap:\n${lines(ctx.coins.slice(0, 10))}\nMarket: ${statLine || 'n/a'}\nHeadlines:\n` +
    ctx.news.slice(0, 6).map((n) => `- ${n.title}`).join('\n');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: question,
      history: history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'ai', text: m.text })),
      pro: false, tier: 'free', authenticated: false, context: context.slice(0, 4000),
      language: 'en', languageName: 'English', currency: 'USD',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) return { text: data.reply || `You have used today's ${FREE_LIMIT} free AI questions.`, source: 'guard', left: 0, limit: FREE_LIMIT };
  if (!res.ok || !data.reply) throw new Error(data.error || `HTTP ${res.status}`);
  bump();
  return { text: String(data.reply).trim(), source: 'RealCryptoCap AI', left: questionsLeft(), limit: FREE_LIMIT };
}
