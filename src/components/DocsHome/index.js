import React from 'react';
import Link from '@docusaurus/Link';

const hosts = [
  {name: 'penny', hardware: 'Raspberry Pi 4', services: [['Traefik', 'traefik'], ['Authelia', 'authelia'], ['AdGuard', 'adguard']]},
  {name: 'galahad', hardware: 'ZimaBoard', services: [['Vaultwarden', 'vaultwarden'], ['DNS secondaire', 'dns-failover']]},
  {name: 'lancelot', hardware: 'ZimaBoard', services: [['Grafana', 'grafana'], ['PBS', 'pbs']]},
];
const groups = [
  {title: 'Comprendre', links: [['Réseau et DNS', '/architecture/reseau/'], ['Catalogue des services', '/services/'], ['Modèle de sécurité', '/securite/politique/']]},
  {title: 'Faire évoluer', links: [['Ajouter un service', '/guides/ajouter-service/'], ['Renforcer la sécurité', '/securite/hardening/'], ['Décisions et journal', '/projet/']]},
  {title: 'Maintenir', links: [['Superviser le lab', '/operations/monitoring/'], ['Sauvegarder et restaurer', '/operations/backups/'], ['Diagnostiquer un incident', '/operations/depannage/']]},
];

export default function DocsHome() {
  return <div className="homelab-home">
    <header className="homelab-home-intro"><div><p className="homelab-eyebrow">HOMELAB / GABIN SIMOND</p><h1>Documentation<span className="brand-dot">.</span></h1><p className="homelab-lead">Comprendre l’infrastructure. Retrouver une procédure.</p></div><div className="homelab-home-actions"><Link className="button button--primary" to="/architecture/">Explorer l’architecture <span aria-hidden="true">→</span></Link><Link to="/services/">Parcourir les services <span aria-hidden="true">→</span></Link></div></header>
    <nav className="homelab-shortcuts" aria-label="Accès rapides"><Link to="/recherche/">Rechercher dans la documentation</Link><Link to="/operations/depannage/">Dépannage</Link><Link to="/operations/backups/">Sauvegardes</Link><Link to="/guides/ajouter-service/">Ajouter un service</Link></nav>
    <section className="homelab-infra" aria-labelledby="lab-overview"><div className="homelab-infra-intro"><p className="homelab-eyebrow">LE LAB EN UN REGARD</p><h2 id="lab-overview">Trois machines.<br />Un système.</h2><p>Le réseau sur penny. Les services répartis entre galahad et lancelot.</p><Link to="/architecture/hardware/">Voir les machines <span aria-hidden="true">→</span></Link></div><div className="homelab-hosts"><div className="homelab-host-caption"><span>Hôte</span><span>Exemples de services documentés</span></div>{hosts.map((host) => <div className="homelab-host" key={host.name}><div><strong>{host.name}</strong><small>{host.hardware}</small></div><div className="homelab-host-services">{host.services.map(([label, slug]) => <Link key={slug} to={`/services/${slug}/`}>{label}<span aria-hidden="true"> ↗</span></Link>)}</div></div>)}</div></section>
    <section aria-labelledby="essential-resources"><div className="homelab-section-heading"><h2 id="essential-resources">Aller à l’essentiel</h2><span>Guides et références</span></div><div className="homelab-resource-grid">{groups.map((group) => <div key={group.title}><h3>{group.title}</h3><ul>{group.links.map(([title, to]) => <li key={to}><Link to={to}>{title}<span aria-hidden="true">→</span></Link></li>)}</ul></div>)}</div></section>
    <Link className="homelab-recovery" to="/operations/break-glass/"><strong>Reprise après incident</strong><span>Accéder à la procédure Break-Glass</span><span aria-hidden="true">→</span></Link>
  </div>;
}
