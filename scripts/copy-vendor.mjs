// Kopiert jsPDF in den Web-Ordner (offline, ohne CDN) und übersetzt es nach ES2020,
// damit es auch auf älteren iPhones (Safari ab iOS 14) läuft. jsPDF 4.x selbst nutzt ES2022.
import { mkdirSync } from 'node:fs';
import { buildSync } from 'esbuild';
mkdirSync('www/vendor', { recursive: true });
buildSync({
  entryPoints: ['node_modules/jspdf/dist/jspdf.umd.min.js'],
  outfile: 'www/vendor/jspdf.umd.min.js',
  target: 'es2020',
  minify: true,
  legalComments: 'inline',
  logLevel: 'warning',
});
console.log('jsPDF (ES2020) -> www/vendor/jspdf.umd.min.js');
