import React from 'react';
import OriginalFooter from '@theme-original/DocItem/Footer';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import Link from '@docusaurus/Link';

const links = {
  'services/traefik': [['Authentification avec Authelia', '/services/authelia/'], ['Réseau et DNS', '/architecture/reseau/'], ['TLS et certificats', '/guides/tls/'], ['Dépannage', '/operations/depannage/']],
  'services/authelia': [['Routage avec Traefik', '/services/traefik/'], ['Politique de sécurité', '/securite/politique/'], ['Dépannage', '/operations/depannage/']],
  'operations/break-glass': [['Sauvegardes', '/operations/backups/'], ['Exercice de restauration', '/operations/dr-drill-scenario-1/'], ['Machines', '/architecture/hardware/']],
  'guides/ajouter-service': [['Traefik', '/services/traefik/'], ['Authelia', '/services/authelia/'], ['TLS et certificats', '/guides/tls/']],
};
export default function DocFooter(props) {
  const {metadata, frontMatter} = useDoc();
  const related = frontMatter.related_docs || links[metadata.id] || [];
  return <>
    {!!related.length && <nav className="homelab-related" aria-label="Pages liées"><h2>Pour continuer</h2><ul>{related.map(([label, to]) => <li key={to}><Link to={to}>{label}<span aria-hidden="true"> →</span></Link></li>)}</ul></nav>}
    <OriginalFooter {...props} />
  </>;
}
