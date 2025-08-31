# Lifetrace API (Cloud Function)

- 平台：微信云开发 / CloudBase
- 触发：HTTP 触发（支持 GET/POST/OPTIONS）

## 目录
- index.js  云函数入口（内置轻路由）
- package.json  依赖：@cloudbase/node-sdk

## 部署
1. 在云开发控制台创建云函数 `api`，选择 Node.js 16+
2. 上传本目录全部文件（或在开发者工具中“导入本地函数”）
3. 安装依赖并部署，勾选“HTTP 触发”
4. 复制函数 HTTPS 域名，填入小程序“服务器域名”
5. 小程序端设置：`uni.setStorageSync('API_BASE', 'https://你的函数域名')`

## 路由示例
- GET  /api/health
- POST /api/login
- POST /api/register
- GET  /api/memos
- POST /api/memos
- GET  /api/daily/session
- POST /api/daily/session/answer
- POST /api/daily/session/next

> 注意：示例鉴权与数据结构为最小可运行版本，请按你的业务替换为正式逻辑与权限控制。
