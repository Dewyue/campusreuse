# 校区文件夹配图

获取日期：2026-10-14。图片来源为中南大学人事处官网 [走进中南](https://rsc.csu.edu.cn/rczp/zjzn.htm) 的校区联系信息区。六张照片已经逐张查看，非 AI 生成，非外部图库替代。页面按照片 alt、地址和对应校区顺序配对；应用保留原有常用校区名称和数据筛选键，没有擅自迁移交易数据。

| 应用名称 | 官网标签 | 原始图片 |
| --- | --- | --- |
| 南校区 | 麓南校区，麓山南路605号 | https://rsc.csu.edu.cn/img/figma/yuelulanxiaoqu.png |
| 新校区 | 潇湘校区，潇湘中路350号 | https://rsc.csu.edu.cn/img/figma/xiaoxiangxiaoqu.png |
| 校本部 | 岳麓山校区，麓山南路932号 | https://rsc.csu.edu.cn/img/figma/yueluxiaoqu.png |
| 铁道校区 | 天心校区，韶山南路 | https://rsc.csu.edu.cn/img/figma/tianxinxiaoqu.png |
| 湘雅新校区 | 杏林校区，桐梓坡路172号 | https://rsc.csu.edu.cn/img/figma/yingxinxiaoqu.png |
| 湘雅老校区 | 开福校区，湘雅路88号 | https://rsc.csu.edu.cn/img/figma/kaifuxiaoqu.png |

原始文件保留于 `frontend/public/images/campuses/`。界面使用 `frontend/assets/campuses/` 中的 WebP 衍生文件，维持 720×440 尺寸，使用 ffmpeg libwebp quality 80 / compression_level 6 压缩，无额外滤镜；由 Vite 生成带内容哈希的资源地址，进入应用时低优先级预加载。服务器部署对 /assets/ 配置长期缓存，HTML 和 API 不受影响。界面通过 object-fit 裁切。仅作为课程原型的校区识别素材；官方公开展示不等于开放许可，权利归原权利人，公开商业使用前需确认授权。不暗示本服务属于学校官方。

交互：文件夹堆叠，六个标签统一左侧；点击向上抽起约 400ms 后进入对应校区列表，并清空旧关键词、品类及免费筛选，避免新校区被旧条件误筛成空。键盘 Enter/Space 可触发，减少动态效果偏好下立即跳转。离开页面卸载组件即取消未完成的转场，不执行延迟跳转。

按用户后续反馈，保留图片无内边框、标签统一左侧；取消毛玻璃覆盖和图片滤镜，恢复清晰原图，标签使用统一不透明浅灰蓝底色。没有修改下载的原始图片。

标签轮廓以平滑 Bezier 曲线过渡，参考 Apple [连续曲率圆角](https://developer.apple.com/documentation/swiftui/roundedcornerstyle/continuous) 的设计方向；这是适配网页文件夹造型的近似，不是宣称复刻原生 SwiftUI 几何参数。原先折线切角已移除。

文件夹区域按动态视口剩余高度布局，扣除页头、底部导航与安全区；六层间距占堆叠区高度的 14%，每层高度 30%，最后一层底部恰好落在区域底部。无需纵向滑动查看第六个文件夹，文字字号不随视口缩放。

取消堆叠区最大高度限制，底部只保留 4px 与导航分隔；桌面也计入应用顶部外边距，避免出现较大的底部留白。
