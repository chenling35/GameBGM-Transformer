"""
任务管理：TaskInfo 类、全局任务字典、子进程运行器
"""
import subprocess
from datetime import datetime
from typing import Optional

# ═══════════════ 常量 ═══════════════
MAX_TASKS = 50            # 任务字典最大容量
MAX_LOGS_PER_TASK = 3000  # 每个任务日志行数上限

# ═══════════════ 全局任务字典 ═══════════════
active_tasks: dict = {}


def _evict_old_tasks():
    """当任务数超过上限时，清除最早完成/失败的任务"""
    done = [t for t in active_tasks.values() if t.status in ("completed", "failed")]
    done.sort(key=lambda t: t.end_time or "")
    for t in done[:max(0, len(active_tasks) - MAX_TASKS + 1)]:
        del active_tasks[t.task_id]


# ═══════════════ TaskInfo ═══════════════
class TaskInfo:
    def __init__(self, task_id: str, task_type: str, description: str):
        self.task_id = task_id
        self.task_type = task_type
        self.description = description
        self.status = "running"
        self.logs: list[str] = []
        self.process: Optional[subprocess.Popen] = None
        self.start_time = datetime.now().isoformat()
        self.end_time: Optional[str] = None
        self.result_files: list[str] = []

    def to_dict(self):
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "description": self.description,
            "status": self.status,
            "logs": self.logs[-200:],
            "log_count": len(self.logs),
            "start_time": self.start_time,
            "end_time": self.end_time,
            "result_files": self.result_files,
        }


# ═══════════════ 通用子进程运行器 ═══════════════
def run_subprocess_task(task: TaskInfo, command: list[str], cwd: str):
    """在后台线程中运行子进程并捕获输出"""
    try:
        task.logs.append(f"[系统] 启动命令: {' '.join(command)}")
        task.logs.append(f"[系统] 工作目录: {cwd}")
        task.logs.append("")

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=cwd,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        task.process = process

        for line in iter(process.stdout.readline, ""):
            if len(task.logs) < MAX_LOGS_PER_TASK:
                task.logs.append(line.rstrip())
            elif len(task.logs) == MAX_LOGS_PER_TASK:
                task.logs.append("[系统] 日志已达上限，后续输出已截断")

        process.wait()

        if process.returncode == 0:
            task.status = "completed"
            task.logs.append("")
            task.logs.append("[系统] 任务完成!")
        else:
            task.status = "failed"
            task.logs.append("")
            task.logs.append(f"[系统] 任务失败，返回码: {process.returncode}")

    except Exception as e:
        task.status = "failed"
        task.logs.append(f"[系统] 错误: {str(e)}")
    finally:
        task.end_time = datetime.now().isoformat()
        task.process = None
