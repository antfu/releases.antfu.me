import { Octokit } from 'octokit'
import type { ReleaseInfo } from '../../types'

const LIMIT = 100

export default defineLazyEventHandler(() => {
  const config = useRuntimeConfig()
  const octokit = new Octokit({
    auth: config.githubToken,
  })

  const infos: ReleaseInfo[] = []

  async function getDataAtPage(page = 1): Promise<ReleaseInfo[]> {
    const { data } = await octokit.request('GET /users/{username}/events', {
      username: config.githubLogin,
      per_page: 100,
      page,
    })

    return data
      .filter(item => item.type === 'PushEvent' && item.public)
      .map((item): ReleaseInfo => {
        const payload: any = item.payload || {}
        const title = (payload.commits?.[0]?.message || '').split('\n')[0]
        const commit = payload.commits?.[0]?.url || ''
        const version = title.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\s|$)/)?.[1] || ''
        return {
          id: item.id,
          type: item.type!,
          repo: item.repo.name,
          title,
          commit,
          created_at: item.created_at!,
          version,
          // payload: item.payload,
        }
      })
      .filter(item => item.title.includes('release') && item.version)
  }

  return defineCachedEventHandler(async () => {
    let goNextPage = true
    for (let page = 1; page <= 3; page++) {
      if (!goNextPage)
        break
      try {
        const items = await getDataAtPage(page)
        for (let index = items.length - 1; index >= 0; index--) {
          const current = items[index]
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

    infos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    if (infos.length > LIMIT)
      infos.slice(0, LIMIT)

    return infos
  }, {
    maxAge: 60 * 5 /* 5 minutes */,
    swr: true,
  })
})
