# Forgejo

La forge auto-hébergée, source de vérité des dépôts. GitHub reste un miroir, et
porte le déploiement Pages de cette documentation.

| | |
|---|---|
| Image | `codeberg.org/forgejo/forgejo:13-rootless` |
| URL | `git.home.gabin-simond.fr` |
| Base | SQLite |
| SSH | **désactivé** (`DISABLE_SSH: true`) — tout passe en HTTPS |
| Données | `/mnt/ssd/forgejo/data` |
| Inscription | fermée, `REQUIRE_SIGNIN_VIEW` actif |

## Authentification : OIDC, jamais forwardAuth

:::danger[Ne pas mettre Forgejo derrière le forwardAuth d'Authelia]
Le forwardAuth intercepte **toutes** les requêtes, y compris celles de `git` et de
l'API. Un `git clone` ou un runner d'Actions se retrouve devant une page de
connexion HTML et échoue. Forgejo doit donc utiliser **OIDC en interne** : le
navigateur passe par Authelia, `git` et l'API gardent leur propre
authentification.
:::

:::warning[Rattachement par e-mail divergent]
Forgejo rattache un compte OIDC à un compte local en comparant les **e-mails**. Si
l'adresse déclarée par Authelia diffère de celle du compte existant, il crée un
**second compte** en silence, et les dépôts du premier deviennent invisibles.
Vérifier l'e-mail des deux côtés avant le premier login.
:::

## Actions et runner

Le runner tourne dans le **LXC 108 `ci-runner`** sur lancelot, en aarch64 —
voir [ci-runner](ci-runner.md). Trois réglages sont indispensables et non
évidents :

- `DEFAULT_ACTIONS_URL=github` — sans quoi les `uses: actions/checkout@v4` ne
  résolvent pas.
- Une URL d'instance **publique** dans la config du runner, pas `localhost` —
  sinon les dépôts privés échouent au clone.
- `has_actions` doit être activé **par dépôt**, ce n'est pas global.

## Le piège de fusion

:::danger[Une PR `merged: true` ne prouve pas que la référence a bougé]
Constaté le 2026-08-16 : l'API a répondu `merged: true`, HTTP 200, et créé le
commit de fusion — mais `refs/heads/main` n'avait pas avancé. **Rien n'était
publié**, alors que l'interface affichait la PR comme fusionnée.

Vérifier par la référence, jamais par l'état de la PR :

```bash
git ls-remote origin refs/heads/main
```
:::

En cas de perte d'accès à l'interface, voir
[Forgejo — accès d'urgence](../operations/forgejo-acces-urgence.md).
