// Post-export step: inject SEO + social-preview meta into the exported
// dist/index.html. Expo's single-page web export doesn't let +html.tsx set a
// custom <title>/<meta>, and link-preview crawlers (iMessage, WhatsApp, Slack,
// Twitter/X, Facebook) don't run JS — so the tags must be in the static HTML.
// Chained after `expo export` in netlify.toml, so every build (Netlify or
// local) gets them. Idempotent.
const fs = require('fs');

const FILE = 'dist/index.html';
const TITLE = 'Pocket — Your money, finally explained';
const DESCRIPTION =
  'Pocket turns your spending into a clear dashboard. Log expenses by typing or voice, snap a statement, track Splitwise, set budgets and goals, and get AI insights — across 12 currencies.';
const URL = 'https://pocketme.netlify.app';
const OG_IMAGE = `${URL}/og.png`;

const esc = (s) => s.replace(/"/g, '&quot;');

const META = `
    <meta name="description" content="${esc(DESCRIPTION)}" />
    <meta name="theme-color" content="#6366F1" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(TITLE)}" />
    <meta property="og:description" content="${esc(DESCRIPTION)}" />
    <meta property="og:url" content="${URL}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:site_name" content="Pocket" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(TITLE)}" />
    <meta name="twitter:description" content="${esc(DESCRIPTION)}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
`;

let html = fs.readFileSync(FILE, 'utf8');

// Set the real title.
html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(TITLE)}</title>`);

// Inject the meta block once, right before </head>.
if (!html.includes('og:title')) {
  html = html.replace(/<\/head>/i, `${META}  </head>`);
}

fs.writeFileSync(FILE, html);
console.log('inject-meta: title + social meta written to', FILE);
