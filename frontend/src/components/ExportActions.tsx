import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button } from './ui';
import { exportToCsv, exportToExcel, exportToPdf, printPayload } from '@/lib/exporters';
import type { ReportColumn } from '@/types';

interface Props {
  filename: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  filterSummary?: string;
  disabled?: boolean;
}

export function ExportActions({ filename, title, columns, rows, filterSummary, disabled }: Props) {
  const payload = { filename, title, columns, rows, filterSummary };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => exportToExcel(payload)}>
        <FileSpreadsheet className="h-4 w-4" /> Excel
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => exportToCsv(payload)}>
        <FileDown className="h-4 w-4" /> CSV
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => exportToPdf(payload)}>
        <FileText className="h-4 w-4" /> PDF
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => printPayload(payload)}>
        <Printer className="h-4 w-4" /> Print
      </Button>
    </div>
  );
}
