<a name="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![CC BY 4.0 License][license-shield]][license-url]
[![Deploy][deploy-shield]][deploy-url]

<!-- PROJECT HEADER -->
<br />
<div align="center">

<h3 align="center">homelab-doc</h3>

  <p align="center">
    The public logbook of a residential homelab: architecture, self-hosted services,
    hardening, observability and runbooks — everything I would need to rebuild it from scratch.
    <br />
    <a href="https://homelab.gabin-simond.fr/"><strong>Read the docs »</strong></a>
    <br />
    <br />
    <a href="https://homelab.gabin-simond.fr/">View site</a>
    ·
    <a href="https://github.com/GabinSMD/homelab-doc/issues">Report bug</a>
    ·
    <a href="https://github.com/GabinSMD/homelab-doc/issues">Request a page</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#whats-inside">What's inside</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#deployment">Deployment</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

This repository builds **[homelab.gabin-simond.fr](https://homelab.gabin-simond.fr/)**, the public
documentation of a three-host homelab: a Raspberry Pi 4 running DietPi (`penny`) and two ZimaBoards
in a Proxmox cluster (`galahad`, `lancelot`).

It is deliberately split from the machine's actual configuration:

| Repository | Visibility | Holds |
| --- | --- | --- |
| `homelab-doc` (this one) | public | why and how — architecture, guides, runbooks, decisions |
| `homelab-config` | private | what the machines read at runtime — compose files, systemd units, secrets |

Nothing here is read by a running host. A page belongs in this repository when it explains a
decision or walks through a reproducible procedure; a file the Pi loads at boot belongs in the
other one.

> **Note** — the documentation itself is written in French. This README is in English because the
> repository is public.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### What's inside

73 pages under `docs/`, organised as a narrative rather than a file dump:

| Section | Pages | Covers |
| --- | --- | --- |
| `architecture/` | 7 | hosts, network, Proxmox cluster and its QDevice, target topology |
| `services/` | 25 | one page per self-hosted service, with its failure modes |
| `operations/` | 9 | backups, monitoring, alerting, incident runbooks |
| `securite/` | 6 | threat model, hardening layers, secret handling |
| `guides/` | 4 | step-by-step procedures worth repeating |
| `projet/` | 19 | roadmap, architecture decisions, incident journal |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [Docusaurus 3](https://docusaurus.io/) — static site generator
* [React 19](https://react.dev/)
* [Mermaid](https://mermaid.js.org/) — architecture diagrams, via `@docusaurus/theme-mermaid`
* [Bun](https://bun.sh/) — package manager and task runner
* [GitHub Pages](https://pages.github.com/) — hosting

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

* **Bun** 1.3.12 or later — it is the only lockfile in the repository, so `npm ci` will not work here
  ```sh
  curl -fsSL https://bun.sh/install | bash
  ```
* **Node.js** 20 or later, required by Docusaurus itself

### Installation

1. Clone the repository
   ```sh
   git clone https://github.com/GabinSMD/homelab-doc.git
   cd homelab-doc
   ```
2. Install dependencies
   ```sh
   bun install --frozen-lockfile
   ```
3. Start the dev server
   ```sh
   bun run start
   ```

The site is then served on `http://localhost:3000` with hot reload.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE -->
## Usage

```sh
bun run start    # dev server with hot reload
bun run build    # production build into build/
bun run serve    # serve the production build locally
bun run clear    # clear the Docusaurus cache
```

Always run `bun run build` before pushing: Docusaurus fails the build on a broken internal link,
and that is exactly what the CI checks.

Continuous integration runs five jobs on every pull request:

| Job | What it guards |
| --- | --- |
| secret scan (gitleaks) | credentials committed by accident — GitHub only |
| secret scan (homelab scanner) | the same scan as the pre-commit hook, runs on GitHub **and** Forgejo |
| markdown lint | style, advisory only |
| doc freshness | terms removed from the infrastructure must disappear from operational pages |
| docusaurus build | broken links, invalid MDX |

The repository is mirrored to a self-hosted Forgejo instance, which is why several jobs are guarded
by `if: github.server_url == 'https://github.com'` — GitHub Pages and the GitHub API do not exist
on the mirror.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- DEPLOYMENT -->
## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds with Bun and publishes
`build/` to GitHub Pages. The custom domain comes from the `CNAME` file
(`homelab.gabin-simond.fr`); there is nothing to do by hand.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

The live roadmap is a page of the site itself, not a list in this file:
**[projet/roadmap](https://homelab.gabin-simond.fr/projet/roadmap/)**.

Known housekeeping in this repository:

- [ ] Remove `mkdocs.yml`, left over from the MkDocs → Docusaurus migration (26 Aug 2026)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

This documents one specific set of machines, so feature contributions do not really apply — but
corrections very much do. If a procedure here is wrong, dangerous or no longer works, please
[open an issue](https://github.com/GabinSMD/homelab-doc/issues).

If you want to submit a fix directly:

1. Fork the project
2. Create your branch (`git checkout -b fix/broken-runbook`)
3. Check the build passes (`bun run build`)
4. Commit your changes (`git commit -m 'Fix the restic restore order'`)
5. Push and open a pull request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the Creative Commons Attribution 4.0 International license. Copy, adapt and
reuse anything here, including commercially, as long as you credit the source. See `LICENSE` for
the full text.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

Gabin Simond — gabin.simond@simondancebros.org

Project link: [https://github.com/GabinSMD/homelab-doc](https://github.com/GabinSMD/homelab-doc)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Docusaurus](https://docusaurus.io/) — and its build that refuses to ship a broken link
* [DietPi](https://dietpi.com/) — what makes a Raspberry Pi a serious server
* [Proxmox VE](https://www.proxmox.com/) and [Proxmox Backup Server](https://pbs.proxmox.com/)
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — the shape of this file

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/GabinSMD/homelab-doc.svg?style=for-the-badge
[contributors-url]: https://github.com/GabinSMD/homelab-doc/graphs/contributors
[stars-shield]: https://img.shields.io/github/stars/GabinSMD/homelab-doc.svg?style=for-the-badge
[stars-url]: https://github.com/GabinSMD/homelab-doc/stargazers
[issues-shield]: https://img.shields.io/github/issues/GabinSMD/homelab-doc.svg?style=for-the-badge
[issues-url]: https://github.com/GabinSMD/homelab-doc/issues
[license-shield]: https://img.shields.io/badge/license-CC%20BY%204.0-blue.svg?style=for-the-badge
[license-url]: https://github.com/GabinSMD/homelab-doc/blob/main/LICENSE
[deploy-shield]: https://img.shields.io/github/actions/workflow/status/GabinSMD/homelab-doc/deploy.yml?branch=main&style=for-the-badge&label=pages
[deploy-url]: https://github.com/GabinSMD/homelab-doc/actions/workflows/deploy.yml
