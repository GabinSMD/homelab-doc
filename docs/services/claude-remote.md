# Claude Remote Control — piloter penny depuis le smartphone

Service systemd qui expose penny comme **appareil connecté** dans l'app Claude : on y crée des sessions à la demande depuis le téléphone, sans SSH ni laptop. Objectif : diagnostiquer et réparer le homelab depuis la poche.

**Depuis 2026-08-03.**

## Pourquoi

L'incident du 2026-08-03 a montré le trou : le SSD Argon a décroché à 01:25, docker est mort dans la fenêtre `dietpi-backup`, et la stack est restée down **9 heures** — le temps que quelqu'un ouvre un terminal. Un accès Claude permanent depuis le téléphone réduit ce délai au temps de trajet jusqu'à la poche.

## Architecture

```mermaid
flowchart LR
    S[Smartphone<br/>app Claude]
    A[Bridge Anthropic<br/>environment env_017uqn…]
    T[penny · tmux -L claude<br/>claude remote-control<br/>cwd /root]
    S1[session 1]
    S2[session 2]
    S3[… jusqu'a 4]

    S <-->|appareil| A
    A <-->|443 sortant| T
    T --> S1
    T --> S2
    T --> S3

    style T fill:#d4edda,stroke:#28a745
    style A fill:#fff3cd,stroke:#ffc107
```

Le lien est **sortant en HTTPS** : aucun port entrant, aucune règle NAT sur la box. Cohérent avec la posture « zéro WAN forward » de penny.

Le serveur enregistre un **environment** côté Anthropic — c'est cette entité qui apparaît comme appareil dans l'app, avec une icône d'ordinateur et un point vert quand elle est en ligne. Son identifiant est persisté par répertoire de travail dans `~/.claude/projects/-root/bridge-pointer.json`, donc **l'appareil reste le même d'un reboot à l'autre** tant que le `WorkingDirectory` du service ne change pas.

## Composants

| Fichier | Rôle |
|---------|------|
| `homelab-config/scripts/claude-remote.sh` | superviseur (source de vérité) |
| `/usr/local/bin/claude-remote.sh` | copie live, **sur carte SD** |
| `homelab-config/system/systemd/claude-remote.service` | unit (source de vérité) |
| `/etc/systemd/system/claude-remote.service` | unit live |
| `/var/lib/claude-remote/claude-remote.log` | log persistant (`StateDirectory`) |
| `homelab-config/scripts/claude-remote-watch.sh` | garde-fou : scrape les événements de session, notifie les échecs |
| `homelab-config/system/systemd/claude-remote-watch.{service,timer}` | timer, une passe par minute |
| `/var/lib/claude-remote/server-events.log` | **événements de session horodatés** (la seule trace durable) |
| `/var/lib/claude-remote/server-debug.log` | `--debug-file` du serveur, rotaté à chaque lancement (`.1` conservé) |

## Décisions de design

**Le service ne dépend en rien de `/mnt/ssd`.** Script et binaire `claude` vivent sur la carte SD, et l'unit n'a volontairement **pas** de `RequiresMountsFor=/mnt/ssd`. C'est le cœur du design : le service doit survivre exactement à la panne qu'il sert à diagnostiquer. Vérifié en conditions réelles — la session est restée joignable pendant tout le décrochage SSD.

**Mode serveur, pas le flag `--remote-control`.** Le flag est limité par conception à **une session par process** : l'app affiche alors une session unique et figée. La sous-commande `claude remote-control` est un serveur persistant qui enregistre un environment et crée les sessions à la demande. C'est la différence entre « une conversation partagée » et « une machine où je peux lancer du travail ».

**`--capacity 4`.** Le défaut amont est 32 sessions concurrentes — chacune étant un process `claude` complet, c'est intenable sur un Pi 4. Quatre laisse de la marge sans risquer l'OOM.

**`--spawn same-dir`.** Le mode `worktree` isolerait chaque session dans un git worktree, mais exige un dépôt git : `/root` n'en est pas un. À reconsidérer si le `WorkingDirectory` bascule un jour vers un des deux repos — au prix de la dépendance au SSD.

**tmux plutôt que `script(1)`.** La TUI de `claude` exige un pty ; tmux le fournit et rend la session attachable (`tmux -L claude attach -t claude`) pour voir son état exact. La sortie n'inonde pas journald — on évite le chemin journald/mmap responsable des SIGBUS récurrents sur ARM. Socket dédié `-L claude` pour ne pas collider avec les sessions tmux interactives.

:::warning[Le pane tmux ne conserve AUCUN historique]
Contrairement à ce que cette page affirmait jusqu'au 2026-08-05, la sortie du serveur **ne s'accumule pas** dans le scrollback tmux. La TUI tourne en **écran alterné** : `tmux display-message -p '#{history_size}'` renvoie **0**, quel que soit `history-limit`. Les lignes d'événement (`Session failed`, `Reconnected after 16s`) s'effacent donc en défilant, sans laisser de trace — et journald ne peut pas servir de filet puisqu'il est en `Storage=volatile` sur cette machine.

C'est ce qui a rendu **définitivement inanalysable** l'échec de session du 2026-08-04 17:50:29. D'où les deux instruments ajoutés depuis : `--debug-file` côté serveur et `claude-remote-watch` côté scrape.
:::

**Log dans `/var/lib`, pas `/var/log`.** Sur DietPi, `/var/log` est un tmpfs de 50 MiB purgé **chaque heure** par `dietpi-ramlog` (`AUTO_SETUP_LOGGING_INDEX=-1`). Un log de santé y serait effacé toutes les heures. `StateDirectory=claude-remote` place le fichier sur la carte SD, persistant.

**Aucune directive de sandboxing.** Pas de `ProtectSystem`, `ProtectKernelModules` ni `PrivateTmp` : ce sont précisément ces options, sans `PrivateMounts=yes`, qui ont fait fuiter des mounts read-only sur `/etc` et `/usr/lib/modules` sur cette machine.

**Supervision dans le wrapper.** `ExecStart` rend la main tout de suite (tmux détaché), donc systemd ne peut pas surveiller `claude`. La boucle de relance vit dans le script : relance après 10 s, et abandon après 5 sorties rapides consécutives (< 30 s) avec notification ntfy — pour ne pas boucler indéfiniment sur une auth expirée.

## Exploitation

```bash
systemctl status claude-remote           # etat de l'unit
tmux -L claude attach -t claude          # ecran serveur (Ctrl-b d pour detacher)
tail -f /var/lib/claude-remote/claude-remote.log
systemctl restart claude-remote          # repart sur un serveur neuf
```

L'attache tmux montre l'**écran du serveur** — état de connexion, capacité utilisée, URL de l'environment, `espace` pour un QR code — et non un prompt : en mode serveur on ne tape pas localement dans la conversation. C'est le compromis assumé du modèle appareil.

Depuis un shell Claude ou une session SSH sur un nœud PVE, le socket tmux du service n'est pas visible (mount namespace privé) : passer par `nsenter -t 1 -m -- tmux -L claude capture-pane -p -t claude`.

### Signaux de santé

L'état `active` de systemd **ne reflète pas** la santé du serveur : `RemainAfterExit=yes` garde l'unit active même s'il est mort. Les vrais signaux :

| Signal | Où |
|--------|-----|
| Cycles de relance | `/var/lib/claude-remote/claude-remote.log` |
| Abandon après 5 échecs | notification ntfy priorité haute |
| Appareil hors ligne | le point vert disparaît dans l'app |
| **Échec d'une session** | `/var/lib/claude-remote/server-events.log` + notification ntfy |
| Détail d'un échec | `/var/lib/claude-remote/server-debug.log` (le `.1` = run précédent) |

Le superviseur ne surveille que le **serveur**. Or une session peut mourir alors que le serveur reste parfaitement sain : c'est le cas le plus fréquent, et il ne produisait aucun signal avant le 2026-08-05. `claude-remote-watch` comble exactement ce trou.

### Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Appareil absent de l'app | auth OAuth expirée | `claude auth login` puis `systemctl restart claude-remote` |
| Log en boucle `exit rc=1 apres <30s` | binaire ou credentials KO | vérifier `/root/.claude/.credentials.json` |
| Notif ntfy « abandonnée » | 5 échecs rapides | corriger la cause, puis restart |
| Une relance sans cause apparente | coupure réseau > ~10 min : le serveur sort de lui-même | rien à faire, la boucle relance |
| Impossible d'ouvrir une session de plus | capacité 4 atteinte | fermer une session depuis l'app, ou relever `CLAUDE_REMOTE_CAPACITY` |
| **Je reviens sur une session, elle ne répond plus** | voir « Les deux modes » ci-dessous | la notif ntfy tranche entre amont et local |

#### Les deux modes de « session KO »

Le symptôme est identique dans l'app, les causes n'ont rien à voir. La notification indique lequel s'est produit ; `server-events.log` garde la trace.

| | Mode **amont** | Mode **local** |
|---|---|---|
| Trace | rafale `api_error` dans le transcript, `retryAttempt == maxRetries` | `Session failed: Process exited with error <cse_id>` dans `server-events.log` |
| Le process de session | **vivant**, endormi dans `epoll_wait`, ~0 % CPU | **mort** |
| Ce que ça donne | la session est muette ~4 min, puis affiche `API Error: 529 Overloaded` | plus rien ne répond, le slot de capacité peut rester consommé |
| Cause | saturation des serveurs Anthropic — **rien à réparer sur penny** | à déterminer avec `server-debug.log` |
| Action | attendre, cf. [status.claude.com](https://status.claude.com) | consulter le debug log, relancer le service si besoin |

Observé le 2026-08-05 : 10 × HTTP 529 `overloaded_error` en trois minutes, ladder de retry épuisée, puis une relance manuelle restée sans réponse pendant 4 min 12 s avant d'afficher l'erreur. Aucun défaut local — mais impossible de le savoir sans instrument, d'où ce tableau.

#### Reprendre une conversation après un drop

**La conversation n'est jamais perdue** : elle vit dans `~/.claude/projects/-root/<uuid>.jsonl`, indépendamment du process de session. Un drop ne casse que le rattachement de la session vivante.

Depuis l'app, dans **n'importe quelle** session penny, la commande **`/resume`** ouvre un sélecteur qui relit ces transcripts et reprend la conversation voulue. En ligne de commande : `claude --resume <session-id>`, ou `--fork-session` pour repartir d'une copie sans toucher l'original.

Nommer les sessions (`-n`/`--name`, ou `/rename` depuis l'app) rend ce sélecteur exploitable — sans quoi il faut retrouver un UUID parmi des dizaines de transcripts.

Remote Control exige un login claude.ai complet : un token `claude setup-token` ou `CLAUDE_CODE_OAUTH_TOKEN` ne permet **pas** d'établir le lien. Ne pas remplacer l'auth du service par un token long-lived.

## Posture de sécurité

Ce service expose penny comme **appareil root permanent, pilotable depuis le compte Anthropic** — jusqu'à 4 sessions simultanées. Conséquence directe : la 2FA de ce compte devient un contrôle de sécurité du homelab, au même niveau que la clé SSH. Le mode de permissions reste celui de `~/.claude/settings.json` (`auto`) — les validations sensibles remontent dans l'app.
