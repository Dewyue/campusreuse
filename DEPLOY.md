# 发布到 campusreuse.dewyue.com

线上地址：https://campusreuse.dewyue.com

GitHub 每个仓库单独存 Secrets，**不用新生成密钥**，把这台服务器已经在用的那一套再贴进本仓库一次。

1. https://github.com/Dewyue/campusreuse/settings/environments  
   新建 Environment，名称必须是 `ALIYUN_SSH_KEY`
2. 在该环境添加 `ALIYUN_HOST`、`ALIYUN_USER`、`ALIYUN_SSH_KEY`、`ALIYUN_PORT`（没有就 `22`）
3. Actions → **Deploy campusreuse.dewyue.com** → Run workflow

之后推送到 `main` 会自动更新。
