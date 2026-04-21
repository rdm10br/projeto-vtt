// import * as path from 'path'
// import { dirname } from 'path';
// import { defineConfig } from 'vite'
// import { fileURLToPath } from 'url';
// import react from "@vitejs/plugin-react"

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// export default defineConfig({
//   plugins: [react()],
//   // resolve: {
//   //   alias: {
//   //     "@engine": path.resolve(__dirname, 'client/src/engine'),
//   //     "@network": path.resolve(__dirname, 'client/src/network'),
//   //   }
//   // }
// })
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    react(),
    // O plugin lerá o tsconfig.json local e resolverá os caminhos
    tsconfigPaths({
      projects: ['./tsconfig.json']
    })
  ],
  build: {
    // Garantir que o diretório de saída esteja correto no monorepo
    outDir: 'dist',
  }
});