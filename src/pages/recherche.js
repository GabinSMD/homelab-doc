import React, {useEffect, useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useLocation, useHistory} from '@docusaurus/router';
import {searchRecords, highlightParts} from '../utils/search.cjs';

function Highlight({text, query}) {
  return highlightParts(text, query).map((part, i) => part.match ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>);
}

export default function SearchPage() {
  const location = useLocation();
  const history = useHistory();
  const query = new URLSearchParams(location.search).get('q') || '';
  const requestedScope = new URLSearchParams(location.search).get('scope');
  const scope = ['current', 'archives', 'all'].includes(requestedScope) ? requestedScope : 'current';
  const [draft, setDraft] = useState(query);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(20);
  const indexUrl = useBaseUrl('/search-index.json');
  useEffect(() => {setDraft(query); setLimit(20);}, [query, scope]);
  const navigateSearch = (nextQuery, nextScope) => {
    const params = new URLSearchParams({q: nextQuery.trim(), scope: nextScope});
    history.push(`${location.pathname}?${params}`);
  };
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
  const allMatches = useMemo(() => searchRecords(index?.records || [], query), [index, query]);
  const archiveCount = allMatches.filter((record) => record.archived).length;
  const matches = allMatches.filter((record) => scope === 'all' || (scope === 'archives' ? record.archived : !record.archived));
  return <Layout title="Recherche" description="Rechercher un service, une configuration ou une procédure dans la documentation du homelab.">
    <main className="homelab-search-page container">
      <Link to="/">← Documentation</Link>
      <h1>Rechercher dans la documentation<span className="brand-dot">.</span></h1>
      <form role="search" onSubmit={(event) => {event.preventDefault(); navigateSearch(draft, scope);}}>
        <label htmlFor="docs-query">Service, commande ou problème rencontré</label>
        <div className="homelab-search-field"><input id="docs-query" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="DNS, restic snapshots, Traefik…" /><button className="button button--primary" type="submit">Rechercher</button></div>
      </form>
      <fieldset className="homelab-search-scopes"><legend>Rechercher dans</legend>{[
        ['current', 'Documentation', allMatches.length - archiveCount],
        ['archives', 'Archives', archiveCount],
        ['all', 'Tout', allMatches.length],
      ].map(([value, label, count]) => <label key={value}><input type="radio" name="search-scope" value={value} checked={scope === value} onChange={() => navigateSearch(query, value)} />{label}{index && query.trim() && <span> ({count})</span>}</label>)}</fieldset>
      {error ? <div role="alert"><p>Impossible de charger la recherche. Réessayez lorsque vous êtes connecté.</p><button className="button button--secondary" onClick={() => window.location.reload()}>Réessayer</button></div> : !index ? <p role="status">Chargement de l’index…</p> : <>
        <p role="status" aria-live="polite" className="homelab-search-count">{query.trim() ? `${matches.length} résultat${matches.length === 1 ? '' : 's'} pour « ${query} »` : `${index.documents} documents disponibles. Saisissez votre recherche.`}</p>
        {query.trim() && !matches.length && <p>Essayez un nom de service ou un terme plus court. Les accents et les majuscules ne changent pas les résultats.{scope === 'current' && archiveCount > 0 && <> <button className="homelab-text-button" onClick={() => navigateSearch(query, 'archives')}>Voir les {archiveCount} résultats dans les archives</button>.</>}</p>}
        {scope === 'archives' && <p className="homelab-search-help">Journaux datés et services retirés : ces pages décrivent un état passé du lab.</p>}
        <ul className="homelab-search-results">{matches.slice(0, limit).map((result) => <li key={result.url}>
          <Link to={result.url}><span className="homelab-result-category">{result.category} / <Highlight text={result.title} query={query} /></span>{result.archived && <span className="homelab-archive-badge">Archive{result.archiveDate && <> · <time dateTime={result.archiveDate}>{new Date(`${result.archiveDate}T12:00:00Z`).toLocaleDateString('fr-FR', {timeZone: 'UTC'})}</time></>}</span>}<h2><Highlight text={result.heading} query={query} /></h2><p><Highlight text={result.excerpt} query={query} /></p></Link>
        </li>)}</ul>
        {matches.length > limit && <button className="button button--secondary" onClick={() => setLimit((previous) => previous + 20)}>Afficher 20 résultats supplémentaires</button>}
      </>}
    </main>
  </Layout>;
}
