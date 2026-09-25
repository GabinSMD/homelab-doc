# Forgejo maître : accès en urgence

**Depuis le 2026-08-16**, Forgejo (`git.home.gabin-simond.fr`, conteneur sur penny)
est la source de vérité du code. GitHub en est une **réplique en lecture seule**,
alimentée par un miroir push.

Cette page existe pour un seul scénario : le homelab est à terre et il faut
quand même travailler.

## Ce qui change concrètement

Sur penny, les clones de `/mnt/ssd/config` et `/mnt/ssd/homelab-doc` ont deux
remotes :

| remote | vers | usage |
|---|---|---|
| `origin` | Forgejo | **là où on pousse** |
| `github` | GitHub | réplique, lecture seule |

Le miroir se déclenche à chaque commit poussé (`sync_on_commit`), plus un
rattrapage toutes les 8 heures. Mesuré à l'activation : **10 secondes** entre le
push dans Forgejo et l'apparition sur GitHub.

## Le piège : ne pas pousser sur GitHub

Le miroir a la sémantique `git push --mirror`. Un commit poussé directement sur
GitHub sera **écrasé** à la prochaine synchronisation, sans avertissement et sans
trace ailleurs que dans le reflog local de celui qui l'a poussé.

Ce n'est pas une préférence de style : c'est une perte de données silencieuse.

## Si le homelab est à terre

Le cas s'est présenté le 2026-08-14 : une micro-coupure électrique a mis les
trois machines par terre pendant que les runbooks étaient sur penny.

**Lire** ne pose aucun problème : GitHub a une copie à jour de tout, et elle est
consultable depuis n'importe où.

**Écrire** demande un choix :

1. **Attendre le retour de Forgejo**, puis pousser normalement. À privilégier
   dès que le correctif peut attendre.
2. **Pousser sur GitHub en urgence**, puis, au retour de Forgejo, **rejouer le
   commit dans Forgejo** avant que le miroir ne se déclenche :

   ```bash
   # au retour du service, depuis un clone a jour
   git fetch github
   git cherry-pick <sha-du-commit-d-urgence>
   git push origin main          # Forgejo, qui re-poussera vers GitHub
   ```

   Si le miroir est passé avant le cherry-pick, le commit est perdu sur GitHub :
   il faut le récupérer dans le reflog de la machine qui l'a poussé
   (`git reflog`), ou dans l'onglet Activity de GitHub qui garde une trace des
   pushes forcés.

**Ne jamais** laisser un correctif d'urgence vivre uniquement sur GitHub en
espérant y penser plus tard.

## Vérifier que le miroir fonctionne

```bash
# les deux doivent afficher le meme sha
git ls-remote origin main | cut -c1-7
git ls-remote github main | cut -c1-7
```

:::tip[Une sonde le fait déjà, toutes les heures]
Depuis le 2026-09-04, `mirror-drift-check` compare `refs/heads/main` chez `origin` et
chez `github` sur les **deux** dépôts, avec un délai de grâce de **20 minutes** — le
miroir est asynchrone, un écart de quelques minutes est normal. Au-delà, il alerte.

La vérification manuelle ci-dessus reste utile juste après un push, quand on veut la
confirmation tout de suite plutôt qu'au prochain passage horaire. Mais **le seuil qui
fait foi est 20 minutes, pas 8 heures** : si rien n'a sonné, c'est que le miroir suit.

Deux choses en dépendaient sans filet avant cette sonde. `homelab-doc` alimente GitHub
Pages : un miroir mort gèle le site public sans qu'aucune page n'affiche d'erreur. Et
`ci-health-check` interroge GitHub faute de jeton Forgejo : il lirait des runs périmés
et rendrait **vert** sur de vieux commits. Un garde-fou en portait déjà un autre.
:::

Si l'écart persiste, regarder les paramètres du dépôt dans Forgejo, onglet
*Settings > Repository*, section *Mirror Settings*.

## Ce qui n'a pas change en phase 1

Les Actions GitHub **restent actives**. La documentation publique continue donc
d'être construite et publiée par GitHub Pages, et le CI continue de valider les
PR. C'est délibéré : couper les Actions arrêterait la publication de
`homelab.gabin-simond.fr`, et penny ne peut pas la servir — la box ne redirige
aucun port.

Les runners Forgejo, la désactivation des Actions et un Renovate auto-hébergé
forment la phase 2, conditionnée à l'ajout de disque sur les nœuds.

## Sauvegarde

Forgejo est couvert par `homelab_backup.sh` depuis le 2026-08-15
(`/mnt/ssd/forgejo`). Le miroir GitHub **n'est pas une sauvegarde** : il ne
contient ni les tickets, ni les comptes, ni les jetons d'accès.
