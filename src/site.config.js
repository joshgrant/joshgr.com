// Everything about you that appears around the site lives here.
// Edit this file, save, and the whole site updates.

export const site = {
  name: 'Josh Grant',

  // Your real domain. Used for the RSS feed and sitemap.
  url: 'https://joshgr.com',

  // Shown in search results and link previews.
  description: 'Exploring systems',

  // Where the "Contact me" link sends email.
  email: 'joshgrant@pm.me',

  // The main links in the side menu.
  nav: [
    { label: 'Home', href: '/' },
    { label: 'Writing', href: '/writing/' },
    { label: 'Projects', href: '/projects/' },
    { label: 'Wizardly Words', href: '/wizardly-words/' },
  ],

  // Shown under "Elsewhere" in the side menu. Add, remove or reorder freely.
  // The RSS feed link is added at the end automatically.
  elsewhere: [
    { label: 'GitHub', href: 'https://github.com/joshgrant' },
    { label: 'Substack', href: 'https://substack.com/@tenhittender' },
    { label: 'Bluesky', href: 'https://bsky.app/profile/tenhittender.bsky.social' },
    // { label: 'Kofi', href: 'https://buyme a coffe.com' }
  ],

  // Your projects. `featured: true` puts one on the homepage.
  // `href` can be a page on this site ("/wizardly-words/") or any URL.
  projects: [
    {
      name: 'The Morning App',
      description: 'The transition from sleep to wakefulness is the most powerful moment of your day. How do you leverage it?',
      href: 'https://themorning.app',
      featured: true
    },
    {
      name: 'Wizardly Words',
      description: 'If language is how we see the world, what happens when we invent new words?',
      href: '/wizardly-words/',
      featured: true,
    },
    {
      name: 'MusicX',
      description: 'What does the musical desert look like?',
      href: 'https://github.com/joshgrant/MusicX',
      featured: true,
    },
    {
      name: 'Seedling',
      description: 'Daily planner for iOS',
      href: 'https://apps.apple.com/us/app/seedling-daily-planner/id1516093618',
      featured: true
    }
  ],

  // How many recent posts the homepage shows.
  homePostCount: 3,
};
