# 项目技术亮点（答辩素材）

> 毕业设计：基于情感驱动的游戏 BGM 生成系统
> 答辩年份：2026
> 核心模型：EMO-Disentanger (ISMIR 2024) + midi-emotion (IEEE Access 2022)

---

## 一、核心创新点

1. **双模型并行架构，覆盖离散与连续两种情感范式**
   同一系统中集成 EMO-Disentanger（离散 Q1-Q4 四象限）与 midi-emotion（连续 V/A 浮点数）两套独立生成路径，用户可自由切换，实验对比不同情感建模粒度对生成效果的影响。

2. **两阶段解耦设计，将效价（Valence）与唤醒度（Arousal）分离建模**
   Stage 1（Transformer-XL）负责 lead sheet 生成，仅感知效价（Positive/Negative）；Stage 2（GPT-2/Performer）在演奏层面引入唤醒度区分（Q1 vs Q4，Q2 vs Q3），与 Russell 环形模型的二维结构严格对应。

3. **Functional Representation 保证调性不变性**
   使用相对音阶度数（scale degree）和罗马数字和弦标记（I, ii, V7）替代绝对 MIDI 音高，模型在任意调性下训练的知识可以无损迁移，提升跨调泛化能力。

4. **全链路 Web 系统，从情感输入到音频试听一键完成**
   FastAPI 异步任务队列 + React 19 前端实时日志流，将复杂的命令行推理流程封装为可视化操作界面，降低使用门槛，同时通过 FluidSynth 在线完成 MIDI→WAV 转换，无需本地音频软件。

5. **VGMusic 大规模游戏数据集分析与可行性评估**
   对 31,800 首游戏 MIDI（VGMusic 数据库）进行系统性兼容性分析，定量揭示其与 EMO-Disentanger 数据格式的差距（0% 和弦标注、74% 含鼓轨、平均 7.8 轨/曲），为后续 midi-emotion 训练路径的选择提供数据支撑。

---

## 二、技术难点与解决方案

### 问题 1：EMO-Disentanger Stage 1 强制生成双效价文件，无法只生成目标情感

**背景**: Stage 1 脚本每次推理固定同时输出 `samp_XX_Positive.mid` 和 `samp_XX_Negative.mid`，即使用户只需要 Q1（正效价），也会产生 Negative 中间文件。

**解决方案**: 后端在 Stage 2 推理完成后，根据用户指定情感（Q1/Q4 → Positive，Q2/Q3 → Negative）自动删除不需要的 valence 中间文件，最终产物 `samp_XX_Q{N}_full.mid` 与用户选择完全对应，前端按 `*_{emotion}_full.mid` 模式过滤展示。

---

### 问题 2：FluidSynth 路径在不同系统/安装方式下不固定

**背景**: Windows 用户安装 FluidSynth 后路径各异（Program Files、自定义目录、PATH 未配置等），直接调用 `fluidsynth` 命令会失败。

**解决方案**: 实现三层自动检测策略：① 检查系统 PATH（`shutil.which`）→ ② 遍历 Windows 常见安装路径（`glob` 模式匹配）→ ③ 检查项目内置 `tools/` 目录。前端 `/api/status` 接口实时反馈 FluidSynth 状态，用户可直观判断是否配置正确。

---

### 问题 3：midi-emotion 推理进度不可见（generate.py 用 `end=" "` 无换行输出倒计时）

**背景**: midi-emotion 的 `generate.py` 用空格分隔而非换行符输出剩余 token 倒计时数字，标准的逐行读取无法获取进度。

**解决方案**: 后端改用逐字符读取子进程输出，累积字符后检测数字 token，根据 `(gen_len - remaining) / gen_len` 计算百分比，每 10% 输出一次进度日志，解决了前端长时间无日志更新的问题。

---

### 问题 4：前端 Tab 切换导致生成状态丢失

**背景**: 用户在生成任务运行期间切换 Tab，若用条件渲染（`v-if` / `&&` 判断）会卸载组件，丢失轮询状态和已有日志。

**解决方案**: Tab 切换采用 CSS `display: none` 方案保持所有组件始终挂载（不卸载），隐藏状态下轮询继续运行，切换回来后日志无缝衔接。

---

### 问题 5：VGMusic 数据与 EMO-Disentanger 格式完全不兼容

**背景**: EMO-Disentanger 要求三轨钢琴（melody/texture/bass）、100% 和弦标注、Q1-Q4 情感标签，而 VGMusic 平均 7.8 轨、无和弦标注、无情感标签。

**解决方案**: 放弃将 VGMusic 直接接入 EMO-Disentanger 的方案，改用 midi-emotion 模型（Pianoroll 表示，多乐器，无需和弦标注），设计"VGMusic 无监督预训练 → EMOPIA 情感微调"的两阶段训练策略，并形成详细可行性报告（`docs/FEASIBILITY_REPORT.md`）。

---

## 三、与 Baseline 对比

| 对比维度 | EMO-Disentanger 原版（Baseline）| 本系统扩展 |
|---------|--------------------------------|-----------|
| 情感粒度 | 离散 4 类（Q1-Q4）| 离散 + 连续（V/A 浮点，理论上无限）|
| 乐器支持 | 仅钢琴 | 钢琴 + 多乐器（midi-emotion 路径）|
| 使用方式 | 纯命令行，需配置 Python 环境 | Web UI，浏览器即开即用 |
| 音频试听 | 需本地 MIDI 播放软件 | 内置 FluidSynth 在线转换，浏览器直接播放 |
| 进度反馈 | 命令行 stdout，无结构化 | 实时日志流，百分比进度，任务状态机 |
| 训练管理 | 手动调用脚本 | Web 界面配置超参，后台异步执行 |
| 数据支持 | EMOPIA（1087首标注钢琴）| + VGMusic（31,800首游戏MIDI，midi-emotion路径）|
| 对比实验 | 无 | 两模型并行可切换，便于定量/定性对比 |

---

## 四、答辩常见问题与参考回答

### Q1：为什么选择 EMO-Disentanger 而不是更新的模型？

**参考回答**：

EMO-Disentanger 是 ISMIR 2024 的工作，代表当前情感音乐生成的前沿水平。它的核心创新——两阶段解耦架构——直接对应 Russell 环形模型的 Valence×Arousal 二维分解，理论上有明确动机，不是黑盒 end-to-end。

更重要的是，本项目并不是"只用 EMO-Disentanger"，而是将其作为 baseline，同时集成了 IEEE Access 2022 的 midi-emotion 模型提供连续情感控制，构成了"离散 vs 连续"的对比实验框架。这恰好踩在学术界关于情感表示粒度的核心争议上，有一定研究价值。

---

### Q2：两个模型生成质量如何对比，哪个更好？

**参考回答**：

这取决于评估维度：

- **情感准确性**：midi-emotion 的连续 V/A 条件理论上更精细，但 EMO-Disentanger 的 Functional Representation（调性不变性）在和声结构上更规整，风格更接近古典钢琴乐。
- **多样性**：midi-emotion 支持多乐器，生成风格更接近现代游戏 BGM；EMO-Disentanger 输出纯钢琴，风格统一。
- **客观指标**：可以用 MV（Music Valence）、MIREX 情感分类准确率等指标量化，具体实验数据见实验记录。

实践中，两个模型各有适用场景，双模型架构的意义正在于此——让用户根据需求选择合适的生成路径。

---

### Q3：系统对 RTX 3060 6GB 显存是否有特殊优化？

**参考回答**：

有以下几点针对性处理：

1. **EMO-Disentanger**：Stage 1 使用 Transformer-XL（序列长度可控），Stage 2 使用 GPT-2（6层，嵌入维度 512），单卡显存需求约 2-3GB，RTX 3060 完全胜任。
2. **midi-emotion 训练**：批大小默认设为 8，`tgt_len=512`，实测显存占用约 4-5GB，留有余量。如遇 OOM，可通过 Web 界面将 `batch_size` 调低至 4。
3. **推理阶段**：两个模型推理时均不需要梯度，显存需求进一步降低，可在 4GB 显存环境下运行。
4. **CPU Fallback**：后端设备检测自动识别环境，无 GPU 时回退到 CPU 运行（速度较慢，但可用）。

---

### Q4：Functional Representation 是什么，为什么比标准 REMI 好？

**参考回答**：

标准 REMI 使用绝对 MIDI 音高（0-127）表示音符，模型学到的是"C大调的I级和弦用C-E-G表示"。如果训练数据以C大调为主，模型在其他调性上会表现差。

Functional Representation 改用相对表示：音高用音阶度数（第1音、第2音...），和弦用罗马数字（I, ii, V7）。这样"I级大三和弦"不管在什么调性里都是同一个 token，模型在不同调性间的知识可以共享。

对于游戏 BGM 来说，曲目调性多样（C、G、D、F 等），这个特性尤其重要——同一份模型权重可以生成各种调性的音乐，而无需对每个调性分别训练。

---

### Q5：如果模型权重没有经过充分训练，生成结果质量如何保证？

**参考回答**：

系统的稳健性设计分两层：

**第一层（保底）**：EMO-Disentanger 使用论文作者提供的预训练权重（在 EMOPIA 数据集上训练至 ep300，验证损失 0.120），这是已发表论文配套的 checkpoint，质量有保证。即使 midi-emotion 训练不完整，EMO-Disentanger 路径始终可用。

**第二层（扩展）**：midi-emotion 的预训练权重来自 Lakh MIDI 数据集（~170K 首），在此基础上 fine-tune 1500 步即可适应新数据，门槛较低。如果训练时间不足，可以直接用未 fine-tune 的预训练权重演示连续 V/A 情感控制能力，重点在于展示框架设计而非最优生成质量。

评审老师关注的往往是系统架构的合理性和技术路线的创新性，而非单一模型是否训练到最优。
