# PveSphere UI

[![license](https://img.shields.io/github/license/pvesphere/pvesphere-ui.svg)](LICENSE)

**English** | [中文](./README_zh.md)

---

## Introduction

PveSphere UI is the web frontend for [PveSphere](https://github.com/pvesphere/pvesphere) - a multi-cluster management platform for Proxmox VE. It provides a modern, unified interface for managing multiple PVE clusters, nodes, virtual machines, storage, and templates.

> 💡 **Note**: This is the frontend repository. For the main project documentation, installation guides, and backend setup, please visit the core repository: **[pvesphere/pvesphere](https://github.com/pvesphere/pvesphere)**

## Technology Stack

- **Framework**: Vue 3 (Composition API) + TypeScript 5
- **Build Tool**: Vite 7
- **UI Library**: Element Plus 2
- **State Management**: Pinia 3
- **Routing**: Vue Router 4
- **Charts**: ECharts 6
- **Terminal**: xterm.js 5, noVNC
- **Styling**: Tailwind CSS 4, SCSS
- **Base Template**: [vue-pure-admin](https://github.com/pure-admin/vue-pure-admin)

## Quick Start

### Prerequisites

- Node.js >= 20.19.0 or >= 22.13.0
- pnpm >= 9

### Development

```bash
# Clone the repository
git clone https://github.com/pvesphere/pvesphere-ui.git
cd pvesphere-ui

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Documentation

For comprehensive documentation, please visit the main project:

**📚 [https://docs.pvesphere.com](https://docs.pvesphere.com)**

## Related Projects

- **[pvesphere/pvesphere](https://github.com/pvesphere/pvesphere)** - Core backend service (main repository)
- [Proxmox VE](https://www.proxmox.com/) - The underlying virtualization platform
- [vue-pure-admin](https://github.com/pure-admin/vue-pure-admin) - Frontend base template

## License

[Apache License 2.0](LICENSE)

Copyright © 2025-present PveSphere Contributors

## Contact

- **Email**: pvesphere@gmail.com
- **Twitter**: [@PveSphere](https://x.com/PveSphere)
- **GitHub**: [https://github.com/pvesphere/pvesphere](https://github.com/pvesphere/pvesphere)
