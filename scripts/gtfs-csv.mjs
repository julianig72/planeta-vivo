export function csv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) {
      row.push(value.trim()); value = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (c !== '\r') value += c;
  }
  if (quoted) throw new Error('CSV GTFS incompleto.');
  if (value || row.length) { row.push(value.trim()); rows.push(row); }
  const header = rows.shift();
  if (!header) throw new Error('CSV GTFS vacío.');
  return rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])));
}
