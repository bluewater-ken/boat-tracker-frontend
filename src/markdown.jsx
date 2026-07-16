// Minimal, safe markdown → React nodes (bold, italic, code, bullet/numbered
// lists, headers, blank lines). Returns JSX so React escapes all text — no XSS,
// no dependency. Emojis pass straight through as ordinary text.
// Shared by Ask the B.O.S.S and the Shop Report so their commentary reads the same.
function inline(text, base) {
  const nodes = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={`${base}-${i}`}>{m[2]}</strong>);
    else if (m[3] != null || m[4] != null) nodes.push(<em key={`${base}-${i}`}>{m[3] ?? m[4]}</em>);
    else if (m[5] != null) nodes.push(<code key={`${base}-${i}`}>{m[5]}</code>);
    last = re.lastIndex; i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Same markdown rules rendered to an HTML string — for surfaces that need real
// HTML instead of React nodes (e.g. Ask B.O.S.S's pop-out tab). Text is escaped
// first, so answers can't inject markup.
export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inlineHtml(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
export function answerToHtml(text) {
  const lines = (text || '').split('\n');
  let html = ''; let list = null;
  const flush = () => { if (list) { html += `<${list.tag}>` + list.items.map(t => `<li>${inlineHtml(t)}</li>`).join('') + `</${list.tag}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const num = line.match(/^\s*\d+\.\s+(.*)/);
    const head = line.match(/^#{1,6}\s+(.*)/);
    if (bullet) { if (!list || list.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; } list.items.push(bullet[1]); }
    else if (num) { if (!list || list.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; } list.items.push(num[1]); }
    else { flush(); if (head) html += `<h3>${inlineHtml(head[1])}</h3>`; else if (line !== '') html += `<p>${inlineHtml(line)}</p>`; }
  }
  flush();
  return html;
}

export function renderAnswer(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, '');
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const num = line.match(/^\s*\d+\.\s+(.*)/);
    const head = line.match(/^#{1,6}\s+(.*)/);
    if (bullet) { if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; } list.items.push(bullet[1]); }
    else if (num) { if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; } list.items.push(num[1]); }
    else { flush(); if (head) blocks.push({ type: 'h', text: head[1] }); else if (line === '') blocks.push({ type: 'sp' }); else blocks.push({ type: 'p', text: line }); }
  });
  flush();
  return blocks.map((b, i) => {
    if (b.type === 'ul') return <ul key={i} className="ask-md-list">{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ul>;
    if (b.type === 'ol') return <ol key={i} className="ask-md-list">{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ol>;
    if (b.type === 'h') return <div key={i} className="ask-md-h">{inline(b.text, i)}</div>;
    if (b.type === 'sp') return <div key={i} className="ask-md-sp" />;
    return <p key={i} className="ask-md-p">{inline(b.text, i)}</p>;
  });
}
