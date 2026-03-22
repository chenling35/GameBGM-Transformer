"""
情感音乐生成系统 - FastAPI 后端入口
职责：app 初始化 + CORS + 注册 Router
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import system, generation, midi_emotion, training, task_mgmt, files

app = FastAPI(
    title="情感音乐生成系统",
    description="基于 EMO-Disentanger 的情感驱动钢琴音乐生成",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册所有 Router
app.include_router(system.router)
app.include_router(generation.router)
app.include_router(midi_emotion.router)
app.include_router(training.router)
app.include_router(task_mgmt.router)
app.include_router(files.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
