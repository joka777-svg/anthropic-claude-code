// Kopiert jsPDF in den Web-Ordner, damit die App offline ohne CDN funktioniert.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('www/vendor', { recursive: true });
copyFileSync('node_modules/jspdf/dist/jspdf.umd.min.js', 'www/vendor/jspdf.umd.min.js');
console.log('jsPDF -> www/vendor/jspdf.umd.min.js');
