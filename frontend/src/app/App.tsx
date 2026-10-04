// Provides the root router composition for public and session-protected application routes.
import { RouterProvider } from 'react-router-dom'
import { router } from './router.tsx'

/**
 * Renders the browser router after it is available.
 *
 * @returns The root element that later contains routed screens.
 */
export function App() {
  return router ? <RouterProvider router={router} /> : null
}
