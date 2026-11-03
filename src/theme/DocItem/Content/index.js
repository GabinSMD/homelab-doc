import React, {useEffect} from 'react';
import OriginalContent from '@theme-original/DocItem/Content';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {kinds, documentKind, validVerificationDate} from '../../../utils/doc-kind.cjs';

export default function DocContent(props) {
  const {metadata, frontMatter} = useDoc();
  const kind = documentKind(metadata.id, frontMatter);
  useEffect(() => {
    let closedDetails = [];
    const beforePrint = () => {
      closedDetails = [...document.querySelectorAll('.theme-doc-markdown details:not([open])')];
      closedDetails.forEach((details) => {details.open = true;});
      document.querySelectorAll('.theme-doc-markdown [role="tabpanel"]').forEach((panel) => {
        const label = document.getElementById(panel.getAttribute('aria-labelledby'));
        if (label) panel.dataset.printLabel = label.textContent;
      });
    };
    const afterPrint = () => {closedDetails.forEach((details) => {details.open = false;}); closedDetails = [];};
    const revealHash = () => {
      let id;
      try {id = decodeURIComponent(window.location.hash.slice(1));} catch {return;}
      const target = document.getElementById(id);
      if (!target) return;
      let parent = target.parentElement;
      while (parent) {if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement;}
    };
    revealHash();
    window.addEventListener('hashchange', revealHash);
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {afterPrint(); window.removeEventListener('hashchange', revealHash); window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', afterPrint);};
  }, [metadata.id]);
  if (metadata.id === 'index') return <OriginalContent {...props} />;
  return <div className="homelab-doc-content" data-doc-kind={kind}>
    <div className="homelab-doc-toolbar homelab-no-search"><span>{kinds[kind]}</span><button type="button" onClick={() => window.print()}>Imprimer / PDF</button></div>
    {validVerificationDate(frontMatter.verified_at) && <p className="homelab-verification">Vérification opérationnelle : <time dateTime={frontMatter.verified_at}>{new Date(`${frontMatter.verified_at}T12:00:00Z`).toLocaleDateString('fr-FR', {timeZone: 'UTC'})}</time>{frontMatter.verification_note && <> — {frontMatter.verification_note}</>}</p>}
    <OriginalContent {...props} />
  </div>;
}
