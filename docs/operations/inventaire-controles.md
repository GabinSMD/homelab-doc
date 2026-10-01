# Inventaire des contrôles et des risques sans contrôle

> Établi le 2026-10-01 par Sentinel (suivi interne HOM-5), en lecture seule.
> Aucune modification de configuration n'a été faite pendant cet inventaire.
> Les corrections listées ici sont des **propositions** ; elles ne démarrent qu'après
> approbation explicite de l'administrateur (T3).

Cette page contient deux tableaux. Le second — les risques **sans** contrôle — est
le plus important : la cause la plus fréquente d'incident non alerté dans ce
homelab n'a jamais été une sonde qui ment, c'est l'absence de sonde.

> **Révision 2 — 2026-10-01.** La [§6](#6-addendum-du-2026-10-01--instruction-des-deux-pistes-de-hom-4)
> instruit les paris de silence de `notif-hygiene.md`, le jeton `fish-lxc105`, la
> cascade de suppression, et **corrige trois affirmations** de la révision 1
> (R-01, R-13, §2.2). Trois risques ajoutés : R-16 à R-18.

---

## 0. Méthode, preuves et limites

### Sources

| Source | Accès | Usage |
|---|---|---|
| `gabins/homelab-config` | Forgejo, lecture seule (`pull: true`, `push: false`) | 32 `*.timer`, 44 `*.service`, 20 règles Grafana, `crontab`, configs Alloy |
| Loki réplica `http://loki-replica:3100` | lecture, sans jeton | historique de déclenchement, fraîcheur des séries |

### Rétention effective — à lire avant toute conclusion

```
GET /config → limits_config.retention_period: 30d
             limits_config.max_query_length:  30d1h
             compactor.retention_enabled:     true
```

Vérifié empiriquement, et pas seulement lu dans la configuration :

```
GET /loki/api/v1/index/volume_range?query={job=~".+"}&targetLabels=host&step=24h
→ premier jour porteur de données pour TOUS les hôtes : 2026-09-02
→ dernier : 2026-10-01
```

**Conséquence directe : l'historique de déclenchement sur 12 mois demandé par la
tâche n'est pas récupérable.** La fenêtre réellement interrogeable est
**2026-09-02 → 2026-10-01**, soit 30 jours. Toute affirmation du type « cette
sonde ne s'est jamais déclenchée » signifie ici, et uniquement ici, « pas de
déclenchement entre le 2026-09-02 et le 2026-10-01 ». C'est la lentille
**rétention et cardinalité** : une requête au-delà de la rétention ne renvoie pas
d'erreur, elle renvoie silencieusement moins que la réalité.

### Trois limites supplémentaires, dites explicitement

1. **Le réplica n'est pas un miroir fidèle du Loki primaire.**
   `homelab_monitor.sh:300` pousse directement vers `http://192.168.1.31:3100`
   (le primaire), pas vers le réplica. Vérifié : `{job="monitor-alerts"}` rend
   **0 stream sur 30 jours** sur le réplica, et `alert_tag` n'apparaît pas dans
   `GET /loki/api/v1/labels` sur la fenêtre. Ces séries existent pourtant côté
   primaire (la règle `alert-ssd-events` qui les interroge s'est bien déclenchée
   le 2026-09-21). **Je n'ai donc pas pu auditer les séries poussées en direct.**

2. **Je n'ai pas accès à l'historique d'état des règles Grafana** (`grafana.db`,
   API Grafana). L'historique de déclenchement reconstruit ci-dessous vient des
   journaux de `ntfy-relay`, qui ne voient que ce qui transite par Grafana —
   pas les notifications des 68 sondes, qui attaquent ntfy en direct.

3. **Pas de montage hôte.** Je n'ai lu aucun `systemctl list-timers`, aucun
   `/var/lib/*`, aucun fichier déployé. Tout ce qui suit sur l'état *déployé* est
   inféré depuis Loki, jamais depuis la machine.

### Le réplica tombe sous une requête de 7 jours

Constaté deux fois pendant cet inventaire : une agrégation sur 29 jours
(`sum by (host) (count_over_time({job=~".+"}[1d]))`) puis un filtre de ligne sur
7 jours ont chacun fait tomber `loki-replica`. `GET /ready` est repassé à 503
puis est revenu à 200 après ~25 s.

```
try1 ready=503 / try2 ready=503 / try3 ready=200
```

Aucune règle n'observe `loki-replica`. C'est consigné en **R-11** ci-dessous.

---

## 1. Ce que l'inventaire a trouvé en premier

Trois constats structurels dominent tout le reste. Ils sont détaillés dans les
tableaux, mais ils se lisent mieux ensemble.

### 1.1 — Les 32 sondes prouvent qu'elles ont tourné, pas qu'elles ont observé

Hypothèse de départ, testée et **réfutée** : j'ai d'abord relevé que 24 unités de
sonde sur 32 n'ont aucun stream `{job="journald", unit="X.service"}` sur 30 jours,
et j'ai cru à des sondes mortes. Le test décisif montre autre chose.

Les messages `Starting` / `Finished` de PID 1 portent `_SYSTEMD_UNIT=init.scope`,
pas le nom de l'unité. En interrogeant `init.scope` :

```
{job="journald",host="penny",unit="init.scope"} |= "aide-check"
→ 10-01 02:31:04  Starting aide-check.service - AIDE file integrity check (daily)...
  10-01 02:53:20  aide-check.service: Deactivated successfully.
  10-01 02:53:20  Finished aide-check.service - AIDE file integrity check (daily).
  10-01 02:53:20  aide-check.service: Consumed 19min 34.949s CPU time.
```

Même résultat pour `backup-freshness-check` (10-01 07:45), `restic-drill-monthly`
(10-01 03:20→04:00, 8 min 29 s CPU), `digest-drift-check` (10-01 03:00),
`break-glass-fraicheur` (10-01 07:22), `grafana-rules-health` (10-01 05:29),
`comptes-convention-check` (10-01 02:16), `security-updates` (10-01 03:51),
`repo-drift-check` (10-01 05:20), `outillage-health-check`, `smart-textfile-exporter`,
`funnel-public-check`, `mirror-drift-check` (échantillon 09-29).

**Les sondes tournent, et elles sortent toutes en code 0.** Le constat correct est
donc plus grave que « elles sont mortes » :

> 24 sondes sur 32 n'émettent **rien** sur stdout/stderr. Leur seule trace dans
> Loki est `Starting` / `Finished` / `Deactivated successfully` émis par PID 1.
> C'est une **preuve d'exécution**, qui est une forme de preuve d'intention.

Une sonde qui a tourné et rendu 0 est indiscernable d'une sonde qui n'a rien
observé : scan sur un ensemble vide, requête rendant zéro ligne, `curl` échoué
avalé par un `|| true`. C'est exactement la conjonction des lentilles **preuve
d'effet contre preuve d'intention** et **sonde vide**.

Les 8 qui produisent leur propre flux — et sont donc auditables — sont :
`ansible-drift-check`, `argon-evidence-archive`, `control-drift-check`,
`guardrail-liveness`, `homelab-backup`, `pbs-datastore-sync`,
`restic-check-monthly`, `trivy-scan`.

### 1.2 — Trois hôtes sont sortis de `{job="journald"}` le 2026-09-25

Le `job` a sept valeurs sur 30 jours, dont une qui ne devrait pas exister :

```
GET /loki/api/v1/label/job/values (fenêtre 30j)
→ ['audit','fail2ban','journald','monitor','proxmox','docker',
   'loki.source.journal.system']
```

`loki.source.journal.system` est l'identifiant de composant Alloy. Les configs
`galahad.alloy:31`, `lancelot.alloy`, `securo.alloy:54` portent pourtant déjà la
règle de relabel qui corrige ce défaut, avec ce commentaire :

> *« Alloy >= 1.19.2 IGNORE le bloc `labels` de `loki.source.journal` et étiquette
> job avec l'ID du composant. L'hôte sort alors silencieusement de toute requête
> `{job="journald"}`. »*

199 streams portent quand même ce label. Bornage exact :

| Hôte | Première ligne mal étiquetée | Dernière | Durée |
|---|---|---|---|
| `securo` | 2026-09-25 02:42 | 2026-09-25 14:45 | ≈ 12 h |
| `galahad` | 2026-09-25 14:26 | 2026-09-25 14:45 | ≈ 19 min |
| `lancelot` | 2026-09-25 14:30 | 2026-09-25 14:45 | ≈ 15 min |

Pendant ces fenêtres, ces hôtes étaient **invisibles à toute règle
`{job="journald"}`**, dont `Systemd — unit en crash-loop`. Le défaut s'est résorbé
seul à 14:45 le 2026-09-25. **Rien ne l'a signalé.**

C'est la récidive littérale de l'incident « la Pi sortie des alertes
`{job="journald"}` pendant deux mois » — corrigée sur penny le 2026-08-29, non
surveillée ailleurs. La correction a été écrite ; le **contrôle** qui vérifie que
la correction tient ne l'a pas été.

### 1.3 — L'alerte « penny est mort » doit traverser penny pour être livrée

Chaîne de notification Grafana, reconstruite depuis les fichiers :

```
Grafana (LXC logs, lancelot)
  → ntfy-relay (LXC logs, lancelot)        logs/logs-prod-1/docker-compose.yml:114
  → https://ntfy.home.gabin-simond.fr      NTFY_URL du relais
  → Traefik            (penny)
  → ntfy  (conteneur)  (penny)             docker/docker-compose.yml:516
  → ntfy.sh → iPhone
```

L'évaluation est correctement **déportée** : la règle `Penny — silence Loki > 10min
(host down ?)` tourne sur lancelot, pas sur penny. Mais les deux derniers sauts
avant la sortie — Traefik et ntfy — sont **sur penny**. Quand penny tombe, l'alerte
qui annonce que penny est tombé ne peut pas sortir.

Ce n'est pas théorique. Le 2026-09-21 :

```
08:25:04 ERROR ntfy forward failed: <urlopen error [Errno 111] Connection refused>
08:25:04 INFO  172.18.0.2 - "POST /webhook HTTP/1.1" 502 -
08:30:00 ERROR ntfy forward failed: ... 502
08:35:00 ERROR ntfy forward failed: ... 502
```

`app.py:219-222` : en cas d'échec le relais journalise et rend 502. **Pas de file
d'attente, pas de spool, pas de ré-essai.** Ces notifications sont perdues. Et
aucune règle n'observe `{container="ntfy-relay"}` — vérifié, `grep -n ntfy` sur
`rules.yml` ne rend aucune règle.

C'est la lentille **chaîne de notification complète** : sonde → règle → routage →
**livraison** → humain. Les trois premiers maillons sont instrumentés, le
quatrième ne l'est pas.

---

## 2. Tableau (a) — Inventaire des contrôles existants

### 2.1 Volumétrie de notification mesurée

Compteur interne de ntfy, relevé aux deux bords de la fenêtre :

```
{container="ntfy"} |= "messages_published"
2026-09-02 08:58  messages_published=1297
2026-10-01 08:57  messages_published=1491
```

**194 notifications en 30 jours, soit ≈ 6,5 par jour** pour un seul lecteur.
*Réserve : ce compteur repart à zéro si ntfy redémarre ; la série étant monotone
croissante sur la fenêtre, un redémarrage est improbable mais non exclu.*

Sur ces 194, seules **35** sont passées par le relais Grafana (comptées ligne à
ligne dans `{container="ntfy-relay"} |= "/webhook"`). Les **~159 restantes (82 %)
viennent des sondes systemd**, qui attaquent `http://127.0.0.1:8090/homelab` en
direct. Ces 159 notifications **ne sont journalisées nulle part que je puisse
auditer** : ni dans le relais, ni dans Loki.

### 2.2 Les 20 règles Grafana

Fichier : `logs/logs-prod-1/grafana-provisioning/alerting/rules.yml`.
Point de contact unique : `ntfy-homelab` → webhook `http://ntfy-relay:8080/webhook`.
`group_wait: 30s`, `group_interval: 5m`, `repeat_interval: 12h`.

Historique reconstruit depuis `{container="ntfy-relay"}` sur 30 jours.

| Règle (`title`) | Fenêtre | Prétend observer | Prouve réellement | Déclenchements 30 j | Classement | Correction proposée | Risque résiduel |
|---|---|---|---|---|---|---|---|
| `Systeme de fichiers > 90 %` | `for: 15m` | Un disque se remplit | Que la valeur instantanée a franchi 90 % | **8 transitions** : 09-12 18:00 F / 09-12 17:10 R / 09-13 02:20 R / 09-17 02:00 F / 02:10 R / 02:40 F / 03:00 R / 09-25 14:57 F / 09-26 03:02 F / 06:12 R / 09-30 14:52 F / 10-01 02:57 F | **bruyante** — bat autour du seuil ; cycle complet F→R en 10 min le 09-17 | Hystérésis : déclencher à 90 %, ne résoudre qu'en dessous de 85 %. Et alerter sur la **pente** (`predict_linear` à 4 h) plutôt que sur le niveau : le symptôme est « le disque sera plein », pas « il est à 90,2 % » | Un remplissage brutal (log qui s'emballe) passe sous la fenêtre de prédiction |
| `Latence de lecture disque anormale (seuil provisoire)` | — | Le disque ralentit | Un dépassement de seuil non étalonné — le titre le dit : « seuil provisoire » | 09-17 00:40 F → 00:45 R (**5 min**) | **bruyante** | Étalonner sur le p99 observé sur 30 j, ou retirer la règle. Un seuil provisoire laissé en place est un seuil faux | Une dégradation lente reste sous le seuil |
| `SSD — evenement hardware` | `for: 1m` | 4 événements SSD via `alert_tag` | Non vérifiable depuis le réplica : `{job="monitor-alerts"}` → **0 stream / 30 j** | 09-21 08:40 F (urgent) / 08:50 R / 09:10 F / 09:25 R | **non classée** — a bien fonctionné (déclenchement réel), mais sa série source est absente du réplica | Faire pousser `monitor-alerts` vers les **deux** writers, comme Alloy. Voir **R-10** | Dépendance à un `push` direct sans ré-essai dans `homelab_monitor.sh` |
| `Penny — silence Loki > 10min (host down ?)` | `for: 0s` | penny est injoignable | Que penny n'a rien expédié en 10 min | 09-22 05:39 — **émise et NON livrée** | **menteuse par le maillon aval** (voir §1.3 et §2.3) | Sortir le dead-man de la fenêtre de maintenance, et le doubler d'un chemin de livraison hors penny | Un contrôle depuis l'extérieur reste absent (**R-01**) |
| `Galahad / Lancelot — silence Loki > 10min` | `for: 0s` | Un nœud PVE est tombé | Idem, correctement **déporté** (évalué sur lancelot) | 0 | **conforme pour galahad** | — | `Lancelot — silence Loki` est évalué **sur lancelot** : observateur co-localisé (**R-02**) |
| `Systemd — unit en crash-loop` | `for: 5m` | Une unité boucle | 3 `Failed with result 'exit-code'` en 30 min, **sur `{job="journald"}` seulement** | 0 | **menteuse par intermittence** | Retirer la contrainte `job` ou alerter sur l'apparition d'un `job` inattendu (**R-03**) | Une unité qui échoue sans ce message exact reste invisible |
| `node_exporter muet` | `for: 10m` | Les métriques d'hôte sont perdues | `min by (host) (up{job="node"})` — bon contrôle de fraîcheur | 0 | **conforme** | — | Ne couvre pas la **péremption d'un fichier textfile** (**R-06**) |
| `Systeme de fichiers en LECTURE SEULE` | `for: 1m` | Un FS est passé en RO | Effet observable et direct | 0 | **conforme** | — | — |
| `Authelia — auth failures spike` · `fail2ban — > 5 bans/h` · `Traefik — 5xx anormaux` · `auditd — pic de sudo` | 3 à 5 min | Activité anormale | Un comptage de lignes au-dessus d'un seuil | 0 | **muettes, non prouvées** | Aucun déclenchement en 30 j ne distingue « rien ne s'est passé » de « la requête ne matche plus ». Ajouter un canari : vérifier que le dénominateur (volume total du flux) est non nul | Un changement de format de log casse le `|~` en silence |
| `Autoheal — restarts en pic` | `for: 5m` | autoheal redémarre trop | Comptage sur `{container="autoheal"}` | 0 | **muette, mais sélecteur valide** — `autoheal` est bien présent dans les valeurs du label `container` sur 30 j, donc le flux existe et le seuil n'a simplement jamais été franchi | Ajouter un canari de dénominateur (volume total du flux non nul) pour distinguer « aucun redémarrage » de « le flux a disparu » | Un arrêt du conteneur `autoheal` rendrait la règle muette sans que rien ne le dise |
| `Alerte infra (homelab_monitor.sh)` | `for: 1m` | Le moniteur a détecté un problème | Qu'une ligne contient `ALERT\|CRITICAL\|FAILED\|DOWN\|READ-ONLY` | 0 | **muette par construction côté réplica** | — | **Si `homelab_monitor.sh` meurt, cette règle rend 0 et ne déclenche pas** (**R-04**) |
| `Temperature > 75 C` · `Memoire disponible < 10 %` · `Lien reseau degrade` | 3 à 15 min | Seuils matériels | Dépassement instantané | 0 | **non prouvées** | Lentille **symptôme plutôt que seuil** : « mémoire < 10 % » n'est pas un symptôme ; l'OOM-kill en est un | — |
| `Lynis lancelot — audit en echec ou score bas` | — | L'audit a échoué | Le contenu du rapport | 0 | **conforme** | — | — |
| `Lynis lancelot — muet depuis plus de 8 jours` | — | L'audit a cessé de tourner | **Fraîcheur de la série** — exemplaire | 0 | **conforme — modèle à généraliser** | C'est le seul contrôle de fraîcheur par sonde du parc. Les 31 autres sondes n'en ont pas (**R-05**) | — |

**Piège documenté dans le fichier lui-même** (`rules.yml:11-30`) : retirer une
règle du fichier de provisioning **ne la supprime pas** de `grafana.db`. Quatre
`deleteRules` explicites existent (`alert-host-sucre-silent`,
`alert-sucre-llm-unavailable`, `alert-host-finance-silent`,
`alert-firefly-remote-user-missing`). Le commentaire rapporte qu'une règle
orpheline avait produit **38 notifications ntfy en 24 h, 60 % du trafic total**.
Le dispositif est bon ; il repose sur la discipline humaine de nommer chaque uid
retiré, et rien ne vérifie qu'il a été appliqué.

### 2.3 La fenêtre de maintenance : un silencieux correct, un maillon non prouvé

`logs/logs-prod-1/ntfy-relay/app.py:206-213` :

```python
if est_silencable(title) and maintenance_active():
    # On repond 200 : du point de vue de Grafana la livraison a reussi.
    log.info("maintenance active, non livre: title=%r", title)
    self.send_response(200)
```

Observé en production le 2026-09-22 à 05:39 :

```
INFO maintenance active, non livre: title='[FIRING] Penny silence Loki > 10min (host down ?)'
INFO 172.18.0.4 - "POST /webhook HTTP/1.1" 200 -
```

Le dead-man-switch de penny a été **étouffé**, et Grafana a enregistré une
livraison réussie. `MAINT_SILENCEABLE` contient `silence loki` par défaut
(`app.py:133`), donc l'étouffement est intentionnel et documenté.

**Ce qui est sain dans ce dispositif, et mérite d'être dit :**
`homelab-maintenance.sh` est bien conçu. Le marqueur vit dans `/run` (tmpfs, donc
un reboot le lève), la fenêtre porte une échéance absolue, le plafond dur est de
120 min (`MAINT_MAX_MIN`), et `maintenance_active()` livre en cas de doute
(`app.py:147`). Le périmètre est volontairement étroit : matériel et sécurité ne
sont jamais tus.

**Ce qui n'est pas prouvé :** `homelab_monitor.sh:145-147` publie
`homelab_maintenance_active` dans un fichier **textfile** de node_exporter,
rafraîchi chaque minute par cron. Le collecteur textfile sert un fichier
**indéfiniment**, sans péremption. Si `homelab_monitor.sh` meurt alors que la
dernière valeur écrite était `1`, la fenêtre reste ouverte **pour toujours** du
point de vue du relais — et le dead-man de penny reste étouffé. Aucune règle
n'observe `node_textfile_mtime_seconds` (vérifié : `grep textfile rules.yml` →
aucun résultat). Voir **R-06**.

### 2.4 Les 32 minuteurs systemd

Fréquences lues dans les `.timer`. **31 sur 32 portent `Persistent=true`** — seul
`claude-remote-watch.timer` ne l'a pas, ce qui est cohérent avec son
`OnUnitActiveSec=1min`. C'est un point fort du parc : un run manqué est rattrapé,
et le commentaire du `crontab` explique pourquoi la migration cron → timer a été
faite (« le drill du 2026-06-01 a sauté pendant le downtime penny 31/05-03/06 »).

Priorité ntfy et refroidissement relevés dans les scripts :

| Sonde (`.timer`) | Fréquence | Prio | Cooldown | Flux propre dans Loki | Classement |
|---|---|---|---|---|---|
| `smart-textfile-exporter` | 15 min | — | non | non | muette¹ |
| `claude-remote-watch` | 1 min | — | — | non | muette¹ |
| `ci-health-check` | 30 min | default/high | oui | non | muette¹ |
| `outillage-health-check` | 30 min | high | oui | non | muette¹ |
| `funnel-public-check` | horaire | default/high | oui | non | muette¹ |
| `mirror-drift-check` | horaire | default/high | oui | non | muette¹ |
| `control-drift-check` | 6 h | high | oui | **oui** | conforme |
| `guardrail-liveness` | 6 h | high | oui | **oui** | conforme |
| `grafana-rules-health` | 6 h | default/high | oui | non | muette¹ |
| `lxc-disk-check` | 6 h | high | oui | non | muette¹ |
| `aide-check` | quotidien 04:30 | high | **non** | non (malgré `StandardOutput=journal`) | muette¹ |
| `ansible-drift-check` | quotidien 03:40 | default/high | oui | **oui** | conforme |
| `argon-evidence-archive` | quotidien 07:20 | — | — | **oui** | conforme |
| `backup-coverage-check` | quotidien 06:45 | high | oui | non | muette¹ |
| `backup-freshness-check` | quotidien 09:30 | **urgent** | oui | non | muette¹ |
| `break-glass-fraicheur` | quotidien 09:20 | — | oui | non | muette¹ |
| `comptes-convention-check` | quotidien 04:10 | default | oui | non | muette¹ |
| `homelab-backup` | quotidien 03:00 | — | — | **oui** | conforme |
| `pbs-datastore-sync` | quotidien 03:30 | — | — | **oui** | conforme |
| `pbs-snapshot-integrity` | quotidien 04:05 | default/high | oui | non | muette¹ |
| `repo-drift-check` | quotidien 07:10 | default | oui | non | muette¹ |
| `security-updates` | quotidien 05:40 | — | non | non | muette¹ |
| `lynis-notify` · `lynis-remote-audit` | hebdo dim. | — | — | non | muette¹ |
| `trivy-scan` | hebdo dim. 06:00 | — | non | **oui** | conforme |
| `ci-runner-gc` · `rotate-logs-ssd` · `pct-fstrim-all` · `pve-guests-fstrim` | hebdo | — | non | non | muette¹ (entretien, pas observation) |
| `digest-drift-check` · `restic-check-monthly` · `restic-drill-monthly` | mensuel le 1er | — | non | `restic-check` **oui**, les 2 autres non | voir ci-dessous |

¹ **« muette » signifie ici précisément ceci, et rien de plus** : la sonde tourne
et rend 0 (prouvé par `init.scope`), mais n'émet aucune trace de son *résultat*.
Son succès et son échec silencieux sont indiscernables dans Loki. Ce n'est pas
« elle ne tourne pas ».

**Le matin du 2026-10-01**, les trois mensuelles ont bien tourné :
`digest-drift-check` 03:00→03:05, `restic-drift-monthly` 03:20→04:00 (8 min 29 s
CPU), `restic-check-monthly` 02:20 avec sortie complète et lisible :

```
10-01 02:20:09  [0:02] 100.00%  13 / 13 snapshots
10-01 02:20:09  no errors were found
```

`restic-check-monthly` est le **contre-exemple exemplaire** du reste du parc : il
prouve son effet. On lit le nombre de snapshots vérifiés — donc l'ensemble n'était
pas vide — et le verdict. C'est le modèle à généraliser.

**Cas particuliers relevés, à ne pas corriger ici :**

- `aide-check` consomme **19 min 34 s de CPU** chaque nuit sur un Raspberry Pi 4
  et n'émet pas une ligne. C'est le contrôle d'intégrité de fichiers du parc, et
  son verdict est invisible. C'est, parmi les 24, celui dont l'écart
  prétendu/prouvé est le plus coûteux.
- `guardrail-liveness.sh` est la meilleure pièce du parc : ses trois couches
  (timer *enabled* → *déclenché récemment* → *a produit une trace*) attrapent
  exactement la classe de panne décrite en §1.1. Son en-tête pose lui-même la
  bonne question — « qui surveille celui-ci ? » — et répond que `control-drift-check`
  remonte les units en échec. Mais il tourne **sur penny, pour penny**
  (`NTFY_URL=http://127.0.0.1:8090/homelab`), et il ne couvre pas les sondes des
  nœuds PVE ni du LXC `logs`. Voir **R-07**.

---

## 3. Tableau (b) — Inventaire des risques sans contrôle

C'est la moitié qui corrige le défaut de la révision 1 du plan. Chaque ligne porte
le risque, la panne réelle ou l'angle mort structurel qui le rend plausible, le
contrôle qui l'aurait vu, et pourquoi il n'existe pas.

### 3.1 Avertissement de méthode

La tâche demande de partir des pannes réelles des 12 derniers mois. **La rétention
Loki est de 30 jours** : je ne peux pas reconstruire cet historique par la mesure.
J'utilise donc deux sources écrites, en le disant à chaque ligne :

1. les **commentaires datés de `homelab-config`**, cités avec fichier et ligne ;
2. la page [Incidents récurrents](./incidents-recurrents.md), qui porte des
   **compteurs réels sur 4 mois** issus de la table `proposals` de sucre.

Ces compteurs sont **figés depuis le 2026-08-25** (sucre est arrêté), et ne
couvrent que 4 mois, pas 12. Ils sont fiables sur ce qu'ils ont compté, muets sur
le reste. **Un inventaire des pannes réelles sur 12 mois reste à faire à partir
d'une source qui les couvre** — c'est le rôle du tableau 2 du registre de mesure,
renseigné par l'administrateur, et c'est volontairement hors de portée d'un agent.

Les fréquences observées sur 4 mois, pour situer les priorités :

| Incident | Matches / 4 mois |
|---|---|
| Conteneurs à l'arrêt après reboot | **84** |
| Traefik : provider docker en EOF | 23 |
| AdGuard secondaire désynchronisé | 5 |
| pmxcfs bloqué en lecture seule | 1 |
| 6 autres fiches du catalogue | 0 |

### 3.2 Les risques

| # | Risque | Panne réelle, ou angle mort structurel | Contrôle qui l'aurait vu | Pourquoi il n'existe pas |
|---|---|---|---|---|
| **R-01** *(réécrit le 2026-10-01, cf. §6.5)* | **Les alertes de Grafana n'ont aucun chemin de secours, alors que celles du moniteur en ont un.** Toute la chaîne de livraison finit sur penny (Traefik + ntfy). | Réel, 2026-09-21 : le relais Grafana perd trois notifications à 08:25/08:30/08:35 (`ntfy forward failed: Connection refused` → 502, sans spool ni ré-essai, `app.py:219`) — tandis que le **même jour** à 10:06, 10:10 et 10:35, `homelab_monitor.sh` bascule avec succès sur healthchecks.io `/fail`. Deux producteurs, un seul filet. | Donner au relais `ntfy-relay` le repli hors-pile que `homelab_monitor.sh` possède déjà : à l'échec de livraison locale, déclencher `/fail` sur un check externe en portant le message. Lentille **observateur co-localisé** et **chaîne de notification complète**. | Le repli a été écrit pour le moniteur, en réponse à un incident du moniteur, et n'a pas été généralisé au second producteur d'alertes. **Correction de la version 1**, qui affirmait à tort que rien n'était hébergé hors du homelab : healthchecks.io est câblé dans trois scripts et a porté 4 messages réels en 30 j (§6.4). |
| **R-02** | **`Lancelot — silence Loki` est évalué sur lancelot.** Grafana vit dans le LXC `logs`, hébergé sur lancelot. | Structurel, et c'est la forme exacte de l'incident des onze jours. Si lancelot tombe, Grafana tombe avec, et la règle qui annonce que lancelot est tombé ne s'évalue jamais. | Évaluer le dead-man de lancelot **depuis galahad** (ou depuis penny), pas depuis lancelot. | Une seule pile Grafana, et elle est posée sur un des deux nœuds qu'elle surveille. `Penny —` et `Galahad — silence Loki` sont correctement déportés ; `Lancelot —` ne peut pas l'être avec la topologie actuelle. |
| **R-03** | **Un hôte sort silencieusement de `{job="journald"}`.** | Réel, 2026-09-25 : `securo` 12 h, `galahad` 19 min, `lancelot` 15 min sous `job="loki.source.journal.system"`. Récidive de « la Pi sortie des alertes pendant deux mois ». Non détecté. | Une règle sur l'**apparition d'une valeur de `job` non attendue**, ou sur la **chute du volume** de `{job="journald", host=X}` par hôte. | Le relabel Alloy a été corrigé dans les configs ; **le contrôle qui vérifie que la correction tient** n'a jamais été écrit. On a corrigé la panne, pas sa classe. |
| **R-04** | **`homelab_monitor.sh` meurt et plus rien ne le dit.** Il tourne par cron **chaque minute** sur penny. | Structurel. La règle `Alerte infra (homelab_monitor.sh)` compte des lignes `ALERT\|CRITICAL\|...` : à l'arrêt du script, elle rend 0, soit en-dessous du seuil. `execErrState: OK` et `or vector(0)` garantissent le silence. Un seul stream existe : `/mnt/ssd/log-homelab/homelab_monitor.log`. | Un dead-man de **fraîcheur** : `{job="monitor"}` muet > 5 min. Le modèle existe déjà dans le parc (`Lynis lancelot — muet depuis plus de 8 jours`). | La règle a été écrite pour détecter ce que le moniteur *dit*, jamais pour détecter qu'il *s'est tu*. Lentille **silence ≠ santé** : l'absence d'alerte n'informe que si l'absence d'alerte est surveillée. |
| **R-05** | **Une sonde cesse de tourner et personne ne le voit.** 31 sondes sur 32 n'ont aucun contrôle de fraîcheur. | Précédent documenté dans `guardrail-liveness.sh:30` : *« backup-freshness-check.timer JAMAIS ACTIVE depuis son déploiement, alors qu'il avait été créé parce que des sauvegardes avaient échoué en silence pendant 251 heures. »* | Un contrôle de fraîcheur par sonde, sur le modèle de `Lynis lancelot — muet depuis plus de 8 jours`. | `guardrail-liveness` couvre la couche « le timer s'est-il déclenché », mais seulement sur penny, et son verdict n'est pas lisible dans Loki (il n'émet pas sur stdout). |
| **R-06** | **Un fichier textfile périmé est servi indéfiniment comme une métrique saine.** En particulier `homelab_maintenance_active`. | Structurel, à fort impact : si `homelab_monitor.sh` meurt pendant une fenêtre de maintenance, `homelab_maintenance_active` reste à `1` pour toujours, et le relais étouffe **silence loki, node_exporter muet, crash-loop, autoheal, 5xx** sans limite de durée (`app.py:133`). | Une règle sur `time() - node_textfile_mtime_seconds > 300`. Lentille **fraîcheur des données** : une métrique figée ressemble à une métrique saine. | `grep textfile rules.yml` → aucun résultat. Le plafond de 120 min est appliqué par `homelab-maintenance.sh`, mais il vit dans le fichier `/run` ; le relais, lui, ne lit que la métrique Prometheus, qui n'a pas d'échéance. |
| **R-07** | **Les sondes hors-penny ne sont surveillées par personne.** | Structurel. `guardrail-liveness` tourne sur penny et notifie `127.0.0.1:8090`. Les sondes des nœuds PVE (`lxc-disk-check`, `pct-fstrim-all`, `pve-guests-fstrim`), de PBS (`pbs-snapshot-integrity`) et du runner CI (`ci-health-check`, `ci-runner-gc`) n'ont pas d'équivalent. | Étendre les trois couches de `guardrail-liveness` aux autres hôtes, ou centraliser le verdict dans Loki pour l'évaluer depuis Grafana. | Le script a été écrit pour résoudre un incident penny, et n'a pas été généralisé. |
| **R-08** | **CrowdSec bannit sans jamais notifier.** | Structurel. `crowdsec/profiles.yaml:9-13` et `:24-28` : **toutes** les lignes `notifications:` sont commentées. Aucune règle Grafana ne mentionne CrowdSec. | Un profil de notification CrowdSec vers ntfy, ou une règle Loki sur `{container="crowdsec"}` pour les décisions. | Les profils livrés par défaut n'ont jamais été activés. Le parc s'appuie sur la règle `fail2ban`, qui observe un **autre** outil : une attaque arrêtée par CrowdSec seul est totalement silencieuse. |
| **R-09** | **Le relais de notification redémarre en boucle sans que rien ne l'observe.** | Réel. `ntfy-relay` redémarre tous les jours à 00:32, et **16 fois le 2026-09-24** (00:04, 00:32, 07:26, 09:06, 09:47, 09:54, 10:00, 10:05, 10:26, 10:42, 12:26, 12:38, 12:44, 12:56, 13:31, 13:32). Aucune notification émise. | Une règle sur `{container="ntfy-relay"} |= "forward failed"` et sur le taux de redémarrage. | Le relais a été construit pour transporter les alertes, pas pour en être le sujet. Lentille **chaîne de notification complète** : le maillon livraison n'a pas sa propre preuve. |
| **R-10** | **Le réplica Loki ne contient pas tout ce que contient le primaire.** | Mesuré : `{job="monitor-alerts"}` → **0 stream / 30 j** sur le réplica, alors que la règle `alert-ssd-events` qui l'interroge s'est déclenchée le 2026-09-21. Cause : `homelab_monitor.sh:300` pousse vers `192.168.1.31:3100` uniquement, là où Alloy écrit vers les **deux** writers. | Un contrôle comparant le volume ingéré des deux côtés par `job`. | Le réplica a été ajouté pour les flux Alloy ; le `push` direct n'a jamais été recâblé. Un basculement sur le réplica perdrait le chemin d'alerte SSD **en silence**. |
| **R-11** | **`loki-replica` tombe sous une requête ordinaire.** | Réel et reproduit deux fois pendant cet inventaire, le 2026-10-01 : une agrégation 29 j puis un filtre de ligne 7 j ont rendu `GET /ready` → 503 pendant ~25 s. | Une sonde de disponibilité sur `loki-replica:3100/ready`, et une limite `max_query_length` plus basse pour échouer franchement au lieu de tomber. | `outillage-health-check.sh` couvre pulse, Grafana, PBS, Portainer — pas `loki-replica`. Un outil d'observabilité qui tombe est une panne d'observabilité. |
| **R-12** | **La notification part et n'arrive pas sur le téléphone.** Le dernier maillon n'a aucune preuve. | Réel, trois fois pour trois causes différentes, d'après `funnel-public-check.sh:14` : *« fetch anonyme 05/08, NXDOMAIN public 01/09, ingress décroché 21/09 »* — à chaque fois le canal d'alerte était lui-même la victime, et on l'apprenait en n'arrivant plus à lire une notification. | `funnel-public-check.sh` (horaire) a été écrit **exactement pour ça** et il est bien conçu : il teste toutes les adresses anycast, n'alerte que si elles échouent toutes, et résout par un résolveur public. Le trou n'est pas la conception, c'est qu'il tourne **sur penny** et qu'il n'émet aucune trace auditable. | Il hérite du défaut commun : co-localisé, et muet sur son résultat. |
| **R-14** | **L'auto-réparation silencieuse est un incident non alerté.** L'incident le plus fréquent du homelab (**84 matches en 4 mois**, « conteneurs à l'arrêt après reboot ») est auto-réparé depuis le 2026-08-30 par `check_containers_restart`, 2 min après détection, avec un disjoncteur de 3 relances par conteneur et par 24 h. | Réel et de loin le plus fréquent. Le registre de mesure pose la règle explicitement : *« y compris si le système s'est réparé tout seul — l'auto-réparation silencieuse est un incident non alerté, pas un non-événement. »* | Deux contrôles distincts, et il faut les deux : (a) une notification par relance effectuée, (b) une alerte **urgente** quand le disjoncteur se déclenche — un conteneur relancé 3 fois en 24 h est une panne de fond que la réparation masque. | Je n'ai pas pu vérifier depuis Loki si (a) et (b) notifient : les notifications de `homelab_monitor.sh` passent par un `push` direct vers le primaire (**R-10**) et par ntfy en localhost, deux chemins hors de ma portée. **Question ouverte à trancher en T3, pas un défaut établi.** |
| **R-15** | **Un chemin de code jamais emprunté se dégrade en silence.** | Réel, documenté dans [Incidents récurrents](./incidents-recurrents.md#trois-lecons-du-catalogue) : à l'arrêt de sucre, **4 fiches de remède sur 10 pointaient vers un script inexistant** (`<nom>.sh` au lieu de `<nom>-fix.sh`) — pendant **quatre mois**, sans que rien le signale, *« parce que rien n'a jamais tenté de les exécuter »*. Le même bug avait déjà été corrigé une fois sans que personne vérifie les autres. | Un exercice périodique qui **emprunte** le chemin : alerte de test de bout en bout jusqu'au téléphone, et vérification d'existence des cibles référencées. | Appliqué au présent inventaire, c'est le risque le plus transversal : la chaîne de notification complète (relais → Traefik → ntfy → ntfy.sh → iPhone) n'est jamais parcourue volontairement. On n'en découvre les ruptures qu'au moment où on en a besoin — ce qui est exactement ce qui s'est produit trois fois en 2026 (**R-12**). |
| **R-13** *(réécrit le 2026-10-01, cf. §6.4)* | **Trois étiquettes d'alerte font 57 % du trafic et ne se closent jamais.** | Mesuré sur 30 j : **202 messages publiés par ntfy** (compteur serveur), dont **86 alertes du moniteur pour 31 résolutions**. `pbs-down` 25/1, `docker-down` 14/0, `nfs-export-down` 10/0. Précédent documenté dans `rules.yml:22` : une règle orpheline a produit **38 notifications en 24 h, 60 % du trafic**. | Une alerte qui ré-émet sans jamais se clore doit être traitée comme un défaut de contrôle, pas comme un incident répété : hystérésis sur `pbs-down`, et une ligne de clôture pour `docker-down` / `nfs-export-down`. | La version 1 affirmait que ces notifications n'étaient journalisées nulle part : **c'était faux**, `{job="monitor"}` les porte toutes et le décompte par étiquette est désormais mesurable. Lentille **rapport signal/bruit** : une notification qu'on apprend à ignorer est une panne future qu'on ne verra pas. Reste non mesurable : les sondes en minuteur, qui publient sur ntfy sans journaliser (~81 messages sur les 202). |

---

## 4. Ce que je propose de faire ensuite — et qui ne démarre pas ici

Rien de ce qui suit n'est engagé. T3 ne démarre qu'après lecture et approbation
explicite de cette page par l'administrateur.

Si l'on devait ordonner par rapport valeur/risque, l'ordre serait :

1. **R-01 et R-02** — un veilleur hors du homelab, et le dead-man de lancelot
   déporté sur galahad. Ce sont les deux angles morts qui ont déjà produit un
   incident de onze jours.
2. **R-04 et R-06** — deux règles de fraîcheur, peu coûteuses : `{job="monitor"}`
   muet > 5 min, et `node_textfile_mtime_seconds` > 5 min. La seconde ferme le
   scénario « maintenance ouverte pour toujours ».
3. **R-09 et R-12** — instrumenter le maillon livraison : règle sur
   `forward failed`, et spool de ré-essai dans le relais.
4. **R-03** — une règle sur l'apparition d'un `job` inattendu, pour que la classe
   de panne du 2026-09-25 ne puisse pas se rejouer sans bruit.
   Et **R-15** — un exercice d'alerte de bout en bout, périodique, qui *emprunte*
   la chaîne au lieu de la supposer.
5. **Les 24 sondes muettes** — leur faire émettre une ligne de verdict structurée
   incluant la **taille de l'ensemble observé**, afin qu'une sonde vide échoue au
   lieu de réussir. `restic-check-monthly` montre déjà la forme attendue.

Conversion type, telle qu'elle devrait être formulée :

> ~~« rendre la sauvegarde observable »~~
> « vérifier que `backup.log` a été modifié dans les 26 dernières heures **et**
> que la ligne de verdict mentionne un nombre de fichiers strictement positif. »

---

## 5. Résumé du classement

| Classement | Nombre | Lecture |
|---|---|---|
| **Muets** | 24 sondes sur 32, et 16 règles Grafana sur 20 sans aucune livraison en 30 j | Tournent, rendent 0, ne prouvent rien de leur effet. Pour les règles, zéro déclenchement ne distingue pas « rien ne s'est passé » de « le sélecteur ne matche plus » |
| **Bruyants** | 2 règles (`Systeme de fichiers > 90 %`, `Latence de lecture disque`) **et 3 étiquettes d'alerte du moniteur** (`pbs-down` 25 émissions / 1 résolution, `docker-down` 14/0, `nfs-export-down` 10/0 — §6.4) | Battent autour d'un seuil sans hystérésis, ou ré-émettent sans jamais se clore. 49 des 86 alertes de 30 j |
| **Menteurs** | 2 maillons (`ntfy-relay` en maintenance rend 200 sans livrer ; `Systemd — crash-loop` aveugle aux hôtes hors `{job="journald"}`) | Rapportent un succès qui n'a pas eu lieu |
| **Conformes** | 8 sondes à flux propre, `restic-check-monthly` en modèle, 4 règles Grafana | Prouvent un effet observable |
| **Risques sans contrôle** | **18** (R-01 → R-18) | Dont 10 adossés à une panne réelle datée, les autres à un angle mort structurel. R-16 à R-18 ajoutés le 2026-10-01 (§6.6) |
| **Paris de silence** | 12 lignes de `notif-hygiene.md`, dont **10 tenus**, 2 non instrumentés | La doctrine de silence n'est pas le défaut du parc — §6.2 |
| **Cascade de suppression** | conforme, **394 suppressions sur 30 j** pour 86 alertes émises | Fait ce que la doc promet, par un mécanisme plus robuste que celui décrit — §6.3 |

Aucune ligne de cet inventaire ne conclut « conforme » sur l'ensemble du parc. Le
parc n'est pas négligé — il est au contraire remarquablement documenté, et
plusieurs dispositifs (`guardrail-liveness`, `homelab-maintenance`,
`funnel-public-check`, les `deleteRules` explicites, `Persistent=true` partout)
montrent que les bonnes questions ont déjà été posées. L'écart tient en une
phrase : **ces dispositifs prouvent qu'ils ont tourné, rarement ce qu'ils ont
observé, et presque jamais que leur alerte est arrivée.**

---

## 6. Addendum du 2026-10-01 — instruction des deux pistes de HOM-4

Cette section répond au relevé de HOM-4 sur
`operations/notif-hygiene.md` et `operations/monitoring.md`. Elle **corrige trois
affirmations** de la version précédente de cette page : les corrections sont en
§6.5, et les lignes concernées (R-01, R-13) ont été réécrites sur place.

### 6.1 Le jeton `fish-lxc105` — le risque est réel, et il n'y a aucun observable

`notif-hygiene.md:131-152` documente que l'utilisateur ntfy `fish` — l'ancien nom
de sucre, service arrêté le 2026-08-25 — conserve un jeton `fish-lxc105` sans
expiration et un accès en **écriture** sur l'unique topic `homelab`.

Ce que la mesure ajoute :

| Mesure | Requête / fenêtre | Résultat |
|---|---|---|
| Les 4 comptes existent toujours | `{container="ntfy"}`, dernière ligne du 2026-10-01 09:09:33 | `users=4` — cohérent avec les 4 comptes du tableau (`publisher`, `phone`, `admin`, `fish`), **37 jours** après l'arrêt de sucre |
| Trace d'un usage de `fish` | `sum(count_over_time({container="ntfy"} |= "fish" [30d]))` | **vecteur vide** — aucune occurrence sur 30 j |
| Le filtre sait rendre autre chose que zéro | `sum(count_over_time({container="ntfy"} |= "Server stats" [30d]))` | **43 132** lignes (≈ 1/min × 30 j). Lentille **sonde vide** : un zéro n'est une preuve que si le même filtre sait produire un non-zéro |
| Ce que ntfy journalise réellement | `{container="ntfy"} != "Server stats"` sur 6 h | **0 ligne** |

La dernière ligne est le vrai constat, et il est plus lourd que « aucune sonde ne
regarde » : **ntfy ne journalise rien d'autre que son relevé de statistiques
minute.** Aucune publication, aucune authentification, aucune attribution par
utilisateur n'est écrite. Il n'existe donc **aucun observable** sur lequel bâtir
un contrôle : une écriture par `fish-lxc105` sur le canal d'alerte du homelab ne
laisserait de trace nulle part. Le zéro mesuré ci-dessus ne prouve pas que `fish`
n'a rien publié — il prouve que **la question n'est pas décidable** en l'état.

Conséquence pour T3 : la conversion ne commence pas par une sonde, elle commence
par **créer l'observable** (élever le niveau de journalisation de ntfy, ou activer
son journal d'accès). Sans cela toute sonde écrite ici serait une sonde vide.

### 6.2 Le pari du silence, instruit ligne par ligne

`notif-hygiene.md:20-35` liste douze catégories silenciées depuis le 2026-05-04.
Chaque ligne est un pari : « ce succès n'a pas besoin d'être dit ». Un pari n'est
pas un défaut — c'est la bonne doctrine, et le parc l'applique sérieusement. Ce
qui compte est : **quelque chose prouve-t-il encore que la chose a eu lieu ?**

| Ligne silenciée | Ce qui prouve encore l'effet | Preuve lue | Verdict du pari |
|---|---|---|---|
| heartbeat `homelab_monitor` / 6 h | Registre `guardrail-liveness`, témoin `/mnt/ssd/log-homelab/homelab_monitor.log`, âge max **1 h** ; + ping healthchecks.io chaque minute | `guardrail-liveness.sh:91` ; `homelab_monitor.sh:2159-2182` | **tenu**, le mieux couvert du parc |
| `homelab_backup.sh` OK | Triple : `check_restic_repos_freshness` (repo `restic`, 30 h, urgent), registre « Sauvegarde principale » 30 h, `backup-freshness-check.timer` | `monitoring.md:190-194` ; `guardrail-liveness.sh:88,96` | **tenu** — et c'est une *preuve d'effet* : le seuil interroge R2, pas l'unité |
| `vault-backup.sh` (LXC 102) | `restic-vault`, seuil **3 h** | idem | **tenu**. Modèle à généraliser : une sonde d'un autre hôte vérifiée par l'octet déposé, pas par son unité |
| `logs-backup.sh` (LXC 101) | `restic-logs`, 30 h | idem | **tenu** |
| `dnsfailover-backup.sh` (LXC 100) | `restic-dnsfailover`, 30 h | idem | **tenu** |
| `restic-check-monthly.sh` | Registre, 840 h, **témoin fichier `-`** | `guardrail-liveness.sh:112` | **partiel** — couches 1 et 2 seulement : on sait que le timer s'est déclenché, pas qu'il a rendu un verdict |
| `restic-drill-monthly.sh` | Registre 840 h **avec** témoin `/var/lib/restic-drill/restic-drill.log` | `guardrail-liveness.sh:113` | **tenu** |
| `lynis-notify.sh` (silence si score ≥ 70) | Registre + 2 règles Grafana (`Lynis lancelot — audit en echec ou score bas`, `— muet depuis plus de 8 jours`) | `rules.yml:1161,1223` | **tenu mais déjà démenti une fois** : le témoin penny a crié « muet depuis 264 h » alors que l'audit tournait, en masquant un vrai écart de score **11 jours** (`guardrail-liveness.sh:104-109`) |
| `clear_alert()` — résolutions silencieuses | Rien côté téléphone ; l'état ne vit que dans `$STATE_DIR` sur penny | `homelab_monitor.sh:425` | **non instrumenté**. Mesuré : **86 ALERT pour 31 RESOLVED** sur 30 j (§6.4). Depuis le téléphone, « réparé » et « toujours cassé » sont indistinguables |
| whitelist AdGuard 02:00-02:05 | Fenêtre bornée à 5 min ; l'alerte repart au tick de 02:06 si la panne est vraie | `homelab_monitor.sh:1376-1383` | **tenu**. Résidu : une panne qui commence *et* finit dans la fenêtre est invisible — arbitrage acceptable |
| whitelist Loki/Grafana 02:30-02:35 | Même structure | `homelab_monitor.sh:1538-1545` | **tenu**. Point à vérifier en T3, pas un défaut établi : la fenêtre est calculée sur l'heure **locale de penny** (`date +%H%M`) alors que le `vzdump` est planifié côté PVE — un décalage d'horloge entre les deux décale le silence |
| CT log monitor (silence sauf nouveau sous-domaine) | Registre « CT log (certificats) », témoin `/mnt/ssd/log-homelab/ct-monitor.log`, 30 h | `guardrail-liveness.sh:90` | **partiel** : la liveness est couverte, la justesse du « jamais vu » (la base des sous-domaines connus) n'est vérifiée par rien |

**Ce que ce tableau dit du parc :** dix paris sur douze sont adossés à un contrôle
de fraîcheur réel, et le registre `guardrail-liveness` en porte l'essentiel. La
doctrine de silence n'est pas le problème de ce homelab. Les deux paris non
couverts sont tous deux du même type — on a silencié le succès **et** la
résolution, sans rien mettre à la place qui dise « c'est fini ».

**Ce que le tableau ne dit pas, et qui est le vrai manque :** le pari lui-même n'a
jamais été réévalué depuis mai 2026. `notif-hygiene.md` est une liste de décisions,
pas une mesure. Le registre 30 jours de HOM-4 est le premier
instrument capable de dire si un silence a coûté un incident.

### 6.3 La cascade de suppression — conforme, mais pas par le mécanisme documenté

`monitoring.md:49-58` annonce deux règles : `house-down` supprime `cluster-hosts`,
`logs-stack` et `pbs-down` ; `lancelot-down` supprime `logs-stack` et `pbs-down`.

Lecture du code :

- `check_cluster_hosts` sort **immédiatement** si le témoin `house-down` existe
  (`homelab_monitor.sh:1477-1481`) — donc pendant une panne maison, le témoin
  `lancelot-down` n'est jamais écrit.
- `check_logs_stack` et `check_pbs_health` ne consultent pas `house-down` : ils
  appellent `parent_down lancelot` (`:1550`, `:1762`).
- `parent_down()` ne se contente pas du témoin : à défaut, il **ping l'hôte en
  direct** et renvoie « parent down » si le ping échoue (`homelab_monitor.sh`,
  corps de `parent_down`).

La promesse de la page est donc tenue — mais par le ping de repli, pas par la
cascade de témoins décrite. C'est **plus robuste** que la documentation : la
suppression ne dépend pas de l'ordre d'écriture des témoins ni du fait que
l'alerte parente soit effectivement partie. Elle accorde en outre une grâce de
`HOST_RECOVERY_GRACE_S` = 300 s au retour d'un hôte, pour ne pas alerter sur des
LXC qui n'ont pas fini de démarrer.

Volume mesuré, et c'est le chiffre qui compte :

> `sum by (k) (count_over_time({job="monitor"} |~ "SUPPRIME|suppressed|..." [30d]))`
> → **394** lignes `suppressed` (cascade) et **25** `SUPPRIME` (fenêtre de
> maintenance ou grâce de boot), contre **86** alertes émises.

**Pour une alerte émise, environ 4,6 alertes enfants sont supprimées.** La cascade
n'est pas un détail de confort : elle porte la majorité du trafic de décision du
moniteur. Classement : **conforme**, avec un risque résiduel à la hauteur du
volume — toute erreur de règle de cascade se traduit par un silence de masse, et
rien ne contrôle aujourd'hui la justesse des suppressions elles-mêmes. Les 25
`SUPPRIME` sont un second enseignement : **29 % des alertes détectées sur 30 jours
n'ont pas été livrées**, par décision explicite. Détection et livraison divergent
d'un tiers — un écart qu'aucun tableau de bord n'affiche.

### 6.4 Ce que la piste a permis de mesurer et qui manquait à la version 1

En cherchant la trace de la cascade, j'ai trouvé ce que la première passe avait
manqué : `/mnt/ssd/log-homelab/homelab_monitor.log` **est** collecté dans Loki,
sous `{job="monitor"}` (61 Mo sur 30 j, `host="penny"`). La première version de
cette page affirmait que les notifications de sondes n'étaient journalisées nulle
part. C'était faux pour le moniteur, qui est le plus gros émetteur du parc.

Décompte par étiquette d'alerte sur 30 jours
(`sum by (verbe, tag) (count_over_time({job="monitor"} |~ "(ALERT|RESOLVED) \[" | regexp ... [30d]))`) :

| Étiquette | ALERT | RESOLVED | Lecture |
|---|---|---|---|
| `pbs-down` | **25** | 1 | Le plus bruyant du parc. 25 émissions pour une seule résolution : l'état expire et ré-alerte au lieu de se clore |
| `docker-down` | **14** | 0 | Aucune clôture en 30 j |
| `grafana-down` | 11 | 11 | Symétrique — le modèle de ce qu'une étiquette saine produit |
| `nfs-export-down` | **10** | 0 | Aucune clôture |
| `loki-down` | 6 | 4 | |
| `lancelot-down` | 3 | 1 | |
| `ram-collapse`, `firefly-down`, `containers-stopped` | 3 | 3 | Symétriques |
| `penny-rebooted`, `galahad-down` | 2 | 0 / — | |
| `ssd-smart-crc`, `oom-kill`, `load-watchdog`, `freebox-down` | 1 | 1 | Symétriques |
| `ssd-usb-errors` | **0** | 1 | Une résolution sans alerte : l'alerte est **antérieure au 2026-09-02**, hors rétention. Preuve directe que la fenêtre de 30 j tronque |
| **Total** | **86** | **31** | |

Trois conclusions :

1. **Trois étiquettes font 57 % du volume** (`pbs-down`, `docker-down`,
   `nfs-export-down` = 49 des 86), et aucune des trois ne se clôt. C'est la
   définition opérationnelle d'une sonde **bruyante** : un signal répété qu'on
   apprend à ignorer, sans jamais la satisfaction d'un « c'est réglé ».
2. **86 alertes pour 31 résolutions.** 64 % des incidents n'ont jamais reçu de
   ligne de clôture. Le silence des résolutions (§6.2) est donc le pari le plus
   coûteux de la liste, et c'est celui qui n'a aucune compensation.
3. La volumétrie totale est maintenant mesurée de bout en bout :
   **202 messages publiés par ntfy entre le 2026-09-01 09:10 et le 2026-10-01
   09:09** (compteur `messages_published` : 1289 → 1491, sous réserve de
   non-redémarrage du conteneur dans la fenêtre — un redémarrage remettrait le
   compteur à zéro). Dont 86 du moniteur (61 livrés après les 25 `SUPPRIME`) et
   ~35 de Grafana. L'estimation de 194 de la version 1 est confirmée à 4 % près.

Enfin, le chemin de secours externe **existe et a fonctionné** :
`{job="monitor"} |~ "DEADMAN|ntfy send FAILED"` sur 30 j rend **4** bascules vers
healthchecks.io `/fail`, les 2026-09-21 à 10:06, 10:10 et 10:35, et le 2026-09-25
à 16:35 — chacune précédée d'un `ntfy send FAILED`. C'est une preuve d'effet, pas
d'intention : le chemin hors-pile a porté un message réel quatre fois ce mois-ci.

### 6.5 Corrections apportées à la version 1 de cette page

| Ligne | Ce qu'elle disait | Ce qui est vrai | Comment je le sais |
|---|---|---|---|
| **R-01** | « Rien n'est hébergé hors du homelab » | **Faux.** healthchecks.io est un veilleur externe, câblé dans trois scripts (`homelab_monitor.sh:2159`, `guardrail-liveness.sh:258`, `break-glass-auto-depot.sh:38`) et déclenché 4 fois en 30 j | §6.4 ; lecture des trois scripts |
| **R-13** | « ~159 notifications de sondes journalisées nulle part » | **Faux pour le moniteur** : 86 alertes sont journalisées et décomposables par étiquette sous `{job="monitor"}` | §6.4 |
| §2.2 / `monitoring.md:349` | La page doc annonce « 19 règles provisionnées » | Le fichier `rules.yml` porte **20** titres de règles. Écart de la documentation au dépôt, mineur mais réel : le compte écrit ne peut pas servir de référence à `grafana-rules-health` | `grep -c "title:" rules.yml` |

Et deux risques que la correction de R-01 fait apparaître, parce qu'un veilleur
externe qui existe pose ses propres questions :

- **Un seul check healthchecks.io est partagé par trois producteurs aux
  sémantiques incompatibles.** Le moniteur pinge le succès chaque minute ; les
  deux autres appellent `/fail` en dernier recours. Un `/fail` émis par
  `guardrail-liveness` est donc **effacé par le ping de la minute suivante**, et
  il fait croire entre-temps que penny est mort. Ce n'est pas une hypothèse : le
  commentaire `guardrail-liveness.sh:253-256` le documente, et c'est arrivé le
  2026-09-22 à 07:14 — fausse alerte envoyée à l'administrateur.
  `funnel-public-check.sh:108-110` a tiré la conclusion inverse et utilise le
  relais mail de galahad. Trois scripts, trois doctrines. → **R-16**.
- **Rien ne prouve que le veilleur externe est armé.** Le ping est
  `curl -fsSL ... || true` (`homelab_monitor.sh:2179`) : si le check a été
  supprimé ou mis en pause côté healthchecks.io, le `curl` échoue, l'erreur est
  avalée et aucune trace n'est écrite. Et si `/etc/homelab/healthchecks-url` est
  absent, le ping est sauté silencieusement — le code le dit : *« no-op safe »*.
  Lentille **sonde vide** appliquée au dernier filet du parc. → **R-17**.

### 6.6 Trois risques sans contrôle ajoutés (R-16 → R-18)

| # | Risque | Panne réelle, ou angle mort structurel | Contrôle qui l'aurait vu | Pourquoi il n'existe pas |
|---|---|---|---|---|
| **R-16** | **Un `/fail` de secours fait croire que penny est mort, puis est effacé une minute plus tard.** Le check healthchecks.io est partagé entre un dead-man (ping de succès/minute) et deux canaux de dernier recours (`/fail`). | Réel, 2026-09-22 07:14 : fausse alerte « penny DOWN » envoyée à l'administrateur pour un test de `guardrail-liveness`, documenté dans `guardrail-liveness.sh:254-256`. | Un second check healthchecks (gratuit, le palier libre en offre 20) dédié aux canaux de dernier recours, distinct du dead-man. Lentille **chaîne de notification complète** : deux messages différents ne peuvent pas partager un même état. | Le commentaire dit explicitement *« on ne cree pas un troisieme mecanisme »* — l'économie de mécanisme était le bon réflexe, mais elle a fusionné deux sémantiques opposées. |
| **R-17** | **Rien ne prouve que le veilleur externe est encore armé.** Si le check est supprimé, mis en pause ou l'URL perdue, le homelab perd son seul filet hors-pile en silence. | Structurel. `homelab_monitor.sh:2179` : `curl -fsSL ... \|\| true` — l'échec du ping est avalé. Fichier d'URL absent → *« ping skipped silencieusement (no-op) »*. | Journaliser l'échec du ping (le code d'état HTTP suffit) et porter une entrée de fraîcheur dans le registre `guardrail-liveness`. Lentille **sonde vide** et **silence ≠ santé**. | Le `\|\| true` est là pour que le moniteur ne se bloque pas sur un tiers lent — intention juste, effet de bord muet. |
| **R-18** | **Le dernier maillon — ntfy vers le téléphone — n'est observable par rien.** | Structurel, et mesuré : `subscribers=0` dans **les 43 132 relevés** de 30 j. Le serveur n'a jamais vu d'abonné connecté. La livraison réelle passe par le relais ntfy.sh/APNS, hors de portée du homelab. | Un accusé de réception de bout en bout : message de test périodique dont la lecture sur le téléphone est reconduite vers le homelab. C'est le seul contrôle qui fermerait la chaîne **sonde → règle → routage → livraison → humain**. | Aucun contrôle n'a jamais visé le maillon humain. `funnel-public-check` s'arrête au chemin public ; au-delà, personne. Même angle mort que **R-15**. |

