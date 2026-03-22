"""
训练接口
POST /api/tasks/train   — EMO-Disentanger Stage1/Stage2
POST /api/tasks/train_v2 — midi-emotion 微调
"""
import sys
import uuid
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import BASE_DIR, EMO_DIR, DEFAULT_CONFIGS
from models import TrainRequest, TrainV2Request
from tasks import active_tasks, TaskInfo, run_subprocess_task, _evict_old_tasks

router = APIRouter(prefix="/api/tasks", tags=["训练"])


@router.post("/train")
async def start_training(req: TrainRequest):
    _evict_old_tasks()
    task_id = str(uuid.uuid4())[:8]

    config_path = DEFAULT_CONFIGS.get(req.config, req.config)

    if req.stage == "stage1":
        command = [
            sys.executable,
            "stage1_compose/train.py",
            "-c", config_path,
            "-r", req.representation,
        ]
        desc = f"Stage1 训练 ({req.representation})"
    else:
        command = [
            sys.executable,
            "stage2_accompaniment/train.py",
            "-m", req.model_type,
            "-c", config_path,
            "-r", req.representation,
        ]
        desc = f"Stage2 训练 ({req.model_type}, {req.representation})"

    task = TaskInfo(task_id, "training", desc)
    active_tasks[task_id] = task

    thread = threading.Thread(
        target=run_subprocess_task,
        args=(task, command, str(EMO_DIR)),
        daemon=True,
    )
    thread.start()

    return {"task_id": task_id, "message": f"训练任务已启动: {desc}"}


@router.post("/train_v2")
async def start_training_v2(req: TrainV2Request):
    """midi-emotion 微调训练"""
    _evict_old_tasks()
    task_id = str(uuid.uuid4())[:8]

    # 数据集路径映射
    dataset_dirs = {
        "emopia": str(BASE_DIR / "data" / "processed" / "emopia"),
        "vgmusic": str(BASE_DIR / "data" / "processed" / "vgmusic"),
    }
    data_dir = dataset_dirs.get(req.dataset, req.data_dir)
    if not data_dir or not Path(data_dir).exists():
        raise HTTPException(status_code=400, detail=f"数据目录不存在: {data_dir}")

    # 构建命令
    log_step = max(10, req.max_steps // 30)
    command = [
        sys.executable,
        str(BASE_DIR / "src" / "midi_emotion" / "finetune.py"),
        "--data_dir", data_dir,
        "--output_dir", str(BASE_DIR / req.output_dir),
        "--max_steps", str(req.max_steps),
        "--tgt_len", "512",
        "--batch_size", str(req.batch_size),
        "--lr", str(req.lr),
        "--log_step", str(log_step),
        "--eval_step", str(req.eval_step),
    ]
    if req.pretrained:
        command += ["--pretrained", str(BASE_DIR / req.pretrained)]

    dataset_names = {"emopia": "EMOPIA 970首", "vgmusic": "VGMusic 129,650首"}
    ds_label = dataset_names.get(req.dataset, req.data_dir)
    desc = (
        f"[midi-emotion] {ds_label} | "
        f"{req.max_steps}步 bs={req.batch_size} lr={req.lr}"
    )

    task = TaskInfo(task_id, "training", desc)
    active_tasks[task_id] = task

    thread = threading.Thread(
        target=run_subprocess_task,
        args=(task, command, str(BASE_DIR)),
        daemon=True,
    )
    thread.start()

    return {"task_id": task_id, "message": f"训练任务已启动: {desc}"}
