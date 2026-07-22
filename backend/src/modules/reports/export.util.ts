import ExcelJS from 'exceljs';
import { Response } from 'express';
import { ReportResult } from './report.service';
import { fmtDateTimeIST } from '../../utils/dateFormat';

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
  // IST + DD/MM/YYYY — the container runs in UTC, so a plain toLocaleString showed the wrong date
  metaCell.value = `${filterSummary}  |  Generated: ${fmtDateTimeIST()}`;
  metaCell.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };

  // Column headers
  const headerRow = ws.addRow(report.columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Column-specific header tint so Plan/Actual/Attendance stand out from the rest
  const HEADER_TINTS: Record<string, string> = { planned: 'FF1E40AF', actual: 'FF15803D', attendance: 'FF6D28D9' };
  headerRow.eachCell((cell, colNumber) => {
    const key = report.columns[colNumber - 1]?.key;
    if (key && HEADER_TINTS[key]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_TINTS[key] } };
  });

  // Data rows — category/section and subtotal rows get a background tint;
  // the Shift/Plan/Actual/Attendance % columns get a distinguishing font color.
  const SHIFT_COLOR: Record<string, string> = { Day: 'FF0369A1', Night: 'FF4F46E5' };
  const CELL_COLOR: Record<string, string> = { planned: 'FF1E3A8A', actual: 'FF15803D', attendance: 'FF6D28D9' };
  for (const row of report.rows) {
    const values = report.columns.map((c) => row[c.key] ?? '');
    const xlRow = ws.addRow(values);
    const isSection = row._section === true;
    const isTotal = row._total === true;
    if (isSection || isTotal) {
      const fill = isSection ? 'FFDBEAFE' : 'FFFFEDD5'; // blue-100 / amber-100
      xlRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.font = { bold: true };
      });
      if (isTotal) {
        // "Total X" label reads into the numbers that follow
        const costCentreIdx = report.columns.findIndex((c) => c.key === 'costCentre');
        if (costCentreIdx >= 0) xlRow.getCell(costCentreIdx + 1).alignment = { horizontal: 'right' };
      }
    } else {
      report.columns.forEach((c, i) => {
        const cell = xlRow.getCell(i + 1);
        if (c.key === 'shift' && typeof row.shift === 'string' && SHIFT_COLOR[row.shift]) {
          cell.font = { color: { argb: SHIFT_COLOR[row.shift] }, bold: true };
        } else if (CELL_COLOR[c.key]) {
          cell.font = { color: { argb: CELL_COLOR[c.key] } };
        }
      });
    }
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
