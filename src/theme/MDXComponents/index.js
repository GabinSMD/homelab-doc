import React from 'react';
import OriginalComponents from '@theme-original/MDXComponents';

function Table(props) {
  return <div className="homelab-table-scroll" role="region" aria-label="Tableau — défilement horizontal si nécessaire" tabIndex={0}><table {...props} /></div>;
}

export default {...OriginalComponents, table: Table};
