// Universium service worker (scope: /service/)
importScripts('/uv/uv.bundle.js');
importScripts('/uv/uv.config.js');
importScripts('/uv/uv.sw.js');

const sw = new UVServiceWorker();

// Take over immediately after an update instead of waiting for every tab to close.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── Ad / tracker blocking ──────────────────────────────────────────────
const AD_HOSTS = [
  'googlesyndication.com', 'doubleclick.net', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'connect.facebook.net', 'amazon-adsystem.com', 'assoc-amazon.com',
  'ads.twitter.com', 'static.ads-twitter.com', 'adnxs.com', 'adsafeprotected.com',
  'adsrvr.org', 'advertising.com', 'adform.net', 'adf.ly', 'outbrain.com',
  'taboola.com', 'revcontent.com', 'moatads.com', 'scorecardresearch.com',
  'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
  'casalemedia.com', 'contextweb.com', 'media.net', 'hotjar.com', 'fullstory.com',
  'mouseflow.com', 'segment.com', 'mixpanel.com', 'heap.io', 'pardot.com',
  'marketo.net', 'adroll.com', 'quantserve.com', 'zedo.com', 'bidswitch.net',
  'sharethrough.com', 'spotxchange.com', 'lijit.com', 'sovrn.com', '33across.com',
];

function isAd(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AD_HOSTS.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

// The page tells us the setting. Persist it in Cache Storage because the
// browser kills idle service workers, which would reset an in-memory flag.
const SETTINGS_CACHE = 'uos-settings';
const ADBLOCK_KEY = '/__uos/adblock';
let adblock = null;

async function adblockEnabled() {
  if (adblock !== null) return adblock;
  try {
    const r = await (await caches.open(SETTINGS_CACHE)).match(ADBLOCK_KEY);
    adblock = r ? (await r.text()) === '1' : true;
  } catch { adblock = true; }
  return adblock;
}

self.addEventListener('message', e => {
  if (e.data?.type !== 'SET_ADBLOCK') return;
  adblock = !!e.data.value;
  e.waitUntil(caches.open(SETTINGS_CACHE).then(c => c.put(ADBLOCK_KEY, new Response(adblock ? '1' : '0'))));
});

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    if (!sw.route(event)) return fetch(event.request);
    try {
      const url = event.request.url;
      const target = __uv$config.decodeUrl(url.slice(url.indexOf(__uv$config.prefix) + __uv$config.prefix.length));
      if (isAd(target) && await adblockEnabled()) return new Response('', { status: 204 });
    } catch {}
    return sw.fetch(event);
  })());
});
