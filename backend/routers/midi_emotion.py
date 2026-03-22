"""
midi-emotion 连续 V/A 情感生成接口
POST /api/tasks/generate_v2
"""
import os
import sys
import uuid
import random
import threading
import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter

from config import BASE_DIR
from models import GenerateV2Request
from tasks import active_tasks, TaskInfo, MAX_LOGS_PER_TASK, _evict_old_tasks

router = APIRouter(prefix="/api/tasks", tags=["midi-emotion"])


def run_midi_emotion_generate(task: TaskInfo, req: GenerateV2Request):
    """真实 midi-emotion 推理：逐个 sample 调用 generate.py"""
    try:
        model_dir = req.checkpoint if req.checkpoint else "continuous_concat"
        midi_emotion_src = str(BASE_DIR / "midi-emotion" / "src")

        task.logs.append("[系统] midi-emotion 生成任务已启动")
        task.logs.append(f"[参数] valence={req.valence:+.2f}  arousal={req.arousal:+.2f}")
        task.logs.append(f"[参数] gen_len={req.gen_len}  n_samples={req.n_samples}  模型={model_dir}")
        task.logs.append("")

        for i in range(req.n_samples):
            seed = random.randint(1, 999999)
            task.logs.append(f"[生成] sample {i+1}/{req.n_samples}  seed={seed}")

            command = [
                sys.executable, "generate.py",
                "--model_dir", model_dir,
                "--conditioning", "continuous_concat",
                "--valence", f"{req.valence:.4f}",
                "--arousal", f"{req.arousal:.4f}",
                "--gen_len", str(req.gen_len),
                "--batch_size", "1",
                "--seed", str(seed),
                "--min_n_instruments", "1",
                # 不用 --quiet，让倒计时数字输出以便追踪进度
            ]
            # 抑制 FutureWarning 等噪音
            env = os.environ.copy()
            env["PYTHONWARNINGS"] = "ignore::FutureWarning"

            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=midi_emotion_src,
                bufsize=1,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            task.process = process

            # 逐字符读取，解析倒计时数字进度（generate.py 用 end=" " 无换行输出）
            gen_len_val = req.gen_len
            last_progress_pct = -1
            word_buf = ""
            line_buf = ""

            def flush_word(w):
                nonlocal last_progress_pct
                if w.isdigit():
                    remaining = int(w)
                    pct = int((gen_len_val - remaining) / gen_len_val * 100)
                    if pct // 10 > last_progress_pct // 10:
                        last_progress_pct = pct
                        task.logs.append(
                            f"[progress:{pct}] 生成中 {gen_len_val - remaining}/{gen_len_val} tokens ({pct}%)"
                        )

            for ch in iter(lambda: process.stdout.read(1), ""):
                if ch == " ":
                    flush_word(word_buf)
                    word_buf = ""
                elif ch == "\n":
                    flush_word(word_buf)
                    word_buf = ""
                    if line_buf.strip() and "FutureWarning" not in line_buf:
                        task.logs.append(line_buf.strip())
                    line_buf = ""
                else:
                    if word_buf.isdigit() or not word_buf:
                        word_buf += ch
                    else:
                        line_buf += word_buf + ch
                        word_buf = ""
            # 处理末尾残留
            if word_buf:
                flush_word(word_buf)
            if line_buf.strip() and "FutureWarning" not in line_buf:
                task.logs.append(line_buf.strip())
            process.wait()

            if process.returncode != 0:
                task.logs.append(f"[错误] sample {i+1} 生成失败，返回码: {process.returncode}")
                task.status = "failed"
                return
            else:
                task.logs.append(f"[完成] sample {i+1} 生成成功")
                task.logs.append("")

        # 列出生成的文件
        gen_dir = BASE_DIR / "midi-emotion" / "output" / model_dir / "generations" / "inference"
        if gen_dir.exists():
            midi_files = sorted(gen_dir.glob("*.mid"), key=lambda f: f.stat().st_mtime, reverse=True)
            recent = midi_files[:req.n_samples]  # 最新生成的文件

            # 文件前缀重命名
            if req.file_prefix:
                renamed = []
                for f in recent:
                    new_name = f"{req.file_prefix}_{f.name}"
                    new_path = f.parent / new_name
                    f.rename(new_path)
                    renamed.append(new_path)
                    task.logs.append(f"[重命名] {f.name} → {new_name}")
                recent = renamed

            task.logs.append(f"[结果] 生成目录: {gen_dir}")
            for f in recent:
                fp = Path(f) if not isinstance(f, Path) else f
                task.logs.append(f"  {fp.name}  ({fp.stat().st_size / 1024:.1f} KB)")
                task.result_files.append(str(fp))

        task.status = "completed"
        task.logs.append("")
        task.logs.append("[系统] 全部生成完成!")

    except Exception as e:
        task.status = "failed"
        task.logs.append(f"[系统] 错误: {str(e)}")
    finally:
        task.end_time = datetime.now().isoformat()
        task.process = None


@router.post("/generate_v2")
async def start_generate_v2(req: GenerateV2Request):
    """midi-emotion 连续 V/A 情感生成接口"""
    _evict_old_tasks()
    task_id = str(uuid.uuid4())[:8]
    desc = (
        f"[midi-emotion] V={req.valence:+.2f} A={req.arousal:+.2f} "
        f"× {req.n_samples} samples"
    )
    task = TaskInfo(task_id, "generate_v2", desc)
    active_tasks[task_id] = task

    thread = threading.Thread(target=run_midi_emotion_generate, args=(task, req), daemon=True)
    thread.start()

    return {"task_id": task_id, "message": desc}
