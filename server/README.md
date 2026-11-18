# 共享服务器

`lobby.mjs` 对应现有的 `zhiku-lobby.service`，默认监听 `127.0.0.1:43147`。`DATA_DIR` 指向现有数据目录，`PORT` 可覆盖端口。更新程序前备份程序及 `lobby.json`；例图目录继续使用，不重新迁移数据。

新增 `PUT /lobby/posts/:id`：沿用 `X-Piaoce-Uid` 身份和所有者检查，修改名称、说明、标签及 content，保留分享 ID、作者、发布时间、例图和互动记录。服务器追加编辑记录，保留原有自定义 content 字段。请求可携带 `expectedEditedAt`，与当前 `content.editedAt` 不同则返回 409；写入失败恢复内存中的旧值。

`GET /health` 返回 `capabilities: ["edit-post"]`，CORS 允许 PUT。先运行 `node tests/lobby-edit-server.mjs`，测试使用独立临时目录及随机端口，不连接线上数据。


## 0.8.98：变快 + 小图

- 列表接口一次算完所有点赞 / 保存数，只把当前这一页做成返回的样子（以前每条分享各扫一遍全部记录，分享和记录多了以后很慢）。图片查找不再每次拼一个大数组。
- 小图：上传时客户端顺手带一张 480 宽的 JPEG（200KB 以内），存成 `images/<id>.t`；列表里的图片多一个 `thumb` 地址（`/images/<id>?t=1`），没小图就还是给原图。`GET /health` 的 `capabilities` 多了 `thumbs`。
- 旧分享补小图：`POST /images/:id/thumb`（`{ data }`），只有分享的作者能补；作者打开共享时客户端会自动补传自己旧分享的小图。
- 共享空间上限可以用环境变量 `MAX_MB` 调大（默认 64）。
- 测试：`node tests/lobby-thumbs-server.mjs`（独立临时目录、随机端口）。

更新步骤：备份现在的 `lobby.mjs` 和数据目录里的 `lobby.json`，用新的 `server/lobby.mjs` 覆盖服务器上的程序，然后 `systemctl restart zhiku-lobby`。数据和例图目录不用动，旧数据直接能用。
