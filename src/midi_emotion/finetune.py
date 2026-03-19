"""
midi-emotion 微调脚本
从预训练权重（continuous_concat）在 EMOPIA/VGMIDI 上做情感条件微调

用法:
  python src/midi_emotion/finetune.py \
    --data_dir data/processed/emopia \
    --pretrained midi-emotion/output/continuous_concat \
    --output_dir midi-emotion/output/finetuned_emopia \
    --max_steps 5000 \
    --batch_size 2

调试（快速冒烟测试）:
  python src/midi_emotion/finetune.py \
    --data_dir data/processed/emopia \
    --pretrained midi-emotion/output/continuous_concat \
    --output_dir midi-emotion/output/debug \
    --max_steps 50 --batch_size 2 --debug
"""

import sys
import os
import argparse
import time
import math
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import pandas as pd
from tqdm import tqdm

# 把 midi-emotion/src 加入 Python 路径
_HERE = Path(__file__).resolve().parent
_MIDI_EMOTION_SRC = _HERE.parent.parent / "midi-emotion" / "src"
sys.path.insert(0, str(_MIDI_EMOTION_SRC))

from models.build_model import build_model       # noqa: E402
from data.loader import Loader                   # noqa: E402

# collate.py 依赖 torch._six（PyTorch 2.0 已移除），直接内联替换版本
import collections.abc
import re as _re
import numpy as _np

_np_str_obj_array_pattern = _re.compile(r'[SaUO]')
_numpy_type_map = {
    'float64': torch.DoubleTensor, 'float32': torch.FloatTensor,
    'float16': torch.HalfTensor,   'int64':   torch.LongTensor,
    'int32':   torch.IntTensor,    'int16':   torch.ShortTensor,
    'int8':    torch.CharTensor,   'uint8':   torch.ByteTensor,
}

def filter_collate(batch):
    """过滤 None 样本并拼成 batch（兼容 PyTorch 2.x）"""
    if isinstance(batch, (list, tuple)):
        batch = [i for i in batch if i is not None]
    if batch == []:
        return batch
    elem = batch[0]
    if isinstance(elem, torch.Tensor):
        return torch.stack(batch, 0)
    if type(elem).__module__ == 'numpy' and type(elem).__name__ == 'ndarray':
        return filter_collate([torch.from_numpy(b) for b in batch])
    if isinstance(elem, float):
        return torch.tensor(batch, dtype=torch.float64)
    if isinstance(elem, int):
        return torch.tensor(batch)
    if isinstance(elem, str):
        return batch
    if isinstance(elem, collections.abc.Mapping):
        return {k: filter_collate([d[k] for d in batch]) for k in elem}
    if isinstance(elem, collections.abc.Sequence):
        return [filter_collate(s) for s in zip(*batch)]
    raise TypeError(f"filter_collate: 不支持的类型 {type(elem)}")


def load_features(data_dir: Path, debug: bool = False):
    """读取 features.csv，返回 train/test 两个 dict list"""
    feat_csv = data_dir / "features.csv"
    if not feat_csv.exists():
        raise FileNotFoundError(f"找不到 {feat_csv}，请先运行 preprocess.py")

    df = pd.read_csv(feat_csv)
    # 只保留文件实际存在的记录
    existing = {p.stem for p in data_dir.glob("*.pt") if p.name != "maps.pt"}
    df = df[df["file"].isin(existing)]

    train_df = df[df["split"] == "train"]
    test_df  = df[df["split"] == "test"]

    if debug:
        train_df = train_df.head(16)
        test_df  = test_df.head(4)

    # Loader 需要的字段: file (无后缀), valence, arousal
    train_feats = train_df[["file", "valence", "arousal"]].to_dict("records")
    test_feats  = test_df[["file", "valence", "arousal"]].to_dict("records")

    return train_feats, test_feats


def build_loaders(data_dir: Path, train_feats: list, test_feats: list,
                  tgt_len: int, batch_size: int, num_workers: int = 0):
    """创建 DataLoader，min_n_instruments=1（支持单轨钢琴数据）"""
    data_folder = str(data_dir)

    train_ds = Loader(
        data_folder, train_feats, tgt_len,
        conditioning="continuous_concat",
        min_n_instruments=1,   # EMOPIA/VGMIDI 是钢琴独奏
        max_transpose=3,
    )
    test_ds = Loader(
        data_folder, test_feats, tgt_len,
        conditioning="continuous_concat",
        min_n_instruments=1,
        max_transpose=0,       # 测试集不做 augmentation
    )

    train_loader = torch.utils.data.DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, collate_fn=filter_collate,
        pin_memory=torch.cuda.is_available(), drop_last=True,
    )
    test_loader = torch.utils.data.DataLoader(
        test_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, collate_fn=filter_collate,
        pin_memory=torch.cuda.is_available(), drop_last=True,
    )

    return train_loader, test_loader, train_ds.get_maps(), train_ds.get_pad_idx()


def load_pretrained_model(pretrained_dir: Path, device: torch.device):
    """加载预训练模型"""
    config = torch.load(pretrained_dir / "model_config.pt", map_location=device)
    model, _ = build_model(None, load_config_dict=config)
    model.load_state_dict(
        torch.load(pretrained_dir / "model.pt", map_location=device)
    )
    print(f"预训练模型加载自 {pretrained_dir}")
    n_params = sum(p.numel() for p in model.parameters())
    print(f"参数量: {n_params:,}")
    return model


def evaluate(model, loader, pad_idx, device, amp, max_steps=200):
    model.eval()
    ce_loss = nn.CrossEntropyLoss(ignore_index=pad_idx)
    total_loss, n_elements = 0.0, 0
    null_cond = torch.FloatTensor([float("nan"), float("nan")]).to(device)

    with torch.no_grad():
        for i, (input_, condition, target) in enumerate(loader):
            if i >= max_steps:
                break
            if input_ == [] or input_ is None:
                continue
            input_  = input_.to(device)
            target  = target.to(device)
            condition = condition.to(device)
            # 把 NaN condition 替换成 null（模型能处理）
            condition = torch.where(torch.isnan(condition), null_cond, condition)

            with torch.cuda.amp.autocast(enabled=amp):
                output = model(input_, condition)
                output_flat = output.reshape(-1, output.size(-1))
                loss = ce_loss(output_flat, target.reshape(-1))

            n = input_.numel()
            total_loss += loss.item() * n
            n_elements  += n

    if n_elements == 0:
        return float("nan")
    avg_loss = total_loss / n_elements
    return avg_loss


def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() and not args.no_cuda else "cpu")
    print(f"设备: {device}")

    data_dir    = Path(args.data_dir)
    output_dir  = Path(args.output_dir)
    pretrained  = Path(args.pretrained)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── 数据 ──────────────────────────────────────────────────────
    train_feats, test_feats = load_features(data_dir, debug=args.debug)
    print(f"训练集: {len(train_feats)} 首，测试集: {len(test_feats)} 首")

    train_loader, test_loader, maps, pad_idx = build_loaders(
        data_dir, train_feats, test_feats,
        tgt_len=args.tgt_len,
        batch_size=args.batch_size,
        num_workers=0 if args.debug else 2,
    )

    # ── 模型 ──────────────────────────────────────────────────────
    model = load_pretrained_model(pretrained, device)
    model = model.to(device)

    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    scaler    = torch.cuda.amp.GradScaler(enabled=(device.type == "cuda"))
    ce_loss   = nn.CrossEntropyLoss(ignore_index=pad_idx)
    amp       = (device.type == "cuda") and not args.no_amp

    # 保存配置供后续生成使用
    config = torch.load(pretrained / "model_config.pt")
    torch.save(config,    output_dir / "model_config.pt")
    torch.save(maps,      output_dir / "mappings.pt")

    # ── 训练循环 ───────────────────────────────────────────────────
    step       = 0
    best_loss  = float("inf")
    start_time = time.time()
    null_cond  = torch.FloatTensor([float("nan"), float("nan")]).to(device)

    print(f"\n开始微调，最多 {args.max_steps} 步，每 {args.log_step} 步打印一次\n")

    try:
        while step < args.max_steps:
            model.train()
            for input_, condition, target in train_loader:
                if step >= args.max_steps:
                    break
                if input_ == [] or input_ is None:
                    continue

                input_    = input_.to(device)
                target    = target.to(device)
                condition = condition.to(device)
                condition = torch.where(torch.isnan(condition), null_cond, condition)

                with torch.cuda.amp.autocast(enabled=amp):
                    output = model(input_, condition)
                    output_flat = output.reshape(-1, output.size(-1))
                    loss = ce_loss(output_flat, target.reshape(-1))

                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad()

                step += 1

                if step % args.log_step == 0:
                    elapsed = (time.time() - start_time) / 60
                    print(f"step {step:>6d} | loss {loss.item():.4f} | {elapsed:.1f} min")

                if step % args.eval_step == 0 and not args.debug:
                    val_loss = evaluate(model, test_loader, pad_idx, device, amp)
                    ppl = math.exp(val_loss) if not math.isnan(val_loss) else float("nan")
                    print(f"  [Eval] val_loss={val_loss:.4f}  ppl={ppl:.2f}")

                    if val_loss < best_loss:
                        best_loss = val_loss
                        torch.save(model.state_dict(), output_dir / "model.pt")
                        print(f"  [保存] 新最优模型 val_loss={best_loss:.4f}")

    except KeyboardInterrupt:
        print("\n训练中断，保存当前模型...")

    # 最终保存
    torch.save(model.state_dict(), output_dir / "model_last.pt")
    elapsed_total = (time.time() - start_time) / 60
    print(f"\n微调完成！共 {step} 步，耗时 {elapsed_total:.1f} min")
    print(f"模型保存至 {output_dir}/")
    print(f"\n生成命令:")
    print(f"  cd midi-emotion/src && python generate.py \\")
    print(f"    --model_dir ../../{output_dir.relative_to(output_dir.parent.parent)} \\")
    print(f"    --conditioning continuous_concat \\")
    print(f"    --valence 0.8 --arousal 0.8 --batch_size 1")


def main():
    parser = argparse.ArgumentParser(description="midi-emotion 微调")
    parser.add_argument("--data_dir",   type=str, required=True,  help="预处理后的数据目录（含 .pt 和 features.csv）")
    parser.add_argument("--pretrained", type=str,
                        default="midi-emotion/output/continuous_concat",
                        help="预训练模型目录（含 model.pt 和 model_config.pt）")
    parser.add_argument("--output_dir", type=str,
                        default="midi-emotion/output/finetuned",
                        help="微调结果输出目录")
    parser.add_argument("--tgt_len",    type=int, default=1216,   help="训练序列长度")
    parser.add_argument("--batch_size", type=int, default=2,      help="批大小（RTX 3060 建议 2）")
    parser.add_argument("--lr",         type=float, default=2e-5, help="学习率（微调建议低学习率）")
    parser.add_argument("--max_steps",  type=int, default=5000,   help="最大训练步数")
    parser.add_argument("--log_step",   type=int, default=100,    help="日志打印间隔")
    parser.add_argument("--eval_step",  type=int, default=500,    help="验证集评估间隔")
    parser.add_argument("--no_cuda",    action="store_true",      help="强制使用 CPU")
    parser.add_argument("--no_amp",     action="store_true",      help="关闭混合精度")
    parser.add_argument("--debug",      action="store_true",      help="调试模式（仅用少量数据）")
    args = parser.parse_args()

    train(args)


if __name__ == "__main__":
    main()
