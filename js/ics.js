// Minimal, honest ICS event import: single VEVENT DTSTART/DTEND/SUMMARY/UID.
// Does not expand RRULE recurrences or resolve arbitrary TZIDs. Preserve original.
export function parseICS(input) {
  const unfolded = input.replace(/\r?\n[ \t]/g, '');
  const entries = [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)];
  return entries
    .map((match, idx) => {
      const lines = match[1].split(/\r?\n/).filter(Boolean);
      const field = prefix => {
        const line = lines.find(line => line.split(':')[0].split(';')[0] === prefix);
        return line?.slice(line.indexOf(':') + 1) || '';
      };
      const start = field('DTSTART');
      const end = field('DTEND');
      if (!start) return null;
      return {
        id: field('UID') || `event-${idx}-${start}`,
        title: field('SUMMARY').replace(/\\,/g, ',').replace(/\\n/gi, ' ') || 'حدث دون عنوان',
        date: parseIcsDate(start),
        endDate: parseIcsDate(end),
        rawDate: start,
        location: field('LOCATION'),
        notes: field('DESCRIPTION').replace(/\\n/g, ' '),
        recurring: !!field('RRULE'),
      };
    })
    .filter(Boolean);
}
function parseIcsDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(s);
  if (!m) return s;
  const [, y, mo, d, h = '00', mi = '00', se = '00', z] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}${z || ''}`;
}
