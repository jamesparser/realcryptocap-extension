// Firebase AI Logic hybrid inference: on-device (Gemini Nano via Chrome's Prompt API) first,
// automatic fallback to cloud Gemini. Every call reports which engine answered.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { fmtPrice, fmtBig } from './data.js';

/* global FIREBASE_CONFIG, APPCHECK_DEBUG_TOKEN */
const app = initializeApp(FIREBASE_CONFIG);

// App Check: a Chrome extension cannot load reCAPTCHA (remote code is not allowed in Manifest V3),
// so this build uses an App Check debug token registered in the Firebase console.
if (APPCHECK_DEBUG_TOKEN) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = APPCHECK_DEBUG_TOKEN;
}
initializeAppCheck(app, {
  provider: new CustomProvider({ getToken: async () => { throw new Error('App Check debug token only'); } }),
  isTokenAutoRefreshEnabled: true,
});

const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });

export const SUMMARY_LABEL = 'AI summary';
export const HAS_DEVICE = true;

export async function prepareOnDevice(onProgress) {
  // Must run after a user gesture. Starts the Gemini Nano download if it is not on the device yet.
  try { await model.initializeDeviceModel(onProgress); return true; } catch (e) { console.warn('on-device init', e); return false; }
}

async function run(prompt) {
  const result = await model.generateContent(prompt);
  return { text: result.response.text().trim(), source: result.response.inferenceSource === 'ON_DEVICE' ? 'on-device' : 'cloud' };
}

export async function summarizeNews(item) {
  return run(
    `You are a concise crypto market assistant. Summarize this headline for a trader in exactly 2 short sentences. ` +
    `Use only the facts below, add nothing else.\nTitle: ${item.title}\nDetails: ${item.description || '(none)'}`
  );
}

export async function summarizeCoin(c, ctx) {
  return run(
    `You are a concise crypto market assistant. In exactly 2 short sentences, describe how ${c.name} (${c.symbol}) is doing. ` +
    `Use only these facts. Do not predict prices or give financial advice.\n` +
    `Price $${fmtPrice(c.price)}, 24h change ${c.change24h?.toFixed(2)}%, 24h range $${fmtPrice(c.low)} to $${fmtPrice(c.high)}, ` +
    `market cap $${fmtBig(c.marketCap)}, rank ${c.rank}.` +
    (ctx.stats?.fearGreed != null ? ` Market fear and greed index: ${ctx.stats.fearGreed} (${ctx.stats.fearGreedLabel}).` : '')
  );
}

export { findUntracked, notTrackedMessage } from './guard.js';
import { findUntracked, notTrackedMessage } from './guard.js';

// ---- Chat ------------------------------------------------------------------------------------
function mentioned(question, coins) {
  const q = question.toLowerCase();
  return coins.filter((c) => new RegExp(`\\b(${esc(c.symbol.toLowerCase())}|${esc(c.name.toLowerCase())})\\b`).test(q));
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function chat(question, history, ctx) {
  const bad = findUntracked(question, ctx.coins);
  if (bad) return { text: notTrackedMessage(bad), source: 'guard' };

  const focus = mentioned(question, ctx.coins).slice(0, 4);
  const top = ctx.coins.slice(0, 10);
  const lines = (arr) => arr.map((c) => `${c.symbol} ${c.name}: $${fmtPrice(c.price)}, 24h ${c.change24h?.toFixed(2)}%, mcap $${fmtBig(c.marketCap)}, vol $${fmtBig(c.volume)}, range $${fmtPrice(c.low)}-$${fmtPrice(c.high)}`).join('\n');
  const s = ctx.stats || {};
  const statLine = [
    s.fearGreed != null && `Fear and greed ${s.fearGreed} (${s.fearGreedLabel})`,
    s.realCap && `Real market cap $${fmtBig(s.realCap)} vs reported $${fmtBig(s.reportedCap)}`,
    s.longPct && `Longs ${s.longPct.toFixed(1)}% / shorts ${s.shortPct.toFixed(1)}%`,
  ].filter(Boolean).join('. ');
  const heads = ctx.news.slice(0, 6).map((n) => `- ${n.title}`).join('\n');
  const convo = history.slice(-6).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

  const prompt =
`You are the RealCryptoCap assistant. Answer using ONLY the DATA below. Be brief (max 4 sentences). No financial advice, no price predictions.
If the user asks about a specific coin that is not in DATA, reply exactly: NOT_TRACKED:<coin name>

DATA
${focus.length ? 'Coins asked about:\n' + lines(focus) + '\n' : ''}Top 10 by real market cap:
${lines(top)}
Market: ${statLine || 'n/a'}
Headlines:
${heads}

${convo ? 'Conversation so far:\n' + convo + '\n' : ''}User: ${question}
Assistant:`;

  const out = await run(prompt);
  const nt = out.text.match(/NOT_TRACKED:\s*(.+)/i);
  if (nt) return { text: notTrackedMessage(nt[1].trim().replace(/[.\s]+$/, '')), source: 'guard' };
  return out;
}
