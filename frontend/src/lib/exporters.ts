import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportColumn } from '@/types';

interface ExportPayload {
  filename: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  filterSummary?: string;
}

function asMatrix({ columns, rows }: ExportPayload) {
  const head = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => r[c.key] ?? ''));
  return { head, body };
}

export function exportToExcel(p: ExportPayload) {
  const { head, body } = asMatrix(p);
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws['!cols'] = head.map((h, i) => ({
    wch: Math.min(40, Math.max(12, Math.max(String(h).length, ...body.map((r) => String(r[i] ?? '').length)) + 2)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, p.title.slice(0, 30) || 'Report');
  XLSX.writeFile(wb, `${p.filename}.xlsx`);
}

export function exportToCsv(p: ExportPayload) {
  const { head, body } = asMatrix(p);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head, ...body].map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(p: ExportPayload) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Branded header
  doc.setFillColor(30, 58, 138); // brand dark blue
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('TAG - MPS', 40, 26);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('TAG Corporation — Manpower Plan vs Actual', 40, 42);
  doc.setTextColor(249, 115, 22); // accent
  doc.setFont('helvetica', 'bold');
  doc.text(p.title, pageWidth - 40, 30, { align: 'right' });

  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const stamp = `Generated: ${new Date().toLocaleString()}${p.filterSummary ? '   |   ' + p.filterSummary : ''}`;
  doc.text(stamp, 40, 70);

  const { head, body } = asMatrix(p);
  autoTable(doc, {
    head: [head],
    body: body as never,
    startY: 80,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [243, 246, 252] },
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${data.pageNumber} of ${page}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
    },
  });

  doc.save(`${p.filename}.pdf`);
}

export function printPayload(p: ExportPayload) {
  const { head, body } = asMatrix(p);
  const win = window.open('', '_blank');
  if (!win) return;
  const rowsHtml = body
    .map((r) => `<tr>${r.map((c) => `<td>${String(c ?? '')}</td>`).join('')}</tr>`)
    .join('');
  win.document.write(`
    <html><head><title>${p.title}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;padding:24px;color:#111}
      h1{color:#1E3A8A;margin:0} .sub{color:#666;font-size:12px;margin:4px 0 16px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th{background:#1E3A8A;color:#fff;padding:8px;text-align:left}
      td{border:1px solid #ddd;padding:6px}
      tr:nth-child(even){background:#f3f6fc}
    </style></head><body>
    <h1>TAG - MPS — ${p.title}</h1>
    <div class="sub">${p.filterSummary ?? ''} | Generated ${new Date().toLocaleString()}</div>
    <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
