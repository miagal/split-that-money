// Renders the authenticated account trigger, controlled dropdown, theme preference, and logout action.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Check,
  CloudOff,
  LogOut,
  RefreshCw,
  Settings,
  Skull,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { UserDto } from '../../api/contracts.ts'
import {
  useAuth,
  useSyncPendingChanges,
  useSyncStatus,
} from '../../app/providers.tsx'
import { canAccessAdmin } from '../../app/router-rules.ts'
import {
  shouldAnimateOverflow,
  shouldCloseAccountMenu,
  syncPendingLabel,
  syncPresentation,
} from './account-menu-rules.ts'
import { Switch } from '../../components/Switch.tsx'
import { Button } from '../../components/Button.tsx'
import { Dialog } from '../../components/Dialog.tsx'
import { useTheme } from './theme.ts'

type AccountMenuProps = { user: UserDto }

/**
 * Renders the account popover for an authenticated user.
 *
 * @param props - The signed-in user displayed by the trigger and popover.
 * @returns The account control and its small menu.
 */
export function AccountMenu({ user }: AccountMenuProps) {
  const navigate = useNavigate()
  const {
    sessionExpired,
    sessionExpiredNoticeSeen,
    dismissSessionExpiredNotice,
    logout,
    leaveToLogin,
  } = useAuth()
  const syncStatus = useSyncStatus()
  const pendingChanges = useSyncPendingChanges()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [emailOverflow, setEmailOverflow] = useState<{
    animate: boolean
    distance: number
  }>({ animate: false, distance: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const emailTrackRef = useRef<HTMLSpanElement>(null)
  const initials =
    `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase()
  const online = typeof navigator === 'undefined' || navigator.onLine
  const noticeOpen = sessionExpired && !sessionExpiredNoticeSeen
  const presentation = syncPresentation(syncStatus)
  const StatusIcon: LucideIcon = {
    check: Check,
    refresh: RefreshCw,
    upload: Upload,
    'cloud-off': CloudOff,
    warning: TriangleAlert,
  }[presentation.icon]
  const statusClass =
    presentation.tone === 'success'
      ? 'text-accent'
      : presentation.tone === 'warning'
        ? 'text-amber-500'
        : presentation.tone === 'danger'
          ? 'text-danger'
          : 'text-muted'
  const pendingLabel = syncPendingLabel(syncStatus, pendingChanges)

  useEffect(() => {
    if (!open) return

    /** Closes only for pointer targets outside both persistent account surfaces. */
    function onPointerDown(event: PointerEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (
        shouldCloseAccountMenu({
          targetInsideMenu: menuRef.current?.contains(target) ?? false,
          targetInsideTrigger: triggerRef.current?.contains(target) ?? false,
        })
      )
        setOpen(false)
    }

    /** Lets keyboard users dismiss the same controlled menu without changing Tab behavior. */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    /** Measures actual clipping so ordinary email addresses remain still. */
    function measureEmailOverflow(): void {
      const track = emailTrackRef.current
      if (!track) return
      setEmailOverflow({
        animate: shouldAnimateOverflow({
          scrollWidth: track.scrollWidth,
          clientWidth: track.clientWidth,
          reducedMotion: media.matches,
        }),
        distance: Math.max(track.scrollWidth - track.clientWidth, 0),
      })
    }

    measureEmailOverflow()
    window.addEventListener('resize', measureEmailOverflow)
    media.addEventListener('change', measureEmailOverflow)
    return () => {
      window.removeEventListener('resize', measureEmailOverflow)
      media.removeEventListener('change', measureEmailOverflow)
    }
  }, [open, user.email])

  /**
   * Delegates to the unified logout flow, then always returns the UI to login.
   *
   * @returns Nothing.
   */
  async function signOut(): Promise<void> {
    try {
      await logout()
    } finally {
      navigate('/login')
    }
  }

  /** Leaves to login after marking the expired-session notice seen for this app start. */
  function signInAgain(): void {
    dismissSessionExpiredNotice()
    setOpen(false)
    leaveToLogin()
    navigate('/login')
  }

  return (
    <div className="relative">
      <Dialog
        open={noticeOpen}
        title="Session expired"
        onClose={dismissSessionExpiredNotice}
        nestedConfirmationOpen={false}
        saving={false}
        footer={
          <>
            <Button variant="secondary" onClick={dismissSessionExpiredNotice}>
              Later
            </Button>
            <Button onClick={signInAgain}>Sign in</Button>
          </>
        }
      >
        <p>
          Your changes are safe on this device. Sign in again as {user.email} to
          sync them with the server.
        </p>
      </Dialog>
      <button
        ref={triggerRef}
        className="flex items-center gap-3 rounded-full p-1 text-sm font-semibold"
        type="button"
        aria-expanded={open}
        aria-label="Open account menu"
        onClick={() => setOpen((visible) => !visible)}
      >
        <span className="hidden sm:inline">{user.display_name}</span>
        <span className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-surface leading-none text-accent">
          {initials}
          {sessionExpired ? (
            <Skull
              aria-label="Session expired"
              size={12}
              className="absolute -bottom-1 -right-1 text-danger"
            />
          ) : (
            <span
              className={`absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-surface-raised bg-surface-raised ${statusClass}`}
              role="status"
              aria-label={`Sync status: ${presentation.label}`}
              title={`Sync status: ${presentation.label}`}
            >
              <StatusIcon
                aria-hidden
                size={12}
                className={
                  presentation.icon === 'refresh' ? 'animate-spin' : undefined
                }
              />
            </span>
          )}
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-surface-raised p-3 shadow-lg"
        >
          <p className="border-b border-border pb-3 text-sm text-muted">
            <span
              ref={emailTrackRef}
              className="account-menu-email-track"
              tabIndex={0}
            >
              {emailOverflow.animate ? (
                <span
                  className="account-menu-email-marquee"
                  style={
                    {
                      '--account-menu-email-shift': `-${emailOverflow.distance}px`,
                    } as CSSProperties
                  }
                >
                  {user.email}
                </span>
              ) : (
                user.email
              )}
            </span>
          </p>
          {sessionExpired && (
            <button
              className="flex w-full items-start gap-2 border-b border-border py-3 text-left text-sm text-danger"
              type="button"
              onClick={signInAgain}
            >
              <Skull aria-hidden size={16} className="mt-0.5 shrink-0" />
              <span>
                <span className="block font-semibold">Session expired.</span>
                <span className="text-muted">
                  Sign in again to sync your data with the server.
                </span>
              </span>
            </button>
          )}
          <div
            className={`flex w-full flex-col gap-0.5 border-b border-border pt-3 text-left text-sm ${pendingLabel ? 'pb-0.5' : 'pb-3'}`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-base font-medium">Sync status</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-current px-2 py-0.5 font-medium ${statusClass}`}
              >
                <StatusIcon
                  aria-hidden
                  size={15}
                  className={
                    presentation.icon === 'refresh' ? 'animate-spin' : undefined
                  }
                />
                {presentation.label}
              </span>
            </span>
            {pendingLabel && (
              <span className="w-full text-right text-xs text-muted">
                {pendingLabel}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between py-3 text-sm">
            <span className="text-base font-medium">Dark mode</span>
            <Switch
              checked={theme === 'dark'}
              aria-label="Toggle dark mode"
              onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')}
            />
          </div>
          <button
            className="flex w-full items-center gap-2 border-t border-border py-3 text-left text-base font-medium"
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/offline_setup')
            }}
          >
            <Settings aria-hidden size={16} />
            Offline setup
          </button>
          {canAccessAdmin(user) && online && (
            <button
              className="w-full border-t border-border py-3 text-left text-sm"
              type="button"
              onClick={() => {
                setOpen(false)
                navigate('/admin/users')
              }}
            >
              User management
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 border-t border-border pt-3 text-left text-base font-medium text-danger"
            type="button"
            onClick={signOut}
          >
            <LogOut aria-hidden size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
