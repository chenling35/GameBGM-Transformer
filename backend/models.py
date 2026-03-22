"""
所有 Pydantic 请求模型
"""
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    emotion: str = "Q1"
    n_groups: int = 1
    output_dir: str = "generation/emopia_functional_two"
    model_type: str = "gpt2"
    stage1_weights: str = ""
    stage2_weights: str = ""


class TrainRequest(BaseModel):
    stage: str = "stage1"
    model_type: str = "gpt2"
    representation: str = "functional"
    config: str = "stage1_finetune"


class TrainV2Request(BaseModel):
    """midi-emotion 微调训练请求"""
    dataset: str = "emopia"             # emopia / vgmusic / custom
    data_dir: str = ""                  # 自定义路径（dataset=custom 时必填）
    output_dir: str = "midi-emotion/output/finetuned"
    pretrained: str = ""                # 留空 = 默认预训练权重
    max_steps: int = 1500
    batch_size: int = 8
    lr: float = 2e-5
    eval_step: int = 500


class GenerateV2Request(BaseModel):
    """midi-emotion 生成请求（连续 V/A 情感条件）"""
    valence: float = Field(0.5, ge=-1.0, le=1.0)     # 效价 [-1, 1]
    arousal: float = Field(0.5, ge=-1.0, le=1.0)     # 唤醒度 [-1, 1]
    gen_len: int = Field(2048, ge=64, le=8192)        # 生成 token 数（越大越长越慢）
    n_samples: int = Field(1, ge=1, le=10)            # 生成数量
    checkpoint: str = ""        # 模型目录名（如 continuous_concat, finetuned_emopia 等）
    file_prefix: str = ""       # 文件前缀（生成后自动重命名）


class PlayFileRequest(BaseModel):
    file_path: str


class BrowseRequest(BaseModel):
    directory: str = ""
    pattern: str = "*.mid"
