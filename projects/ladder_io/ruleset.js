const fs = require('fs');
const path = require('path');
const YAML = require('./yaml');

const REMOTE_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()!@:%_+.~#?&/=]*)/;

class RuleSet {
  constructor(rules = []) {
    this.rules = rules;
  }

  static fromEnv() {
    return new RuleSet();
  }

  static load(rulePaths) {
    const ruleSet = new RuleSet();
    const paths = rulePaths.split(';');

    const promises = [];

    for (const rp of paths) {
      const rulePath = rp.trim();
      const isRemote = REMOTE_REGEX.test(rulePath);

      try {
        if (isRemote) {
          promises.push(ruleSet.loadFromRemote(rulePath));
        } else {
          ruleSet.loadFromLocal(rulePath);
        }
      } catch (err) {
        console.warn(`WARN: failed to load ruleset from '${rulePath}': ${err.message}`);
      }
    }

    return Promise.all(promises).then(() => {
      ruleSet.printStats();
      return ruleSet;
    });
  }

  loadFromLocal(filePath) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      this.loadFromDir(filePath);
    } else {
      this.loadFromFile(filePath);
    }
  }

  loadFromDir(dirPath) {
    const yamlRegex = /.ya?ml$/;
    const files = fs.readdirSync(dirPath, { recursive: true });

    for (const file of files) {
      if (typeof file !== 'string') continue;
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() || !yamlRegex.test(file)) continue;

      try {
        this.loadFromFile(fullPath);
        console.log(`INFO: loaded ruleset ${fullPath}`);
      } catch (err) {
        console.warn(`WARN: failed to load '${fullPath}': ${err.message}, skipping`);
      }
    }
  }

  loadFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = YAML.load(content);
    const rules = Array.isArray(parsed) ? parsed : [parsed];
    this.rules.push(...rules);
  }

  loadFromRemote(url) {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? require('https') : require('http');

      const get = (url, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const parsedUrl = new URL(url);
        const opts = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          rejectUnauthorized: false,
        };
        mod.get(opts, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location, redirectCount + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          }
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            try {
              const content = Buffer.concat(chunks).toString('utf8');
              const parsed = YAML.load(content);
              const rules = Array.isArray(parsed) ? parsed : [parsed];
              this.rules.push(...rules);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
          res.on('error', reject);
        }).on('error', reject);
      };

      get(url);
    });
  }

  domains() {
    return this.rules.flatMap(rule => {
      return [rule.domain, ...(rule.domains || [])].filter(Boolean);
    });
  }

  count() {
    return this.rules.length;
  }

  domainCount() {
    return this.domains().length;
  }

  printStats() {
    console.log(`INFO: Loaded ${this.count()} rules for ${this.domainCount()} domains`);
  }

  toYaml() {
    return YAML.dump(this.rules);
  }
}

module.exports = { RuleSet };
