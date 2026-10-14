# 中南闲集：手机端演示原型

采用中南大学蓝白视觉方向，保留分类入口、双列商品流和底部导航，加入校区筛选。项目是课程演示，与闲鱼官方及学校官方服务没有关联。

## 当前视觉调整：简洁商品导向

参考 Apple Store 的留白、字体层级与产品导向布局：https://www.apple.com.cn/store 。不是苹果官方产品或界面的像素复制。保留中南蓝作为操作色，移除大面积蓝色页头、促销入口、彩色分类方块与暖色价格，改为白色页面、黑灰文字、轻量分段切换和低干扰底部导航。

已实际引入 `motion` 实现短时入场与分段指示器过渡，`@radix-ui/react-dialog` 处理弹窗的焦点锁定、Escape 关闭、背景不可交互与辅助技术语义。遵守系统减少动态效果设置。没有安装外部账号插件，也不需要用户另行授权设计工具。

示例照片调整：相机使用 Unsplash `photo-1510127034890-ba27508e9f1c`；耳机使用 `photo-1583394838336-acd977736f90`。同步修正演示商品名称，避免图片品牌与描述不符。界面移除“推荐”与列表件数，默认按发布顺序倒序，支持价格从低到高，同价时最新优先。排序不使用样例 featured/wish 字段；旧 recommend 请求按最新处理。既有数据库不覆盖用户数据；新的演示初始化与在线浏览器预览使用更新后的样例。

2026-10-14 更新：“逛校园”改为六个官方校区照片文件夹，标签统一左侧、主体与标签圆角、无边框清晰图片，点击上升后进入对应校区；按视口高度完整显示六层。“我的发布”在“我的收藏”前，进入个人页默认显示发布。图片来源与使用边界见 [校区图片登记](docs/campus-image-sources.md)。毛玻璃已按用户反馈撤回，不是最终效果。

## 上一轮视觉参考

学校章程确认学校徽志为蓝白配色：https://www.csu.edu.cn/zjzn/xxzc.htm 。界面主色 `#1768a6` 是屏幕可读性适配色，不声称为学校官方标准 RGB 色值。

统一方形商品图与两行标题；蓝色用于主要操作与选中状态，珊瑚红突出价格，绿色保留再使用含义。缩小宣传入口占位、提高辅助文字对比度、扩大收藏与筛选的触控区域，排序标签不再随内容改变布局。保留原有接口与独立后端，在线预览访问名单不变。

## 前后端分离

在线界面预览与服务器版分开构建：`npm run build:preview` 生成 `dist/`，仅该预览使用浏览器本地演示数据，无跨设备同步；正常 `npm run build` 及 Docker 构建仍连接独立后端，不会因接口失败而静默切换模拟数据。现有在线预览按访问名单共享，需使用已获授权的账号登录；发布更新不改变名单。

- `frontend/`：独立页面，只通过 `/api` 访问后端；打包产物为 `frontend/dist/`。
- `backend/`：独立 HTTP API，Node.js 22.13+，SQLite 持久化数据。
- `shared/`：服务器和本地预览共用的校区、发布校验、面交状态规则。
- `deploy/`：反向代理配置。前后端是两个独立服务，同域转发避免不必要的跨域授权。
- `compose.yaml`：两服务部署与数据库卷。没有绑定任何指定云厂商。

## 本地启动

```bash
npm ci
npm run server
```

另开终端：

```bash
npm run dev -- --port 5173
```

打开 http://localhost:5173 。后端默认只监听本机 3100 端口，开发代理连接此端口。

```bash
npm test
npm run build
```

## 伙伴服务器部署

需要 Docker Compose。在此目录执行：

```bash
docker compose up -d --build
curl http://127.0.0.1:8088/api/health
```

默认只开放服务器本机 `127.0.0.1:8088`，请由现有网关配置域名、HTTPS 和演示访问密码后再提供外部访问。不要直接把此演示的无认证写入接口暴露到公网。部署配置已提供，但尚未在伙伴的服务器上运行或验证。

`market-data` 卷保存数据库；`docker compose down` 不会删除数据，不要使用 `down -v`。可离线停服务后备份数据卷。不要提交数据库或学生个人数据。

## 已接通

商品列表、关键词搜索、六校区与分类筛选、仅看可预约、价格排序、免费送、详情与收藏；实物照片发布、结构化品相和瑕疵披露；提出时间地点、卖家接受或拒绝、取消、过期、双方确认交接、分歧记录、再使用问卷。发布照片限单张 JPG/PNG/WebP、1 MiB，暂存为数据 URL，不是生产级图片服务。已提供自建账号注册/登录（密码哈希存 SQLite，会话令牌 30 天）。学校身份核验仍未做，任何人可自创账号。未登录时仍可用 `X-Demo-Session` 演示分区。

只有双方分别确认才计入完成，单方操作不能算成交；完成记录也不是物理交接的独立证明。样例商品没有真实卖家，不会自动接受请求。在线本地预览只能演示单方流程；真实双会话流程需运行独立后端。

服务设计依据、状态机和下一阶段研究见 [服务逻辑审阅](docs/service-logic-review.md)。

## 明确未完成

学校身份验证、真实聊天与推送、支付托管、物流、专业质检、纠纷仲裁、举报审核、接口限流均未接入。本项目只适合受控演示。面交页面轮询记录，不会向真实人员发送通知。分歧记录会锁住物品，但尚无仲裁与解锁流程。所有初始化商品、卖家、原价和想要人数都是演示内容；不冒充调研证据或真实交易。样例图片来自 Unsplash，不代表所描述型号的实拍。照片尚无内容审核与隐私元数据清理。

没有虚构减碳数值。需要后续确定功能单位、基准情景、替代率、运输与使用阶段边界以及排放因子来源。

## API 摘要

注册、登录、退出、当前账号不需要演示会话。其余接口二选一：`Authorization: Bearer <token>`（登录后下发），或原来的 `X-Demo-Session`（16–80 位字母、数字或连字符，仅演示分区）。

| 方法 | 路径 | 内容 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态；`auth: true` 表示已接通账号 |
| POST | `/api/register` | `{ "username", "password" }` → `{ token, user }`；账号 2–20 位汉字/字母/数字/下划线，密码 8–72 位 |
| POST | `/api/login` | `{ "username", "password" }` → `{ token, user }` |
| GET | `/api/account` | 当前登录用户 `{ id, username, createdAt }` |
| POST | `/api/logout` | 作废当前令牌 |
| GET | `/api/items?q=&campus=&category=&sort=&free=&available=` | 商品列表；sort 为 new/price，默认 new；available=true 只看可预约 |
| POST | `/api/items` | title, description, price, category, campus, photo, condition, functionStatus, defects, pickupPlace, pickupWindow, disclosureConfirmed=true |
| GET | `/api/me` | 当前会话的 favorites、published、reservations（买方）、incoming（卖方） |
| PUT | `/api/favorites/:id` | `{ "saved": true }`，幂等 |
| POST | `/api/reservations` | itemId, meetingAt（ISO 时间）, place, safetyConfirmed=true；同物品同买方活动请求幂等 |
| PATCH | `/api/reservations/:id` | action: accept/decline/cancel/confirm/issue/evidence；confirm 还需 confirmed=true；evidence 携带 evidence 对象 |

品相为近全新/轻微使用痕迹/明显使用痕迹；功能为功能正常/部分功能异常。校区及全部合法枚举见 `shared/market.js`。再使用数据包含 alternative（buy_new/buy_used/not_buy/unknown）、travelMode（walk/bike/bus/car/unknown）、extraKm、expectedMonths。记录只标记 not_calculated，不输出减碳数值。

## 验证

```bash
npm test
npm run build:preview -- --emptyOutDir
node frontend/preview-check.mjs
npm run build
node frontend/trade-flow-check.mjs
```

前者检查静态预览、320/390/430/1440 像素视口、图片与交互；后者启动隔离数据库及 API，以两个独立浏览器会话检查双边流程。测试数据不写入常用数据库。`frontend/browser-check.mjs` 为双边检查的兼容入口。

## 协作

此原型位于课程仓库 `prototypes/campus-market`，与 `prototypes/csu-swap` 并行保留。按任务临时认领，不固定两人的职责；接口变化先修改本文件并共同确认。按仓库要求通过任务分支和 Pull Request 审阅，不直接替换伙伴原型或其部署。Sites 的托管标识不纳入此副本，伙伴服务器使用本文的独立前后端部署流程。

## 图片来源

示例图片下载自 `images.unsplash.com`，文件 ID：camera `photo-1516035069371-29a1b244cc32`，books `photo-1544947950-fa07a98d237f`，headphones `photo-1546435770-a3e426bf472b`，lamp `photo-1507473885765-e6ed057f782c`，bike `photo-1485965120184-e220f721d03e`，bag `photo-1553062407-98eeb64c6a62`，shoes `photo-1542291026-7eec264c27ff`，cup `photo-1514228742587-6b1558fcca3d`。正式作品应替换为经许可的真实校园闲置照片。
