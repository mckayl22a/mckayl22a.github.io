const http = require('http');
require('fs');
require('path');
const { RuleSet } = require('../projects/ladder_io/ruleset');

const PORT = process.env.PORT || 8080;

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DEFAULT_FORWARDED_FOR = '66.249.66.1';

const userAgent = process.env.USER_AGENT || DEFAULT_USER_AGENT;
const forwardedFor = process.env.X_FORWARDED_FOR || DEFAULT_FORWARDED_FOR;

let ruleSet = new RuleSet();

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
        const closeTag = '</' + tag + '>';
        const closeIdx = body.indexOf(closeTag);
        if (closeIdx !== -1) {
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', rules: ruleSet.count(), domains: ruleSet.domainCount() });
  }

  if (pathname.startsWith('/ascend/proxy/')) {
    const rawPath = pathname.slice(13);
    try {
      const result = await fetchSite(rawPath, queries, req);
      return sendText(res, 200, result.contentType || 'text/html', result.body);
    } catch (err) {
      console.error('ERROR:', err.message);
      return sendText(res, 500, 'text/plain', err.message);
    }
  }

  if (pathname.startsWith('/ascend/api/')) {
    const rawPath = pathname.slice(11);
    try {
      const result = await fetchSite(rawPath, queries, req);
      return sendJson(res, 200, { version: '1.0.0', body: result.body, request: { headers: result.requestHeaders }, response: { headers: result.responseHeaders } });
    } catch (err) {
      console.error('ERROR:', err.message);
      return sendText(res, 500, 'text/plain', err.message);
    }
  }

  if (pathname === '/ascend/ruleset') {
    return sendText(res, 200, 'text/yaml', ruleSet.toYaml());
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
    console.log('Ascend backend running at http://localhost:' + PORT);
  });
}

startServer();
