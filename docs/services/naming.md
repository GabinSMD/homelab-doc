# Naming

Parce qu'un homelab sans personnalite, c'est juste un tas de silicium dans un placard.

Chaque machine porte un nom de code emprunte au monde de l'espionnage, des agents secrets et des heros de l'ombre. Un **pantheon** mixte de personnages qui ont tous un point commun : ils bossent dans l'ombre, ils parlent peu, et sans eux, rien ne tient.

## Le casting

```
fish        # Prison Break        — l'assistant (futur, pas encore deploye)
penny       # James Bond          — appliance reseau (RPi 4)
galahad     # Kingsman            — ZimaBoard #1 (Proxmox)
lancelot    # Kingsman            — ZimaBoard #2 (Proxmox)
guardian    # — generique —       — LXC 100 sur galahad (AdGuard secondaire + health check)
luther      # Mission Impossible  — Minisforum futur (compute + stockage)
fury        # Marvel              — appliance firewall futur (OPNsense)
```

## Les references

### `penny` — Raspberry Pi 4

**Reference** : Miss Moneypenny dans *James Bond*.

Le bureau de Moneypenny au MI6 est le point de passage oblige. Chaque agent, chaque mission, chaque note confidentielle passe par son bureau avant d'arriver a M. Elle sait tout avant tout le monde, elle redirige, elle filtre, elle garde la memoire institutionnelle.

**Pourquoi c'est le RPi** : parce que le RPi fait exactement ca dans le reseau. DNS, reverse proxy, monitoring, VPN. Tout le trafic passe par lui. Il est l'appliance reseau, le point de passage.

### `galahad` — ZimaBoard #1

**Reference** : Harry Hart / Galahad dans *Kingsman*.

Les agents Kingsman portent les noms de code des chevaliers de la table ronde. Galahad c'est l'agent de terrain par excellence : impeccable, discret, redoutable. Costume trois pieces, manieres irreprochables.

**Pourquoi c'est le premier ZimaBoard** : premier noeud du cluster Proxmox, premier agent de l'equipe. Fiable, toujours operationnel.

### `lancelot` — ZimaBoard #2

**Reference** : Lancelot dans *Kingsman*.

L'autre agent Kingsman. Equivalent en rang a Galahad, personnalite differente.

**Pourquoi c'est le second ZimaBoard** : deuxieme noeud du cluster, duo inseparable avec galahad. Ensemble, ils forment le cluster Proxmox.

### `luther` — Minisforum N5 Max (futur)

**Reference** : Luther Stickell dans *Mission Impossible*.

Luther c'est le hacker de l'equipe IMF. Le cerveau technique, celui qui a toujours un acces, qui sait toujours ou sont planques les donnees. Sans Luther, l'operation n'existe pas.

**Pourquoi c'est le Minisforum** : noeud compute + stockage, le plus puissant de l'infra. NAS, backups, VMs lourdes. C'est lui qui a les donnees.

### `fury` — appliance OPNsense (futur)

**Reference** : Nick Fury dans *Marvel Cinematic Universe*.

Directeur du SHIELD. Bandeau sur l'oeil. Son job : **controler qui a acces a quoi**. Agents, informations, technologies.

**Pourquoi c'est le firewall** : un firewall c'est litteralement ca. Il filtre chaque paquet, il decide qui passe et qui ne passe pas. La reference est parfaite.

### `fish` — assistant personnel (futur)

**Reference** : Michael Scofield dans *Prison Break*.

Scofield arrive a Fox River et herite du surnom "Fish". Il parle peu, il observe, il a le plan tatoue sur le corps. Il voit dix coups d'avance et il orchestre tout sans jamais hausser la voix.

**Pourquoi c'est l'assistant** : intelligence calme, qui observe, qui execute, qui repare avant que tu t'en rendes compte. Il dit "c'est regle" ou "j'ai besoin de toi". Rien entre les deux.

## Pourquoi un theme mixte

Un pantheon mixte est plus riche qu'un theme unique : chaque machine a sa propre histoire, vient de son propre univers. Scofield n'est pas le meme genre de cerveau que Fury, et Moneypenny n'est pas le meme genre de relais que Luther. Ensemble, ils forment une equipe composite, comme une cellule secrete recrutee dans plusieurs agences.

## Portee

Le pantheon s'applique uniquement aux **machines physiques** et aux **entites de haut niveau** (assistant).

Les services Docker, containers, LXC, subdomains et comptes restent **fonctionnels** (`vault`, `auth`, `monitor`, `svc-homepage`...) pour eviter la friction au quotidien.

## Hostnames systeme

| Machine | Hostname | IP LAN | IP Tailscale |
|---|---|---|---|
| RPi 4 | `penny` | 192.168.1.28 | 100.97.239.90 |
| ZimaBoard 1 | `galahad` | 192.168.1.18 | 100.98.58.121 |
| ZimaBoard 2 | `lancelot` | 192.168.1.19 | 100.69.6.13 |
| LXC 100 | `guardian` | 192.168.1.30 | 100.74.145.26 |

## Futurs ajouts

| Ajout prevu | Nom potentiel | Reference |
|---|---|---|
| Switch manageable | actuel : aucun nom (192.168.1.2) | — |
| NAS dedie | **q** | Q branch dans James Bond |
| 2e firewall (HA) | **hill** | Maria Hill dans Marvel |
| Home Assistant | **jarvis** ou **friday** | Iron Man |
| Serveur LLM local | **hal** | 2001 l'Odyssee de l'espace |
