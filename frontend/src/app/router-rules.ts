// Holds pure session-route decisions so native tests do not need to load JSX route definitions.
import type { UserDto } from '../api/contracts.ts'

type SessionRouteUser = { id: string }
const publicRoutes = new Set(['/login', '/offline_setup'])

/**
 * Resolves the path allowed for the current session state.
 *
 * @param session - A minimal signed-in identity, or null when unauthenticated.
 * @param pathname - The requested browser path.
 * @returns The requested path or the appropriate login/groups redirect.
 */
export function nextPathForSession(
  session: SessionRouteUser | null,
  pathname: string,
): string {
  if (!session && !publicRoutes.has(pathname)) return '/login'
  if (session && pathname === '/login') return '/groups'
  return pathname
}

/** Returns whether a signed-in account may enter the system-admin route. */
export function canAccessAdmin(
  session: Pick<UserDto, 'is_staff' | 'is_superuser'> | null,
): boolean {
  return Boolean(session && (session.is_staff || session.is_superuser))
}
