# Rotation des secrets

Comment on tourne un secret du homelab sans rien casser, et comment on sait
lesquels doivent l'être. La **politique** (paliers, cadences, critère de
classement) est dans [politique.md](politique.md#rotation--revocation) ; cette page
est le **pas-à-pas**.

Aucune valeur, aucune date, aucun inventaire ici : l'inventaire daté vit dans le
dépôt privé de configuration, les valeurs dans Vaultwarden.

---

## Ce qui mesure la rotation {#ce-qui-mesure-la-rotation}

Une politique de rotation sans horloge est une intention, pas un contrôle. Depuis
novembre 2026, un contrôle quotidien sur penny (`secrets-rotation-check`, 08:10) :

- lit un **inventaire de métadonnées** (nom, emplacement, consommateurs, palier,
  date de dernière rotation, comment savoir si le secret est mort) ;
- **refuse de démarrer** si l'inventaire ment : un secret sans sonde **et** sans
  alarme existante déclarée est un angle mort, et le contrôle préfère s'arrêter
  bruyamment plutôt que de l'ignorer ;
- traite une **date inconnue comme échue** : dater un vieux secret au jour de
  l'inventaire serait un mensonge qui endormirait pendant douze mois ;
- exécute des **sondes HTTP déclaratives** pour les seuls jetons qu'aucune alarme
  ne couvre. Une sonde exerce la permission **réellement utilisée** par le
  consommateur, jamais un point de vérification générique du fournisseur (voir
  le piège Cloudflare plus bas). Le jeu de sondes est fermé : l'inventaire
  n'est jamais exécutable ;
- signale toute variable de secret ou tout fichier scellé **absent de
  l'inventaire**, sans quoi l'inventaire serait vrai le jour de sa pose et faux
  ensuite.

Ce qu'il **ne fait pas** : il ne crée, ne tourne ni ne révoque rien. Automatiser
la création de jetons exigerait un jeton d'amorçage aux droits larges, qui
deviendrait le secret le plus dangereux du parc. Il ne détecte pas non plus
qu'un secret est *compromis* : seulement qu'il est **vieux** ou **mort**.

Les notifications suivent le [format commun](../operations/notifications.md) :

| Situation | Notification |
|---|---|
| Sonde en échec (secret refusé) | problème, gravité 4, rappel quotidien, résolution quand la sonde repasse |
| Expiration imposée par le fournisseur dans 14 j ou moins | problème, gravité 4, quotidien |
| Cadence dépassée, préavis de 30 j, secret hors inventaire | **un seul** événement, gravité 3, le lundi, liste complète en pièce jointe |
| Inventaire invalide | problème, gravité 3 |

Un dead-man dans le moniteur de penny alerte si le contrôle n'a pas tourné depuis
50 h : son état normal est le silence, donc sa mort le serait aussi.

---

## La méthode, pour tout secret {#methode}

L'ordre compte. Une rotation qui casse quelque chose **sans le dire** est pire
qu'un jeton vieux de dix-huit mois, et ce parc a un historique de casses
silencieuses liées aux identifiants.

1. **Créer** le nouveau secret à côté de l'ancien, avec la portée minimale. Ne
   pas révoquer l'ancien.
2. **Ranger** la valeur dans Vaultwarden (nommage « Service — compte ») **avant**
   tout le reste : un secret qui n'existe que dans un terminal est perdu au
   premier incident.
3. **Sceller** : mettre la valeur dans le fichier concerné puis le chiffrer avec
   sops (`.env.enc` ou fichier dédié). Jamais de valeur en clair dans un commit,
   un journal ou une conversation.
4. **Déployer** : déchiffrer vers le tmpfs (`homelab-unseal`), puis redémarrer le
   seul consommateur.
5. **Vérifier**, l'étape qu'on saute : exercer la permission réellement utilisée
   (la tuile s'affiche, la sauvegarde passe, la connexion SSO aboutit). Le
   contrôle quotidien peut être lancé à la main sans rien envoyer :
   `secrets-rotation-check.py --dry-run`.
6. **Révoquer** l'ancien, seulement maintenant.
7. **Dater** : mettre à jour `derniere_rotation` dans l'inventaire (par PR, avec
   le fichier rescellé) et la date de révision dans Vaultwarden.

---

## Jeton Cloudflare {#token-cloudflare}

Utilisé par Traefik pour le défi DNS-01 des certificats.

- **Créer** : Cloudflare › My Profile › API Tokens › Create Token, gabarit
  *Edit zone DNS*, portée `Zone:DNS:Edit` sur la seule zone du homelab. Jamais la
  Global API Key.
- **Déployer** : `.env.enc`, puis redémarrer Traefik.
- **Vérifier** : interroger `/client/v4/zones?name=<zone>` avec le jeton, attendu
  `"success":true`, puis forcer ou attendre un renouvellement de certificat.

:::warning Ne pas vérifier avec `/user/tokens/verify`
Ce point rend « Invalid API Token » sur un jeton **limité à une zone**, alors que
le jeton est parfaitement valide : il ne peut pas interroger un point `/user/…`.
Une sonde construite dessus crierait au loup sur un jeton sain. C'est la mesure
qui a fixé la règle « une sonde exerce la permission réellement utilisée ».
:::

Pas de sonde dédiée : l'expiration des certificats, déjà surveillée, verrait sa
mort.

## Clés R2 de sauvegarde {#cles-r2}

Clés S3 du bucket de sauvegarde restic, utilisées par penny et par les LXC
sauvegardées.

- **Créer** : tableau de bord Cloudflare › R2 › Manage API tokens, droits
  *Object Read & Write* sur le seul bucket.
- **Déployer** : fichier d'environnement restic scellé, puis sa copie dans
  chaque LXC qui sauvegarde.
- **Vérifier** : `restic snapshots` depuis **chaque** consommateur, pas seulement
  penny. Une LXC oubliée échoue la nuit suivante.

Couvert par la surveillance de fraîcheur des dépôts restic.

## Jetons Proxmox VE {#token-pve}

Jetons d'API des comptes de service (tuiles Homepage, Terraform).

- **Créer** : Datacenter › Permissions › API Tokens, sur le compte de service
  existant, nom suffixé de la période (`…-AAAA-MM`), séparation de privilèges
  active. Les droits sont portés par le rôle du jeton, pas recopiés.
- **Vérifier** : `GET /api2/json/cluster/resources` avec l'en-tête
  `Authorization: PVEAPIToken=<id>=<secret>`. C'est ce que fait la sonde
  quotidienne.
- **Révoquer** l'ancien jeton dans la même page.

## Jetons PBS {#token-pbs}

Deux usages : la tuile Homepage (lecture) et les sauvegardes des nœuds PVE vers
PBS.

- **Créer** : PBS › Configuration › Access Control › API Token.
- Pour le jeton de sauvegarde : **garder le même nom de jeton**. Les groupes de
  sauvegarde appartiennent au jeton ; un nouveau nom fait perdre la propriété
  des groupes existants et la sauvegarde suivante échoue.
- **Vérifier** : la tuile (`/api2/json/status/datastore-usage`, en-tête
  `PBSAPIToken=<id>:<secret>`) ; pour les sauvegardes, lancer une sauvegarde
  manuelle d'un petit invité.

## Jetons Pulse {#jetons-pulse}

Jeton PVE de Pulse, jetons de ses agents, jeton d'API lu par Homepage.

- **Créer** : jeton PVE comme [ci-dessus](#token-pve) ; jetons d'agent et d'API
  depuis les réglages de Pulse.
- **Vérifier** : les nœuds et agents repassent « en ligne » dans Pulse ; la tuile
  Homepage s'affiche.

## Secrets clients OIDC {#secrets-oidc}

Partagés entre Authelia (qui n'en garde qu'une empreinte) et chaque service.

- **Créer** : générer un secret aléatoire long, calculer son empreinte pbkdf2
  avec l'outil d'Authelia.
- **Déployer** : l'empreinte dans la configuration Authelia, le secret en clair
  dans le service (variable scellée, royaume OpenID de PVE/PBS, réglages de
  l'application).
- **Vérifier** : une **vraie connexion SSO** sur le service. Aucune sonde
  automatique n'est possible : le secret ne s'exerce que pendant l'échange du
  code d'autorisation.

:::note `invalid_client` n'accuse pas forcément le secret
Une méthode d'authentification du client (`token_endpoint_auth_method`) refusée
rend la même erreur qu'un mauvais secret. Vérifier la méthode avant de tourner
le secret une deuxième fois.
:::

## ntfy {#ntfy}

Jetons de publication (outil `notif`, n8n, Pulse), jeton du téléphone, mots de
passe des comptes.

- **Créer** : `ntfy token add <compte>` dans le conteneur, avec une étiquette
  datée.
- **Déployer** : le jeton de publication vit à plusieurs endroits (penny et les
  LXC qui notifient) ; le jeton du téléphone se saisit dans l'application.
- **Vérifier** : un envoi sur le topic d'essai, en passant par `notif`, depuis
  chaque machine. La sonde quotidienne vérifie que le jeton du téléphone peut
  **lire** le topic.
- **Révoquer** : `ntfy token remove <compte> <jeton>`.

## Jetons d'outillage {#jetons-outillage}

Clés d'API de n8n, d'Outline, d'Anthropic, de Forgejo, du bot Renovate, du
compte machine Vaultwarden.

- **Créer** depuis les réglages de chaque application, au nom du compte de
  service, avec la portée minimale.
- **Ranger dans Vaultwarden avant de révoquer l'ancien** : c'est la règle des
  secrets machine.
- **Vérifier** : un appel réel par l'outil qui le consomme (exécution du
  workflow n8n, publication de test dans Outline, appel de l'API Forgejo).

Ces jetons n'ont pas de sonde : ils sont lus à la demande, ou vivent dans une
autre machine, et leur mort se voit au premier usage.

## Relais SMTP {#relais-smtp}

Jeton SMTP du relais des nœuds Proxmox.

- **Créer** : réglages SMTP du fournisseur, jeton dédié au relais.
- **Déployer** : fichier scellé, puis script d'installation du relais sur chaque
  nœud.
- **Vérifier** : un courriel de test depuis chaque nœud, et sa réception.

## CrowdSec {#crowdsec}

Clé du bouncer Traefik, identifiants de l'agent auprès de l'API locale,
identifiants de l'API centrale.

- **Clé du bouncer** : `cscli bouncers add <nom-daté>`, déposer la clé dans le
  fichier lu par le plugin, redémarrer Traefik, **vérifier qu'un site répond**
  (une clé refusée fait répondre 403 à tout), puis `cscli bouncers delete`
  l'ancien.
- **Identifiants de l'agent** : `cscli machines add` puis rescellement ; une
  dérive se voit par une boucle de redémarrage « authenticate watcher ».
- **API centrale** : `cscli capi register` ; uniquement à la compromission.

## Clé d'enrôlement Tailscale {#cle-tailscale}

Échéance imposée par Tailscale (90 jours au plus).

- **Créer** : console Tailscale › Settings › Keys › Generate auth key, la plus
  courte durée utile, réutilisable seulement si nécessaire, avec étiquettes.
- **Dater** : renseigner `expire_le` dans l'inventaire ; le contrôle prévient
  14 jours avant.
- **Vérifier** : seulement en enrôlant une machine. Aucune sonde : une clé
  d'enrôlement ne se valide qu'en la consommant, et lister les clés exigerait
  un jeton d'administration du tailnet.
- Si plus rien n'enrôle de machine, **la retirer** plutôt que la tourner.

## Clés de signature et bases {#cles-de-signature}

Clés de signature d'application (Outline) et mots de passe de bases locales.
Palier « à la compromission » : elles ne quittent jamais le fichier scellé.

- Tourner une clé de signature **déconnecte toutes les sessions** : prévenir.
- Mot de passe de base : changer le mot de passe **dans la base** d'abord
  (`ALTER USER`), puis la variable, puis redémarrer l'application.
- **Vérifier** : l'application démarre et une connexion aboutit.

## Internes Authelia {#internes-authelia}

Secret JWT, secret de session, clé de chiffrement du stockage, secret HMAC et
clé de signature OIDC.

- Palier « à la compromission ».
- Tourner le secret de session déconnecte tout le monde ; tourner la clé de
  chiffrement du stockage exige la **migration** de la base (`authelia storage
  encryption change-key`), sinon Authelia ne démarre plus.
- **Vérifier** : connexion complète avec second facteur, puis une connexion
  OIDC.

## Identifiants de services locaux {#identifiants-locaux}

Comptes utilisés par les tuiles Homepage vers des services joignables seulement
depuis le réseau local.

- Changer le mot de passe dans le service, puis la variable scellée, puis
  redémarrer Homepage.
- **Vérifier** : la tuile affiche des données, pas une pastille d'erreur.

## Secret sans consommateur {#retrait}

Un secret dont plus rien ne se sert ne se tourne pas : il se **révoque** chez le
fournisseur, puis se retire du dépôt et de l'inventaire. Décommissionner un
service et révoquer ses identifiants sont deux gestes distincts, et le second
est celui qu'on oublie parce que rien ne casse quand il manque.

## Matériel et reprise {#materiel-et-reprise}

Mots de passe root de secours, mot de passe maître Vaultwarden, clé age
logicielle. Palier 24 mois.

- Mots de passe de secours : `passwd`, puis mise à jour du coffre **et** de
  l'enveloppe break-glass ; vérifier au prochain
  [drill break-glass](../operations/break-glass.mdx).
- Clé age : générer la nouvelle, l'ajouter comme destinataire dans `.sops.yaml`,
  **rechiffrer tous les fichiers** (`sops updatekeys`), vérifier le déchiffrement
  au démarrage, puis seulement retirer l'ancienne.

## YubiKey {#yubikey}

Voir [YubiKey age setup](yubikey-age-setup.md). Remplacer une clé, c'est
l'ajouter comme destinataire sops et comme clé SSH autorisée, rechiffrer,
vérifier, puis retirer l'ancienne partout.
