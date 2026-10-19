// Verifies public config is shown from cache immediately and replaced only after a live read.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { PublicConfigDto } from '../../api/contracts.ts'

type HookHarness = ReturnType<typeof publicConfigHarness>
const require = createRequire(import.meta.url)
const stored: PublicConfigDto = {
  ALLOW_SELF_REGISTRATION: true,
  SHOW_APP_VERSION: true,
  SHELL_NETWORK_TIMEOUT_SECONDS: 3,
  SYNC_REQUEST_TIMEOUT_SECONDS: 8,
  LOCAL_CA_SETUP: true,
  APP_VERSION: 'v1.2.3',
  APP_GIT: 'abc1234',
}
const live: PublicConfigDto = {
  ...stored,
  SHOW_APP_VERSION: false,
  APP_VERSION: 'v1.2.4',
}

/** Runs the real hook with stored and live public config replaced at the API boundary. */
function publicConfigHarness(options: {
  stored?: PublicConfigDto | null
  live?: PublicConfigDto
  liveError?: Error
}) {
  const states: unknown[] = []
  const effects: Array<() => void | (() => void)> = []
  let stateIndex = 0
  const react = {
    useState(initial: unknown) {
      const index = stateIndex++
      if (!(index in states))
        states[index] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [
        states[index],
        (value: unknown) => {
          states[index] =
            typeof value === 'function'
              ? (value as (old: unknown) => unknown)(states[index])
              : value
        },
      ]
    },
    useEffect(effect: () => void | (() => void)) {
      effects.push(effect)
    },
  }
  const compiled = ts.transpileModule(
    readFileSync(new URL('./public-config.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText
  const exports: { usePublicConfig?: () => PublicConfigDto | null } = {}
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === 'react') return react
      if (name.endsWith('auth-api.ts'))
        return {
          readStoredPublicConfig: () => options.stored ?? null,
          getPublicConfig: () =>
            options.liveError
              ? Promise.reject(options.liveError)
              : Promise.resolve(options.live ?? live),
        }
      return require(name)
    },
  })
  return {
    read(): PublicConfigDto | null {
      stateIndex = 0
      return exports.usePublicConfig!()
    },
    flushEffects() {
      effects.splice(0).forEach((effect) => effect())
    },
  }
}

/** Lets the live public-config promise settle. */
async function afterLive(hook: HookHarness): Promise<PublicConfigDto | null> {
  hook.read()
  hook.flushEffects()
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
  return hook.read()
}

test('usePublicConfig returns stored config before the live read finishes', () => {
  const hook = publicConfigHarness({ stored })
  assert.deepEqual(hook.read(), stored)
})

test('usePublicConfig replaces stored config when the live read succeeds', async () => {
  const hook = publicConfigHarness({ stored, live })
  assert.deepEqual(await afterLive(hook), live)
})

test('usePublicConfig keeps stored config when the live read fails', async () => {
  const hook = publicConfigHarness({
    stored,
    liveError: new TypeError('Failed to fetch'),
  })
  assert.deepEqual(await afterLive(hook), stored)
})
