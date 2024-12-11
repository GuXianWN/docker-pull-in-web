FROM node:18-alpine

WORKDIR /app

# 复制构建产物
COPY .output ./

# 创建下载目录
RUN mkdir -p downloads tmp

# 设置环境变量
ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "server/index.mjs"] 