import { Octokit } from 'octokit'
import type { ReleaseInfo } from '../../types'

const LIMIT = 200
const KV_KEY = 'records'

export interface ReturnData {
  infos: ReleaseInfo[]
  lastUpdated: number
  lastFetched: number
}

export default defineLazyEventHandler(async () => {
  const config = useRuntimeConfig()
  const octokit = new Octokit({
    auth: config.githubToken,
  })

  let infos: ReleaseInfo[] = await hubKV().get(KV_KEY) || []

  // Migrate old data
  infos.forEach((item) => {
    if (typeof item.created_at === 'string')
      item.created_at = +new Date(item.created_at)
  })

  let lastUpdated = infos[0]?.created_at || 0

  async function getDataAtPage(page = 1): Promise<ReleaseInfo[]> {
    const { data } = await octokit.request('GET /users/{username}/events', {
      username: config.public.login,
      per_page: 100,
      page,
    })

    return data
      .map((i) => {
        const createAt = +new Date(i.created_at || 0)
        // Record the latest update time
        if (lastUpdated < createAt)
          lastUpdated = createAt
        return {
          ...i,
          created_at: createAt,
        }
      })
      .filter(item => item.type === 'PushEvent' && item.public)
      .flatMap((item): ReleaseInfo => {
        const payload: any = item.payload || {}
        return (payload.commits || []).map((commit: any) => {
          const title = (commit?.message || '').split('\n')[0]
          const version = title.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\s|$)/)?.[1] || ''
          return {
            id: item.id,
            type: item.type!,
            repo: item.repo.name,
            isOrg: item.org !== undefined,
            title,
            sha: commit?.sha || '',
            commit: `https://github.com/${item.repo.name}/commit/${commit?.sha}`,
            created_at: item.created_at,
            version,
            // payload: item.payload,
          }
        })
      })
      .filter(item => item.title.includes('release') && item.version)
  }

  return defineCachedEventHandler(async () => {
    const lastFetched = new Date()

    let goNextPage = true
    for (let page = 1; page <= 3; page++) {
      if (!goNextPage)
        break
      try {
        const items = await getDataAtPage(page)
        for (let index = items.length - 1; index >= 0; index--) {
          const current = items[index]!
          const found = infos.find(item => item.id === current.id)
          if (found) {
            goNextPage = false
            continue
          }
          infos.push(current)
        }
      }
      catch (error) {
        console.error(error)
        goNextPage = false
        break
      }
    }

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
      infos.slice(0, LIMIT)

    hubKV().set(KV_KEY, infos)

    return {
      infos,
      lastUpdated,
      lastFetched: +lastFetched,
    }
  }, {
    maxAge: 60 * 5 /* 5 minutes */,
    swr: true,
  })
})
