# Split That Money frontend

Run these commands from `frontend/`:

```bash
npm run dev
npm test
npm run lint
npm run build
npm run preview
```

## Offline check

1. Run `npm run build`, then `npm run preview`, and open the reported local URL in a browser. The production preview enables the PWA service worker; `npm run dev` does not.
2. Open DevTools, then Network, and enable **Offline**.
3. Reload the page to confirm the application shell still opens.
4. Create or edit an expense or settlement after that capability is available, then confirm the change is queued locally.
5. Disable Offline and confirm the queued money change synchronizes.
