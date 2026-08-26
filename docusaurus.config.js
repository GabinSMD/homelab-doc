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

  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        // Le reagencement du 2026-08-26 a deplace 12 pages : les artefacts dates
        // (specs, plans, rapports, instantanes, post-mortems) sont regroupes sous
        // `projet/journal/`, et `sucre-observability` a quitte `architecture/`
        // puisqu'il decrit un projet arrete, pas une architecture.
        //
        // Ces redirections ne sont PAS optionnelles. Le principe « zero URL
        // cassee » a tenu toute la migration MkDocs -> Docusaurus grace a
        // `trailingSlash: true` et a l'interdiction de renommer. Des qu'on
        // deplace, c'est ce plugin qui tient la promesse a leur place.
        //
        // Ne jamais retirer une entree : une URL publiee l'est pour toujours.
        redirects: [
            { from: '/architecture/sucre-observability/', to: '/projet/sucre-observability/' },
            { from: '/operations/b2-cap-exceeded/', to: '/projet/journal/2026-05-10-b2-cap-exceeded/' },
            { from: '/operations/r2-migration/', to: '/projet/journal/2026-05-11-migration-r2/' },
            { from: '/projet/2026-06-11-fiabilisation-drill-restauration/', to: '/projet/journal/2026-06-11-fiabilisation-drill-restauration/' },
            { from: '/projet/2026-08-03-homepage-refonte-design/', to: '/projet/journal/2026-08-03-homepage-refonte-design/' },
            { from: '/projet/2026-08-04-homepage-themes-fonds-design/', to: '/projet/journal/2026-08-04-homepage-themes-fonds-design/' },
            { from: '/projet/2026-08-15-boite-a-outils-technique/', to: '/projet/journal/2026-08-15-boite-a-outils-technique/' },
            { from: '/projet/2026-08-15-forgejo-source-de-verite/', to: '/projet/journal/2026-08-15-forgejo-source-de-verite/' },
            { from: '/projet/2026-08-25-migration-docusaurus/', to: '/projet/journal/2026-08-25-migration-docusaurus/' },
            { from: '/projet/2026-08-26-audit-fraicheur-doc/', to: '/projet/journal/2026-08-26-audit-fraicheur-doc/' },
            { from: '/projet/roadmap-2026-05/', to: '/projet/journal/2026-05-11-roadmap-consolidee/' },
            { from: '/securite/egress-phase2-plan/', to: '/projet/journal/2026-04-19-egress-phase2/' },
        ],
      },
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  // Reprises telles quelles depuis overrides/main.html (theme MkDocs abandonne).

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
