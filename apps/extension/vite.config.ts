import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Copy static files after build
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const publicDir = resolve(__dirname, 'public');
      
      // Copy manifest
      copyFileSync(
        resolve(__dirname, 'src/manifest.json'),
        resolve(distDir, 'manifest.json')
      );
      
      // Copy CSS
      if (existsSync(resolve(__dirname, 'src/content/content.css'))) {
        copyFileSync(
          resolve(__dirname, 'src/content/content.css'),
          resolve(distDir, 'content.css')
        );
      }
      
      // Copy options HTML and JS
      if (!existsSync(resolve(distDir, 'options'))) {
        mkdirSync(resolve(distDir, 'options'), { recursive: true });
      }
      copyFileSync(
        resolve(__dirname, 'src/options/index.html'),
        resolve(distDir, 'options/index.html')
      );
      if (existsSync(resolve(__dirname, 'src/options/options.js'))) {
        copyFileSync(
          resolve(__dirname, 'src/options/options.js'),
          resolve(distDir, 'options/options.js')
        );
      }
      
      // Copy popup HTML
      if (!existsSync(resolve(distDir, 'popup'))) {
        mkdirSync(resolve(distDir, 'popup'), { recursive: true });
      }
      if (existsSync(resolve(__dirname, 'src/popup/popup.html'))) {
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'),
          resolve(distDir, 'popup/popup.html')
        );
      }
      
      // Copy icons
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      const publicIconsDir = resolve(publicDir, 'icons');
      if (existsSync(publicIconsDir)) {
        const iconFiles = readdirSync(publicIconsDir);
        for (const file of iconFiles) {
          if (file.endsWith('.png')) {
            copyFileSync(
              resolve(publicIconsDir, file),
              resolve(iconsDir, file)
            );
          }
        }
      }
      
      // Copy logo.png from public folder
      if (existsSync(resolve(publicDir, 'logo.png'))) {
        copyFileSync(
          resolve(publicDir, 'logo.png'),
          resolve(distDir, 'logo.png')
        );
      }
      
      // Copy logo-square.png from public folder
      if (existsSync(resolve(publicDir, 'logo-square.png'))) {
        copyFileSync(
          resolve(publicDir, 'logo-square.png'),
          resolve(distDir, 'logo-square.png')
        );
      }
      
      console.log('[ClawFi Build] Static files copied successfully');
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.tsx'),
        'content-solana': resolve(__dirname, 'src/content/content-solana.tsx'),
        clanker: resolve(__dirname, 'src/content/sites/clanker.ts'),
        fourmeme: resolve(__dirname, 'src/content/sites/fourmeme.ts'),
        jupiter: resolve(__dirname, 'src/content/sites/jupiter.ts'),
        pancakeswap: resolve(__dirname, 'src/content/sites/pancakeswap.ts'),
        'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
