import React from 'react';
import Link from '@docusaurus/Link';

const scenarios = [
  ['Un seul LXC en panne', 'DNS secondaire, coffre ou logs', 'scénario-0--panne-dun-seul-lxc-dns-failover--vault--logs'],
  ['penny indisponible', 'Le cluster Proxmox fonctionne encore', 'scénario-1--penny-mort-cluster-proxmox-ok'],
  ['Cluster Proxmox perdu', 'galahad et lancelot à reconstruire', 'scénario-2--cluster-proxmox-detruit-galahad--lancelot'],
  ['Reconstruction complète', 'penny et le cluster sont perdus', 'scénario-3--tout-detruit-penny--cluster'],
  ['Authelia corrompu', 'Base de données ou clé OIDC', 'scénario-4--corruption-authelia-db-ou-clé-oidc'],
  ['Accès réseau perdu', 'FAI, DNS externe ou Cloudflare', 'scénario-5--perte-dacces-réseau-fai-dns-externe-cloudflare'],
  ['Clé SSH ou YubiKey perdue', 'Accès et authentification', 'scénario-6--perte-de-clé-ssh-ou-yubikey'],
];

export default function IncidentNavigation() {
  return <nav className="homelab-incidents homelab-no-search" aria-labelledby="choisir-un-scenario">
    <h2 id="choisir-un-scenario">Quel incident rencontrez-vous ?</h2>
    <p>Choisissez le périmètre touché pour rejoindre la procédure correspondante.</p>
    <ul>{scenarios.map(([label, detail, anchor]) => <li key={anchor}><Link to={`#${anchor}`}><strong>{label}<span aria-hidden="true"> →</span></strong><span>{detail}</span></Link></li>)}</ul>
    <p className="homelab-incidents-preparation">Avant d’agir : vérifiez les <Link to="#preparation-avant-lincident">accès et sauvegardes nécessaires</Link>. Après l’intervention : suivez la <Link to="#checklist-de-vérification-finale">checklist de vérification</Link>.</p>
  </nav>;
}
