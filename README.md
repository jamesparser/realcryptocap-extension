# RealCryptoCap (Chrome extension)

A thin bar for any web page: a scrolling ticker of the **top 50 cryptocurrencies** and live **headlines**, plus an **AI chat** about coins, the market and the news. Built for the #BuildHybridAI 2026 hackathon with **Firebase AI Logic hybrid inference**.

Data comes from the free endpoints of [realcryptocap.com](https://realcryptocap.com): prices ranked by *real* market cap (stablecoins, wrapped receipts and tokenized assets are excluded), the news feed, editorial articles, fear and greed, and the headline market numbers shown on the home page.

## How Firebase AI Logic is used

Every AI feature goes through one hybrid model in `src/ai.js`:

```js
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
const result = await model.generateContent(prompt);
result.response.inferenceSource; // "ON_DEVICE" or "IN_CLOUD"
```

- **On-device first.** When Chrome's built-in Gemini Nano is available, headline summaries, coin summaries and chat answers run locally: private, free and offline-capable.
- **Cloud fallback.** If the local model is missing, still downloading or unsupported, the same call transparently runs on cloud Gemini.
- **Visible to the user.** Each answer carries a small badge, `on-device` or `cloud`, read from `inferenceSource`.
- **App Check** is initialised in `src/ai.js`. A Chrome extension cannot load reCAPTCHA (Manifest V3 forbids remote code), so this build uses an App Check debug token.
- **Single-turn limit handled.** On-device inference is single-turn text only, so the extension keeps the conversation itself, fetches the relevant live data first and packs it into each prompt. This also keeps answers grounded in real numbers.

## Features

- Scrolling ticker with a speed control (0.5x to 3x), pause, and hover-to-pause.
- Header or footer placement. The page is pushed aside so nothing is covered.
- Modes: ticker + AI chat, ticker only, or AI chat only.
- Click a coin or a headline to unfold a details box with an AI summary and a link to the full page.
- AI chat that opens from the same bar.
- Top-50 only on the free tier. Asking about a coin outside the top 50 returns a clear message with a link to the full top-500 list.
- Opt-in: nothing runs until you click the toolbar icon on a page (`activeTab` permission only).

## Build and run

Requires Node 18+.

```bash
npm install
cp .env.example .env   # fill in your Firebase web app config and App Check debug token
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and choose the `dist/` folder. Click the RealCryptoCap toolbar icon on any web page.

### Firebase setup

1. In the Firebase console, open **Build > AI Logic**, click **Get started** and choose the **Gemini Developer API** (free tier).
2. Register a web app and copy its config into `.env`.
3. In **App Check**, open the web app and **Manage debug tokens**. Create a token, add it to `.env` as `APPCHECK_DEBUG_TOKEN`, and rebuild.

### On-device model

On-device inference needs desktop Chrome 139 or newer. If the model is not on the device yet, open the RealCryptoCap settings (click the RealCryptoCap logo on the bar) and press **Enable on-device AI** to start the one-time download. Until it finishes, answers use the cloud model.

## Project layout

```
manifest.json        Manifest V3, permissions: activeTab, scripting, storage
src/background.js    Toolbar icon click: runs the content script on the current tab
src/content.js       Injects the bar as an extension iframe and pushes the page aside
src/ui.html|css|js   The bar: ticker, details box, chat, settings
src/ai.js            Firebase AI Logic hybrid inference, prompts, App Check
src/guard.js         Out-of-top-50 detection and message
src/data.js          RealCryptoCap free-endpoint client
build.mjs            esbuild bundling, reads .env
test-guard.mjs       node test-guard.mjs
```

## Privacy

The extension reads nothing from the pages you visit. It calls realcryptocap.com for market data, and sends your chat questions plus a small snapshot of that market data to Gemini through Firebase AI Logic (on-device when possible).

Market data is informational only and not financial advice.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Store edition

`STORE=1 OUT_DIR=dist-store node build.mjs` builds the Chrome Web Store edition. It swaps `src/ai.js` (Firebase AI Logic hybrid inference, used for the hackathon build) for `src/ai-rcc.js`, which asks the RealCryptoCap assistant at realcryptocap.com instead, so no keys or tokens are shipped in the extension. Coin and headline summaries in that edition are built from the data on screen and never use up the free daily AI questions. See `PRIVACY.md`.
