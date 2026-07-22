import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Busca a porta do backend de forma dinâmica
let backendPort = 8000
try {
  const portFile = path.resolve(__dirname, '../data/port.json')
  if (fs.existsSync(portFile)) {
    const data = JSON.parse(fs.readFileSync(portFile, 'utf-8'))
    if (data.port) {
      backendPort = data.port
    }
  }
} catch (e) {
  console.warn("Could not read dynamic backend port, falling back to 8000:", e)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'write-port-plugin',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const address = server.httpServer?.address()
          if (address && typeof address === 'object') {
            const port = address.port
            try {
              const dataDir = path.resolve(__dirname, '../data')
              if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true })
              }
              fs.writeFileSync(
                path.join(dataDir, 'vite_port.json'),
                JSON.stringify({ port })
              )
            } catch (err) {
              console.error("Failed to write vite_port.json:", err)
            }
          }
        })
      }
    }
  ],
  server: {
    host: '127.0.0.1', // Vincula explicitamente ao IPv4 loopback para evitar problemas com IPv6 e DNS no WebViewer
    port: 0, // Porta dinâmica para o próprio servidor do Vite
    proxy: {
      '/api': ({
        target: `http://127.0.0.1:${backendPort}`,
        router: () => {
          try {
            const portFile = path.resolve(__dirname, '../data/port.json')
            if (fs.existsSync(portFile)) {
              const data = JSON.parse(fs.readFileSync(portFile, 'utf-8'))
              if (data.port) return `http://127.0.0.1:${data.port}`
            }
          } catch (e) {}
          return `http://127.0.0.1:8000`
        },
        changeOrigin: true,
        ws: true,
      } as any)
    }
  }
})
