# DrillBox

📱 **手机优先的刷题系统（错题本 / 易错标记 / 反复练习）**

DrillBox 是一个轻量、可自部署的刷题网站，适合记忆型题库（如填空题、判断题、选择题）。  
强调 **刷题体验** 而不是教务管理，支持错题自动记录、手动标注易错题，并可反复练习。

> 技术栈：Fastify + SQLite + 原生 HTML/CSS/JS  
> 资源占用低，1C / 1G RAM 的 VPS 即可运行。

---
## 一键安装 DrillBox（Ubuntu，无 nginx）

这会自动：
✔ 安装 Node.js 20 LTS
✔ 克隆/更新代码
✔ 生成 .env
✔ 初始化数据库
✔ 创建 systemd 服务并启动

> 说明：脚本会安装 Node.js 20、克隆代码、生成 `.env`、初始化数据库、创建 systemd 服务并启动。
> 默认安装目录 `/var/www/drillbox`，默认端口 `16666`。

```
curl -fsSL https://raw.githubusercontent.com/dalaohuuu/drillbox/main/install_drillbox.sh | sudo bash


```
### 📌 自定义安装参数
```
curl -fsSL https://raw.githubusercontent.com/dalaohuuu/drillbox/main/install_drillbox.sh | sudo \
  REPO_URL="https://github.com/dalaohuuu/drillbox.git" \
  PORT="16666" \
  APP_PASSCODE="DrillBox2025!" \
  INSTALL_DIR="/var/www/drillbox" \
  bash

```
| 参数             | 作用          |
| -------------- | ----------- |
| `REPO_URL`     | 仓库地址        |
| `PORT`         | Node 后端监听端口 |
| `APP_PASSCODE` | 登录口令        |
| `INSTALL_DIR`  | 安装目录        |

### 📍 安装后检查
- 看服务状态
systemctl status drillbox --no-pager

- 查看日志
journalctl -u drillbox -n 100 --no-pager

- 测试后端是否可达
curl -I http://127.0.0.1:16666/
提示：

若你用 nginx 做反代，确保 nginx 配置里的 proxy_pass 和 PORT 一致

若你用了 HTTPS，检查证书是否正确

## 🔄 后续更新代码只需要
```
cd /var/www/drillbox && \
sudo git pull && \
sudo npm install && \
sudo systemctl restart drillbox
```
或者用脚本（如果你也添加了 scripts/update.sh）：
```
sudo bash scripts/update.sh
```


## ✨ 功能特点

- ✅ **题型友好**
  - 填空 / 文字题：先看题，点击「查看答案」再显示答案与解析
  - 判断题：`1.对 / 2.错`，点击即作答，自动高亮正确答案
  - 单选题：点击选项即作答
  - 多选题：先勾选，点提交后判分
- 📕 **错题本**
  - 答错自动加入错题
  - 支持「只刷错题」
- ⭐ **易错题标记**
  - 手动标注重点题
  - 支持「只刷易错题」
- 📊 **刷题统计**
  - 最近 50 题正确率
  - 错题数 / 易错题数
- 📱 **手机优先 UI**
  - 大按钮、整块可点
  - 适合单手操作

---

## 🧱 项目结构

```text
drillbox/
├─ server/        # 后端（Fastify + SQLite）
├─ public/        # 前端（纯 H5）
├─ data/          # 数据库 & CSV 题库
├─ package.json
└─ README.md
🚀 快速开始
1️⃣ 安装依赖
npm install

2️⃣ 初始化数据库
npm run initdb

3️⃣ 导入题库（CSV）
npm run import:csv -- ./data/sample_questions.csv

4️⃣ 启动服务
npm run start


浏览器访问：

http://localhost:16666

📄 题库格式（CSV）

第一行为表头：

id,type,section,stem,options,answer,analysis


示例：

q1,判断,示例,"涉密载体应当标明密级和保密期限。",,true,"常见保密要求"
q2,单选,示例,"国家秘密的密级分为哪几种？","[""A. 两种"",""B. 三种"",""C. 四种""]",B,"绝密、机密、秘密"
q3,填空,示例,"国家秘密是关系国家____和____的事项。",,"国家安全；国家利益","定义类填空题"


说明：

options：选择题使用 JSON 数组字符串

answer 为空时，题目进入 自评模式

填空题可用 ； 分隔多个空

🔐 登录说明

当前版本使用 简单口令登录（适合个人/小团队）：

在 .env 中设置：

APP_PASSCODE=your-passcode

🧩 适用场景

个人备考 / 记忆型题库

内部培训刷题

不需要复杂权限和教务管理的练习系统

🛠 可扩展方向（未实现）

多用户账号体系

云端同步（多设备）

题库在线管理界面

Docker / 一键部署脚本

📜 License

MIT License