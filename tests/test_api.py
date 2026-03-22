# 运行方式：cd 项目根目录 && pytest tests/test_api.py -v
# 依赖：pip install pytest httpx
# 注意：本测试文件不依赖 GPU / 模型权重 / FluidSynth，所有测试均为接口级别校验

"""
GameBGM-Transformer 后端集成测试
覆盖路由：
  GET  /                          根路由
  GET  /api/emotions              情感列表
  GET  /api/status                系统状态
  GET  /api/devices               计算设备
  GET  /api/models/midi_emotion   midi-emotion 可用模型列表
  GET  /api/tasks                 任务列表
  GET  /api/tasks/{task_id}       任务详情（404）
  POST /api/tasks/{task_id}/stop  终止任务（404）
  DELETE /api/tasks/{task_id}     删除任务（404）
  POST /api/tasks/generate        启动生成任务（参数校验）
  POST /api/tasks/generate_v2     启动 midi-emotion 生成（参数校验）
  POST /api/tasks/train           启动训练任务
  POST /api/files/browse          文件浏览
  GET  /api/files/search          文件搜索
  POST /api/files/play            播放文件（404）
  GET  /api/download/{filename}   下载 MIDI（404）
  GET  /api/audio/{filename}      获取 WAV（404）
  DELETE /api/cache               清空音频缓存
"""

import pytest
from fastapi.testclient import TestClient


# ══════════════════════════════════════════════════
# 一、基础路由
# ══════════════════════════════════════════════════

class TestRootAndHealth:
    """根路由与基础健康检查"""

    def test_root_returns_200(self, client: TestClient):
        """GET / 应返回 200 且包含 status 字段"""
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert data["status"] == "running"

    def test_root_contains_message(self, client: TestClient):
        """GET / 的 message 字段应包含版本信息"""
        resp = client.get("/")
        data = resp.json()
        assert "message" in data
        # 确认是本系统的接口，不是默认 FastAPI 页
        assert "情感音乐" in data["message"] or "API" in data["message"]


# ══════════════════════════════════════════════════
# 二、情感列表接口
# ══════════════════════════════════════════════════

class TestEmotionsEndpoint:
    """GET /api/emotions — 情感列表"""

    def test_emotions_returns_200(self, client: TestClient):
        """应返回 200"""
        resp = client.get("/api/emotions")
        assert resp.status_code == 200

    def test_emotions_contains_four_quadrants(self, client: TestClient):
        """必须返回 Q1-Q4 四个情感象限"""
        resp = client.get("/api/emotions")
        data = resp.json()
        assert "emotions" in data
        emotions = data["emotions"]
        assert len(emotions) == 4
        ids = {e["id"] for e in emotions}
        assert ids == {"Q1", "Q2", "Q3", "Q4"}

    def test_emotions_have_required_fields(self, client: TestClient):
        """每个情感对象必须包含 id / name / english / description 字段"""
        resp = client.get("/api/emotions")
        emotions = resp.json()["emotions"]
        required_fields = {"id", "name", "english", "description"}
        for emotion in emotions:
            missing = required_fields - set(emotion.keys())
            assert not missing, f"情感 {emotion.get('id')} 缺少字段: {missing}"

    def test_emotions_q1_is_happy(self, client: TestClient):
        """Q1 对应"开心 / Happy""""
        resp = client.get("/api/emotions")
        emotions = resp.json()["emotions"]
        q1 = next((e for e in emotions if e["id"] == "Q1"), None)
        assert q1 is not None
        assert q1["english"].lower() == "happy"


# ══════════════════════════════════════════════════
# 三、模型相关接口
# ══════════════════════════════════════════════════

class TestModelsEndpoint:
    """
    GET /api/models/midi_emotion — midi-emotion 可用模型

    注意：项目中没有 GET /api/models 路由（返回 EMO-Disentanger 信息），
    前端通过 /api/status 的 emo_disentanger 字段间接获知该模型是否可用。
    TODO: 如需统一模型列表接口，可新增 GET /api/models
    """

    def test_midi_emotion_models_returns_200(self, client: TestClient):
        """GET /api/models/midi_emotion 应返回 200"""
        resp = client.get("/api/models/midi_emotion")
        assert resp.status_code == 200

    def test_midi_emotion_models_has_models_key(self, client: TestClient):
        """返回体必须包含 models 列表（没有训练模型时为空列表，不报错）"""
        resp = client.get("/api/models/midi_emotion")
        data = resp.json()
        assert "models" in data
        assert isinstance(data["models"], list)

    def test_nonexistent_model_route_returns_404(self, client: TestClient):
        """访问不存在的路由应返回 404（而非 500）"""
        resp = client.get("/api/models/nonexistent_route")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════
# 四、系统状态与设备接口
# ══════════════════════════════════════════════════

class TestStatusAndDevices:
    """GET /api/status 和 GET /api/devices"""

    def test_status_returns_200(self, client: TestClient):
        """GET /api/status 应返回 200"""
        resp = client.get("/api/status")
        assert resp.status_code == 200

    def test_status_has_required_fields(self, client: TestClient):
        """status 接口必须包含关键字段"""
        resp = client.get("/api/status")
        data = resp.json()
        required = {"status", "emo_disentanger", "soundfont", "fluidsynth", "active_tasks"}
        for field in required:
            assert field in data, f"status 响应缺少字段: {field}"

    def test_status_active_tasks_is_int(self, client: TestClient):
        """active_tasks 字段必须为整数"""
        resp = client.get("/api/status")
        data = resp.json()
        assert isinstance(data["active_tasks"], int)
        assert data["active_tasks"] >= 0

    def test_devices_returns_200(self, client: TestClient):
        """GET /api/devices 应返回 200"""
        resp = client.get("/api/devices")
        assert resp.status_code == 200

    def test_devices_has_devices_list(self, client: TestClient):
        """devices 接口必须包含 devices 列表，且至少有 CPU"""
        resp = client.get("/api/devices")
        data = resp.json()
        assert "devices" in data
        assert isinstance(data["devices"], list)
        # 任何环境都应至少检测到 CPU
        assert len(data["devices"]) >= 1
        device_types = {d["type"] for d in data["devices"]}
        assert "CPU" in device_types

    def test_devices_has_gpu_available_field(self, client: TestClient):
        """devices 接口必须包含 gpu_available 布尔字段"""
        resp = client.get("/api/devices")
        data = resp.json()
        assert "gpu_available" in data
        assert isinstance(data["gpu_available"], bool)


# ══════════════════════════════════════════════════
# 五、生成任务接口 — 参数校验
# ══════════════════════════════════════════════════

class TestGenerateEndpoints:
    """
    POST /api/tasks/generate 和 POST /api/tasks/generate_v2
    这里只测试接口接受请求（不等待实际推理完成），
    以及参数缺失时的 422 报错。
    """

    def test_generate_with_valid_params_returns_200(self, client: TestClient):
        """
        POST /api/tasks/generate 传入合法参数应返回 200。
        后端会立刻返回 task_id（异步执行，不等推理完成）。
        """
        resp = client.post("/api/tasks/generate", json={
            "emotion": "Q1",
            "n_groups": 1,
            "model_type": "gpt2",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data
        assert "message" in data

    def test_generate_returns_task_id_string(self, client: TestClient):
        """task_id 必须是非空字符串"""
        resp = client.post("/api/tasks/generate", json={"emotion": "Q3"})
        data = resp.json()
        assert isinstance(data["task_id"], str)
        assert len(data["task_id"]) > 0

    def test_generate_v2_with_valid_params_returns_200(self, client: TestClient):
        """
        POST /api/tasks/generate_v2 传入合法 V/A 参数应返回 200。
        """
        resp = client.post("/api/tasks/generate_v2", json={
            "valence": 0.5,
            "arousal": -0.3,
            "n_samples": 1,
            "gen_len": 512,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data

    def test_generate_with_wrong_type_returns_422(self, client: TestClient):
        """
        n_groups 传入字符串时，Pydantic 应返回 422 Unprocessable Entity。
        注意：emotion 有默认值，所以本接口不存在"必填参数缺失"的 422；
        此处测试类型错误导致的 422。
        """
        resp = client.post("/api/tasks/generate", json={
            "emotion": "Q1",
            "n_groups": "not_a_number",   # 应为 int
        })
        assert resp.status_code == 422

    def test_generate_v2_with_wrong_type_returns_422(self, client: TestClient):
        """valence 传入非数字字符串时应返回 422"""
        resp = client.post("/api/tasks/generate_v2", json={
            "valence": "high",    # 应为 float
            "arousal": 0.5,
        })
        assert resp.status_code == 422

    def test_train_with_valid_params_returns_200(self, client: TestClient):
        """POST /api/tasks/train 传入合法参数应立刻返回 task_id"""
        resp = client.post("/api/tasks/train", json={
            "stage": "stage1",
            "model_type": "gpt2",
            "representation": "functional",
            "config": "stage1_finetune",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data


# ══════════════════════════════════════════════════
# 六、任务管理接口
# ══════════════════════════════════════════════════

class TestTaskManagement:
    """GET/POST/DELETE /api/tasks 和 /api/tasks/{task_id}"""

    def test_list_tasks_returns_200(self, client: TestClient):
        """GET /api/tasks 应返回 200"""
        resp = client.get("/api/tasks")
        assert resp.status_code == 200

    def test_list_tasks_has_tasks_key(self, client: TestClient):
        """返回体必须包含 tasks 列表"""
        resp = client.get("/api/tasks")
        data = resp.json()
        assert "tasks" in data
        assert isinstance(data["tasks"], list)

    def test_get_nonexistent_task_returns_404(self, client: TestClient):
        """查询不存在的 task_id 应返回 404"""
        resp = client.get("/api/tasks/nonexistent-task-id-00000")
        assert resp.status_code == 404

    def test_stop_nonexistent_task_returns_404(self, client: TestClient):
        """对不存在的任务调用 stop 应返回 404"""
        resp = client.post("/api/tasks/nonexistent-task-id-00000/stop")
        assert resp.status_code == 404

    def test_delete_nonexistent_task_returns_404(self, client: TestClient):
        """删除不存在的任务应返回 404"""
        resp = client.delete("/api/tasks/nonexistent-task-id-00000")
        assert resp.status_code == 404

    def test_task_lifecycle(self, client: TestClient):
        """
        完整生命周期测试：
        1. 启动生成任务 → 获取 task_id
        2. 通过 task_id 查询任务详情 → 200
        3. 确认返回的任务信息结构完整
        4. 任务未完成时删除 → 可能返回 400（running 状态禁止删除）或 200
        """
        # 步骤 1：创建任务
        create_resp = client.post("/api/tasks/generate", json={"emotion": "Q4"})
        assert create_resp.status_code == 200
        task_id = create_resp.json()["task_id"]

        # 步骤 2：查询任务详情
        detail_resp = client.get(f"/api/tasks/{task_id}")
        assert detail_resp.status_code == 200
        data = detail_resp.json()

        # 步骤 3：检查返回结构
        required_fields = {"task_id", "task_type", "status", "logs", "start_time"}
        for field in required_fields:
            assert field in data, f"任务详情缺少字段: {field}"
        assert data["task_id"] == task_id

        # 步骤 4：终止任务（避免后台进程干扰其他测试）
        stop_resp = client.post(f"/api/tasks/{task_id}/stop")
        # 进程可能尚未启动，stop 返回 200 即可
        assert stop_resp.status_code == 200

    def test_task_detail_with_offset_param(self, client: TestClient):
        """GET /api/tasks/{task_id}?offset=N 应支持日志分页（返回 log_offset 字段）"""
        # 先创建一个任务
        create_resp = client.post("/api/tasks/generate", json={"emotion": "Q2"})
        task_id = create_resp.json()["task_id"]

        # 带 offset 参数查询
        resp = client.get(f"/api/tasks/{task_id}?offset=0")
        assert resp.status_code == 200
        data = resp.json()
        assert "log_offset" in data


# ══════════════════════════════════════════════════
# 七、下载与音频接口
# ══════════════════════════════════════════════════

class TestDownloadAndAudio:
    """GET /api/download/{filename} 和 GET /api/audio/{filename}"""

    def test_download_nonexistent_midi_returns_404(self, client: TestClient):
        """请求不存在的 MIDI 文件应返回 404"""
        resp = client.get("/api/download/nonexistent_file_xyzzy.mid")
        assert resp.status_code == 404

    def test_download_nonexistent_midi_has_detail(self, client: TestClient):
        """404 响应应包含 detail 字段，方便前端展示错误信息"""
        resp = client.get("/api/download/nonexistent_file_xyzzy.mid")
        data = resp.json()
        assert "detail" in data

    def test_audio_nonexistent_wav_returns_404(self, client: TestClient):
        """请求不存在的 WAV 音频应返回 404"""
        resp = client.get("/api/audio/nonexistent_file_xyzzy.wav")
        assert resp.status_code == 404

    def test_audio_nonexistent_wav_has_detail(self, client: TestClient):
        """404 响应应包含 detail 字段"""
        resp = client.get("/api/audio/nonexistent_file_xyzzy.wav")
        data = resp.json()
        assert "detail" in data


# ══════════════════════════════════════════════════
# 八、文件浏览与搜索接口
# ══════════════════════════════════════════════════

class TestFileBrowseAndSearch:
    """POST /api/files/browse 和 GET /api/files/search"""

    def test_browse_default_returns_200(self, client: TestClient):
        """POST /api/files/browse 不传 directory 时应返回 200（目录不存在也不报错）"""
        resp = client.post("/api/files/browse", json={})
        assert resp.status_code == 200

    def test_browse_has_files_key(self, client: TestClient):
        """browse 响应必须包含 files 列表"""
        resp = client.post("/api/files/browse", json={})
        data = resp.json()
        assert "files" in data
        assert isinstance(data["files"], list)

    def test_browse_nonexistent_directory(self, client: TestClient):
        """
        传入不存在的目录时，后端不应崩溃（返回 200 + 空列表 + error 提示），
        具体实现见 main.py：返回 {"files": [], "error": "目录不存在"}
        """
        resp = client.post("/api/files/browse", json={
            "directory": "/nonexistent/path/xyzzy_12345",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["files"] == []

    def test_search_returns_200(self, client: TestClient):
        """GET /api/files/search 应返回 200"""
        resp = client.get("/api/files/search")
        assert resp.status_code == 200

    def test_search_has_files_and_count(self, client: TestClient):
        """search 响应必须包含 files 列表和 count 字段"""
        resp = client.get("/api/files/search")
        data = resp.json()
        assert "files" in data
        assert "count" in data
        assert isinstance(data["files"], list)
        assert isinstance(data["count"], int)

    def test_search_with_query_param(self, client: TestClient):
        """GET /api/files/search?query=Q1 应正常响应（结果可为空）"""
        resp = client.get("/api/files/search?query=Q1")
        assert resp.status_code == 200
        data = resp.json()
        assert "files" in data


# ══════════════════════════════════════════════════
# 九、文件播放接口
# ══════════════════════════════════════════════════

class TestFilesPlay:
    """POST /api/files/play"""

    def test_play_nonexistent_file_returns_404(self, client: TestClient):
        """播放不存在的文件应返回 404"""
        resp = client.post("/api/files/play", json={
            "file_path": "/nonexistent/path/xyzzy.mid"
        })
        assert resp.status_code == 404

    def test_play_missing_file_path_returns_422(self, client: TestClient):
        """file_path 为必填字段，缺失时应返回 422"""
        resp = client.post("/api/files/play", json={})
        assert resp.status_code == 422

    def test_play_unsupported_format_returns_400(self, client: TestClient):
        """
        传入存在但格式不支持的文件路径（如 .py），后端应返回 400。
        此处用 backend/main.py 作为目标文件——它肯定存在，
        且后缀 .py 既不是 .mid 也不是 .wav，会触发格式校验逻辑。
        """
        from pathlib import Path
        # tests/test_api.py → 上级目录 → backend/main.py
        main_py = str(Path(__file__).resolve().parent.parent / "backend" / "main.py")
        resp = client.post("/api/files/play", json={"file_path": main_py})
        # main.py 存在但后缀不合法，应返回 400
        assert resp.status_code == 400


# ══════════════════════════════════════════════════
# 十、缓存清理接口
# ══════════════════════════════════════════════════

class TestCacheEndpoint:
    """DELETE /api/cache"""

    def test_clear_cache_returns_200(self, client: TestClient):
        """DELETE /api/cache 应返回 200，无论缓存是否为空"""
        resp = client.delete("/api/cache")
        assert resp.status_code == 200

    def test_clear_cache_has_message(self, client: TestClient):
        """返回体必须包含 message 字段"""
        resp = client.delete("/api/cache")
        data = resp.json()
        assert "message" in data
