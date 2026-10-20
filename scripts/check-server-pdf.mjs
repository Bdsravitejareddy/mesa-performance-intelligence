import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

// Local node_modules hides missing serverless assets. Parse using only the PDF
// runtime files actually included in each production route's deployment trace.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules/pdfjs-dist');
const fixture = await PDFDocument.create();
const font = await fixture.embedFont(StandardFonts.Helvetica);
for (let page = 1; page <= 2; page++) {
  fixture.addPage().drawText(`SERVER_PDF_PAGE_${page}`, { font });
}
const bytes = await fixture.save();

for (const route of ['drive-agent/finalize', 'materials/extract']) {
  const tracePath = path.join(root, `.next/server/app/api/${route}/route.js.nft.json`);
  const trace = JSON.parse(await readFile(tracePath, 'utf8'));
  const isolated = await mkdtemp(path.join(tmpdir(), 'mesa-server-pdf-'));
  try {
    for (const entry of trace.files) {
      const source = path.resolve(path.dirname(tracePath), entry);
      if (!source.startsWith(packageRoot + path.sep)) continue;
      const destination = path.join(isolated, path.relative(packageRoot, source));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    const { getDocument } = await import(pathToFileURL(path.join(isolated, 'legacy/build/pdf.mjs')).href);
    const task = getDocument({ data: bytes.slice(), verbosity: 0 });
    try {
      const document = await task.promise;
      assert.equal(document.numPages, 2);
      for (let page = 1; page <= 2; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        assert.ok(content.items.some(item => 'str' in item && item.str === `SERVER_PDF_PAGE_${page}`));
      }
    } finally {
      await task.destroy();
    }
    console.log(`Serverless PDF extraction verified: /api/${route}, two pages with correct text.`);
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
}
