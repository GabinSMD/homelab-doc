// @ts-check
const prismThemes = require('prism-react-renderer').themes;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Homelab',
  tagline: 'Documentation du homelab',
  favicon: 'img/logo.svg',

  url: 'https://homelab.gabin-simond.fr',
  baseUrl: '/',

  // DECISION DE MIGRATION — ne pas retirer.
  // MkDocs sert /architecture/hardware/ ; Docusaurus sert /architecture/hardware
  // par defaut. Sans ce reglage, les 54 URLs publiques changent d'un coup.
  trailingSlash: true,

  organizationName: 'GabinSMD',
  projectName: 'homelab-doc',

  // `throw` depuis la fin de la phase 3 : c'est ce qui remplace le `--strict` de
  // mkdocs. Etait sur `warn` pendant la migration, le temps de corriger les 7
  // ancres cassees — toutes des liens ecrits sans accents alors que l'ancre
  // reelle les conserve (`...la-piece-cle` au lieu de `...la-pièce-clé`). Elles
  // etaient mortes en production depuis toujours : mkdocs ne valide pas les
  // ancres sans `validation.anchors`, jamais configure ici.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'fr',
    locales: ['fr'],
  },

  markdown: {
    // DECISION DE MIGRATION — ne pas retirer.
    // 'detect' => les .md sont lus en CommonMark pur (pas de JSX), les .mdx en MDX.
    // C'est ce qui empeche un <version> ou un {host} en plein texte de casser le build.
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  headTags: [
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    },
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    },
  ],

  // Reprises telles quelles depuis overrides/main.html (theme MkDocs abandonne).
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          // Le site est une doc, pas un produit avec une landing : la doc est a la racine.
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          // Reste sur GitHub, comme l'ancien edit_uri. Forgejo est la source de
          // verite mais git.home.gabin-simond.fr est injoignable depuis le web
          // public : un lien d'edition mort serait pire que l'actuel.
          editUrl: 'https://github.com/GabinSMD/homelab-doc/edit/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          lastmod: 'date',
          changefreq: null,
          priority: null,
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/logo.svg',
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Homelab',
        logo: { alt: 'Homelab', src: 'img/logo.svg' },
        items: [
          { type: 'docSidebar', sidebarId: 'main', position: 'left', label: 'Documentation' },
          { href: 'https://github.com/GabinSMD/homelab-doc', label: 'GitHub', position: 'right' },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Mentions',
            items: [
              { label: 'Confidentialite', to: '/confidentialite/' },
              { label: "Conditions d'utilisation", to: '/conditions/' },
            ],
          },
        ],
        copyright: `Homelab — GabinSMD`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'yaml', 'json', 'docker', 'nginx', 'ini', 'sql', 'python'],
      },
      mermaid: {
        theme: { light: 'neutral', dark: 'dark' },
      },
    }),
};

module.exports = config;
