import React, {useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useLocation, useHistory} from '@docusaurus/router';
import {searchRecords} from '../utils/search.cjs';

export default function SearchPage() {
  const location = useLocation();
  const history = useHistory();
  const query = new URLSearchParams(location.search).get('q') || '';
  const [draft, setDraft] = useState(query);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(20);
  const indexUrl = useBaseUrl('/search-index.json');
  useEffect(() => {setDraft(query); setLimit(20);}, [query]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(indexUrl, {signal: controller.signal}).then((response) => {
      if (!response.ok) throw new Error('Index unavailable');
      return response.json();
    }).then((data) => {
      if (data.version !== 1 || !Array.isArray(data.records)) throw new Error('Invalid index');
      setIndex(data);
    }).catch((failure) => {if (failure.name !== 'AbortError') setError(true);});
    return () => controller.abort();
  }, [indexUrl]);
  const matches = useMemo(() => searchRecords(index?.records || [], query), [index, query]);
  return <Layout title="Recherche" description="Rechercher un service, une configuration ou une procédure dans la documentation du homelab.">
    <main className="homelab-search-page container">
      <Link to="/">← Documentation</Link>
      <h1>Rechercher dans la documentation<span className="brand-dot">.</span></h1>
      <form role="search" onSubmit={(event) => {event.preventDefault(); history.push(`${location.pathname}?q=${encodeURIComponent(draft.trim())}`);}}>
        <label htmlFor="docs-query">Service, commande ou problème rencontré</label>
        <div className="homelab-search-field"><input id="docs-query" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="DNS, restic snapshots, Traefik…" /><button className="button button--primary" type="submit">Rechercher</button></div>
      </form>
      {error ? <div role="alert"><p>Impossible de charger la recherche. Réessayez lorsque vous êtes connecté.</p><button className="button button--secondary" onClick={() => window.location.reload()}>Réessayer</button></div> : !index ? <p role="status">Chargement de l’index…</p> : <>
        <p role="status" aria-live="polite" className="homelab-search-count">{query.trim() ? `${matches.length} résultat${matches.length === 1 ? '' : 's'} pour « ${query} »` : `${index.documents} documents disponibles. Saisissez votre recherche.`}</p>
        {query.trim() && !matches.length && <p>Essayez un nom de service ou un terme plus court. Les accents et les majuscules ne changent pas les résultats.</p>}
        <ul className="homelab-search-results">{matches.slice(0, limit).map((result) => <li key={result.url}>
          <Link to={result.url}><span className="homelab-result-category">{result.category} / {result.title}</span><h2>{result.heading}</h2><p>{result.excerpt}</p></Link>
        </li>)}</ul>
        {matches.length > limit && <button className="button button--secondary" onClick={() => setLimit((previous) => previous + 20)}>Afficher 20 résultats supplémentaires</button>}
      </>}
    </main>
  </Layout>;
}
