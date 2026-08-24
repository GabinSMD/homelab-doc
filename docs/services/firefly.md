# Firefly III (finances)

Gestion de finances personnelles auto-hebergee, avec son importeur de donnees.

## Acces

| | |
|---|---|
| URL | `https://finance.home.gabin-simond.fr` |
| Importeur | `https://import.home.gabin-simond.fr` |
| Host | LXC 109 `finance` sur galahad (192.168.1.37) |
| Images | `fireflyiii/core`, `postgres:17-alpine`, `fireflyiii/data-importer` (digests epingles) |
| Ports internes | 8080 (Firefly), 8081 (importeur) |
| Auth | ForwardAuth Authelia, consommee par `remote_user_guard` |

## Pourquoi pas d'OIDC ?

Contrairement a Grafana, Forgejo ou Outline, **Firefly III n'est pas un client OIDC** et
il n'existe aucun client a declarer pour lui dans Authelia. Son `config/auth.php` (v6.6.6)
ne connait que trois gardes : `web`, `remote_user_guard` et `api` (Laravel Passport, pour
l'API seulement).

L'integration passe donc par le middleware forwardAuth applique sur le routeur Traefik.
Authelia authentifie, pose un en-tete `Remote-User`, et Firefly fait confiance a cet
en-tete via `AUTHENTICATION_GUARD=remote_user_guard`.

!!! warning "Le middleware EST l'authentification"
    Ce n'est pas de la defense en profondeur. Retirer `authelia@docker` du routeur ne
    rend pas Firefly ouvert — prive de l'en-tete il redirige vers un formulaire qui ne
    peut plus rien authentifier — mais rend l'application totalement inaccessible.

    Pour l'importeur c'est pire : il n'a **aucune** authentification propre et detient un
    jeton capable d'ecrire des ecritures. Sans forwardAuth, quiconque atteint l'URL
    dispose d'un chemin d'ecriture anonyme dans les comptes.

### Le piege du rattachement

`RemoteUserProvider::retrieveById()` cherche `users.email = <valeur de l'en-tete>` et,
s'il ne trouve rien, **cree un compte vide en silence**. Trois valeurs differentes
circulaient au moment de la bascule : le compte existant, le login Authelia et l'adresse
e-mail Authelia. Sans alignement prealable, la premiere connexion aurait fabrique un
second compte, vide, en laissant les donnees inaccessibles dans le premier.

L'identifiant retenu est le **login** Authelia, plus stable qu'une adresse e-mail.
`AUTHENTICATION_GUARD_EMAIL` ne participe pas au rattachement : il ne fait que remplir la
preference `remote_guard_alt_email`, que Firefly utilise pour router ses notifications.

!!! danger "Toute sonde doit porter l'en-tete"
    Une requete web sans `Remote-User` fait journaliser
    `production.ERROR: No user in header "HTTP_REMOTE_USER"`. Le healthcheck du conteneur
    et la sonde du monitor produisaient ainsi ~4300 lignes par jour.

    Le probleme n'est pas le volume : ce message est un **vrai signal**. Si le forwardAuth
    cessait d'envoyer l'en-tete, Firefly repondrait toujours 200 et les sondes resteraient
    au vert pendant que plus personne ne peut se connecter. Noye dans le bruit, il ne
    signalait plus rien. Les deux sondes portent desormais l'en-tete.

    A savoir : `->withoutMiddleware(['web'])` sur la route `/health` n'empeche **pas**
    l'invocation du garde. Les appels d'API porteurs d'un jeton, eux, ne le declenchent pas.

## Importeur de donnees

Firefly III seul n'ingere rien. L'importeur tourne dans le meme LXC et parle a Firefly par
le **reseau Docker interne** — il ne traverse ni Traefik ni Authelia, ce qui permet de
n'accorder aucune exception d'API sur le routeur.

Mode actuel : **CSV**. Chaque import est etiquete automatiquement
(`add_import_tag`, actif par defaut), ce qui permet d'annuler un lot rate en supprimant
les ecritures portant l'etiquette.

L'emplacement pour une synchro bancaire GoCardless est prepare mais volontairement vide.

!!! warning "Avant d'activer GoCardless"
    Le consentement bancaire expire tous les 90 jours et se renouvele a la main. Une
    expiration est **silencieuse** : le flux s'arrete, rien ne le dit. Ne pas l'activer
    sans ajouter en meme temps un controle de fraicheur des ecritures importees.

## Surveillance

| Quoi | Ou | Detail |
|---|---|---|
| Disponibilite | `check_firefly_health` (homelab_monitor.sh) | Sonde `/health` **en direct**, chaque minute |
| Logs | Alloy sur le LXC 109 | journald + conteneurs, vers Loki primaire et replica |
| Silence | Regle `alert-host-finance-silent` | Moins de 5 lignes en 10 min |
| Authentification cassee | Regle `alert-firefly-remote-user-missing` | En-tete absent, doit rester a zero |

!!! note "Sonder en direct, jamais via Traefik"
    Depuis l'exterieur, Authelia repond 302 (ou 401 sur `/api`) **meme si le backend est
    mort**. Un code de retour pris via Traefik ne prouve donc rien. La sonde attaque le
    port du LXC directement, et `/health` fait un `User::count()`, ce qui couvre aussi
    PostgreSQL.

Il n'y a pas de regle Grafana « Firefly down » : le monitor journalise deja
`FIREFLY HEALTH: DOWN`, capte par la regle generique des alertes d'infrastructure.

## Jetons d'API

Trois jetons d'acces personnels distincts : outillage, importeur, widget du dashboard.

!!! note "Separer ne reduit pas les droits"
    Les jetons Firefly n'ont **aucune portee** : ils donnent tous l'acces complet a l'API
    du compte. L'interet est le decouplage de revocation — revoquer le jeton d'outillage
    ne doit pas arreter l'importeur en silence — et l'attribution.

Le jeton de l'importeur est lu depuis un **fichier** (suffixe `_FILE`), il n'apparait donc
ni dans `docker inspect` ni dans `docker compose config`. Ce fichier doit appartenir a
l'uid 33 : l'image tourne en `www-data` et lit le secret, un `0600 root` echoue en
« Permission denied » sur une **lecture**.

## Sauvegardes

| | |
|---|---|
| Methode | `pg_dump` puis restic vers le depot `restic-finance` |
| Frequence | Quotidienne, 02:30 |
| Retention | 7 quotidiennes, 4 hebdomadaires, 6 mensuelles |
| Fraicheur | Surveillee par le dead-man-switch du monitor |

Un `pg_dump` plutot qu'un instantane du volume PostgreSQL : un instantane pris a chaud ne
garantit pas la coherence de la base.

Le cron interne de Firefly (regles recurrentes, factures) tourne a 03:00 par un timer
systemd, via un jeton statique.

## Depannage

| Symptome | Cause probable |
|---|---|
| Boucle de connexion | Le compte Firefly ne correspond plus a l'en-tete Authelia — verifier qu'un compte vide n'a pas ete cree |
| `invalid_client` | Sans objet ici : Firefly n'est pas un client OIDC |
| Un conteneur ne joint pas l'autre | `DOCKER-USER` est greffee dans `FORWARD` et filtre aussi l'inter-conteneurs — le filtre doit etre limite a l'interface externe |
| L'importeur ne se connecte pas | Verifier `/token/validate` sur l'importeur, qui repond `{"result":"OK"}` quand la liaison est bonne |
| Erreurs « No user in header » | Une sonde interroge Firefly sans en-tete `Remote-User` |
