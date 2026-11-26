import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';

// Config comes from environment variables or a local .env file (never committed).
const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY || 'MISSING',
  authDomain: env.FIREBASE_AUTH_DOMAIN || '',
  projectId: env.FIREBASE_PROJECT_ID || 'MISSING',
  storageBucket: env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.FIREBASE_APP_ID || 'MISSING',
};
if (firebaseConfig.apiKey === 'MISSING') console.warn('Warning: FIREBASE_* values are not set. Copy .env.example to .env and fill them in.');

const STORE = env.STORE === '1';
const OUT = env.OUT_DIR || (STORE ? 'dist-store' : 'dist');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// Store edition swaps the AI module for the RealCryptoCap server version (no Firebase, no tokens).
const storePlugin = { name: 'store-ai', setup(b) { b.onResolve({ filter: /\/ai\.js$/ }, (a) => (STORE ? { path: process.cwd() + '/src/ai-rcc.js' } : null)); } };

const common = { bundle: true, minify: false, sourcemap: false, target: 'chrome120', logLevel: 'info' };
await build({ ...common, entryPoints: ['src/background.js'], outfile: OUT + '/background.js', format: 'esm' });
await build({ ...common, entryPoints: ['src/content.js'], outfile: OUT + '/content.js', format: 'iife' });
await build({
  ...common, entryPoints: ['src/ui.js'], outfile: OUT + '/ui.js', format: 'iife', plugins: [storePlugin],
  define: {
    FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
    APPCHECK_DEBUG_TOKEN: JSON.stringify(env.APPCHECK_DEBUG_TOKEN || ''),
  },
});
cpSync('src/ui.html', OUT + '/ui.html');
cpSync('src/ui.css', OUT + '/ui.css');
cpSync('manifest.json', OUT + '/manifest.json');
cpSync('icons', OUT + '/icons', { recursive: true });
console.log('Built ' + OUT + '/. Load it at chrome://extensions with Developer mode, "Load unpacked".');
