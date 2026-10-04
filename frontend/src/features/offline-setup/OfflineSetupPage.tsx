// Explains local certificate trust before installing the authenticated app for offline use.
import { Download, House } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Renders the server-trust instructions and local certificate download. */
export function OfflineSetupPage() {
  return (
    <section className="mx-auto grid max-w-5xl gap-6 px-3 py-5 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold">Offline setup</h1>
        <p className="mt-1 text-muted">
          To add this app to your Home Screen and use it offline, your phone
          needs a trusted HTTPS connection. Because this server has no public
          domain, it uses a local certificate that you must install and trust
          once.
        </p>
      </div>
      <div className="grid gap-4 rounded-xl border border-border bg-surface-raised p-5 sm:p-6">
        <ol className="grid list-none gap-4" start={0}>
          <li className="flex items-start gap-3">
            <span
              className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
              aria-hidden
            >
              0
            </span>
            <h2 className="pt-1 font-bold">Return to the main groups view</h2>
          </li>
          <li className="flex items-start gap-3">
            <span
              className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
              aria-hidden
            >
              1
            </span>
            <h2 className="pt-1 font-bold">Add the app to your Home Screen</h2>
          </li>
          <li className="flex items-start gap-3">
            <span
              className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
              aria-hidden
            >
              2
            </span>
            <h2 className="pt-1 font-bold">
              Open Offline setup (this page) from the Home Screen shortcut
            </h2>
          </li>
          <li className="flex items-start gap-3">
            <span
              className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
              aria-hidden
            >
              3
            </span>
            <div>
              <h2 className="pt-1 font-bold">Download the certificate</h2>
              <a
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2 font-semibold text-accent-contrast transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                href="/caddy-root.crt"
              >
                <Download aria-hidden size={18} />
                Download
              </a>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span
              className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
              aria-hidden
            >
              4
            </span>
            <div>
              <h2 className="pt-1 font-bold">
                Install and trust the certificate
              </h2>
              <p className="mt-1 text-muted">
                If you’re unsure, search the web for the current iOS or Android
                instructions.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span
              className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
              aria-hidden
            >
              5
            </span>
            <h2 className="pt-1 font-bold">Restart the app</h2>
          </li>
        </ol>
        <p className="text-sm text-muted">
          Only install this certificate when you are connected to your own
          server and network.
        </p>
      </div>
      <div className="fixed bottom-4 left-4 z-20 md:hidden">
        <Link
          className="grid size-11 place-items-center rounded-full border border-border bg-surface-raised shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          to="/groups"
          aria-label="All groups"
        >
          <House aria-hidden size={19} />
        </Link>
      </div>
    </section>
  )
}
