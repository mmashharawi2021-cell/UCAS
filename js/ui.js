// Shared, dependency-free UI helpers used by app.js and feature pages.

export const iconPath = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3z"/>',
  book: '<path d="M4 5c3-1 6 0 8 2 2-2 5-3 8-2v15c-3-1-6 0-8 2-2-2-5-3-8-2zM12 7v15"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  quiz: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 13h6M9 18h3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  chart: '<path d="M4 20V9m5 11V4m6 16v-7m5 7V7M2 20h20"/>',
  settings:
    '<path d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.4-6.4-2.1 2.1M7.7 16.3l-2.1 2.1m12.8 0-2.1-2.1M7.7 7.7 5.6 5.6"/><circle cx="12" cy="12" r="4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m15 5-7 7 7 7"/>',
  arrow: '<path d="m16 4-9 8 9 8"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  file: '<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zm-10 10 10 5 10-5M2 18l10 5 10-5"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-7 6-7 12 0 18M12 3c7 6 7 12 0 18"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
  lightbulb: '<path d="M9 18h6M10 21h4M8 15a7 7 0 1 1 8 0l-1 2H9z"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12c4 4 14 4 18 0"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>',
  spark: '<path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z"/>',
  link: '<path d="m10 13 4-4M8 15H7a4 4 0 0 1 0-8h4m2 0h4a4 4 0 0 1 0 8h-4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  folder: '<path d="M3 6h6l2 3h10v12H3z"/>',
  cloud: '<path d="M7 19H6a5 5 0 1 1 1-10 7 7 0 0 1 13 2 4 4 0 0 1-1 8h-2"/>',
  moon: '<path d="M20 15a8 8 0 0 1-11-11 8 8 0 1 0 11 11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/>',
  bot: '<rect x="3" y="7" width="18" height="14" rx="4"/><path d="M12 7V3m-4 10h.01M16 13h.01M8 17h8"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  alert: '<path d="M12 3 2 21h20zM12 9v5m0 3v.1"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  rotate: '<path d="M4 5v6h6M5 11a8 8 0 1 1 2 7"/>',
  shield: '<path d="m12 2 8 4v6c0 6-3 9-8 10-5-1-8-4-8-10V6z"/>',
  external: '<path d="M13 4h7v7m0-7-9 9M20 14v6H4V4h6"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  note: '<path d="M5 3h10l4 4v14H5zM9 9h6M9 13h6M9 17h4"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  report: '<path d="M4 20V4h16v16zM8 16v-4m4 4V8m4 8v-6"/>',
  users:
    '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M22 21c0-3-2-6-5-7"/>',
};
export function ic(name, size = 20) {
  return `<svg class="svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${iconPath[name] || iconPath.file}</svg>`;
}
export function esc(x) {
  return String(x ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
