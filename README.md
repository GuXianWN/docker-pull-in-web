# Docker Registry API 服务

这是一个基于 Nuxt.js 构建的 Docker Registry API 服务，用于处理 Docker 镜像相关的操作。

## 功能特性

- 获取 Docker Registry 认证令牌
- 拉取 Docker 镜像
- 获取镜像 Manifest 信息
- 获取详细的 Manifest 信息
- 组装 Docker 镜像

## 项目结构

```bash
server/api/docker/
├── token.ts # 处理认证令牌
├── pull-image.ts # 镜像拉取
├── manifest.ts # 获取基础 manifest
├── manifest-detail.ts # 获取详细 manifest
└── assemble-image.ts # 镜像组装
```

## 使用方法

1. 安装 Node.js 和 npm

2. 安装依赖

```bash
npm install 
yarn 
pnpm install
```

3. 启动开发环境

```bash
npm run dev
yarn dev
pnpm dev
```



