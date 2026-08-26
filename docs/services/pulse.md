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
