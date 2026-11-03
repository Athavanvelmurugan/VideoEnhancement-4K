/**
 * Build Script for Thamizh Web Studio
 * Packages web assets into a dedicated www/ folder for Capacitor Android packaging.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'www');

console.log('📦 Packaging Thamizh Web Studio assets for Android Capacitor...');

// 1. Clean or create output directory
if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// 2. Helper to copy directories recursively
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 3. Copy asset directories
copyDirSync(path.join(rootDir, 'css'), path.join(outDir, 'css'));
copyDirSync(path.join(rootDir, 'js'), path.join(outDir, 'js'));
copyDirSync(path.join(rootDir, 'icons'), path.join(outDir, 'icons'));

// 4. Copy root web files
const singleFiles = ['index.html', 'manifest.json', 'sw.js'];
for (const file of singleFiles) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(outDir, file));
    }
}

console.log('✅ Assets successfully packaged into www/ folder!');
