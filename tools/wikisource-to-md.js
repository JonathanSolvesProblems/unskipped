// Converts a Wikisource raw page into a plain Markdown manuscript (title + paragraphs).
// Prints only counts, so the story text is not shown before the reader reads it.
//   node tools/wikisource-to-md.js <in.wiki> <out.md> "<Title>" "<Author, year>"
import fs from 'node:fs';

const [inPath, outPath, title, byline] = process.argv.slice(2);
let t = fs.readFileSync(inPath, 'utf8').replace(/\r/g, '');

// drop templates ({{...}}, possibly nested and multi-line)
let prev;
do { prev = t; t = t.replace(/\{\{[^{}]*\}\}/g, ''); } while (t !== prev);
t = t
  .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
  .replace(/\[\[([^\]]*)\]\]/g, '$1')
  .replace(/'''?/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/[ \t]+/g, ' ');

const paras = t.split(/\n\s*\n/)
  .map((p) => p.replace(/\n/g, ' ').trim())
  .filter((p) => p && !/^(__|Category:|\{|\||=)/.test(p) && p.split(' ').length > 2);

fs.writeFileSync(outPath, `# ${title}\n\n_${byline}_\n\n${paras.join('\n\n')}\n`);
const words = paras.join(' ').split(/\s+/).length;
console.log(`${paras.length} paragraphs, ${words} words, longest ${Math.max(...paras.map((p) => p.split(' ').length))} words`);
