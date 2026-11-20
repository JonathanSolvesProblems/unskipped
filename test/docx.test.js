import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readManuscript } from '../src/manuscript.js';
import { docxFromText, addComments, inspectComments, mapParagraphs } from '../src/docx.js';
import JSZip from 'jszip';

const md = fs.readFileSync(new URL('../stories/the-open-window.md', import.meta.url));

test('markdown manuscript parses title, byline and body', async () => {
  const ms = await readManuscript('the-open-window.md', md);
  assert.equal(ms.title, 'The Open Window');
  assert.match(ms.byline, /Saki/);
  assert.equal(ms.paragraphs.length, 29);
});

test('comments land on the right paragraphs and survive a second reader', async () => {
  const ms = await readManuscript('the-open-window.md', md);
  const base = await docxFromText(ms);
  const doc = await (await JSZip.loadAsync(base)).file('word/document.xml').async('string');
  const map = mapParagraphs(doc, ms);
  assert.ok(map.every((x) => x >= 0), 'every paragraph found in the generated docx');

  const one = await addComments(base, ms, [
    { para: 0, author: 'Reader A', text: 'Reader A smiled here.' },
    { para: 5, author: 'Reader A', text: 'No reading: you looked away.' },
  ]);
  const two = await addComments(one, ms, [{ para: 5, author: 'Reader B', text: 'Reader B was gripped here.' }]);
  const info = await inspectComments(two);
  assert.equal(info.comments, 3);
  assert.equal(info.anchors, 3);
  assert.deepEqual(info.authors.sort(), ['Reader A', 'Reader B']);

  // the commented docx still reads back as the same manuscript
  const back = await readManuscript('x.docx', two);
  assert.equal(back.paragraphs.length, ms.paragraphs.length + 1); // + byline paragraph
});

test('a writer .docx keeps its own comments when reader notes are added', async () => {
  const ms = await readManuscript('the-open-window.md', md);
  const withMine = await addComments(await docxFromText(ms), ms, [{ para: 1, author: 'Claire', text: 'cut this?' }]);
  const fromDocx = await readManuscript('chapter.docx', withMine);
  const out = await addComments(withMine, fromDocx, [{ para: 2, author: 'Reader', text: 'gripped' }]);
  const info = await inspectComments(out);
  assert.equal(info.comments, 2);
  assert.deepEqual(info.authors.sort(), ['Claire', 'Reader']);
});

test('an empty self-closing comments part and control characters still give a valid file', async () => {
  const ms = { title: 'T', byline: null, paragraphs: [{ text: 'First paragraph here.', words: 3 }, { text: 'Second one.', words: 2 }] };
  const zip = await JSZip.loadAsync(await docxFromText(ms));
  zip.file('word/comments.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');
  const base = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
  const out = await addComments(base, ms, [{ para: 1, author: 'R\u0001eader', text: 'Note with a bell \u0007 in it' }]);
  const info = await inspectComments(out);
  assert.equal(info.comments, 1);
  assert.equal(info.anchors, 1);
  const c = await (await JSZip.loadAsync(out)).file('word/comments.xml').async('string');
  assert.ok(!/[\u0000-\u0008]/.test(c), 'no control characters left in the XML');
  assert.match(c, /<\/w:comments>$/);
});
