import os
import re
from urllib.parse import urlparse, urlencode, quote

import yaml
import requests
from flask import Flask, request, Response, send_from_directory, abort

app = Flask(__name__, static_folder=None)

ROOT = os.path.join(os.path.dirname(__file__), '..')

PORT = int(os.environ.get('PORT', 8080))
USER_AGENT = os.environ.get('USER_AGENT', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
X_FORWARDED_FOR = os.environ.get('X_FORWARDED_FOR', '66.249.66.1')

rule_set = []

STATIC_SERVICES = {
    'ascend': os.path.join(ROOT, 'projects', 'ladder_io'),
    'chatserver': os.path.join(ROOT, 'projects', 'chatserver'),
    'sandboxels': os.path.join(ROOT, 'projects', 'sandboxels_mods'),
    'static': os.path.join(ROOT, 'static'),
}


def load_ruleset(path):
    global rule_set
    if not path:
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            parsed = yaml.safe_load(f)
        rule_set = parsed if isinstance(parsed, list) else [parsed] if parsed else []
        print(f'Loaded {len(rule_set)} rules')
    except Exception as e:
        print(f'Failed to load ruleset: {e}')


def fetch_rule(domain, url_path=''):
    for rule in rule_set:
        domains = list(rule.get('domains', []))
        if rule.get('domain'):
            domains.append(rule['domain'])
        for rule_domain in domains:
            if domain == rule_domain or domain.endswith('.' + rule_domain):
                paths = rule.get('paths', [])
                if paths and url_path not in paths:
                    continue
                return rule
    return {}


def modify_url(target_url, rule):
    parsed = urlparse(target_url)
    host = parsed.hostname or ''

    url_mods = rule.get('urlMods', {})

    for mod in url_mods.get('domain', []):
        host = re.sub(mod['match'], mod['replace'], host)

    path = parsed.path
    for mod in url_mods.get('path', []):
        path = re.sub(mod['match'], mod['replace'], path)

    if rule.get('googleCache'):
        return f'https://webcache.googleusercontent.com/search?q=cache:{target_url}'

    return f'{parsed.scheme}://{host}{path}' + (f'?{parsed.query}' if parsed.query else '')


def apply_rules(body, rule):
    if not rule_set:
        return body
    for rr in rule.get('regexRules', []):
        body = re.sub(rr['match'], rr['replace'], body)
    for injection in rule.get('injections', []):
        position = injection['position']
        tag_match = re.match(r'^([a-zA-Z][a-zA-Z0-9]*)$', position)
        if tag_match:
            tag = tag_match.group(1)
            close_tag = f'</{tag}>'
            close_idx = body.find(close_tag)
            if close_idx != -1:
                insert = injection.get('replace', '')
                if not insert:
                    insert = (injection.get('prepend', '') or '') + (injection.get('append', '') or '')
                body = body[:close_idx] + insert + body[close_idx:]
            continue
        parts = position.split()
        last_tag = parts[-1].lstrip('.#')
        match = re.search(f'<{last_tag}([\\s>])', body, re.IGNORECASE)
        if match:
            insert = injection.get('replace', '')
            if not insert:
                insert = (injection.get('prepend', '') or '') + (injection.get('append', '') or '')
            body = body[:match.end()] + insert + body[match.end():]
    return body


def rewrite_html(body, target_url, rule):
    parsed = urlparse(target_url)
    host = parsed.hostname or ''
    body = re.sub(r'<img\s+([^>]*\s+)?src="/([^"]*)', f'<img \\1 src="/https://{host}/\\2', body)
    body = re.sub(r'<script\s+([^>]*\s+)?src="/([^"]*)', f'<script \\1 src="/https://{host}/\\2', body)
    body = body.replace('href="/"', f'href="/https://{host}/"')
    body = re.sub(r'href="/', f'href="/https://{host}/', body)
    body = re.sub(r"url\('/", f"url('/https://{host}/", body)
    body = re.sub(r'url\(/', f'url(/https://{host}/', body)
    escaped = re.escape(host)
    body = re.sub(f'href="https://{escaped}"', f'href="/https://{host}/"', body)
    if os.environ.get('RULESET'):
        body = apply_rules(body, rule)
    return body


def fetch_site(raw_path, extra_params=None):
    target_url = raw_path
    if extra_params:
        qs = urlencode(extra_params)
        target_url += ('&' if '?' in target_url else '?') + qs

    parsed = urlparse(target_url)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError(f'Invalid URL: {target_url}')

    rule = fetch_rule(parsed.hostname, parsed.path)
    modified_url = modify_url(target_url, rule)

    headers = {}
    if rule.get('headers'):
        ua = rule['headers'].get('user-agent', USER_AGENT)
        headers['User-Agent'] = ua
        xff = rule['headers'].get('x-forwarded-for', X_FORWARDED_FOR)
        if xff and xff != 'none':
            headers['X-Forwarded-For'] = xff
        ref = rule['headers'].get('referer')
        if ref and ref != 'none':
            headers['Referer'] = ref
        else:
            headers['Referer'] = f'{parsed.scheme}://{parsed.hostname}'
        cookie = rule['headers'].get('cookie')
        if cookie:
            headers['Cookie'] = cookie
    else:
        headers['User-Agent'] = USER_AGENT
        headers['X-Forwarded-For'] = X_FORWARDED_FOR
        headers['Referer'] = f'{parsed.scheme}://{parsed.hostname}'

    resp = requests.get(modified_url, headers=headers, timeout=15, allow_redirects=True)
    content_type = resp.headers.get('content-type', 'text/html')

    body = resp.text
    if 'text/html' in content_type or 'application/xhtml' in content_type:
        try:
            body = rewrite_html(body, target_url, rule)
        except Exception:
            pass

    csp = ''
    if rule.get('headers', {}).get('content-security-policy'):
        csp = rule['headers']['content-security-policy']

    return body, content_type, csp, headers, dict(resp.headers)


@app.route('/health')
def health():
    return {'status': 'ok', 'rules': len(rule_set)}


@app.route('/proxy/<path:raw_path>', methods=['GET'])
def proxy(raw_path):
    try:
        body, content_type, csp, req_headers, resp_headers = fetch_site(raw_path, request.args.to_dict())
        return Response(body, content_type=content_type,
                       headers={'Content-Security-Policy': csp} if csp else None)
    except Exception as e:
        print(f'ERROR: {e}')
        return str(e), 500


@app.route('/ascend/ruleset')
def ruleset():
    return Response(yaml.dump(rule_set), content_type='text/yaml')


@app.route('/<service>/')
@app.route('/<service>')
def serve_service(service):
    if service in STATIC_SERVICES:
        index = os.path.join(STATIC_SERVICES[service], 'index.html')
        if os.path.isfile(index):
            return send_from_directory(STATIC_SERVICES[service], 'index.html')
    if service == '':
        index = os.path.join(STATIC_SERVICES['ascend'], 'index.html')
        if os.path.isfile(index):
            return send_from_directory(STATIC_SERVICES['ascend'], 'index.html')
    abort(404)


@app.route('/<service>/<path:filepath>')
def serve_static(service, filepath):
    if service in STATIC_SERVICES:
        file_path = os.path.join(STATIC_SERVICES[service], filepath)
        if os.path.isfile(file_path):
            return send_from_directory(STATIC_SERVICES[service], filepath)
    abort(404)


@app.route('/')
def index():
    return send_from_directory(STATIC_SERVICES['ascend'], 'index.html')


@app.route('/favicon.ico')
def favicon():
    for service_dir in STATIC_SERVICES.values():
        favicon_path = os.path.join(service_dir, 'favicon.ico')
        if os.path.isfile(favicon_path):
            return send_from_directory(service_dir, 'favicon.ico')
    abort(404)


if __name__ == '__main__':
    ruleset_path = os.environ.get('RULESET')
    if ruleset_path:
        abs_path = os.path.join(ROOT, ruleset_path) if not os.path.isabs(ruleset_path) else ruleset_path
        if os.path.isfile(abs_path):
            load_ruleset(abs_path)
        else:
            load_ruleset(ruleset_path)

    print(f'Server running on port {PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=False)
