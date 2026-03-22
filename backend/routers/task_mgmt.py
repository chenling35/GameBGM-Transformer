"""
任务管理接口：查询、终止、删除
GET    /api/tasks
GET    /api/tasks/{task_id}
POST   /api/tasks/{task_id}/stop
DELETE /api/tasks/{task_id}
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException

from tasks import active_tasks

router = APIRouter(prefix="/api/tasks", tags=["任务管理"])


@router.get("")
async def list_tasks():
    return {"tasks": [t.to_dict() for t in active_tasks.values()]}


@router.get("/{task_id}")
async def get_task(task_id: str, offset: int = 0):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    result = task.to_dict()
    if offset > 0:
        result["logs"] = task.logs[offset:]
    result["log_offset"] = len(task.logs)
    return result


@router.post("/{task_id}/stop")
async def stop_task(task_id: str):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.process:
        task.process.terminate()
        task.status = "stopped"
        task.logs.append("[系统] 任务已手动终止")
        task.end_time = datetime.now().isoformat()
        return {"message": "任务已终止"}
    return {"message": "任务未在运行"}


@router.delete("/{task_id}")
async def delete_task(task_id: str):
    task = active_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status == "running":
        raise HTTPException(status_code=400, detail="无法删除正在运行的任务")
    del active_tasks[task_id]
    return {"message": "任务已删除"}
