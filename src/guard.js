import { TOP500_URL } from './data.js';

// ---- Out-of-top-50 guard -------------------------------------------------------------------
const STOP = new Set(['AI','USD','USDT','USDC','ETF','ETFS','DEFI','NFT','NFTS','FED','SEC','CPI','GDP','US','UK','EU','OK','PM','AM','ATH','ATL','ROI','DCA','RSI','MACD','API','UTC','CEO','FOMO','FUD','TLDR','VS','AND','THE','WHY','HOW','WHAT','IS','ARE','BTC','ETH','TVL','APY','APR','DEX','CEX','LONG','SHORT','FAQ','PRO']);

export function notTrackedMessage(name) {
  return `${name} isn't tracked on the free tier of this extension, which covers the top 50 coins by real market cap. ` +
         `See up-to-date price data for the top 500 cryptos at ${TOP500_URL}`;
}

export function findUntracked(question, coins) {
  const known = new Set();
  coins.forEach((c) => { known.add(c.symbol.toLowerCase()); known.add(c.name.toLowerCase()); known.add(c.id.toLowerCase()); });
  const words = question.match(/[A-Za-z0-9][A-Za-z0-9.\-]{1,19}/g) || [];
  // 1) an ALL-CAPS ticker-like word that is not a known coin or common finance term
  for (const w of words) {
    if (/^[A-Z0-9]{2,6}$/.test(w) && !/^\d+$/.test(w) && !STOP.has(w) && !known.has(w.toLowerCase())) return w;
  }
  // 2) "<name> coin" or "<name> token" (one or two words)
  const m = question.match(/\b((?:[A-Za-z][A-Za-z0-9\-]{1,19}\s+)?[A-Za-z][A-Za-z0-9\-]{1,19})\s+(coin|token)s?\b/i);
  if (m) {
    const name = m[1].replace(/^(the|this|that|a|an|any|my|which|what|each|every|other|new|about|tell|me|on|of|is|are)\s+/i, '').trim();
    if (name && !/^(the|this|that|any|a|my|which|what|each|every|other|new|crypto|stable|which|me|about)$/i.test(name) && !known.has(name.toLowerCase())) return name;
  }
  return null;
}

