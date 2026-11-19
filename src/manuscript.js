// Reads a manuscript (.docx, .md or .txt) into a title and the list of body paragraphs.
// For .docx the paragraph order matches word/document.xml, so comments can be written
// back onto the same paragraphs of the writer's own file.
import JSZip from 'jszip';

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Text of each <w:p> in document.xml order, including empty ones (index = docx paragraph index). */
export function docxParagraphTexts(documentXml) {
  const out = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g;
  let m;
  while ((m = re.exec(documentXml))) {
    const xml = m[0];
    let text = '';
    const tr = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let t;
    while ((t = tr.exec(xml))) text += t[1] !== undefined ? decodeXml(t[1]) : ' ';
    out.push(text);
  }
  return out;
}

/**
 * @returns {{ title: string, byline: string|null, paragraphs: {text:string, words:number, src:number}[], kind: string }}
 *   src = index of the source paragraph (docx <w:p> index, or block index for text)
 */
export async function readManuscript(name, buf) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.docx')) {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    const texts = docxParagraphTexts(xml);
    const body = texts.map((text, src) => ({ text: text.trim(), src })).filter((p) => p.text);
    const title = body.length && wordCount(body[0].text) <= 12 ? body.shift().text : name.replace(/\.docx$/i, '');
    return { title, byline: null, kind: 'docx', paragraphs: body.map((p) => ({ ...p, words: wordCount(p.text) })) };
  }
  const text = Buffer.from(buf).toString('utf8').replace(/\r/g, '');
  const blocks = text.split(/\n\s*\n/).map((b) => b.replace(/\n/g, ' ').trim());
  let title = name.replace(/\.(md|txt)$/i, '');
  let byline = null;
  const paragraphs = [];
  blocks.forEach((b, src) => {
    if (!b) return;
    if (/^#\s+/.test(b) && paragraphs.length === 0) { title = b.replace(/^#\s+/, ''); return; }
    if (/^_.*_$/.test(b) && paragraphs.length === 0) { byline = b.slice(1, -1); return; }
    paragraphs.push({ text: b, words: wordCount(b), src });
  });
  return { title, byline, kind: 'text', paragraphs };
}
