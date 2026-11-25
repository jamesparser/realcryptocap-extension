import { findUntracked, notTrackedMessage } from './src/guard.js';
const coins = ['BTC:Bitcoin:bitcoin','ETH:Ethereum:ethereum','SOL:Solana:solana','XRP:XRP:ripple','BNB:BNB:binancecoin'].map(s=>{const [symbol,name,id]=s.split(':');return {symbol,name,id}});
const cases = [
  ['Analyze BTC', null],
  ['why is SOL up?', null],
  ['what is the price of PEPE?', 'PEPE'],
  ['tell me about the shiba inu coin', 'shiba inu'],
  ['is the market fearful?', null],
  ['how are ETF flows and the FED?', null],
  ['compare Bitcoin and Solana', null],
  ['what about dogwifhat token', 'dogwifhat'],
  ['Analyze HYPE', 'HYPE'],
];
let fail = 0;
for (const [q, want] of cases) { const got = findUntracked(q, coins); const ok = got === want; if(!ok) fail++; console.log(ok?'ok  ':'FAIL', JSON.stringify(q), '->', got); }
console.log('\nMessage:', notTrackedMessage('PEPE'));
process.exit(fail ? 1 : 0);
