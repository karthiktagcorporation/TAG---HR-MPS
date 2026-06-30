import ExcelJS from 'exceljs';
import { Response } from 'express';
import { ReportResult } from './report.service';

/** Streams a report as a branded XLSX workbook. */
export async function streamReportXlsx(res: Response, report: ReportResult, filterSummary: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TAG - MPS';
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 30));

  // Branded header
  ws.mergeCells(1, 1, 1, report.columns.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = `TAG Corporation — ${report.title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A8A' } };

  ws.mergeCells(2, 1, 2, report.columns.length);
  const metaCell = ws.getCell('A2');
  metaCell.value = `${filterSummary}  |  Generated: ${new Date().toLocaleString()}`;
  metaCell.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };

  // Column headers
  const headerRow = ws.addRow(report.columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Data rows
  for (const row of report.rows) {
    ws.addRow(report.columns.map((c) => row[c.key] ?? ''));
  }

  // Column widths
  report.columns.forEach((c, i) => {
    const maxLen = Math.max(c.label.length, ...report.rows.map((r) => String(r[c.key] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(40, Math.max(12, maxLen + 2));
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${report.type}-${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
