const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { RuleSet } = require('./ruleset');

const PORT = process.env.PORT || 8080;
const LOG_URLS = process.env.LOG_URLS === 'true';
const LOG_REQUESTS = process.env.NOLOGS !== 'true';
const DISABLE_FORM = process.env.DISABLE_FORM === 'true';
const EXPOSE_RULESET = process.env.EXPOSE_RULESET !== 'false';
const DEFAULT_TIMEOUT = parseInt(process.env.HTTP_TIMEOUT || '15', 10) * 1000;

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DEFAULT_FORWARDED_FOR = '66.249.66.1';

const userAgent = process.env.USER_AGENT || DEFAULT_USER_AGENT;
const forwardedFor = process.env.X_FORWARDED_FOR || DEFAULT_FORWARDED_FOR;

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

let ruleSet = RuleSet.fromEnv();

let allowedDomains = [];
if (process.env.ALLOWED_DOMAINS) {
  allowedDomains = process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim()).filter(Boolean);
}
let authUser = null;
let authPass = null;
const userpass = process.env.USERPASS;
if (userpass) {
  const parts = userpass.split(':');
  authUser = parts[0];
  authPass = parts.slice(1).join(':');
}

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

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
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
  try {
    reqUrl = decodeURIComponent(rawPath);
  } catch {
    reqUrl = rawPath;
  }
  try {
    const parsed = new URL(reqUrl);
    return parsed.toString();
  } catch {
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return new URL(reqUrl, refererUrl.origin).toString();
      } catch { /* fall through */ }
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
  try { parsedUrl = new URL(targetUrl); }
  catch { throw new Error('Invalid URL: ' + targetUrl); }

  if (allowedDomains.length > 0 && !allowedDomains.some(d => parsedUrl.host.includes(d))) {
    throw new Error('Domain not allowed. ' + parsedUrl.host);
  }

  if (LOG_URLS) console.log(targetUrl);

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
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
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

  const responseHeaders = {};
  resp.headers.forEach((value, key) => { responseHeaders[key] = value; });
  if (rule.headers && rule.headers['content-security-policy']) {
    responseHeaders['content-security-policy'] = rule.headers['content-security-policy'];
  }

  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    try { body = rewriteHtml(body, parsedUrl, rule); } catch { /* ignore */ }
  }

  return {
    body, contentType,
    csp: rule.headers ? rule.headers['content-security-policy'] || '' : '',
    requestHeaders: Object.entries(headers).map(([key, value]) => ({ key, value })),
    responseHeaders: Object.entries(responseHeaders).map(([key, value]) => ({ key, value })),
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const queries = parsed.query;

  if (LOG_REQUESTS) console.log(req.method + ' ' + pathname);

  if (authUser) {
    const authHeader = getHeader(req, 'authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Ladder"', 'Content-Type': 'text/plain' });
      return res.end('Access denied');
    }
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (user !== authUser || pass !== authPass) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Ladder"', 'Content-Type': 'text/plain' });
      return res.end('Access denied');
    }
  }

  if (pathname === '/favicon.ico') return sendFile(res, path.join(__dirname, 'favicon.ico'));
  if (pathname === '/') {
    if (DISABLE_FORM) return sendText(res, 404, 'text/html', 'Form Disabled');
    const customFormPath = process.env.FORM_PATH;
    if (customFormPath) {
      try { return sendText(res, 200, 'text/html', fs.readFileSync(customFormPath, 'utf8')); }
      catch (err) { console.error('ERROR: unable to load custom form:', err.message); }
    }
    return sendFile(res, path.join(__dirname, 'index.html'));
  }

  const staticFile = path.join(__dirname, pathname);
  if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) return sendFile(res, staticFile);

  if (pathname === '/ruleset') {
    if (!EXPOSE_RULESET) return sendText(res, 403, 'text/plain', 'Rules Disabled');
    return sendText(res, 200, 'text/yaml', ruleSet.toYaml());
  }

  if (pathname.startsWith('/api/')) {
    try {
      const result = await fetchSite(pathname.slice(5), queries, req);
      return sendJson(res, 200, { version: '1.0.0', body: result.body, request: { headers: result.requestHeaders }, response: { headers: result.responseHeaders } });
    } catch (err) { console.error('ERROR:', err.message); return sendText(res, 500, 'text/plain', err.message); }
  }

  if (pathname.startsWith('/raw/')) {
    try {
      const result = await fetchSite(pathname.slice(5), queries, req);
      return sendText(res, 200, result.contentType || 'text/html', result.body);
    } catch (err) { console.error('ERROR:', err.message); return sendText(res, 500, 'text/plain', err.message); }
  }

  try {
    const result = await fetchSite(pathname.slice(1), queries, req);
    res.writeHead(200, { 'Content-Type': result.contentType || 'text/html', 'Content-Security-Policy': result.csp || '' });
    return res.end(result.body);
  } catch (err) { console.error('ERROR:', err.message); return sendText(res, 500, 'text/plain', err.message); }
});

async function startServer() {
  if (process.env.RULESET) {
    try {
      ruleSet = await RuleSet.load(process.env.RULESET);
    } catch (err) {
      console.error('Failed to load ruleset:', err.message);
    }
  }

  if (process.env.ALLOWED_DOMAINS_RULESET === 'true') {
    allowedDomains = [...allowedDomains, ...ruleSet.domains()];
  }

  server.listen(PORT, () => {
    console.log('Ladder proxy running at http://localhost:' + PORT);
    console.log('Rules loaded: ' + ruleSet.count() + ' rules for ' + ruleSet.domainCount() + ' domains');
  });
}

startServer();
