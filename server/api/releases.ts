import type { ReleaseInfo } from '../../types'
import { Octokit } from 'octokit'

// How many releases we return to the client
const LIMIT = 200
// How many releases we keep in KV. The events API only reaches back ~3 weeks,
// so KV is the only long-term history we have, keep a lot more than we show.
const HISTORY_LIMIT = 2000

const KV_KEY = 'records'
const KV_KEY_SEEN = 'seen-events'
const KV_KEY_BACKFILLED = 'backfilled-repos'

// How many event ids we remember to avoid resolving the same push twice.
// The events API only exposes a few hundred events, so this is generous.
const SEEN_LIMIT = 1000
// Resolving a push costs one extra API request, cap the work of a single run
// so a cold start can't blow the function timeout. Leftovers are picked up
// by the following runs.
const MAX_RESOLVE_PER_RUN = 40
const RESOLVE_CONCURRENCY = 12

// Backfilling walks one repo per request, drain it across runs too
const MAX_BACKFILL_PER_RUN = 10
const BACKFILL_CONCURRENCY = 10
const BACKFILL_PER_REPO = 30

const ZERO_SHA = '0'.repeat(40)
const VERSION_RE = /v?(\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\s|$)/

const refs = [
  'refs/heads/main',
  'refs/heads/master',
  'refs/heads/latest',
  'refs/heads/stable',
  'refs/heads/release',
  'refs/heads/dev',
]

export interface ReturnData {
  infos: ReleaseInfo[]
  lastUpdated: number
  lastFetched: number
}

interface PushEvent {
  id: string
  type: string
  repo: string
  isOrg: boolean
  created_at: number
  before: string
  head: string
}

interface Commit {
  sha: string
  message: string
}

// A release is identified by its repo and version, not by the event or commit
// that produced it. The same release can be discovered from a push event and
// from the releases API, and we only ever want to keep one of them.
function keyOf(info: Pick<ReleaseInfo, 'repo' | 'version'>): string {
  return `${info.repo}@${info.version}`
}

export default defineLazyEventHandler(async () => {
  const config = useRuntimeConfig()
  const octokit = new Octokit({
    auth: config.githubToken,
  })

  const kv = useStorage('kv')

  // Repos we could not read this run, keyed by repo. Populated by the fetch
  // helpers below. Without this a rejected token drops releases silently,
  // which is exactly how the missing org releases went unnoticed.
  const skipped = new Map<string, string>()

  function reportSkipped() {
    if (!skipped.size)
      return
    const forbidden = [...skipped].filter(([, reason]) => /forbid|fine-grained|SAML|403/i.test(reason))
    console.warn(`[releases] skipped ${skipped.size} repo(s) this run`)
    for (const [repo, reason] of skipped)
      console.warn(`[releases]   ${repo}: ${reason.split('\n')[0]}`)
    if (forbidden.length) {
      console.warn(
        `[releases] ${forbidden.length} repo(s) refused the GITHUB_TOKEN. `
        + 'Many orgs reject fine-grained PATs whose lifetime exceeds 366 days. '
        + 'Use a classic PAT, or a fine-grained one with a shorter lifetime granted to those orgs.',
      )
    }
  }

  async function getPushEventsAtPage(page: number, onEvent: (created_at: number) => void): Promise<PushEvent[]> {
    const { data } = await octokit.request('GET /users/{username}/events', {
      username: config.public.login,
      per_page: 100,
      page,
    })

    return data
      .map((i) => {
        // Normalize the date to number
        const created_at = +new Date(i.created_at || 0)
        // Record the latest update time
        onEvent(created_at)
        return {
          ...i,
          created_at,
        }
      })
      // For releases, we only care about the push events
      .filter(item => item.type === 'PushEvent' && item.public)
      // Sometimes GitHub API might return activities from other forks (when syncing PRs)
      // We filter then out by checking the ref
      .filter(item => refs.includes((item.payload as any)?.ref))
      .map((item) => {
        const payload: any = item.payload || {}
        return {
          id: item.id,
          type: item.type!,
          repo: item.repo.name,
          isOrg: item.org !== undefined,
          created_at: item.created_at,
          before: payload.before || '',
          head: payload.head || '',
        }
      })
      .filter(item => item.head)
  }

  // Since Aug 2025 the events API no longer embeds `payload.commits` in push
  // events, it only gives us the boundary SHAs. So we diff them to recover the
  // commits of the push.
  // https://github.blog/changelog/2025-08-08-upcoming-changes-to-github-events-api-payloads/
  async function getPushCommits(event: PushEvent): Promise<Commit[]> {
    const [owner, repo] = event.repo.split('/') as [string, string]

    if (event.before && event.before !== ZERO_SHA) {
      try {
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
          owner,
          repo,
          basehead: `${event.before}...${event.head}`,
        })
        return (data.commits || []).map(c => ({ sha: c.sha, message: c.commit.message }))
      }
      catch (error: any) {
        // A 403 here means the token itself is refused (see `reportSkipped`),
        // there is no point trying the single-commit endpoint with it.
        if (error?.status === 403) {
          skipped.set(event.repo, error.message || 'forbidden')
          return []
        }
        // Rewritten history (force pushes, rebases) makes the base unreachable.
        // Fall back to the head commit below, which is where release commits live.
      }
    }

    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner,
        repo,
        ref: event.head,
      })
      return [{ sha: data.sha, message: data.commit.message }]
    }
    catch (error: any) {
      skipped.set(event.repo, error?.message || String(error))
      return []
    }
  }

  async function resolveReleases(event: PushEvent): Promise<ReleaseInfo[]> {
    const commits = await getPushCommits(event)

    // Normalize the releases. A push can have multiple commits, we flatten them
    return commits
      .map((commit): ReleaseInfo => {
        const title = (commit.message || '').split('\n')[0]!
        return {
          id: event.id,
          type: event.type,
          repo: event.repo,
          isOrg: event.isOrg,
          title,
          sha: commit.sha,
          commit: `https://github.com/${event.repo}/commit/${commit.sha}`,
          created_at: event.created_at,
          version: title.match(VERSION_RE)?.[1] || '',
        }
      })
      .filter(item => item.title.includes('release') && item.version)
  }

  // Push events only reach back ~3 weeks. The releases API has the full tag
  // history, so we use it to seed the older entries for repos we already know.
  async function backfillRepo(repo: string, isOrg: boolean): Promise<ReleaseInfo[]> {
    const [owner, name] = repo.split('/') as [string, string]

    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/releases', {
        owner,
        repo: name,
        per_page: BACKFILL_PER_REPO,
      })

      return data
        .filter(release => !release.draft)
        .map((release): ReleaseInfo => ({
          id: `release:${repo}@${release.tag_name}`,
          type: 'Release',
          repo,
          isOrg,
          title: release.name || release.tag_name,
          commit: release.html_url,
          created_at: +new Date(release.published_at || release.created_at),
          version: release.tag_name.match(VERSION_RE)?.[1] || '',
        }))
        .filter(item => item.version && item.created_at)
    }
    catch (error: any) {
      skipped.set(repo, error?.message || String(error))
      return []
    }
  }

  return defineCachedEventHandler(async () => {
    const lastFetched = Date.now()
    skipped.clear()

    // Full history, never collapsed. The display filtering happens at the end
    // so that a release is never lost from KV.
    let infos: ReleaseInfo[] = await kv.getItem<ReleaseInfo[]>(KV_KEY) || []

    // Migrate old data
    infos.forEach((item) => {
      if (typeof item.created_at === 'string')
        item.created_at = +new Date(item.created_at)
    })

    // Drop any duplicates a previous version of this handler may have stored
    const byKey = new Map<string, ReleaseInfo>()
    infos.forEach(info => byKey.set(keyOf(info), byKey.get(keyOf(info)) || info))

    let lastUpdated = infos[0]?.created_at || 0
    const trackUpdated = (created_at: number) => {
      if (lastUpdated < created_at)
        lastUpdated = created_at
    }

    const add = (items: ReleaseInfo[]) => {
      for (const item of items) {
        const key = keyOf(item)
        // First writer wins. Push events run before backfill, so the richer
        // commit-derived record is preferred over the tag-derived one.
        if (!byKey.has(key))
          byKey.set(key, item)
      }
    }

    const seen: string[] = await kv.getItem<string[]>(KV_KEY_SEEN) || []
    const seenSet = new Set(seen)
    // Releases already stored are known-processed, this keeps upgrades from an
    // older version of this handler from re-resolving them.
    infos.forEach(info => seenSet.add(info.id))

    // Events are returned newest first, only a few pages are available
    const events: PushEvent[] = []
    for (let page = 1; page <= 3; page++) {
      try {
        events.push(...await getPushEventsAtPage(page, trackUpdated))
      }
      catch (error) {
        console.error(error)
        break
      }
    }

    const pending = events
      .filter(event => !seenSet.has(event.id))
      .slice(0, MAX_RESOLVE_PER_RUN)

    // Resolve in bounded-concurrency batches to stay friendly to rate limits
    for (let i = 0; i < pending.length; i += RESOLVE_CONCURRENCY) {
      const batch = pending.slice(i, i + RESOLVE_CONCURRENCY)
      const results = await Promise.all(batch.map(event => resolveReleases(event)))
      results.forEach(items => add(items))
      batch.forEach(event => seen.push(event.id))
    }

    // Backfill repos we have seen but never walked, a few per run
    const backfilled: string[] = await kv.getItem<string[]>(KV_KEY_BACKFILLED) || []
    const backfilledSet = new Set(backfilled)
    const orgs = new Map<string, boolean>()
    ;[...byKey.values()].forEach(info => orgs.set(info.repo, info.isOrg))

    const toBackfill = [...orgs.keys()]
      .filter(repo => !backfilledSet.has(repo))
      .slice(0, MAX_BACKFILL_PER_RUN)

    for (let i = 0; i < toBackfill.length; i += BACKFILL_CONCURRENCY) {
      const batch = toBackfill.slice(i, i + BACKFILL_CONCURRENCY)
      const results = await Promise.all(batch.map(repo => backfillRepo(repo, orgs.get(repo) ?? false)))
      results.forEach(items => add(items))
      batch.forEach(repo => backfilled.push(repo))
    }

    // Newest first
    infos = [...byKey.values()].sort((a, b) => b.created_at - a.created_at)

    if (infos.length > HISTORY_LIMIT)
      infos = infos.slice(0, HISTORY_LIMIT)

    // Save the full history back to KV before any display filtering
    await kv.setItem(KV_KEY, infos)
    await kv.setItem(KV_KEY_SEEN, seen.slice(-SEEN_LIMIT))
    await kv.setItem(KV_KEY_BACKFILLED, backfilled)

    // Display only: when a repo releases several times back to back, show just
    // the newest of that run. Anything in between stays in KV.
    let display = infos.filter((info, index) => {
      const previous = infos[index - 1]
      return !(previous && previous.repo === info.repo)
    })

    if (display.length > LIMIT)
      display = display.slice(0, LIMIT)

    reportSkipped()

    return {
      infos: display,
      lastUpdated,
      lastFetched,
    }
  }, {
    maxAge: 60 * 5 /* 5 minutes */,
    swr: true,
  })
})
