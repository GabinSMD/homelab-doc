import React, {useRef, useState} from 'react';
import OriginalMermaid from '@theme-original/Mermaid';

export default function Mermaid(props) {
  const dialog = useRef(null);
  const button = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [opened, setOpened] = useState(false);
  return <figure className="homelab-diagram">
    <OriginalMermaid {...props} />
    <figcaption><button ref={button} type="button" onClick={() => {setZoom(1); setOpened(true); dialog.current.showModal();}}>Agrandir le schéma</button></figcaption>
    <dialog ref={dialog} className="homelab-diagram-dialog" aria-label="Schéma agrandi" onClose={() => {setOpened(false); button.current?.focus();}} onClick={(event) => {if (event.target === dialog.current) dialog.current.close();}}>
      <div className="homelab-diagram-controls"><span>Schéma agrandi</span><div><button type="button" aria-label="Réduire le zoom" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}>−</button><output aria-live="polite">{Math.round(zoom * 100)} %</output><button type="button" aria-label="Augmenter le zoom" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.5))}>+</button><button type="button" onClick={() => dialog.current.close()}>Fermer</button></div></div>
      <div className="homelab-diagram-scroll"><div style={{width: `${zoom * 100}%`}}>{opened && <OriginalMermaid {...props} />}</div></div>
    </dialog>
  </figure>;
}
