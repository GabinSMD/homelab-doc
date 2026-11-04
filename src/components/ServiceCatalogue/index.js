import React, {useMemo, useState} from 'react';
import Link from '@docusaurus/Link';
import services from '../../data/service-catalogue.json';
import {filterServices} from '../../utils/catalogue.cjs';

function ServiceTable({entries, retired = false}) {
  return <table className="homelab-catalogue-table">
    <thead><tr><th scope="col">Service</th><th scope="col">Rôle</th><th scope="col">{retired ? 'Anciennes machines' : 'Machine'}</th><th scope="col">Statut</th></tr></thead>
    <tbody>{entries.map((service) => <tr key={service.id}>
      <th scope="row"><Link to={service.href}>{service.name}</Link></th>
      <td>{service.role}</td>
      <td><span className="homelab-mobile-label" aria-hidden="true">{retired ? 'Anciennes machines : ' : 'Machine : '}</span>{service.hosts.join(', ')}</td>
      <td><span className="homelab-service-status">{service.status === 'retired' ? 'Retiré' : service.status === 'test' ? 'En test' : 'En service'}</span>{service.retiredAt && <time dateTime={service.retiredAt}>{new Date(`${service.retiredAt}T12:00:00Z`).toLocaleDateString('fr-FR', {timeZone: 'UTC'})}</time>}</td>
    </tr>)}</tbody>
  </table>;
}

export default function ServiceCatalogue() {
  const [query, setQuery] = useState('');
  const [host, setHost] = useState('all');
  const filtered = useMemo(() => filterServices(services, {query, host}), [query, host]);
  const current = filtered.filter((service) => service.status !== 'retired');
  const retired = filtered.filter((service) => service.status === 'retired');
  return <section className="homelab-catalogue" aria-label="Catalogue des services">
    <div className="homelab-catalogue-filters homelab-no-search">
      <label htmlFor="service-filter">Trouver un service<input id="service-filter" type="search" placeholder="Nom ou rôle : DNS, sauvegarde…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label htmlFor="host-filter">Machine<select id="host-filter" value={host} onChange={(event) => setHost(event.target.value)}><option value="all">Toutes les machines</option>{['penny', 'galahad', 'lancelot'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <p className="homelab-catalogue-note">Le statut décrit l’usage documenté du service, sans mesure de disponibilité en temps réel.</p>
    <p role="status" aria-live="polite" className="homelab-catalogue-count homelab-no-search">{current.length} service{current.length > 1 ? 's' : ''} en cours · {retired.length} retiré{retired.length > 1 ? 's' : ''}</p>
    {current.length ? <ServiceTable entries={current} /> : <p>Aucun service en cours ne correspond à ces filtres.</p>}
    {!!retired.length && <section className="homelab-no-search" aria-labelledby="services-retires"><h3 id="services-retires">Services retirés</h3><p className="homelab-catalogue-note">Fiches conservées pour l’historique. Les machines indiquées sont celles de l’ancien déploiement.</p><ServiceTable entries={retired} retired /></section>}
    {!filtered.length && <button className="button button--secondary homelab-no-search" onClick={() => {setQuery(''); setHost('all');}}>Réinitialiser les filtres</button>}
  </section>;
}
