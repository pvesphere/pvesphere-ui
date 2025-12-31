# PveSphere UI

[![license](https://img.shields.io/github/license/pvesphere/pvesphere-ui.svg)](LICENSE)

[English](./README.md) | **中文**

---

## 简介

PveSphere UI 是 [PveSphere](https://github.com/pvesphere/pvesphere) 的 Web 前端 - 一个用于 Proxmox VE 的多集群管理平台。它提供了一个现代化、统一的界面，用于管理多个 PVE 集群、节点、虚拟机、存储和模板。

> 💡 **提示**：这是前端仓库。完整的项目文档、安装指南和后端配置，请访问核心仓库：**[pvesphere/pvesphere](https://github.com/pvesphere/pvesphere)**

## 技术栈

- **框架**：Vue 3 (Composition API) + TypeScript 5
- **构建工具**：Vite 7
- **UI 库**：Element Plus 2
- **状态管理**：Pinia 3
- **路由**：Vue Router 4
- **图表**：ECharts 6
- **终端**：xterm.js 5, noVNC
- **样式**：Tailwind CSS 4, SCSS
- **基础模板**：[vue-pure-admin](https://github.com/pure-admin/vue-pure-admin)

## 快速开始

### 前置要求

- Node.js >= 20.19.0 或 >= 22.13.0
- pnpm >= 9

### 开发

```bash
# 克隆仓库
git clone https://github.com/pvesphere/pvesphere-ui.git
cd pvesphere-ui

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

## 文档

完整文档请访问主项目：

**📚 [https://docs.pvesphere.com](https://docs.pvesphere.com)**

## 相关项目

- **[pvesphere/pvesphere](https://github.com/pvesphere/pvesphere)** - 核心后端服务（主仓库）
- [Proxmox VE](https://www.proxmox.com/) - 底层虚拟化平台
- [vue-pure-admin](https://github.com/pure-admin/vue-pure-admin) - 前端基础模板

## 许可证

[Apache License 2.0](LICENSE)

版权所有 © 2025-present PveSphere Contributors

## 联系方式

- **邮箱**：pvesphere@gmail.com
- **Twitter**：[@PveSphere](https://x.com/PveSphere)
- **GitHub**：[https://github.com/pvesphere/pvesphere](https://github.com/pvesphere/pvesphere)
