import { Feed } from 'feed'
import { joinURL } from 'ufo'
import { logoOverrides } from '~~/shared/constants'

const DOMAIN = 'https://releases.antfu.me'

export default defineEventHandler(async (event) => {
  const feed = new Feed({
    title: 'Anthony Fu is Releasing...',
    description: 'Anthony Fu\'s recent releases',
    id: DOMAIN,
    link: DOMAIN,
    language: 'en',
    image: joinURL(DOMAIN, 'favicon.png'),
    favicon: joinURL(DOMAIN, 'favicon.png'),
    copyright: 'CC BY-NC-SA 4.0 2024 © Anthony Fu',
    feedLinks: {
      rss: `${DOMAIN}/rss.xml`,
    },
  })

  const releaseList = await $fetch('/api/releases')

  for (const item of releaseList.infos) {
    feed.addItem({
      id: item.id,
      link: `https://github.com/${item.repo}/releases/tag/v${item.version}`,
      date: new Date(item.created_at),
      title: `${item.repo} v${item.version} released`,
      image: logoOverrides[item.repo] || `https://github.com/${item.repo.split('/')[0]}.png`,
      description: `<a href="${item.commit}">${item.title}</a>`,
    })
  }

  appendHeader(event, 'Content-Type', 'application/xml')
  return feed.rss2()
})
