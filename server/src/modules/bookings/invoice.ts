import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { formatINR } from '../../lib/money.js';
import type { bookingDetail } from './booking.view.js';
import type { Settings } from '../settings/settings.service.js';

type Detail = Awaited<ReturnType<typeof bookingDetail>>;
const rs = (p: number) => formatINR(p).replace('₹', 'Rs. '); // built-in PDF fonts lack the ₹ glyph
const LOGO = path.resolve(process.cwd(), 'assets/logo-mark.png');

/** Branded PDF invoice. Streams to `out`. */
export function renderInvoice(d: Detail, s: Settings, customerName: string | null, out: NodeJS.WritableStream) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${d.code}`, Author: s.company.name } });
  doc.pipe(out);
  const navy = '#0B2559', orange = '#F25A0C', grey = '#5B6476';

  if (fs.existsSync(LOGO)) doc.image(LOGO, 48, 44, { width: 46 });
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text(s.company.name, 104, 48);
  doc.fillColor(grey).font('Helvetica').fontSize(9).text(s.company.tagline, 104, 70);
  const contact = [s.company.address, s.company.supportPhone, s.company.email, s.company.gstin ? `GSTIN: ${s.company.gstin}` : null].filter(Boolean).join('  ·  ');
  if (contact) doc.text(contact, 104, 83, { width: 300 });

  doc.fillColor(orange).font('Helvetica-Bold').fontSize(20).text(d.status === 'COMPLETED' ? 'TAX INVOICE' : 'BOOKING SUMMARY', 300, 48, { width: 247, align: 'right' });
  doc.fillColor(grey).font('Helvetica').fontSize(9)
    .text(`Booking ID: ${d.code}`, 300, 74, { width: 247, align: 'right' })
    .text(`Date: ${(d.completedAt ?? d.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { width: 247, align: 'right' })
    .text(`Payment: ${d.paymentStatus.replaceAll('_', ' ')}`, { width: 247, align: 'right' });

  doc.moveTo(48, 120).lineTo(547, 120).strokeColor('#E3E8F2').stroke();
  const a = d.address as Record<string, string | null>;
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text('Billed to', 48, 132);
  doc.fillColor('#111').font('Helvetica').fontSize(9)
    .text(customerName ?? a.contactName ?? '', 48, 147)
    .text([a.houseNo, a.street, a.locality].filter(Boolean).join(', '), { width: 240 })
    .text([a.landmark ? `Landmark: ${a.landmark}` : null, `${a.city ?? ''} ${a.pincode ?? ''}`].filter(Boolean).join(', '), { width: 240 });
  doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text('Service', 320, 132);
  doc.fillColor('#111').font('Helvetica').fontSize(9).text(`${d.scheduledDate} · ${d.slotLabel}`, 320, 147)
    .text(d.technician ? `Technician: ${d.technician.name ?? ''} (${d.technician.code})` : 'Technician: —');

  let y = 210;
  const row = (c: string[], bold = false, color = '#111') => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color);
    doc.text(c[0], 48, y, { width: 260 }); doc.text(c[1], 310, y, { width: 50, align: 'right' }); doc.text(c[2], 365, y, { width: 85, align: 'right' }); doc.text(c[3], 455, y, { width: 92, align: 'right' });
    y += 18;
  };
  doc.rect(48, y - 6, 499, 22).fill('#F1F4FA'); row(['Description', 'Qty', 'Rate', 'Amount'], true, navy);
  for (const i of d.items) row([i.name, String(i.quantity), rs(i.unitPrice), rs(i.unitPrice * i.quantity)]);
  for (const x of d.addons.filter((x) => x.status === 'APPROVED')) row([`${x.kind === 'PART' ? 'Spare part' : 'Additional'}: ${x.name}`, String(x.quantity), rs(x.unitPrice), rs(x.unitPrice * x.quantity)]);
  doc.moveTo(48, y).lineTo(547, y).strokeColor('#E3E8F2').stroke(); y += 10;

  const total = (label: string, v: string, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(bold ? navy : '#111'); doc.text(label, 300, y, { width: 150, align: 'right' }); doc.text(v, 455, y, { width: 92, align: 'right' }); y += bold ? 20 : 16; };
  const b = d.bill;
  total('Services', rs(b.itemsTotal));
  if (b.addonsTotal) total('Approved additions', rs(b.addonsTotal));
  if (b.couponDiscount) total('Coupon discount', '- ' + rs(b.couponDiscount));
  if (b.taxTotal) total(b.taxInclusive ? `${s.tax.label} (included)` : s.tax.label, rs(b.taxTotal));
  if (b.walletUsed) total('Wallet', '- ' + rs(b.walletUsed));
  total('Total payable', rs(b.grandTotal), true);
  total('Paid', rs(b.amountPaid));
  if (b.amountDue) total('Balance due', rs(b.amountDue), true);

  y += 16;
  if (d.warranty.until) { doc.fillColor(orange).font('Helvetica-Bold').fontSize(10).text(`Service warranty valid until ${d.warranty.until}`, 48, y); y += 16; }
  doc.fillColor(grey).font('Helvetica').fontSize(8).text('Spare parts are charged separately where applicable and only after your approval. Warranty covers the work performed and parts replaced by us, subject to terms.', 48, y, { width: 499 });
  doc.fillColor(grey).fontSize(8).text(`${s.company.name} · Thank you for choosing us.`, 48, 780, { width: 499, align: 'center' });
  doc.end();
}
