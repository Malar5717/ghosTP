import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: [
      'tidy-masks-smile.loca.lt',
      '.loca.lt',
      'localhost'
    ]
  }
})
