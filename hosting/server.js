const http = require('http');
const fs = require('fs');
const path = require('path');
const { RuleSet } = require('../projects/ladder_io/ruleset');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

let ruleSet = new RuleSet();

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DEFAULT_FORWARDED_FOR = '66.249.66.1';

const userAgent = process.env.USER_AGENT || DEFAULT_USER_AGENT;
const forwardedFor = process.env.X_FORWARDED_FOR || DEFAULT_FORWARDED_FOR;

const SERVICES = {
  ascend: path.join(ROOT, 'projects', 'ladder_io'),
  chatserver: path.join(ROOT, 'projects', 'chatserver'),
  sandboxels: path.join(ROOT, 'projects', 'sandboxels_mods'),
};

function getHeader(req, name) {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(req.headers)) {
    if (key.toLowerCase() === lower) return val;
  }
  return '';
}

function sendText(res, code, contentType, body) {
  res.writeHead(code, { 'Content-Type': contentType });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

function extractUrl(rawPath, referer) {
  let reqUrl;
  try { reqUrl = decodeURIComponent(rawPath); } catch { reqUrl = rawPath; }
  try { return new URL(reqUrl).toString(); } catch {
    if (referer) {
      try { return new URL(reqUrl, new URL(referer).origin).toString(); } catch {}
    }
    return reqUrl;
  }
}

function fetchRule(domain, urlPath) {
  if (ruleSet.rules.length === 0) return {};
  for (const rule of ruleSet.rules) {
    const domains = [...(rule.domains || [])];
    if (rule.domain) domains.push(rule.domain);
    for (const ruleDomain of domains) {
      if (domain === ruleDomain || domain.endsWith('.' + ruleDomain)) {
        if (rule.paths && rule.paths.length > 0 && !rule.paths.includes(urlPath)) continue;
        return rule;
      }
    }
  }
  return {};
}

function modifyUrl(uri, rule) {
  const urlObj = new URL(uri);
  if (rule.urlMods && rule.urlMods.domain) {
    for (const mod of rule.urlMods.domain) {
      urlObj.host = urlObj.host.replace(new RegExp(mod.match), mod.replace);
    }
  }
  if (rule.urlMods && rule.urlMods.path) {
    for (const mod of rule.urlMods.path) {
      urlObj.pathname = urlObj.pathname.replace(new RegExp(mod.match), mod.replace);
    }
  }
  if (rule.urlMods && rule.urlMods.query) {
    for (const q of rule.urlMods.query) {
      if (!q.value) urlObj.searchParams.delete(q.key);
      else urlObj.searchParams.set(q.key, q.value);
    }
  }
  if (rule.googleCache) {
    return 'https://webcache.googleusercontent.com/search?q=cache:' + urlObj.toString();
  }
  return urlObj.toString();
}

function applyRules(body, rule) {
  if (ruleSet.rules.length === 0) return body;
  if (rule.regexRules) {
    for (const rr of rule.regexRules) {
      body = body.replace(new RegExp(rr.match, 'g'), rr.replace);
    }
  }
  if (rule.injections && rule.injections.length > 0) {
    for (const injection of rule.injections) {
      const tagMatch = injection.position.match(/^([a-zA-Z][a-zA-Z0-9]*)$/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const openTag = '<' + tag;
        const closeTag = '</' + tag + '>';
        const openIdx = body.indexOf(openTag);
        const closeIdx = body.indexOf(closeTag);
        if (openIdx !== -1 && closeIdx !== -1) {
          let insert = '';
          if (injection.replace) insert = injection.replace;
          else { if (injection.prepend) insert += injection.prepend; if (injection.append) insert += injection.append; }
          body = body.slice(0, closeIdx) + insert + body.slice(closeIdx);
        }
        continue;
      }
      const parts = injection.position.split(/\s+/);
      const lastTag = parts[parts.length - 1].replace(/^[.#]/, '');
      const re = new RegExp('<' + lastTag + '([\\s>])', 'gi');
      const match = re.exec(body);
      if (match) {
        let insert = '';
        if (injection.replace) insert = injection.replace;
        else { if (injection.prepend) insert += injection.prepend; if (injection.append) insert += injection.append; }
        body = body.slice(0, match.index + match[0].length) + insert + body.slice(match.index + match[0].length);
      }
    }
  }
  return body;
}

function rewriteHtml(body, urlObj, rule) {
  const host = urlObj.host;
  body = body.replace(/<img\s+([^>]*\s+)?src="\/([^"]*)"/g, '<img $1 src="/https://' + host + '/$2"');
  body = body.replace(/<script\s+([^>]*\s+)?src="\/([^"]*)"/g, '<script $1 src="/https://' + host + '/$2"');
  body = body.replace(/href="\/"/g, 'href="/https://' + host + '/"');
  body = body.replace(/href="\//g, 'href="/https://' + host + '/"');
  body = body.replace(/url\('\/'/g, "url('/https://" + host + "/'");
  body = body.replace(/url\(\//g, 'url(/https://' + host + '/');
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body.replace(new RegExp('href="https://' + escaped + '"', 'g'), 'href="/https://' + host + '/"');
  if (process.env.RULESET) body = applyRules(body, rule);
  return body;
}

async function fetchSite(rawPath, queries, req) {
  let urlQuery = '?';
  for (const [k, v] of Object.entries(queries)) {
    urlQuery += k + '=' + v + '&';
  }
  urlQuery = urlQuery.replace(/&$/, '').replace(/\?$/, '');

  const referer = getHeader(req, 'referer');
  let targetUrl = extractUrl(rawPath, referer);
  if (urlQuery !== '?') targetUrl += urlQuery;

  let parsedUrl;
  try { parsedUrl = new URL(targetUrl); } catch { throw new Error('Invalid URL: ' + targetUrl); }

  const rule = fetchRule(parsedUrl.host, parsedUrl.pathname);
  const modifiedUrl = modifyUrl(targetUrl, rule);

  const headers = {};
  if (rule.headers) {
    headers['User-Agent'] = rule.headers['user-agent'] || userAgent;
    if (rule.headers['x-forwarded-for'] && rule.headers['x-forwarded-for'] !== 'none') headers['X-Forwarded-For'] = rule.headers['x-forwarded-for'];
    else if (!rule.headers['x-forwarded-for']) headers['X-Forwarded-For'] = forwardedFor;
    if (rule.headers.referer && rule.headers.referer !== 'none') headers['Referer'] = rule.headers.referer;
    else if (!rule.headers.referer) headers['Referer'] = parsedUrl.origin;
    if (rule.headers.cookie) headers['Cookie'] = rule.headers.cookie;
  } else {
    headers['User-Agent'] = userAgent;
    headers['X-Forwarded-For'] = forwardedFor;
    headers['Referer'] = parsedUrl.origin;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let resp;
  try {
    resp = await fetch(modifiedUrl, { headers, signal: controller.signal, redirect: 'follow' });
  } catch (err) {
    clearTimeout(timeout);
    throw new Error('Failed to fetch ' + modifiedUrl + ': ' + err.message);
  }
  clearTimeout(timeout);

  const contentType = resp.headers.get('content-type') || 'text/html';
  let body = await resp.text();

  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    try { body = rewriteHtml(body, parsedUrl, rule); } catch {}
  }

  const responseHeaders = {};
  resp.headers.forEach((value, key) => { responseHeaders[key] = value; });

  return {
    body, contentType,
    csp: rule.headers ? rule.headers['content-security-policy'] || '' : '',
    requestHeaders: Object.entries(headers).map(([key, value]) => ({ key, value })),
    responseHeaders: Object.entries(responseHeaders).map(([key, value]) => ({ key, value })),
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = require('url').parse(req.url, true);
  const pathname = parsed.pathname;
  const queries = parsed.query;

  if (pathname === '/favicon.ico') {
    const faviconPaths = Object.values(SERVICES).map(dir => path.join(dir, 'favicon.ico'));
    for (const fp of faviconPaths) {
      if (fs.existsSync(fp)) return sendFile(res, fp);
    }
    res.writeHead(404);
    return res.end();
  }

  for (const [name, dir] of Object.entries(SERVICES)) {
    const prefix = '/' + name;
    if (pathname === prefix || pathname === prefix + '/') {
      const indexPath = path.join(dir, 'index.html');
      if (fs.existsSync(indexPath)) return sendFile(res, indexPath);
    }
    if (pathname.startsWith(prefix + '/')) {
      const relativePath = pathname.slice(prefix.length + 1);
      const filePath = path.join(dir, relativePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return sendFile(res, filePath);
      }
    }
  }

  if (pathname.startsWith('/ascend/')) {
    const rawPath = pathname.slice(8);
    try {
      const result = await fetchSite(rawPath, queries, req);
      if (rawPath && !rawPath.startsWith('/')) {
        res.writeHead(200, { 'Content-Type': result.contentType || 'text/html', 'Content-Security-Policy': result.csp || '' });
        return res.end(result.body);
      }
    } catch (err) {
      console.error('ERROR:', err.message);
      return sendText(res, 500, 'text/plain', err.message);
    }
  }

  if (pathname === '/' || pathname === '') {
    return sendText(res, 200, 'text/html', `<!DOCTYPE html>
<html lang=""><head><meta charset="utf-8"><title>Services</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f5;color:#333;display:flex;justify-content:center;padding-top:4rem}
.card{background:#fff;padding:2rem 3rem;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{margin-bottom:1rem}a{color:#e94560;text-decoration:none}a:hover{text-decoration:underline}
ul{list-style:none;padding:0}li{margin:.5rem 0;font-size:1.1rem}</style></head>
<body><div class="card"><h1>Services</h1><ul>
<li><a href="/ascend/">Ascend</a> — Paywall proxy</li>
<li><a href="/chatserver/">Chat Server</a></li>
<li><a href="/sandboxels/">Sandboxels Mods</a></li>
</ul></div></body></html>`);
  }

  res.writeHead(404);
  res.end('Not found');
});

async function startServer() {
  if (process.env.RULESET) {
    try {
      ruleSet = await RuleSet.load(process.env.RULESET);
      console.log('Rules loaded: ' + ruleSet.count() + ' rules for ' + ruleSet.domainCount() + ' domains');
    } catch (err) {
      console.error('Failed to load ruleset:', err.message);
    }
  }

  server.listen(PORT, () => {
    console.log('Hosting server running at http://localhost:' + PORT);
  });
}

startServer();
