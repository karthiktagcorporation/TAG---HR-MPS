/** App-wide standard date format: DD/MM/YYYY (India). */
export function fmtDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

/** DD/MM/YYYY HH:mm in Indian time — for "Generated:" stamps on exports. */
export function fmtDateTimeIST(d = new Date()): string {
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}
