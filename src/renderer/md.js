/* Tiny XSS-safe Markdown renderer for group announcements.
 * Strategy: escape ALL input first, then build tags only from matched, validated
 * pieces — raw HTML in the source can never survive as markup.
 * Supports: # ## ### headings, **bold**, *italic*, `code`, ``` blocks, lists,
 * > quotes, ---, [links](https://…), ![images](https://…), and .mp4/.webm
 * image-syntax embeds rendered as <video>. Classic script; exposes window.MD. */
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Input is escaped before these run, so quotes/angle brackets can't appear raw.
  const safeUrl = (u) => (/^https:\/\/[^\s<>"']+$/i.test(u) ? u : null);

  function inline(text) {
    let out = esc(text);
    // Images / videos first (their syntax contains the link syntax).
    out = out.replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g, (m, alt, url) => {
      const u = safeUrl(url);
      if (!u) return m;
      if (/\.(mp4|webm)(\?[^\s)]*)?$/i.test(u)) {
        return `<video controls preload="metadata" src="${u}"></video>`;
      }
      return `<img src="${u}" alt="${alt}" loading="lazy"/>`;
    });
    out = out.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (m, label, url) => {
      const u = safeUrl(url);
      return u ? `<a href="${u}">${label}</a>` : m;
    });
    // Bare https URLs become links too (opened externally by the app).
    out = out.replace(/(^|\s)(https:\/\/[^\s<]+)/g, (m, pre, url) => {
      const u = safeUrl(url);
      return u ? `${pre}<a href="${u}">${u}</a>` : m;
    });
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return out;
  }

  function render(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;
    let list = null;
    let para = [];
    const flushPara = () => {
      if (para.length) {
        html.push(`<p>${para.map(inline).join('<br/>')}</p>`);
        para = [];
      }
    };
    const closeList = () => {
      if (list) {
        html.push(`</${list}>`);
        list = null;
      }
    };
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        flushPara(); closeList();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        flushPara(); closeList();
        const level = h[1].length + 1; // # -> h2 (announcement titles own h-levels above)
        html.push(`<h${level}>${inline(h[2])}</h${level}>`);
        i++;
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        flushPara();
        if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
        html.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        flushPara();
        if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
        html.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        flushPara(); closeList();
        html.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
        i++;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        flushPara(); closeList();
        html.push('<hr/>');
        i++;
        continue;
      }
      if (/^\s*$/.test(line)) {
        flushPara(); closeList();
        i++;
        continue;
      }
      para.push(line);
      i++;
    }
    flushPara();
    closeList();
    return html.join('\n');
  }

  (typeof window !== 'undefined' ? window : globalThis).MD = { render };
})();
