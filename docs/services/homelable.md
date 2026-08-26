# Homelable — cartographie réseau

Découverte et cartographie automatique du réseau : machines, liens, dépendances.
Sert de vue d'ensemble à côté de [Comment on accède aux services](../architecture/acces-reseau.md),
qui en est la légende écrite.

| | |
|---|---|
| Conteneurs | `homelable` (frontend) + `homelable-backend` |
| URL | `homelable.home.gabin-simond.fr` |
| Réseau | `homelable` (isolé) + `proxy` |

## Trois limites structurelles, pas des bugs

:::warning[Ce que la cartographie ne peut pas voir]
**Pas d'adresse MAC.** Le backend tourne dans un bridge Docker : il ne voit que
des adresses de bridge, jamais les MAC réelles du LAN. L'identification par
constructeur est donc hors de portée depuis cette position.

**Le câblage est déduit, pas mesuré.** Le switch (`192.168.1.2`) ne répond pas en
SNMP, donc sa table MAC est inaccessible. Les liens entre le switch et les
machines sont inférés.

**Un scan perdu au redémarrage.** Rien n'est persisté avant la fin de la phase 2 :
un redémarrage en cours de route laisse l'interface sur « en cours, 0 machine »
indéfiniment. Relancer le scan, ne pas attendre.
:::

La synchronisation Proxmox a été réparée le 2026-08-26 : elle échouait sur un
`https://` en double dans l'URL construite, et `PROXMOX_VERIFY_SSL` était ignoré
en silence.

## Les services volontairement absents

Les conteneurs qui n'écoutent que sur un réseau Docker interne — `outline-db`,
`outline-redis`, `socket-proxy`, `kroki-mermaid`, `status`, `autoheal`,
`homelable-backend` — n'ont **pas** de sonde. Un contrôle qui ne peut pas échouer
ne renseigne sur rien.
