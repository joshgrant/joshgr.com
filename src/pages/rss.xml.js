// The RSS feed at /rss.xml. Point Buffer (via Zapier, IFTTT or Make) at this
// URL and every new post is queued to your social accounts automatically.
import rss from '@astrojs/rss';
import { site } from '../site.config.js';
import { getPosts } from '../lib/posts.js';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: site.name,
    description: site.description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description ?? '',
      link: `/writing/${post.id}/`,
    })),
  });
}
