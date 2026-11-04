import React from 'react';
import OriginalLayout from '@theme-original/DocRoot/Layout';
import {useLocation} from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function DocRootLayout(props) {
  const {pathname} = useLocation();
  const home = useBaseUrl('/');
  if (pathname === home) return <main className="homelab-home-main"><div className="container">{props.children}</div></main>;
  return <OriginalLayout {...props} />;
}
