import PDFDocument from 'pdfkit';

export type Pdf = PDFKit.PDFDocument;

const COLORS = { primary: '#0f766e', text: '#1f2937', muted: '#6b7280', line: '#e5e7eb', danger: '#b91c1c' };

export function createPdf(title: string, subtitle: string): Pdf {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: 56, left: 50, right: 50 }, info: { Title: title, Producer: 'MediSchool SGEE' }, bufferPages: true });
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(16).text(title);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(subtitle);
  doc.moveDown(0.5);
  hr(doc);
  return doc;
}

export function hr(doc: Pdf) {
  doc.strokeColor(COLORS.line).lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.5);
}

export function section(doc: Pdf, title: string) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.4);
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase());
  doc.moveDown(0.2);
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(9.5);
}

export function field(doc: Pdf, label: string, value: string | number | null | undefined) {
  doc.font('Helvetica-Bold').fillColor(COLORS.muted).text(`${label}: `, { continued: true });
  doc.font('Helvetica').fillColor(COLORS.text).text(value === null || value === undefined || value === '' ? '—' : String(value));
}

export function paragraph(doc: Pdf, text: string | null | undefined) {
  doc.font('Helvetica').fillColor(COLORS.text).text(text && text.trim() ? text : '—', { align: 'left' });
}

export function table(doc: Pdf, headers: string[], rows: (string | number | null)[][], widths?: number[]) {
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const w = widths ?? headers.map(() => usable / headers.length);
  const drawRow = (cells: (string | number | null)[], bold: boolean) => {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    let x = doc.page.margins.left;
    let maxH = 0;
    cells.forEach((c, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(bold ? COLORS.muted : COLORS.text);
      const text = c === null || c === undefined ? '—' : String(c);
      const h = doc.heightOfString(text, { width: w[i] - 6 });
      doc.text(text, x + 3, y, { width: w[i] - 6 });
      maxH = Math.max(maxH, h);
      x += w[i];
    });
    doc.x = doc.page.margins.left;
    doc.y = y + maxH + 4;
    doc.strokeColor(COLORS.line).moveTo(doc.page.margins.left, doc.y - 2).lineTo(doc.page.margins.left + usable, doc.y - 2).stroke();
  };
  drawRow(headers, true);
  rows.forEach((r) => drawRow(r, false));
  doc.fontSize(9.5);
}

export function watermark(doc: Pdf, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.fillColor(COLORS.danger).opacity(0.15).font('Helvetica-Bold').fontSize(80).text(text, 60, doc.page.height / 2 - 40, { width: doc.page.width - 120, align: 'center' });
    doc.restore();
    doc.opacity(1);
  }
}

export function footer(doc: Pdf, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(`${text} · Página ${i + 1} de ${range.count}`, doc.page.margins.left, doc.page.height - 36, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' });
    doc.page.margins.bottom = bottom;
  }
}

export function pdfToBuffer(doc: Pdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
