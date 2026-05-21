import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv', '**/*.wasm'],

  // ── Chrome Extension Build ─────────────────────────────────────────────────
  // Run `vite build` to produce the extension bundle in dist/.
  // The sidebar popup is compiled from index.html (main entry).
  // The content script is compiled as a separate entry with a stable filename
  // that matches the path declared in public/manifest.json.
  build: {
    rollupOptions: {
      input: {
        // Main sidebar popup
        index: './index.html',
        // Content script injected into Udemy pages (separate bundle, no React)
        content_script: './src/content_script.ts',
      },
      output: {
        // Give the content script a predictable filename so manifest.json
        // can reference it as "assets/content_script.js"
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'content_script'
            ? 'assets/content_script.js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})