# Pulse — LXC 106

Supervision Proxmox et Docker, avec une couche d'analyse par modèle appelée
**Patrol**. Remplace la détection que faisait [sucre](../projet/sucre.md), arrêté
le 2026-08-25.

| | |
|---|---|
| LXC | 106 `pulse`, sur **galahad** |
| URL | `pulse.home.gabin-simond.fr` → `192.168.1.34:7655` |
| Données | `/opt/pulse/data` |
| Agent | `pulse-agent.service`, natif sur les hôtes |

## Ce que Patrol coûte réellement

:::danger[« Watch only » n'est pas gratuit — c'est ta clé Anthropic qui paie]
Mesuré sur les 17 heures qui ont suivi l'activation, dans
`/opt/pulse/data/ai_usage_history.json` : 152 appels, 475 000 tokens d'entrée et
157 000 de sortie, intégralement en `claude-opus-5`. Soit **6,30 $**, autrement dit
**~265 $/mois** au rythme observé.

Et **70 % partait dans `discovery`**, un scan récurrent toutes les six heures — pas
dans la détection de pannes. `discoveryEnabled` est passé à `false` le 2026-08-26.

Pour re-mesurer :

```bash
python3 - <<'PY'
import json, collections
ev = json.load(open("/opt/pulse/data/ai_usage_history.json"))["events"]
agg = collections.Counter()
for e in ev: agg[e["use_case"]] += e["input_tokens"]*5/1e6 + e["output_tokens"]*25/1e6
for k, v in agg.most_common(): print(f"{k:12} {v:6.2f} $")
PY
```
:::

## Un seuil franchi en permanence n'informe plus

Le 2026-08-26, **150 des 159 patrols déclenchés en 24 h** venaient d'une seule
alerte : `diskTemperature` sur le `sda` de penny, à 61 °C stable. Le seuil par
défaut est à 60.

L'origine est instructive : la température a franchi le seuil deux heures après le
réassemblage du pontet USB du SSD, qui a rétabli le lien en SuperSpeed. **Le
correctif d'un incident a fabriqué ce bruit-là.**

Il n'existe aucun fichier de seuils dans `/opt/pulse/data` — tout est aux valeurs
par défaut du binaire, donc un seuil ne se change que par l'interface.

## Les erreurs de Patrol

`investigation failed: provider error: stream error from Anthropic` et
`context deadline exceeded` sont des **échecs amont transitoires**, autour de 3 à
4 % des appels. Le réessai passe. Ce ne sont pas des erreurs de configuration.

## Le SSO ne marche pas sous la v6, et pourquoi

Depuis la v6, se connecter par Authelia échoue :

```
invalid_request — The 'redirect_uri' parameter does not match any of the
OAuth 2.0 Client's pre-registered 'redirect_uris'.
```

Le journal d'Authelia nomme l'URI fautive, et c'est elle qui explique tout :

```
'redirect_uri' value 'http://pulse.home.gabin-simond.fr:443/api/oidc/callback'
```

Schéma `http` et port `443` explicite — deux choses incompatibles. Pulse ne
construit donc pas son URI depuis `OIDC_REDIRECT_URL` ni depuis
`PULSE_PUBLIC_URL` : il la reconstruit **depuis la requête entrante**, en
lisant le port transmis mais pas le protocole.

### Trois fausses pistes, toutes mesurées

**Ce n'est pas la confiance au proxy.** Pulse voit bien une adresse hors du
CIDR déclaré — il tourne dans Docker avec publication de port, donc le NAT
réécrit la source en `172.18.0.1`, la passerelle du pont, jamais l'adresse
LAN de Traefik :

```
ip: "172.18.0.1:37552"                      ← ce que Pulse voit
PULSE_TRUSTED_PROXY_CIDRS=192.168.1.0/24    ← ce qu'il croit
```

Le raisonnement est juste, le remède ne marche pas : élargir le CIDR au pont
Docker **n'a rien changé**, même en forçant `X-Forwarded-Proto: https`.

**Ce n'est pas une variable manquante.** `OIDC_REDIRECT_URL` et
`PULSE_PUBLIC_URL` sont tous deux corrects et bien vus par le conteneur
(`docker exec pulse env`). Le fournisseur les ignore.

**Enregistrer l'URI fautive chez Authelia ne marcherait pas non plus** : le
navigateur serait envoyé en clair vers un port qui parle TLS. La tentation
est forte parce que l'erreur pointe un `redirect_uri` — c'est un piège.

### La vraie cause : on utilise le chemin de compatibilité v5

Le journal de Pulse le dit, pour qui sait le lire :

```
"provider_id":"legacy-oidc"   message:"Initialized SSO OIDC provider"
```

La v6 a introduit un système **multi-fournisseurs**. Les variables `OIDC_*`
n'y sont plus la configuration normale : elles fabriquent un fournisseur de
compatibilité baptisé `legacy-oidc`, servi par le chemin nu
`/api/oidc/callback`. C'est ce chemin hérité qui dérive son URI de la requête.

Un fournisseur v6 normal utilise `/api/oidc/<provider-id>/callback` et dérive
ses URL de l'URL publique configurée.

### La marche à suivre

L'ordre est contre-intuitif : **on crée d'abord côté Pulse**, parce que
l'identifiant du fournisseur n'existe qu'après création.

1. Pulse → **Settings → Security → Single Sign-On → Add Provider**. Pulse
   génère un identifiant et affiche l'URI de rappel.
2. Relever cette URI, de la forme
   `https://pulse.home.gabin-simond.fr/api/oidc/<provider-id>/callback`.
3. L'ajouter aux `redirect_uris` du client `pulse` dans
   `authelia/configuration.yml`, puis redémarrer Authelia.
4. Dans Pulse : émetteur `https://auth.home.gabin-simond.fr`, `client_id`
   `pulse`, et son secret.

L'étape 1 **ne peut pas être automatisée** : l'`API_TOKEN` du fichier
`data/.env` est une empreinte SHA-256, pas le jeton — Pulse ne l'affiche qu'à
sa création. Même limite que le plafond de budget IA, qui vit dans `ai.enc`.

En attendant, on se connecte avec les identifiants locaux.

:::warning Le port est ouvert sur le LAN
Pulse publie `0.0.0.0:7655`. N'importe quelle machine du réseau peut donc
joindre `192.168.1.34:7655` **directement**, en contournant Traefik, Authelia
et CrowdSec. Le SSO ne protège que l'entrée par le nom de domaine.
:::
