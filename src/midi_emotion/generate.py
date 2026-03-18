"""
midi-emotion 生成脚本
论文: Sulun et al., IEEE Access 2022
"Symbolic Music Generation Conditioned on Continuous-Valued Emotions"

TODO: 实现连续 V/A 条件生成
"""
import argparse
from pathlib import Path


def generate(
    valence: float,
    arousal: float,
    instruments: list[str],
    checkpoint: str,
    output_dir: str,
    n_samples: int = 1,
    temperature: float = 0.9,
):
    """
    使用 midi-emotion 模型生成音乐。

    Args:
        valence: 效价 [-1, 1]，负=悲伤/紧张，正=开心/平静
        arousal: 唤醒度 [-1, 1]，负=低沉，正=活跃
        instruments: 乐器列表，如 ['piano', 'guitar', 'bass']
        checkpoint: 模型权重路径
        output_dir: 输出目录
        n_samples: 生成数量
        temperature: 采样温度
    """
    # TODO: 加载 midi-emotion 模型并生成
    raise NotImplementedError("midi-emotion 模型尚未集成，请先完成环境搭建")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="midi-emotion 生成")
    parser.add_argument("--valence", type=float, default=0.5, help="效价 [-1, 1]")
    parser.add_argument("--arousal", type=float, default=0.5, help="唤醒度 [-1, 1]")
    parser.add_argument("--instruments", nargs="+", default=["piano"],
                        choices=["piano", "guitar", "bass", "strings", "drums"])
    parser.add_argument("--checkpoint", type=str, required=True)
    parser.add_argument("--output_dir", type=str, default="generation/midi_emotion")
    parser.add_argument("--n_samples", type=int, default=1)
    parser.add_argument("--temperature", type=float, default=0.9)
    args = parser.parse_args()

    generate(
        valence=args.valence,
        arousal=args.arousal,
        instruments=args.instruments,
        checkpoint=args.checkpoint,
        output_dir=args.output_dir,
        n_samples=args.n_samples,
        temperature=args.temperature,
    )
