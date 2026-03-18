"""
midi-emotion 训练脚本
论文: Sulun et al., IEEE Access 2022

两阶段训练:
  Phase 1: 无标签预训练 (VGMusic 31K)  --no_emotion
  Phase 2: EMOPIA 微调 (情感条件)      --pretrained <ckpt>

TODO: 实现 Transformer + 连续 V/A 条件注入
"""
import argparse
from pathlib import Path


def train(
    data_dir: str,
    checkpoint_dir: str,
    no_emotion: bool = False,
    pretrained: str = None,
    epochs: int = 100,
    batch_size: int = 4,
):
    """
    训练 midi-emotion 模型。

    Args:
        data_dir: 数据目录（含 .npy pianoroll 文件）
        checkpoint_dir: 权重保存目录
        no_emotion: True = 无监督预训练，False = 情感条件训练
        pretrained: 预训练权重路径（Phase 2 微调时使用）
        epochs: 训练轮数
        batch_size: 批大小（RTX 3060 6GB 建议 4）
    """
    # TODO: 实现训练循环
    raise NotImplementedError("midi-emotion 训练尚未实现")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="midi-emotion 训练")
    parser.add_argument("--data_dir", type=str, required=True)
    parser.add_argument("--checkpoint_dir", type=str, default="src/midi_emotion/checkpoints")
    parser.add_argument("--no_emotion", action="store_true", help="无标签预训练模式")
    parser.add_argument("--pretrained", type=str, default=None, help="预训练权重路径")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch_size", type=int, default=4)
    args = parser.parse_args()

    train(
        data_dir=args.data_dir,
        checkpoint_dir=args.checkpoint_dir,
        no_emotion=args.no_emotion,
        pretrained=args.pretrained,
        epochs=args.epochs,
        batch_size=args.batch_size,
    )
