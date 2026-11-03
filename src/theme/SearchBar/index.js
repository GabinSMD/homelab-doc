import React, {useEffect, useRef} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function SearchBar() {
  const input = useRef(null);
  useEffect(() => {
    const focus = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener('keydown', focus);
    return () => window.removeEventListener('keydown', focus);
  }, []);
  return <form className="homelab-search" role="search" action={useBaseUrl('/recherche/')}>
    <label className="sr-only" htmlFor="homelab-search-input">Rechercher dans toute la documentation</label>
    <input ref={input} id="homelab-search-input" type="search" name="q" placeholder="Rechercher…" autoComplete="off" />
    <button type="submit" aria-label="Lancer la recherche"><span aria-hidden="true">⌕</span></button>
  </form>;
}
