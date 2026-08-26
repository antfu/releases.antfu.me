import type { ReleaseInfo } from '../../types'
import { Octokit } from 'octokit'

const LIMIT = 200
const KV_KEY = 'records'
const KV_KEY_SEEN = 'seen-events'

// How many event ids we remember to avoid resolving the same push twice.
// The events API only exposes the latest 300 events, so this is generous.
const SEEN_LIMIT = 1000
// Resolving a push costs one extra API request, cap the work of a single run
// so a cold start can't blow the function timeout. Leftovers are picked up
// by the following runs.
const MAX_RESOLVE_PER_RUN = 40
const RESOLVE_CONCURRENCY = 6

const ZERO_SHA = '0'.repeat(40)

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

export default defineLazyEventHandler(async () => {
  const config = useRuntimeConfig()
  const octokit = new Octokit({
    auth: config.githubToken,
  })

  // The GitHub `/events` API only returns the latest 300 events (3 pages)
  // Thus here we use KV to store the previous data to persist the history for a longer time
  const kv = useStorage('kv')
  let infos: ReleaseInfo[] = await kv.getItem<ReleaseInfo[]>(KV_KEY) || []

  // Migrate old data
  infos.forEach((item) => {
    if (typeof item.created_at === 'string')
      item.created_at = +new Date(item.created_at)
  })

  let lastUpdated = infos[0]?.created_at || 0

  async function getPushEventsAtPage(page = 1): Promise<PushEvent[]> {
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
        if (lastUpdated < created_at)
          lastUpdated = created_at
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
      catch {
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
    catch (error) {
      console.error(error)
      return []
    }
  }

  async function resolveReleases(event: PushEvent): Promise<ReleaseInfo[]> {
    const commits = await getPushCommits(event)

    // Normalize the releases. A push can have multiple commits, we flatten them
    return commits
      .map((commit): ReleaseInfo => {
        const title = (commit.message || '').split('\n')[0]!
        const version = title.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\s|$)/)?.[1] || ''
        return {
          id: event.id,
          type: event.type,
          repo: event.repo,
          isOrg: event.isOrg,
          title,
          sha: commit.sha,
          commit: `https://github.com/${event.repo}/commit/${commit.sha}`,
          created_at: event.created_at,
          version,
        }
      })
      .filter(item => item.title.includes('release') && item.version)
  }

  return defineCachedEventHandler(async () => {
    const lastFetched = Date.now()

    const seen: string[] = await kv.getItem<string[]>(KV_KEY_SEEN) || []
    const seenSet = new Set(seen)
    // Releases already stored are known-processed, this keeps upgrades from an
    // older version of this handler from re-resolving them.
    infos.forEach(info => seenSet.add(info.id))

    // Events are returned newest first, only 3 pages are available
    const events: PushEvent[] = []
    for (let page = 1; page <= 3; page++) {
      try {
        events.push(...await getPushEventsAtPage(page))
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
    const resolved: ReleaseInfo[] = []
    for (let i = 0; i < pending.length; i += RESOLVE_CONCURRENCY) {
      const batch = pending.slice(i, i + RESOLVE_CONCURRENCY)
      const results = await Promise.all(batch.map(event => resolveReleases(event)))
      results.forEach(items => resolved.push(...items))
      batch.forEach(event => seen.push(event.id))
    }

    infos.push(...resolved)

    // Sort from oldest to newest (will be reversed later)
    infos.sort((a, b) => a.created_at - b.created_at)

    // Filter out continuse releases, keep only the latest one
    infos = infos.filter((info, index) => {
      const next = infos[index + 1]
      if (next && info.repo === next.repo)
        return false
      return true
    })

    infos.reverse()

    if (infos.length > LIMIT)
      infos = infos.slice(0, LIMIT)

    // Save back to KV
    await kv.setItem(KV_KEY, infos)
    await kv.setItem(KV_KEY_SEEN, seen.slice(-SEEN_LIMIT))

    return {
      infos,
      lastUpdated,
      lastFetched,
    }
  }, {
    maxAge: 60 * 5 /* 5 minutes */,
    swr: true,
  })
})
