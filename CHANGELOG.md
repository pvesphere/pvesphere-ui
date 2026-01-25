# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-25

### 🎉 正式发布版本

PveSphere UI v1.0.0 是第一个正式发布版本，提供了现代化的 Web 管理界面。

#### ✨ 新增功能

- **国际化登录界面**：登录框支持中英文自适应
- **GitHub 和文档链接**：在导航栏添加 GitHub 仓库和官方文档链接
- **移除权限配置菜单**：简化界面，移除示例权限菜单

#### 🔧 改进

- **API 代理配置**：优化开发环境的 API 代理设置
- **环境变量配置**：支持通过环境变量配置后端 API 地址
- **代码质量**：移除 Husky 和 commitlint，简化开发流程

#### 🐛 修复

- 修复前端无法调用后端 API 的问题
- 修复登录框 account 字段的国际化支持
- 修复 @novnc/novnc 版本兼容性问题

---

## [1.0.0-rc01] - 2026-01-10

### 🧪 Release Candidate 1

PveSphere UI v1.0.0-rc01 是第一个候选发布版本，提供了现代化的 Web 管理界面。

⚠️ **注意**: 这是候选版本，建议先在测试环境使用，欢迎反馈问题。经过充分测试后将发布正式的 v1.0.0 版本。

#### ✨ 核心功能

- **多集群仪表板**：统一展示所有集群资源状态
- **虚拟机管理界面**：直观的 VM 操作界面，支持批量操作
- **模板管理界面**：可视化的模板导入和同步管理
- **存储监控界面**：清晰展示存储使用情况和容量
- **实时监控图表**：基于 ECharts 的资源监控可视化
- **响应式设计**：支持桌面和移动端访问
- **国际化支持**：中文和英文双语界面
- **暗色模式**：支持明暗主题切换

#### 🔧 技术特性

- 基于 Vue 3 + TypeScript + Element Plus
- 使用 Vite 构建，开发体验极佳
- 完整的权限控制和路由守卫
- 优化的打包体积和加载性能

---

[1.0.0]: https://github.com/pvesphere/pvesphere-ui/releases/tag/v1.0.0
[1.0.0-rc01]: https://github.com/pvesphere/pvesphere-ui/releases/tag/v1.0.0-rc01
