// Writes reader notes into a manuscript as real Word comments anchored to paragraphs.
// The writer's own .docx is edited in place (formatting and any existing comments kept);
// .md / .txt manuscripts are first turned into a plain .docx and then commented the same way.
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { docxParagraphTexts } from './manuscript.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const COMMENTS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const COMMENTS_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain .docx for a text manuscript: title, optional byline, body paragraphs. */
export async function docxFromText(ms) {
  const children = [new Paragraph({ text: ms.title, heading: HeadingLevel.TITLE })];
  if (ms.byline) children.push(new Paragraph({ children: [new TextRun({ text: ms.byline, italics: true })] }));
  for (const p of ms.paragraphs) children.push(new Paragraph({ children: [new TextRun(p.text)], spacing: { after: 160 } }));
  const doc = new Document({ creator: 'Unskipped', title: ms.title, sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * Finds the <w:p> index in document.xml for each manuscript paragraph, matching text in order.
 * Returns an array the length of ms.paragraphs (-1 where no match was found).
 */
export function mapParagraphs(documentXml, ms) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const texts = docxParagraphTexts(documentXml).map(norm);
  const out = [];
  let k = 0;
  for (const p of ms.paragraphs) {
    const want = norm(p.text);
    let found = -1;
    for (let j = k; j < texts.length; j++) if (texts[j] === want) { found = j; break; }
    out.push(found);
    if (found >= 0) k = found + 1;
  }
  return out;
}

/**
 * @param {Buffer} docxBuf
 * @param {object} ms manuscript (paragraph list used to build the reading session)
 * @param {{para:number, author:string, initials?:string, text:string, date?:string}[]} comments
 */
export async function addComments(docxBuf, ms, comments) {
  const zip = await JSZip.loadAsync(docxBuf);
  let doc = await zip.file('word/document.xml').async('string');
  const map = mapParagraphs(doc, ms);

  // existing comments part (keep the writer's own comments)
  let commentsXml = zip.file('word/comments.xml') ? await zip.file('word/comments.xml').async('string') : null;
  let nextId = 0;
  if (commentsXml) for (const m of commentsXml.matchAll(/w:id="(\d+)"/g)) nextId = Math.max(nextId, Number(m[1]) + 1);
  for (const m of doc.matchAll(/w:commentReference w:id="(\d+)"/g)) nextId = Math.max(nextId, Number(m[1]) + 1);

  const byDocxPara = new Map();
  const entries = [];
  for (const c of comments) {
    const target = map[c.para];
    if (target === undefined || target < 0) continue;
    const id = nextId++;
    if (!byDocxPara.has(target)) byDocxPara.set(target, []);
    byDocxPara.get(target).push(id);
    const lines = String(c.text).split('\n');
    const body = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`).join('');
    entries.push(`<w:comment w:id="${id}" w:author="${esc(c.author)}" w:date="${c.date || new Date().toISOString().replace(/\.\d+Z$/, 'Z')}" w:initials="${esc(c.initials || c.author.slice(0, 2).toUpperCase())}">${body}</w:comment>`);
  }

  let idx = -1;
  doc = doc.replace(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g, (xml) => {
    idx++;
    const ids = byDocxPara.get(idx);
    if (!ids || xml.endsWith('/>')) return xml;
    const starts = ids.map((id) => `<w:commentRangeStart w:id="${id}"/>`).join('');
    const ends = ids.map((id) => `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`).join('');
    const afterPPr = xml.indexOf('</w:pPr>');
    const openEnd = xml.indexOf('>') + 1;
    const at = afterPPr >= 0 ? afterPPr + '</w:pPr>'.length : openEnd;
    return xml.slice(0, at) + starts + xml.slice(at, -'</w:p>'.length) + ends + '</w:p>';
  });
  zip.file('word/document.xml', doc);

  if (commentsXml) {
    commentsXml = commentsXml.replace(/<\/w:comments>\s*$/, `${entries.join('')}</w:comments>`);
  } else {
    commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W_NS}">${entries.join('')}</w:comments>`;
    let rels = await zip.file('word/_rels/document.xml.rels').async('string');
    if (!rels.includes(COMMENTS_REL)) {
      rels = rels.replace('</Relationships>', `<Relationship Id="rIdUnskippedComments" Type="${COMMENTS_REL}" Target="comments.xml"/></Relationships>`);
      zip.file('word/_rels/document.xml.rels', rels);
    }
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (!ct.includes('/word/comments.xml')) {
      ct = ct.replace('</Types>', `<Override PartName="/word/comments.xml" ContentType="${COMMENTS_CT}"/></Types>`);
      zip.file('[Content_Types].xml', ct);
    }
  }
  zip.file('word/comments.xml', commentsXml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

/** Count comments and anchors in a .docx (used by tests and `npm run check`). */
export async function inspectComments(docxBuf) {
  const zip = await JSZip.loadAsync(docxBuf);
  const doc = await zip.file('word/document.xml').async('string');
  const c = zip.file('word/comments.xml') ? await zip.file('word/comments.xml').async('string') : '';
  return {
    comments: (c.match(/<w:comment /g) || []).length,
    anchors: (doc.match(/<w:commentReference /g) || []).length,
    authors: [...new Set([...c.matchAll(/w:author="([^"]*)"/g)].map((m) => m[1]))],
  };
}
