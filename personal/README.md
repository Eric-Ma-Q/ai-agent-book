# 读者数据目录

`personal/` 存放阅读时产生的数据：划线、笔记、插入的补充、题库进度与实验台的运行记录。它与作者的书稿（`book*/`）分开，作者更新书稿时不会覆盖这里。

公开仓库默认不包含任何读者数据，本目录在第一次运行时自动创建；没有它阅读器也能启动，只是暂时没有笔记。

## 目录约定

| 路径 | 内容 | 由谁写入 |
|---|---|---|
| `notes/<语言>/chapterN.json` | 该章的划线与笔记，使用阅读器自己的备份格式 | 阅读器（划线、写笔记时） |
| `notes/<语言>/chapterN.drafts.json` | 未保存的笔记草稿 | 阅读器（每次按键） |
| `inserts/<语言>/chapterN/<id>.md` | 一条插入的补充，Markdown 加 frontmatter | 阅读器，也可直接用编辑器改 |
| `annotations/<语言>/chapterN.json` | 该章的阅读批注（术语、出处、人物、勘误、延伸） | 只读，阅读器不写这个文件 |
| `harness/favorites.json` | 题库收藏，只存题库 id 与题号 | 阅读器 |
| `harness/progress/<题库>.json` | 答题草稿、历次成绩与错题本 | 阅读器 |
| `lab/models.json` | 模型档案（接口地址、模型 ID、推理档位、单价），不含密钥 | 设置页或实验台 |
| `lab/models.keys.json` | 模型密钥，权限 600 | 设置页或实验台 |
| `lab/runs/` | 每次运行的轨迹（JSONL） | 实验台 |
| `lab/evals/` | 评估报告与趋势数据 | 实验台 |
| `lab/rules.json`、`lab/memory.json` | 学习规则与跨会话记忆 | 实验台 |
| `lab/pricing/` | 模型价格目录缓存 | 实验台 |
| `lab/page-assistant/<run_id>/` | 随页问答的页面快照、视口截图与 workspace | 实验台 |
| `update/token`、`update/status.json`、`update/cache.json` | 更新中心的管理员 token、状态与检查缓存 | 更新脚本与阅读器 |

`<语言>` 是书稿目录的后缀（例如 `book`、`book-en`、`book-ja`），`<题库>` 是题库 id。这些目录由阅读器按需创建，不需要手动准备。

## 文件格式

划线文件与阅读器的「导出备份」格式一致，因此可以互相导入导出：

```json
{
  "format": "ai-agent-book-highlights",
  "version": 2,
  "highlights": [
    {
      "id": "唯一 id",
      "chapter": "ai-agents-in-depth:zh-CN:chapter2",
      "quote": "被划线的原文",
      "prefix": "前文片段",
      "suffix": "后文片段",
      "start": 120,
      "end": 138,
      "createdAt": "2025-10-01T10:00:00.000Z",
      "note": "可选：我的笔记"
    }
  ]
}
```

补充文件用 frontmatter 记录位置，正文就是补充内容，可以直接用编辑器修改：

```markdown
---
after: "所跟随段落的开头文字"
section: "所在小节的标题 id"
offset: 2
created: "2025-10-01T10:00:00.000Z"
updated: "2025-10-01T10:00:00.000Z"
---

这里写补充内容，支持公式与代码块。
```

`after` 是主要定位依据；作者改写了原段落时，退回 `section` 内第 `offset` 个块；整个小节被删除时，补充会显示在章末的「未能定位的补充」里。改 `after` 即可重新定位。

批注文件每条由 `quote`、`kind`、`title`、`body` 与 `sources` 组成。`quote` 在章内出现多次时，用 `context`（包含它且全章唯一的一段原文）指定位置；匹配忽略空白差异，代码块、标题、链接与图注不参与匹配。对不上的批注会被跳过，浏览器控制台会给出条数。

## 备份与迁移

- 笔记与补充是纯文本，直接复制本目录即可；也可以把本目录放进自己的私有 git 仓库。
- 划线与笔记也可以用阅读器的「导出备份」导出为 JSON。
- 题库的「导出全部记录」会把答题进度导出为 JSON；`harness/progress/` 不参与任何自动同步。
- `lab/runs/` 与 `lab/page-assistant/` 会随时间变大，可以按目录删除旧的运行记录，不影响新的提问。

## 不要提交

`personal/` 已在 `.gitignore` 中排除。不要把它提交到公开仓库：笔记、题库进度与模型档案都属于个人数据，`lab/models.keys.json` 与 `update/token` 则是密钥。分享仓库前用 `git status` 确认没有把它们带进暂存区。

需要换一个数据目录（例如测试时），阅读器用环境变量 `PERSONAL_DIR` 指定绝对路径，实验台用 `LAB_PERSONAL_DIR`（或 `LAB_DATA_DIR` 只改实验台数据）；两者指向同一份目录时笔记与实验台数据仍然互通。
