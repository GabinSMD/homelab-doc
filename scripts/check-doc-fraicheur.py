#!/usr/bin/env python3
"""Garde-fou de fraicheur : interdit les termes retires dans les pages qu'on SUIT.

    scripts/check-doc-fraicheur.py

Code 1 si une page operationnelle reference encore quelque chose de retire.

POURQUOI CE CONTROLE EXISTE
---------------------------
Le 2026-08-26, `operations/break-glass.mdx` — la page qu'on suit quand tout a
brule — donnait cinq fois une commande de restauration exportant
`B2_ACCOUNT_ID`, trois mois et demi apres la migration vers Cloudflare R2. Elle
etait donc incapable de s'authentifier, et personne ne l'avait vu : **aucun chemin
de code n'execute un runbook.**

L'information juste existait pourtant deja dans le depot — `r2-migration.md`
documentait noir sur blanc le passage a `AWS_ACCESS_KEY_ID`. Ce n'etait pas un
probleme de redaction mais de propagation. Ce script est la propagation.

CE QU'IL NE FAIT PAS
--------------------
Il ne juge pas l'exactitude technique d'une page. Il ne verifie qu'une chose :
qu'un terme dont on SAIT qu'il est retire n'apparait pas la ou un lecteur le
prendrait pour une instruction.

Le piege a eviter en l'etendant : un `grep` naif remonte surtout des references
historiques legitimes. C'est pourquoi chaque terme porte une liste blanche
explicite, et pourquoi elle est justifiee ligne par ligne.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

# Les pages qu'on suit en situation. Le reste de `docs/` (specs, decisions,
# roadmaps, post-mortems) a le droit de parler du passe : c'est son role.
SURVEILLE = (
    "docs/operations/", "docs/guides/", "docs/services/", "docs/architecture/",
    # Ajoutees le 2026-11-04 : ces trois pages decrivent l'etat COURANT (ports,
    # comptes, secrets a detenir). Hors perimetre, elles annoncaient encore les
    # clients OIDC et le socket direct de Portainer le lendemain de son retrait.
    "docs/securite/hardening.md", "docs/securite/comptes.md", "docs/securite/politique.md",
)

# Les services retires viennent du catalogue (status "retired" + retiredAt), le meme
# fichier qui range leurs fiches dans les archives de la recherche. Un retrait
# declare la-bas est donc verifie ici sans rien recopier : avant le 2026-11-04,
# cette liste s'arretait a Watchtower et le controle passait au VERT pendant que
# Beszel et Portainer etaient decrits au present dans une vingtaine de pages.
# L'`id` de l'entree sert de motif (mot entier, casse ignoree).
CATALOGUE = pathlib.Path("src/data/service-catalogue.json")

# Liste blanche des services du catalogue, par id. Meme regle que plus bas :
# chaque fichier est justifie. La fiche du service et les pages archivees
# (`search_status: archive`) sont exclues d'office.
AUTORISE_CATALOGUE = {
    "beszel": {
        # Constate que portainer et beszel-agent ne montent plus le socket.
        "docs/architecture/os.md",
        # Encadre de correction de la boucle de restauration de la phase 4.
        "docs/operations/break-glass.mdx",
        # Catalogue d'incidents historiques herite de sucre.
        "docs/operations/incidents-recurrents.md",
        # Signale l'agent encore actif sur galahad et lancelot : a retirer de la
        # liste blanche une fois l'agent desinstalle.
        "docs/securite/hardening.md",
        # Liste les secrets a purger du coffre.
        "docs/securite/politique.md",
        # Releves d'inventaire dates et tableau des retraits.
        "docs/services/index.mdx",
        # Pages qui disent « Pulse remplace Beszel depuis le 2026-11-03 » ou
        # nomment un ancien service dans une phrase de retrait.
        "docs/architecture/reseau-cible.md",
        "docs/operations/monitoring.md",
        "docs/operations/depannage.md",
        "docs/services/grafana.md",
        "docs/services/traefik.md",
        "docs/services/authelia.md",
    },
    "portainer": {
        "docs/architecture/os.md",
        "docs/operations/break-glass.mdx",
        # Mesure de l'inventaire du 2026-10-01 (risque R-11).
        "docs/operations/inventaire-controles.md",
        # « Clients socket direct : aucun depuis le retrait de Portainer ».
        "docs/securite/hardening.md",
        "docs/securite/politique.md",
        # Releve des clients OIDC : nomme ceux qui ont ete retires.
        "docs/services/authelia.md",
        "docs/services/index.mdx",
        # Origine de la decision « pas de CSP global » : SPA dont Portainer.
        "docs/services/traefik.md",
    },
    "homelable": {
        # Explique la disparition de homelable@pve des derogations.
        "docs/securite/comptes.md",
        "docs/securite/politique.md",
        # Dit que la legende de cablage servait la cartographie retiree.
        "docs/architecture/acces-reseau.md",
        "docs/services/index.mdx",
        "docs/services/authelia.md",
    },
    "paperclip": {
        # L'index d'exploitation signale la doctrine comme archive.
        "docs/operations/index.md",
    },
    "zomboid": {
        # Liste des CT avec passthrough TUN : 104 nomme comme detruit.
        "docs/operations/derive-configuration.md",
        # Renvoie vers la fiche archivee du serveur demantele.
        "docs/services/waterline.md",
        # Tableau Alloy par LXC (ligne barree) et tableau LXC (ligne « Detruit »).
        "docs/services/alloy-loki-ha.md",
        "docs/services/index.mdx",
        # Note de mise a jour de l'inventaire des timers.
        "docs/operations/monitoring.md",
    },
}

RETIRES = [
    {
        "motif": r"B2_ACCOUNT_ID|B2_ACCOUNT_KEY|\bb2:[a-z0-9-]+:",
        "quoi": "identifiants ou URL Backblaze B2",
        "retire": "2026-05-11 (migration vers Cloudflare R2)",
        "a_la_place": "set -a; . /root/.restic-env; set +a  (n'ecris jamais la liste des variables en dur)",
        "autorise": {
            # Porte deja la note « B2 decommissionne le 2026-05-29 ».
            "docs/operations/dr-drill-scenario-1.md",
            # L'encadre de correction cite l'ancienne commande pour l'expliquer.
            "docs/operations/break-glass.mdx",
            # Les 2 post-mortems B2/R2 ont rejoint projet/journal/ le 2026-08-26 :
            # ils sont hors du perimetre surveille, plus besoin de les blanchir.
        },
    },
    {
        "motif": r"mkdocs build|mkdocs\.yml|MkDocs Material",
        "quoi": "construction du site par MkDocs",
        "retire": "2026-08-26 (migration vers Docusaurus)",
        "a_la_place": "bun run build",
        "autorise": set(),
    },
    {
        "motif": r"fish\.tail|fish\.service|\bunit fish\b",
        "quoi": "l'agent SRE sous son ancien nom « fish »",
        "retire": "2026-07-06 (renomme sucre)",
        "a_la_place": "sucre — et note qu'il est lui-meme arrete depuis le 2026-08-25",
        "autorise": set(),
    },
    {
        "motif": r"/mnt/ssd/homelab-config",
        "quoi": "un chemin de depot qui n'existe pas",
        "retire": "toujours — le depot est en /mnt/ssd/config",
        "a_la_place": "/mnt/ssd/config",
        "autorise": set(),
    },
    # ----- Ajoutes le 2026-09-24, par la revue page par page -------------------
    # Le controle passait au VERT pendant que quatre de ces termes trainaient
    # dans des pages operationnelles. Sa liste s'arretait au 2026-08-26 : un
    # garde-fou ne voit que ce qu'on lui a appris a voir, et celui-ci n'avait
    # rien appris depuis un mois. C'est le motif du temoin orphelin.
    {
        "motif": r"\bkroki\b|kroki-mermaid",
        "quoi": "les conteneurs Kroki de rendu de diagrammes",
        "retire": "2026-08-31",
        "a_la_place": "Mermaid natif de Docusaurus, rien a deployer",
        "autorise": {
            # L'encadre d'inventaire explique la baisse de 24 a 22 conteneurs.
            "docs/services/index.mdx",
            # Explique pourquoi la page annonçait quatre outils au lieu de trois.
            "docs/services/boite-a-outils.md",
        },
    },
    {
        "motif": r"[Ff]irefly",
        "quoi": "Firefly III et sa LXC 109",
        "retire": "2026-09-19",
        "a_la_place": "Securo (LXC 110), en evaluation — voir services/index.mdx",
        "autorise": {
            # Rappelle la composition du releve historique du 24/09, avant les retraits.
            "docs/services/index.mdx",
            # Recense les secrets a purger, dont ceux de Firefly : c'est son role.
            "docs/operations/derive-configuration.md",
            # Post-mortem d'une nuit de notifications ou Firefly etait en cause.
            "docs/operations/depannage.md",
            # Inventaire des controles : cite `alert-firefly-remote-user-missing`
            # (un `deleteRules` qui existe toujours dans rules.yml) et compte les
            # declenchements mesures de l'etiquette `firefly-down` sur 30 j. Deux
            # constats de mesure, aucune instruction : rien n'y dit d'utiliser
            # Firefly. Blanchi le 2026-10-01.
            "docs/operations/inventaire-controles.md",
        },
    },
    {
        "motif": r"homelab-overview|logs-explorer",
        "quoi": "deux tableaux de bord Grafana",
        "retire": "2026-09-22 (refonte : poste-commande, hotes/capacite, securite, traefik, investigation)",
        "a_la_place": "voir services/grafana.md, section Dashboards",
        "autorise": {
            # Nomme les deux anciens precisement pour dire qu'ils n'existent plus.
            "docs/services/grafana.md",
        },
    },
    {
        "motif": r"config/logs/dashboards|homelab-config/logs/docker-compose|(?<!prod-1/)deploy-to-lxc101",
        "quoi": "les chemins du LXC logs avant le renommage logs-prod-1",
        "retire": "2026-09 (logs/ -> logs/logs-prod-1/)",
        "a_la_place": "logs/logs-prod-1/…  — le chemin sans le sous-repertoire n'existe pas, "
                      "donc une boucle for sur *.json n'y trouve aucun fichier",
        "autorise": set(),
    },
    # ----- Ajoutes le 2026-11-04 : retires sans fiche dans le catalogue -------
    {
        "motif": r"(?i)\bsucre\b",
        "quoi": "sucre, l'agent SRE maison (LXC 105)",
        "retire": "2026-08-25 (arret), LXC detruit le 2026-11-03",
        "a_la_place": "Pulse Patrol — voir services/pulse.md",
        "autorise": {
            # Taille de l'archive break-glass mesuree quand sucre/ existait.
            "docs/operations/break-glass.mdx",
            # Pages d'exploitation qui racontent des mesures datees ou des
            # incidents ou sucre etait en cause : c'est leur role.
            "docs/operations/incidents-recurrents.md",
            "docs/operations/inventaire-controles.md",
            "docs/operations/notif-hygiene.md",
            "docs/operations/derive-configuration.md",
            "docs/operations/monitoring.md",
            # Regles Grafana supprimees par deleteRules : l'exemple les nomme.
            "docs/services/grafana.md",
            # Etat des sources Loki avant la bascule du 2026-09-02, et LXC barree.
            "docs/services/alloy-loki-ha.md",
            # Tableau LXC : ligne « Detruit ».
            "docs/services/index.mdx",
            # Cas vecu du piege accept-routes.
            "docs/architecture/reseau.mdx",
            # « Patrol remplace la detection que faisait sucre ».
            "docs/services/pulse.md",
        },
    },
    {
        "motif": r"(?i)\bsecuro\b",
        "quoi": "Securo, agregateur financier en evaluation (LXC 110)",
        "retire": "2026-11-03 (LXC detruit, evaluation abandonnee)",
        "a_la_place": "rien — l'evaluation est close",
        "autorise": {
            # LXC non declaree a Terraform, mesuree le 2026-09-04.
            "docs/operations/derive-configuration.md",
            # Mesures datees de l'inventaire des controles.
            "docs/operations/inventaire-controles.md",
            # LXC barree et encadre « n'expedie rien » du 2026-09-24.
            "docs/services/alloy-loki-ha.md",
            # Releve des clients OIDC.
            "docs/services/authelia.md",
            # Liste des secrets a purger du coffre.
            "docs/securite/politique.md",
            "docs/services/index.mdx",
        },
    },
    {
        "motif": r"[Ww]atchtower",
        "quoi": "le conteneur d'auto-mise a jour Watchtower",
        "retire": "2026-07-06",
        "a_la_place": "plus d'auto-update ; digest-drift-check signale l'ecart amont",
        "autorise": {
            # Decrit precisement l'absence de mise a jour DEPUIS son retrait.
            "docs/operations/depannage.md",
            # Journal des menaces : la ligne dit  depuis le retrait de Watchtower .
            "docs/securite/politique.md",
            # Section  Deja fait  = journal date, avec son encadre d'avertissement.
            "docs/securite/roadmap.md",
            # Catalogue d'incidents : entree historique.
            "docs/operations/incidents-recurrents.md",
            # Tableau de scores lynis historiques.
            "docs/securite/hardening.md",
        },
    },
]

FENCE = re.compile(r"^\s*(```|~~~)")
ARCHIVE = re.compile(r"\A---\n(?:.*\n)*?search_status:\s*archive\s*\n(?:.*\n)*?---\n")


def regles_catalogue() -> tuple[list[dict], set[str], list[str]]:
    """Regles des services retires, fiches a exclure, et ids orphelins."""
    entrees = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    retires = [e for e in entrees if e["status"] == "retired"]
    regles = [
        {
            "motif": rf"(?i)\b{re.escape(e['id'])}\b",
            "quoi": f"{e['name']} ({e['role'].lower()})",
            "retire": e["retiredAt"],
            "a_la_place": f"rien au present — fiche archivee {e['href']}",
            "autorise": AUTORISE_CATALOGUE.get(e["id"], set()),
        }
        for e in retires
    ]
    fiches = {f"docs{e['href'].rstrip('/')}{ext}" for e in retires for ext in (".md", ".mdx")}
    # Une liste blanche sans service retire correspondant est un temoin orphelin :
    # un id renomme dans le catalogue ferait taire sa regle sans bruit.
    ids = {e["id"] for e in retires}
    orphelins = sorted(set(AUTORISE_CATALOGUE) - ids)
    return regles, fiches, orphelins


def main() -> int:
    if not pathlib.Path("docs").is_dir():
        print("docs/ introuvable — lancer depuis la racine du depot.", file=sys.stderr)
        return 2

    regles, fiches_retirees, orphelins = regles_catalogue()
    if orphelins:
        print(f"ECHEC — AUTORISE_CATALOGUE cite des ids absents des services retires : {orphelins}")
        return 1

    pages = [
        p
        for p in [*pathlib.Path("docs").rglob("*.md"), *pathlib.Path("docs").rglob("*.mdx")]
        if p.as_posix().startswith(SURVEILLE)
        and p.as_posix() not in fiches_retirees
        and not ARCHIVE.match(p.read_text(encoding="utf-8"))
    ]

    echecs = 0
    for regle in [*RETIRES, *regles]:
        rx = re.compile(regle["motif"])
        for p in sorted(pages):
            rel = p.as_posix()
            if rel in regle["autorise"]:
                continue
            for n, ligne in enumerate(p.read_text(encoding="utf-8").split("\n"), 1):
                if rx.search(ligne):
                    if echecs == 0:
                        print("ECHEC — des pages operationnelles referencent du retire.\n")
                    echecs += 1
                    print(f"  {rel}:{n}")
                    print(f"     {ligne.strip()[:100]}")
                    print(f"     {regle['quoi']}, retire le {regle['retire']}")
                    print(f"     a la place : {regle['a_la_place']}")
                    print(f"     si c'est un rappel historique legitime, ajoute ce fichier"
                          f" a la liste blanche du motif, AVEC sa justification.\n")

    if echecs:
        print(f"{echecs} occurrence(s). Voir scripts/check-doc-fraicheur.py.")
        return 1

    print(f"OK — {len(pages)} pages operationnelles, aucun terme retire.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
