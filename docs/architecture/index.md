# Architecture

Materiel, système d'exploitation, réseau et connectivite du homelab.

| Page | Contenu |
|---|---|
| [Machines](hardware.md) | Inventaire hardware, specs, IPs, cablage |
| [Optimisations OS](os.md) | DietPi, stabilité SSD, kernel, watchdog, Docker daemon |
| [Réseau actuel](reseau.mdx) | Topologie LAN, DNS (AdGuard rewrites), Tailscale VPN, TLS/certificats |
| [Accès réseau](acces-reseau.md) | Par où on entre : LAN, Tailscale, et pourquoi aucun port n'est ouvert depuis la box |
| [Cluster et QDevice](cluster-qdevice.md) | Les 3 votes du cluster Proxmox, `corosync-qnetd` sur penny |
| [Réseau cible](reseau-cible.md) | Architecture OPNsense, plan VLANs, matrice de flux, WiFi |
