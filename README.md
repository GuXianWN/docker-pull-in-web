# Docker Registry Puller

一个优雅的 Docker 镜像拉取工具,基于 Nuxt.js 构建。让你能够方便地从web页面拉取并下载 Docker 镜像。

[![](https://bb-embed.herokuapp.com/embed?v=BV1jS4y1w7SW)](https://player.bilibili.com/player.html?aid=683633468&bvid=BV1jS4y1w7SW&cid=711074429&page=1)

![video.gif](md/video.gif)

## 部署指南

### 本地开发环境

1. 安装依赖
```bash
pnpm install
```

2. 启动开发服务器
```bash
pnpm run dev
```

3. 使用Docker Compose运行
```bash
docker-compose up -d
```

### 运行容器
```bash
docker run -d \
  -p 3000:3000 \
  -v ./downloads:/app/downloads \
  -v ./tmp:/app/tmp \
  -e NUXT_PORT=3000 \
  guxian/docker-pull-in-web:latest
```

### 环境变量配置

| 变量名      | 默认值                | 描述          |
| ----------- | --------------------- | ------------- |
| NUXT_PORT   | 3000                  | 服务监听端口  |
| HTTP_PROXY  | http://127.0.0.1:7890 | HTTP代理地址  |
| HTTPS_PROXY | http://127.0.0.1:7890 | HTTPS代理地址 |


[MIT License](LICENSE)