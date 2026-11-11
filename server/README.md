# 共享服务器

`lobby.mjs` 对应现有的 `zhiku-lobby.service`，默认监听 `127.0.0.1:43147`。`DATA_DIR` 指向现有数据目录，`PORT` 可覆盖端口。更新程序前备份程序及 `lobby.json`；例图目录继续使用，不重新迁移数据。

新增 `PUT /lobby/posts/:id`：沿用 `X-Piaoce-Uid` 身份和所有者检查，修改名称、说明、标签及 content，保留分享 ID、作者、发布时间、例图和互动记录。服务器追加编辑记录，保留原有自定义 content 字段。请求可携带 `expectedEditedAt`，与当前 `content.editedAt` 不同则返回 409；写入失败恢复内存中的旧值。

`GET /health` 返回 `capabilities: ["edit-post"]`，CORS 允许 PUT。先运行 `node tests/lobby-edit-server.mjs`，测试使用独立临时目录及随机端口，不连接线上数据。
