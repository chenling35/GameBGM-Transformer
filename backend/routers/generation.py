"""
EMO-Disentanger 两阶段生成接口
POST /api/tasks/generate
"""
import sys
import time
import uuid
import random
import threading
import subprocess
from datetime import datetime

from fastapi import APIRouter

from config import (
    BASE_DIR, EMO_DIR,
    DEFAULT_WEIGHTS, DEFAULT_CONFIGS,
    EMOTION_MAP, EMOTION_TO_VALENCE,
)
from models import GenerateRequest
from tasks import active_tasks, TaskInfo, MAX_LOGS_PER_TASK, _evict_old_tasks

router = APIRouter(prefix="/api/tasks", tags=["EMO-Disentanger"])


def run_full_generation(task: TaskInfo, req: GenerateRequest):
    """完整的两阶段生成流程：Stage1 Lead Sheet → Stage2 Accompaniment"""
    try:
        emotion = req.emotion
        valence = EMOTION_TO_VALENCE.get(emotion, "Positive")
        emotion_name = EMOTION_MAP.get(emotion, {}).get("name", emotion)

        # 生成随机种子用于日志追踪（EMO-Disentanger 脚本本身不接受 --seed 参数，
        # 每次生成天然随机，此种子仅作记录用途）
        run_seed = random.randint(100000, 999999)

        task.logs.append(f"[系统] 目标情感: {emotion} {emotion_name}")
        task.logs.append(f"[系统] 效价: {valence} | 模型: {req.model_type}")
        task.logs.append(f"[系统] 本次随机种子（记录用）: {run_seed}")
        task.logs.append("")
        task.logs.append("=" * 50)
        task.logs.append("  Stage 1: 生成 Lead Sheet (主旋律 + 和弦)")
        task.logs.append("=" * 50)
        task.logs.append("")

        # Stage 1: Lead Sheet
        # req.output_dir 是相对于项目根的路径（如 EMO-Disentanger/generation/emopia_functional_two）
        # cwd 是 EMO_DIR（EMO-Disentanger/），所以 -o 需要去掉前缀
        rel_output = (
            req.output_dir.replace("EMO-Disentanger/", "", 1)
            if req.output_dir.startswith("EMO-Disentanger/")
            else req.output_dir
        )
        s1_weights = req.stage1_weights if req.stage1_weights else DEFAULT_WEIGHTS["stage1"]
        stage1_cmd = [
            sys.executable,
            "stage1_compose/inference.py",
            "-c", DEFAULT_CONFIGS["stage1_finetune"],
            "-r", "functional",
            "-m", "lead_sheet",
            "-i", s1_weights,
            "-o", rel_output,
            "-n", str(req.n_groups),
        ]
        task.logs.append(f"[Stage1] 命令: {' '.join(stage1_cmd)}")
        task.logs.append("")

        process = subprocess.Popen(
            stage1_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, cwd=str(EMO_DIR), bufsize=1, encoding="utf-8", errors="replace",
        )
        task.process = process
        for line in iter(process.stdout.readline, ""):
            if len(task.logs) < MAX_LOGS_PER_TASK:
                task.logs.append(line.rstrip())
            elif len(task.logs) == MAX_LOGS_PER_TASK:
                task.logs.append("[系统] 日志已达上限，后续输出已截断")
        process.wait()

        if process.returncode != 0:
            task.status = "failed"
            task.logs.append(f"[Stage1] 失败，返回码: {process.returncode}")
            return

        task.logs.append("")
        task.logs.append("[Stage1] Lead Sheet 生成完成!")

        # 优化: 移除不需要的效价文件（.mid + _roman.txt），减少 Stage2 处理量
        opposite_valence = "Negative" if valence == "Positive" else "Positive"
        output_path = BASE_DIR / req.output_dir
        removed_count = 0
        for f in output_path.glob(f"samp_*_{opposite_valence}*"):
            f.unlink()
            removed_count += 1
        if removed_count > 0:
            task.logs.append(f"[优化] 跳过 {opposite_valence} 效价，移除 {removed_count} 个无关文件")

        task.logs.append("")
        task.logs.append("=" * 50)
        task.logs.append(f"  Stage 2: 生成 {emotion} 完整演奏 (伴奏 + 表现力)")
        task.logs.append("=" * 50)
        task.logs.append("")

        # Stage 2: Accompaniment
        stage2_config = "stage2_finetune_gpt2" if req.model_type == "gpt2" else "stage2_finetune_performer"
        stage2_weights_key = "stage2_gpt2" if req.model_type == "gpt2" else "stage2_performer"
        s2_weights = req.stage2_weights if req.stage2_weights else DEFAULT_WEIGHTS[stage2_weights_key]

        stage2_cmd = [
            sys.executable,
            "stage2_accompaniment/inference.py",
            "-m", req.model_type,
            "-c", DEFAULT_CONFIGS[stage2_config],
            "-r", "functional",
            "-i", s2_weights,
            "-o", rel_output,
        ]
        task.logs.append(f"[Stage2] 命令: {' '.join(stage2_cmd)}")
        task.logs.append("")

        # 每个 lead sheet 生成 2 个 full 文件（如 Positive → Q1 + Q4）
        expected_files = req.n_groups * 2
        task.logs.append(f"[Stage2] 预计生成 {expected_files} 个文件，请耐心等待...")
        task.logs.append("")

        process2 = subprocess.Popen(
            stage2_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, cwd=str(EMO_DIR), bufsize=1, encoding="utf-8", errors="replace",
        )
        task.process = process2

        # 进度监控: 每 60 秒检查已生成的 *_full.mid 文件数（只统计本次新增）
        stage2_done = threading.Event()
        stage2_start = time.time()
        # 记录 Stage2 开始前已存在的文件，避免把遗留文件当新文件
        existing_files = set(
            f.name for f in list(output_path.glob("*.mid")) + list(output_path.glob("*.midi"))
        )

        def monitor_progress():
            known_new = set()  # 本次已报告过的新文件
            while not stage2_done.is_set():
                stage2_done.wait(60)
                if stage2_done.is_set():
                    break
                current_files = {
                    f.name: f
                    for f in list(output_path.glob("*.mid")) + list(output_path.glob("*.midi"))
                }
                # 只看本次新生成的（不在启动前就存在的）
                new_files = {n: f for n, f in current_files.items() if n not in existing_files}
                # 报告还没报告过的
                for name, f in sorted(new_files.items()):
                    if name not in known_new:
                        size_kb = f.stat().st_size / 1024
                        task.logs.append(f"[Stage2] 新文件: {name} ({size_kb:.1f} KB)")
                        known_new.add(name)
                count = len(new_files)
                elapsed = int(time.time() - stage2_start)
                mins, secs = divmod(elapsed, 60)
                task.logs.append(f"[Stage2] 进度: {count}/{expected_files} 文件 | {mins}分{secs}秒")

        monitor_thread = threading.Thread(target=monitor_progress, daemon=True)
        monitor_thread.start()

        for line in iter(process2.stdout.readline, ""):
            task.logs.append(line.rstrip())
        process2.wait()
        stage2_done.set()

        elapsed_total = int(time.time() - stage2_start)
        mins, secs = divmod(elapsed_total, 60)
        task.logs.append(f"[Stage2] 完成，耗时 {mins:02d}:{secs:02d}")

        if process2.returncode != 0:
            task.status = "failed"
            task.logs.append(f"[Stage2] 失败，返回码: {process2.returncode}")
            return

        # 清理 Stage 1 中间文件（.mid lead sheet + _roman.txt，Stage 2 已用完）
        removed_stage1 = 0
        for pattern in ["samp_*_Positive.mid", "samp_*_Negative.mid",
                         "samp_*_Positive.txt", "samp_*_Negative.txt",
                         "samp_*_Positive_roman.txt", "samp_*_Negative_roman.txt"]:
            for f in output_path.glob(pattern):
                f.unlink()
                removed_stage1 += 1
        if removed_stage1 > 0:
            task.logs.append(f"[清理] 移除 {removed_stage1} 个 Stage 1 中间文件")

        # 列出生成的目标情感文件
        output_path = BASE_DIR / req.output_dir
        result_files = sorted(list(output_path.glob("*.mid")) + list(output_path.glob("*.midi")))

        task.logs.append("")
        task.logs.append("=" * 50)
        task.logs.append(f"  生成完成! 目标情感 {emotion} {emotion_name} 的文件:")
        task.logs.append("=" * 50)
        for f in result_files:
            task.logs.append(f"  {f.name}  ({f.stat().st_size / 1024:.1f} KB)")
            task.result_files.append(str(f))

        if not result_files:
            task.logs.append(f"  (未找到 {emotion} 文件，请检查生成目录)")

        task.status = "completed"
        task.logs.append("")
        task.logs.append("[系统] 全部完成!")

    except Exception as e:
        task.status = "failed"
        task.logs.append(f"[系统] 错误: {str(e)}")
    finally:
        task.end_time = datetime.now().isoformat()
        task.process = None


@router.post("/generate")
async def start_generate(req: GenerateRequest):
    """统一的情感音乐生成接口 (Stage1 + Stage2)"""
    _evict_old_tasks()
    task_id = str(uuid.uuid4())[:8]
    emotion_name = EMOTION_MAP.get(req.emotion, {}).get("name", req.emotion)

    task = TaskInfo(task_id, "generate", f"生成 {req.emotion} {emotion_name} 风格音乐")
    active_tasks[task_id] = task

    thread = threading.Thread(target=run_full_generation, args=(task, req), daemon=True)
    thread.start()

    return {"task_id": task_id, "message": f"开始生成 {req.emotion} {emotion_name} 风格音乐"}
