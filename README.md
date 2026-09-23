# Insightra

个人数据工作台。已接通 Tushare 只读行情、原项目产业资料、结构化数据管理与本地文档知识库。健康和家庭读数仍为明确标注的示例。

## 技术结构

- `src/`：Vite + TypeScript + Svelte，页面模块与共享图表组件。
- `src/styles.css`：集中管理三套主题、间距、排版、密度与响应式规则。
- `src/pages/SupplyMap.svelte`：共享产业资料的全行业公司地图与结构观察。
- `backend/app/`：Python + FastAPI，配置、行情、连接检验、文档与 SQLite 生命周期。
- `backend/tests/`：数据库初始化、重复启动及 API 检查。
- `demo/`：本地原始参考资料，不纳入版本控制。

## 环境与启动

需要 Node.js 22.12+、Python 3.12+。依赖安装在项目内；不要求修改系统 PATH。

项目 `.npmrc` 已设置 npmmirror 国内源和下载超时；需要官方源时，可在命令中追加 `--registry=https://registry.npmjs.org`。已锁定兼容 Svelte 检查器的 TypeScript 6。

```powershell
npm ci
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
npm run dev:all
```

前端：<http://127.0.0.1:5173>。后端：<http://127.0.0.1:8000/docs>。
前端通过 Vite 代理访问 `/api`。API 未启动时，示例界面仍可预览，真实数据页面显示错误和重试入口。

macOS/Linux 使用 `python3 -m venv .venv` 和 `.venv/bin/python -m pip install -r backend/requirements.txt`。其余 npm 命令相同。

```powershell
npm run dev       # 仅前端
npm run dev:api   # 仅后端
npm run build     # Svelte/TypeScript 检查与生产构建
npm run test:api  # 后端测试
npm run test:ui   # 浏览器交互与响应式检查，Windows 使用本机 Edge
npm run format    # 统一前端、配置与文档格式
```

SQLite 文件在首次启动 API 时创建于 `data/insightra.sqlite3`，可通过 `INSIGHTRA_DATABASE` 改写路径。包含连接记录、行情缓存、文档与分块表，自动从原版本升级。服务只绑定本机地址，尚不提供远程多用户认证。

仓库仅包含代码和文档，不包含本地数据库、原始产业资料、行情快照、导入文档或凭证。新环境需自行配置数据源并导入资料；文中产业网络规模描述的是本地已导入资料，并非仓库自带数据。`.env.example` 仅提供空配置项。

## 使用

打开右上角“外观设置”，比较中性浅色、纸感暖白、石墨深色，以及舒适/紧凑密度。
产业网络支持全行业公司地图、连接广度与桥接中心性、上下游高亮、缩放、关系明细与保存视图。偏好与保存视图仅写入当前浏览器的 localStorage；不会写入业务数据库。

- **数据连接**：配置 Tushare / Binance 凭证、检验 `trade_cal` 与 `daily`，查看结果与延迟。凭证写入本机 `.env`（未加密，已忽略版本控制），页面不会返回原值。留空保留原配置。Binance 连接器尚未启用。
- **数据管理**：在“资料与视图”中导入 JSON、CSV、TSV、JSONL，使用表格、JSON 树或源码编辑，校验保存并导出。CSV 默认保留文本和前导零；嵌套值导出 CSV 时为 JSON 文本。
- **金融资产**：基于数据绑定的小组件看板，包含大盘云图、市场温度、细分行业、核心指数。可添加组件、调整尺寸与面积指标、移动或删除组件/编组、保存看板、保存编组模板并整体添加。
- **数据源接入**：数据管理 → 数据源 → 接入并同步；同步结果进入只读数据集。小组件库只允许绑定满足标准口径和字段要求的数据集。金融组件不直接调用 Tushare。
- **数据研究**：研究项目、数据集与实验记录工作台；支持新建和保存研究假设。产业网络显示全部 258 家公司与 685 条关系资料的连接，社群和桥接指标由拓扑计算。支持搜索、平移缩放、选中上下游与产品追踪，坐标不随观察操作变化；涨跌演化尚未实现。数据管理中保存修改后可刷新查看。
- **知识空间**：导入 UTF-8 TXT/Markdown、内容去重、自动分块、检索与删除。地图区分合成语义示例与真实分块分布，尚未生成 embedding。
- **健康**：长期趋势、24 小时睡眠节律与逐日记录组成连续日志，支持指标/区间/日期选择；仍为合成示例，可切换到真实空状态。
- **家庭**：点击“编辑家庭布局”，新增/移动/缩放房间、添加家具、旋转和调整尺寸。拖动对象提起并置顶，落点冲突显示红色边缘和阴影；非法放下自动回原位，Esc 取消，合法放置可撤销。地毯允许叠放，其他实体家具不能重叠。保存布局写入本机数据库；环境曲线仍是示例。
- **概览**：连续的市场、研究、知识与生活版面，共享实际行情、文档数与已保存家庭布局。

后续开发遵循 [UI/UX 规范](docs/UI-UX.md)、[架构与能力边界](docs/ARCHITECTURE.md) 及 [项目约定](AGENTS.md)。

行情看板使用最近完整交易日的收盘快照，非实时数据。行业涨跌按 Tushare 分类的股票等权聚合，非官方行业指数。“刷新组件数据”读取已保存数据；从数据源取新行情需在数据管理点击“同步最新数据”。

界面无需外部字体或 CDN 即可运行。浏览器测试在 Windows 使用已安装的 Microsoft Edge；其他系统先运行 `npx playwright install chromium`。
