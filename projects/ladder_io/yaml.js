const YAML = {
  load(str) {
    const raw = str.split('\n');
    const lines = [];
    for (const line of raw) {
      const trimmed = line.replace(/\s+#[^\r\n]*\r?$/, '');
      if (trimmed.trim() === '' || /^\s*$/.test(trimmed)) continue;
      const indent = line.search(/\S/);
      lines.push({ indent: indent === -1 ? 0 : indent, text: trimmed.trim() });
    }

    let i = 0;

    function peek() { return i < lines.length ? lines[i] : null; }

    function scalar(s) {
      s = s.trim();
      if (s === '' || s === 'null' || s === '~') return null;
      if (s === 'true') return true;
      if (s === 'false') return false;
      if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
      if ((s[0] === '"' && s[s.length-1] === '"') || (s[0] === "'" && s[s.length-1] === "'"))
        return s.slice(1, -1);
      return s;
    }

    function readBlock(minIndent) {
      const out = [];
      while (i < lines.length && lines[i].indent > minIndent) {
        out.push(lines[i].text);
        i++;
      }
      return out.join('\n');
    }

    function readMap(indent) {
      const obj = {};
      while (i < lines.length) {
        const ln = peek();
        if (!ln || ln.indent < indent) break;
        if (ln.indent > indent) break;
        if (ln.text.startsWith('-')) break;
        const colonIdx = ln.text.indexOf(':');
        if (colonIdx === -1) break;
        const key = ln.text.slice(0, colonIdx).trim();
        const afterColon = ln.text.slice(colonIdx + 1).trim();
        i++;
        if (afterColon === '|' || afterColon === '>-') {
          obj[key] = readBlock(indent + 1);
        } else if (afterColon === '') {
          const next = peek();
          if (next && next.indent > indent) {
            if (next.text.startsWith('-')) {
              obj[key] = readSeq(next.indent);
            } else {
              obj[key] = readMap(next.indent);
            }
          } else {
            obj[key] = null;
          }
        } else {
          obj[key] = scalar(afterColon);
        }
      }
      return obj;
    }

    function readSeq(indent) {
      const arr = [];
      while (i < lines.length) {
        const ln = peek();
        if (!ln || ln.indent < indent) break;
        if (ln.indent > indent) break;
        if (!ln.text.startsWith('-')) break;
        const afterDash = ln.text.slice(1).trim();
        i++;

        if (afterDash === '' || afterDash === '|' || afterDash === '>-') {
          if (afterDash === '|' || afterDash === '>-') {
            arr.push(readBlock(indent + 1));
          } else {
            const next = peek();
            if (next && next.indent > indent) {
              if (next.text.startsWith('-')) {
                arr.push(readSeq(next.indent));
              } else {
                arr.push(readMap(next.indent));
              }
            } else {
              arr.push(null);
            }
          }
        } else if (afterDash.includes(':')) {
          const colonIdx = afterDash.indexOf(':');
          const firstKey = afterDash.slice(0, colonIdx).trim();
          const firstVal = afterDash.slice(colonIdx + 1).trim();
          const obj = {};

          if (firstVal === '|' || firstVal === '>-') {
            obj[firstKey] = readBlock(indent + 2);
          } else if (firstVal === '') {
            const next = peek();
            if (next && next.indent >= indent + 2) {
              if (next.text.startsWith('-')) {
                obj[firstKey] = readSeq(next.indent);
              } else {
                obj[firstKey] = readMap(next.indent);
              }
            } else {
              obj[firstKey] = null;
            }
          } else {
            obj[firstKey] = scalar(firstVal);
          }

          while (i < lines.length) {
            const nln = peek();
            if (!nln) break;
            if (nln.indent <= indent) break;
            if (nln.text.startsWith('-')) break;
            if (nln.indent !== indent + 2) break;
            const ci = nln.text.indexOf(':');
            if (ci === -1) break;
            const k = nln.text.slice(0, ci).trim();
            const v = nln.text.slice(ci + 1).trim();
            i++;
            if (v === '|' || v === '>-') {
              obj[k] = readBlock(nln.indent + 1);
            } else if (v === '') {
              const nx = peek();
              if (nx && nx.indent >= nln.indent) {
                if (nx.text.startsWith('-')) {
                  obj[k] = readSeq(nx.indent);
                } else {
                  obj[k] = readMap(nx.indent);
                }
              } else {
                obj[k] = null;
              }
            } else {
              obj[k] = scalar(v);
            }
          }

          arr.push(obj);
        } else {
          arr.push(scalar(afterDash));
        }
      }
      return arr;
    }

    const first = peek();
    if (first && first.text.startsWith('-')) {
      return readSeq(first.indent);
    }
    return readMap(0);
  },

  dump(data) {
    function dv(val, p) {
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') {
        if (val.includes('\n')) return '|\n' + val.split('\n').map(l => '  '.repeat(p) + '  ' + l).join('\n');
        return val;
      }
      if (Array.isArray(val)) {
        let s = '\n';
        for (const item of val) {
          if (typeof item === 'object' && item !== null) {
            const ents = Object.entries(item);
            s += '  '.repeat(p) + '- ' + ents[0][0] + ': ' + dv(ents[0][1], p + 2) + '\n';
            for (let j = 1; j < ents.length; j++) s += '  '.repeat(p + 1) + ents[j][0] + ': ' + dv(ents[j][1], p + 2) + '\n';
          } else {
            s += '  '.repeat(p) + '- ' + dv(item, p + 1) + '\n';
          }
        }
        return s;
      }
      if (typeof val === 'object') {
        let s = '\n';
        for (const [k, v] of Object.entries(val)) {
          if (v === null || v === undefined) s += '  '.repeat(p) + k + ':\n';
          else if (typeof v === 'object') s += '  '.repeat(p) + k + ':' + dv(v, p + 1);
          else s += '  '.repeat(p) + k + ': ' + dv(v, p + 1) + '\n';
        }
        return s;
      }
      return String(val);
    }
    function dm(obj, p) {
      const pad = '  '.repeat(p);
      let o = '';
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || v === '') o += `${pad}${k}:\n`;
        else if (Array.isArray(v)) {
          o += `${pad}${k}:\n`;
          for (const item of v) {
            if (typeof item === 'object' && item !== null) {
              const ents = Object.entries(item);
              o += `${pad}  - ${ents[0][0]}: ${dv(ents[0][1], p+2)}\n`;
              for (let j = 1; j < ents.length; j++) o += `${pad}    ${ents[j][0]}: ${dv(ents[j][1], p+2)}\n`;
            } else o += `${pad}  - ${dv(item, p+1)}\n`;
          }
        } else if (typeof v === 'object') o += `${pad}${k}:\n${dm(v, p+1)}`;
        else o += `${pad}${k}: ${dv(v, p)}\n`;
      }
      return o;
    }
    if (Array.isArray(data)) {
      let o = '';
      for (const item of data) {
        if (typeof item === 'object' && item !== null) {
          const ents = Object.entries(item);
          o += `- ${ents[0][0]}: ${dv(ents[0][1], 1)}\n`;
          for (let j = 1; j < ents.length; j++) o += `  ${ents[j][0]}: ${dv(ents[j][1], 1)}\n`;
        } else o += `- ${dv(item, 0)}\n`;
      }
      return o;
    }
    return dm(data, 0);
  }
};

module.exports = YAML;
