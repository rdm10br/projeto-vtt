import * as path from 'path'
import { dirname } from 'path';
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url';
import react from "@vitejs/plugin-react"

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@engine": path.resolve(__dirname, 'client/src/engine'),
      "@network": path.resolve(__dirname, 'client/src/network'),
    }
  }
})