// Builds Vite `server` options for LAN HTTP or an HTTPS reverse-proxy subdomain.

type ViteDevProxy = {
  '/api': {
    target: string
    changeOrigin: false
  }
}

export type ViteDevServerOptions = {
  host: true
  allowedHosts?: string[]
  hmr?: {
    host: string
    protocol: 'wss'
    clientPort: 443
  }
  proxy: ViteDevProxy
}

/**
 * Returns Vite server options for local development.
 *
 * @param domain - Public subdomain when a TLS reverse proxy terminates HTTPS;
 *   omit or blank for plain `http://…:5173` LAN access.
 */
export function viteDevServerOptions(
  domain: string | undefined,
): ViteDevServerOptions {
  const proxy: ViteDevProxy = {
    '/api': {
      target: 'http://127.0.0.1:8000',
      // Keep the browser Host (subdomain) so Django ALLOWED_HOSTS matches APP_DOMAIN.
      changeOrigin: false,
    },
  }
  const host = domain?.trim()
  if (!host)
    return {
      host: true,
      proxy,
    }
  return {
    host: true,
    allowedHosts: [host],
    hmr: {
      host,
      protocol: 'wss',
      clientPort: 443,
    },
    proxy,
  }
}
