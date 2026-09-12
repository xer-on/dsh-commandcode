/**
 * Unit tests for `getUsage()` — the account endpoints behind the settings
 * page's account card and the sidebar panel (node:test, zero network: fetch
 * is stubbed).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CommandCodeAdapter } from '../src/adapter.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fetch stub serving canned per-path responses. */
function makeFetch(paths: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input)
    const path = new URL(url).pathname
    const canned = paths[path]
    if (!canned) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(canned.body), {
      status: canned.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

function makeAdapter(fetchImpl: typeof fetch): CommandCodeAdapter {
  return new CommandCodeAdapter({
    options: () => ({
      apiBase: 'https://api.commandcode.ai',
      workingDir: '/tmp',
      modelsCachePath: '/tmp/cache.json',
    }),
    resolveApiKey: async () => 'user_test_key',
    fetchImpl,
  })
}

// ---------------------------------------------------------------------------
// getUsage parsing
// ---------------------------------------------------------------------------

test('getUsage parses account, usage, and credits', async () => {
  const adapter = makeAdapter(makeFetch({
    '/alpha/whoami': { status: 200, body: { success: true, user: { id: 'u1', name: 'Test User', userName: 'test-user' }, org: { id: 'org1' } } },
    '/alpha/usage/summary': {
      status: 200,
      body: {
        totalCount: 935, totalCost: 1.3187, successRate: 100,
        completedCount: 935, failedCount: 0,
        totalTokensIn: 182721588, totalTokensOut: 790556, totalCredits: 1.3187,
        periodBasis: 'billing-period',
      },
    },
    '/alpha/billing/credits': {
      status: 200,
      body: {
        credits: { monthlyCredits: 8.68, purchasedCredits: 0, freeCredits: 0 },
        windowLimits: {
          fiveHour: { used: 0.035, cap: 3, exceeded: false, resetAt: 1786775976124 },
          weekly: { used: 1.32, cap: 6, exceeded: false, resetAt: 1787310657649 },
        },
      },
    },
    '/alpha/billing/subscriptions': {
      status: 200,
      body: {
        success: true,
        data: { planId: 'individual-pro', status: 'active', currentPeriodStart: '2026-08-01T00:00:00Z', currentPeriodEnd: '2026-09-01T00:00:00Z' },
      },
    },
  }))

  const report = await adapter.getUsage()
  assert.equal(report.failures.length, 0)
  assert.equal(report.account?.name, 'Test User')
  assert.equal(report.usage?.totalCount, 935)
  assert.equal(report.usage?.totalCost, 1.3187)
  assert.equal(report.credits?.monthlyCredits, 8.68)
  assert.equal(report.credits?.fiveHour.cap, 3)
  assert.equal(report.credits?.weekly.used, 1.32)
  assert.equal(report.plan?.name, 'Pro')
  assert.equal(report.plan?.status, 'active')
  assert.equal(report.plan?.monthlyCredits, 30)
  assert.equal(report.plan?.currentPeriodEnd, Date.parse('2026-09-01T00:00:00Z'))
})

test('getUsage resolves the plan id from credits when subscriptions fails', async () => {
  const adapter = makeAdapter(makeFetch({
    '/alpha/whoami': { status: 200, body: { success: true, user: { id: 'u1', name: 'N', userName: 'n' } } },
    '/alpha/billing/credits': { status: 200, body: { credits: { monthlyCredits: 5, planId: 'individual-goat' } } },
    '/alpha/billing/subscriptions': { status: 500, body: {} },
  }))

  const report = await adapter.getUsage()
  assert.equal(report.plan?.name, 'GOAT')
  assert.equal(report.plan?.status, '')
  assert.ok(report.failures.some((f) => f.includes('/alpha/billing/subscriptions')))
})

test('getUsage reports an empty plan when the subscription has no planId', async () => {
  const adapter = makeAdapter(makeFetch({
    '/alpha/whoami': { status: 200, body: { success: true, user: { id: 'u1', name: 'N', userName: 'n' } } },
    '/alpha/billing/subscriptions': { status: 200, body: { success: true, data: {} } },
  }))

  const report = await adapter.getUsage()
  assert.ok(report.plan)
  assert.equal(report.plan?.name, '')
  assert.equal(report.plan?.monthlyCredits, null)
})

test('subscriptionPlanInfo matches the longest plan-id prefix', async () => {
  const { subscriptionPlanInfo } = await import('../src/capabilities.ts')
  assert.deepEqual(subscriptionPlanInfo('individual-pro-v1'), { name: 'Pro', monthlyCredits: 80, tierWeight: 2 })
  assert.deepEqual(subscriptionPlanInfo('individual-provider'), { name: 'Provider', monthlyCredits: 15, tierWeight: 3 })
  assert.deepEqual(subscriptionPlanInfo('INDIVIDUAL_GO'), { name: 'Go', monthlyCredits: 10, tierWeight: 0 })
  assert.deepEqual(subscriptionPlanInfo('teams-pro'), { name: 'Teams Pro', monthlyCredits: 40, tierWeight: 2 })
  assert.equal(subscriptionPlanInfo('individual-enterprise'), undefined)
  assert.equal(subscriptionPlanInfo(''), undefined)
})

test('getUsage degrades per endpoint on failure', async () => {
  const adapter = makeAdapter(makeFetch({
    '/alpha/whoami': { status: 200, body: { success: true, user: { id: 'u1', name: 'N', userName: 'n' } } },
    '/alpha/usage/summary': { status: 500, body: {} },
    '/alpha/billing/credits': { status: 200, body: { credits: { monthlyCredits: 5 } } },
  }))

  const report = await adapter.getUsage()
  assert.equal(report.account?.name, 'N')          // whoami still parsed
  assert.equal(report.usage, undefined)              // usage failed
  assert.ok(report.credits)                          // credits still parsed
  assert.ok(report.failures.some((f) => f.includes('/alpha/usage/summary')))
})

test('getUsage requires a key', async () => {
  const adapter = new CommandCodeAdapter({
    options: () => ({ apiBase: 'https://api.commandcode.ai', workingDir: '/tmp', modelsCachePath: '/tmp/c.json' }),
    resolveApiKey: async () => { throw new Error('no key') },
    fetchImpl: makeFetch({}),
  })
  await assert.rejects(adapter.getUsage(), /no key/)
})
