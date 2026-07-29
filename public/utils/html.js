/**
 * Modul: HTML Utilities
 * Zweck: XSS-Schutz fuer innerHTML-basiertes Rendering
 * Abhaengigkeiten: keine
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const ESCAPE_RE = /[&<>"']/g;

/**
 * Escapet einen String fuer die sichere Einbettung in HTML.
 * Gibt fuer null/undefined einen Leerstring zurueck.
 *
 * @param {*} str - Beliebiger Wert (wird zu String konvertiert)
 * @returns {string} HTML-sicherer String
 */
export function esc(str) {
  if (str == null) return '';
  return String(str).replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

/**
 * Normalisiert einen iCalendar LOCATION-String fuer die Anzeige.
 * Entfernt ICS-Backslash-Escapes (RFC 5545 §3.3.11) und fasst
 * mehrzeilige Adressen zu einem einzeiligen String zusammen.
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
/**
 * Wendet Inline-Markdown auf ein bereits zeilenweise zerlegtes Segment an.
 * Escapet zuerst vollständig (XSS), führt danach nur vertrauenswürdige Tags ein.
 * Unterstützt: <u>Unterstreichung</u> (vom Editor als Literal eingefügt),
 * `Code`, [Text](url) (nur http/https/mailto), **fett**, ~~durchgestrichen~~, *kursiv*.
 *
 * @param {string} segment
 * @returns {string} HTML-sicheres Inline-Fragment
 */
function inlineMarkdown(segment) {
  let out = esc(segment);
  // Unterstreichung: der Editor fügt literale <u>…</u> ein → nach esc() reaktivieren
  out = out.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');
  // Inline-Code zuerst, damit Marker darin nicht als Emphase interpretiert werden
  out = out.replace(/`([^`]+?)`/g, '<code class="note-md-code">$1</code>');
  // Links: nur sichere Schemata, sonst als Literal belassen. url ist bereits escaped.
  out = out.replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, (whole, label, url) => {
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return whole;
    return `<a class="note-md-link" href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;
  });
  // Emphase: fett vor kursiv (verbraucht **), durchgestrichen beliebig
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~(.+?)~~/g, '<s>$1</s>');
  out = out.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  return out;
}

/**
 * Rendert die Markdown-Teilmenge des Notiz-Editors zu sicherem HTML — in
 * voller Parität mit der Editor-Toolbar: Überschriften (#–###), ungeordnete
 * und geordnete Listen, Checklisten (- [ ] / - [x]), Zitate (>), Trennlinien
 * (---), Inline-Code, Links sowie **fett** / *kursiv* / ~~strike~~ / <u>.
 *
 * Alle Nutzertexte werden über esc()/inlineMarkdown() escaped; nur statische,
 * vertrauenswürdige Block-Tags werden eingeführt. Rückgabe ist für
 * insertAdjacentHTML bestimmt.
 *
 * @param {string|null|undefined} text
 * @returns {string} HTML string
 */

/**
 * Toggles the Nth GFM checklist item (0-based) in markdown source.
 * Matches the same line pattern as renderMarkdownLight.
 *
 * @param {string|null|undefined} content
 * @param {number} index
 * @param {boolean} [checked] - force state; omit to flip
 * @returns {{ content: string, checked: boolean } | null}
 */
export function toggleChecklistItem(content, index, checked) {
  if (!Number.isInteger(index) || index < 0) return null;
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (!m) continue;
    if (seen === index) {
      const currently = m[1].toLowerCase() === 'x';
      const next = checked === undefined ? !currently : Boolean(checked);
      const mark = next ? 'x' : ' ';
      lines[i] = lines[i].replace(/^(\s*[-*+]\s+\[)[ xX](\])/, `$1${mark}$2`);
      return { content: lines.join('\n'), checked: next };
    }
    seen += 1;
  }
  return null;
}

/**
 * Editor Enter behaviour for GFM checklist lines (GitHub/Notion-style).
 * On a checklist item with body text → insert a new empty `- [ ] ` line
 * (splitting at the caret). On an empty item → exit the checklist (blank line).
 * Returns null when the current line is not a checklist item.
 *
 * @param {string|null|undefined} value
 * @param {number} pos collapsed caret index
 * @returns {{ value: string, selectionStart: number } | null}
 */
export function continueChecklistEnter(value, pos) {
  const text = String(value ?? '');
  if (!Number.isInteger(pos) || pos < 0 || pos > text.length) return null;

  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEndIdx = text.indexOf('\n', pos);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const line = text.slice(lineStart, lineEnd);

  // Marker only — do not match plain `- list` or `- [not a box]`.
  const m = line.match(/^(\s{0,3})([-*+]) \[([ xX])\] ?/);
  if (!m) return null;

  const marker = m[0];
  const indent = m[1];
  const body = line.slice(marker.length);
  const caretInLine = pos - lineStart;
  const bodyCaret = Math.max(0, caretInLine - marker.length);
  const bodyBefore = body.slice(0, bodyCaret);
  const bodyAfter = body.slice(bodyCaret);

  // Empty item (no text after the marker) → leave the checklist.
  if (body.trim() === '') {
    const next = text.slice(0, lineStart) + text.slice(lineEnd);
    return { value: next, selectionStart: lineStart };
  }

  const kept = marker + bodyBefore;
  const rest = bodyAfter.replace(/^\s+/, '');
  const inserted = `\n${indent}- [ ] ${rest}`;
  const next = text.slice(0, lineStart) + kept + inserted + text.slice(lineEnd);
  const selectionStart = lineStart + kept.length + 1 + indent.length + '- [ ] '.length;
  return { value: next, selectionStart };
}

export function renderMarkdownLight(text, options = {}) {
  if (!text) return '';

  const interactive = Boolean(options && options.interactive);
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let list = null;      // { tag: 'ul' | 'ol', checklist: boolean }
  let para = [];
  let checkIndex = 0;

  const flushPara = () => {
    if (para.length) { html.push(`<p class="note-md-p">${para.join('<br>')}</p>`); para = []; }
  };
  const closeList = () => {
    if (list) { html.push(`</${list.tag}>`); list = null; }
  };

  for (const line of lines) {
    // Trennlinie
    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara(); closeList(); html.push('<hr class="note-md-hr">'); continue;
    }
    // Überschrift (#–###)
    let m = line.match(/^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (m) {
      flushPara(); closeList();
      html.push(`<div class="note-md-h${m[1].length}">${inlineMarkdown(m[2])}</div>`);
      continue;
    }
    // Zitat
    m = line.match(/^ {0,3}>\s?(.*)$/);
    if (m) {
      flushPara(); closeList();
      html.push(`<blockquote class="note-md-quote">${inlineMarkdown(m[1])}</blockquote>`);
      continue;
    }
    // Checklisten-Eintrag
    m = line.match(/^ {0,3}[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (m) {
      flushPara();
      if (!list || list.tag !== 'ul' || !list.checklist) {
        closeList(); html.push('<ul class="note-md-ul note-md-checklist">'); list = { tag: 'ul', checklist: true };
      }
      const checked = m[1].toLowerCase() === 'x';
      const idx = checkIndex++;
      if (interactive) {
        html.push(
          `<li class="note-md-check note-md-check--interactive${checked ? ' is-checked' : ''}" data-check-index="${idx}">`
          + `<button type="button" class="note-md-box" role="checkbox" aria-checked="${checked}"`
          + ` data-action="toggle-check" data-check-index="${idx}" aria-label="${esc(m[2])}"></button>`
          + `<span>${inlineMarkdown(m[2])}</span></li>`
        );
      } else {
        html.push(`<li class="note-md-check${checked ? ' is-checked' : ''}"><span class="note-md-box" aria-hidden="true"></span><span>${inlineMarkdown(m[2])}</span></li>`);
      }
      continue;
    }
    // Ungeordnete Liste
    m = line.match(/^ {0,3}[-*+]\s+(.*)$/);
    if (m) {
      flushPara();
      if (!list || list.tag !== 'ul' || list.checklist) {
        closeList(); html.push('<ul class="note-md-ul">'); list = { tag: 'ul', checklist: false };
      }
      html.push(`<li>${inlineMarkdown(m[1])}</li>`);
      continue;
    }
    // Geordnete Liste
    m = line.match(/^ {0,3}\d+[.)]\s+(.*)$/);
    if (m) {
      flushPara();
      if (!list || list.tag !== 'ol') {
        closeList(); html.push('<ol class="note-md-ol">'); list = { tag: 'ol' };
      }
      html.push(`<li>${inlineMarkdown(m[1])}</li>`);
      continue;
    }
    // Leerzeile → Absatz-Grenze
    if (line.trim() === '') { flushPara(); closeList(); continue; }
    // Fließtext
    closeList();
    para.push(inlineMarkdown(line));
  }
  flushPara();
  closeList();
  return html.join('');
}

export function fmtLocation(raw) {
  if (!raw) return '';
  return raw
    .replace(/\\[Nn]/g, '\n')   // \n / \N → newline
    .replace(/\\,/g,  ',')      // \, → ,
    .replace(/\\;/g,  ';')      // \; → ;
    .replace(/\\\\/g, '\\')     // \\ → \
    .replace(/[\n\r;]+/g, ', ') // newlines / semicolons → ", "
    .replace(/\s*,\s*/g, ', ')  // normalize spaces around commas
    .replace(/(?:,\s*){2,}/g, ', ') // collapse double commas
    .replace(/  +/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, ''); // trim leading/trailing commas
}
