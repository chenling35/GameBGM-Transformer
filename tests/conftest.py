# 运行方式：cd 项目根目录 && pytest tests/ -v
# conftest.py 统一管理测试 fixtures，pytest 会自动加载此文件

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# 将项目根目录加入 sys.path，使 backend.main 可被导入
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """
    创建 FastAPI TestClient，供所有测试函数共享。
    scope="session" 表示整个测试会话只创建一次，避免重复初始化开销。
    TestClient 会自动触发 FastAPI 的 lifespan 事件（如有）。
    """
    with TestClient(app) as c:
        yield c
