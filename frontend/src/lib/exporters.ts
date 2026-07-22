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
  const stamp = `Generated: ${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}${p.filterSummary ? '   |   ' + p.filterSummary : ''}`;
  doc.text(stamp, 40, 70);

  const { head, body } = asMatrix(p);
  // Column-specific header tint so Plan/Actual/Attendance stand out
  const HEADER_TINT: Record<string, [number, number, number]> = { planned: [30, 64, 175], actual: [21, 128, 61], attendance: [109, 40, 217] };
  const SHIFT_COLOR: Record<string, [number, number, number]> = { Day: [3, 105, 161], Night: [79, 70, 229] };
  const CELL_COLOR: Record<string, [number, number, number]> = { planned: [30, 58, 138], actual: [21, 128, 61], attendance: [109, 40, 217] };
  autoTable(doc, {
    head: [head],
    body: body as never,
    startY: 80,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', halign: 'center' },
    alternateRowStyles: { fillColor: [243, 246, 252] },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      const colKey = p.columns[data.column.index]?.key;
      if (data.section === 'head') {
        data.cell.styles.halign = 'center'; // force-override any auto left/right alignment per column
        if (colKey && HEADER_TINT[colKey]) data.cell.styles.fillColor = HEADER_TINT[colKey];
        return;
      }
      const row = p.rows[data.row.index];
      if (!row) return;
      if (row._section) {
        data.cell.styles.fillColor = [219, 234, 254]; // blue-100
        data.cell.styles.textColor = [30, 58, 138];
        data.cell.styles.fontStyle = 'bold';
      } else if (row._total) {
        data.cell.styles.fillColor = [255, 237, 213]; // amber-100
        data.cell.styles.fontStyle = 'bold';
        if (colKey === 'costCentre') data.cell.styles.halign = 'right'; // "Total X" label reads into the numbers
      } else if (colKey === 'shift' && typeof row.shift === 'string' && SHIFT_COLOR[row.shift]) {
        data.cell.styles.textColor = SHIFT_COLOR[row.shift];
        data.cell.styles.fontStyle = 'bold';
      } else if (colKey && CELL_COLOR[colKey]) {
        data.cell.styles.textColor = CELL_COLOR[colKey];
      }
    },
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
  const { head } = asMatrix(p);
  const win = window.open('', '_blank');
  if (!win) return;
  const HEADER_TINT: Record<string, string> = { planned: '#1e40af', actual: '#15803d', attendance: '#6d28d9' };
  const SHIFT_COLOR: Record<string, string> = { Day: '#0369a1', Night: '#4f46e5' };
  const CELL_COLOR: Record<string, string> = { planned: '#1e3a8a', actual: '#15803d', attendance: '#6d28d9' };
  const rowsHtml = p.rows
    .map((r) => {
      const rowClass = r._section ? 'section' : r._total ? 'total' : '';
      const cells = p.columns
        .map((c) => {
          const val = r[c.key] ?? '';
          let style = '';
          if (rowClass === 'total' && c.key === 'costCentre') style = 'text-align:right'; // "Total X" label reads into the numbers
          else if (!rowClass) {
            if (c.key === 'shift' && typeof val === 'string' && SHIFT_COLOR[val]) style = `color:${SHIFT_COLOR[val]};font-weight:600`;
            else if (CELL_COLOR[c.key]) style = `color:${CELL_COLOR[c.key]}`;
          }
          return `<td style="${style}">${String(val)}</td>`;
        })
        .join('');
      return `<tr class="${rowClass}">${cells}</tr>`;
    })
    .join('');
  win.document.write(`
    <html><head><title>${p.title}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;padding:24px;color:#111}
      h1{color:#1E3A8A;margin:0} .sub{color:#666;font-size:12px;margin:4px 0 16px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th{background:#1E3A8A;color:#fff;padding:8px;text-align:center}
      td{border:1px solid #ddd;padding:6px}
      tr:nth-child(even){background:#f3f6fc}
      tr.section td{background:#dbeafe;color:#1e3a8a;font-weight:700}
      tr.total td{background:#ffedd5;font-weight:700}
    </style></head><body>
    <h1>TAG - MPS — ${p.title}</h1>
    <div class="sub">${p.filterSummary ?? ''} | Generated ${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}</div>
    <table><thead><tr>${head.map((h, i) => `<th style="${HEADER_TINT[p.columns[i]?.key] ? `background:${HEADER_TINT[p.columns[i].key]}` : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
