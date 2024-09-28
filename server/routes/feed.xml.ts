import { Feed } from 'feed'
import { joinURL } from 'ufo'
import { logoOverrides } from '~~/shared/constants'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { name, website } = config.public

  const feed = new Feed({
    title: `${name} is Releasing...`,
    description: `${name}'s recent releases`,
    id: website,
    link: website,
    language: 'en',
    image: joinURL(website, 'favicon.png'),
    favicon: joinURL(website, 'favicon.png'),
    copyright: `CC BY-NC-SA 4.0 ${(new Date()).getFullYear()} © ${name}`,
    feedLinks: {
      rss: `${website}/rss.xml`,
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
      content: item.content,
    })
  }

  appendHeader(event, 'Content-Type', 'application/xml')
  return feed.rss2()
})
