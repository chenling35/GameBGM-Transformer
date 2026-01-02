"""
train.py - 情感音乐生成模型训练脚本（高速版）
硬件目标：RTX 3060 6GB
"""
import os
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from pathlib import Path
from datasets import load_from_disk
from transformers import GPT2LMHeadModel, GPT2Config, get_linear_schedule_with_warmup
from miditok import REMI
from tqdm import tqdm
import time

# ==================== 配置 ====================
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_DIR = PROJECT_ROOT / "checkpoints"

# 模型配置（针对6GB显存优化）
MODEL_CONFIG = {
    "n_layer": 6,           # 6层
    "n_head": 8,            # 8个注意力头
    "n_embd": 512,          # 嵌入维度512
    "n_positions": 512,     # 最大序列长度
}

# 训练配置
TRAIN_CONFIG = {
    "batch_size": 4,
    "gradient_accumulation_steps": 8,
    "learning_rate": 5e-4,
    "num_epochs": 30,
    "warmup_steps": 500,
    "save_every_n_steps": 2000,
    "eval_every_n_steps": 1000,
    "log_every_n_steps": 100,
    "fp16": True,
    "max_grad_norm": 1.0,
}


def load_tokenizer():
    """加载miditok tokenizer"""
    tokenizer_path = DATA_DIR / "tokenizer.json"
    tokenizer = REMI(params=str(tokenizer_path))
    return tokenizer


def collate_fn(batch, pad_id=0, max_len=512):
    """自定义batch整理函数"""
    input_ids = []
    labels = []
    attention_masks = []

    for item in batch:
        ids = item["input_ids"]

        # 截断或填充
        if len(ids) > max_len:
            ids = ids[:max_len]

        # attention mask
        attn_mask = [1] * len(ids) + [0] * (max_len - len(ids))

        # padding
        padded_ids = ids + [pad_id] * (max_len - len(ids))

        # labels: padding位置设为-100（计算loss时忽略）
        label = [i if i != pad_id else -100 for i in padded_ids]

        input_ids.append(padded_ids)
        labels.append(label)
        attention_masks.append(attn_mask)

    return {
        "input_ids": torch.tensor(input_ids, dtype=torch.long),
        "attention_mask": torch.tensor(attention_masks, dtype=torch.long),
        "labels": torch.tensor(labels, dtype=torch.long),
    }


def prepare_data():
    """加载数据集"""
    print("加载数据集...")
    dataset = load_from_disk(str(DATA_DIR / "emotion_dataset"))

    # 划分训练/验证集
    split = dataset.train_test_split(test_size=0.1, seed=42)
    train_dataset = split["train"]
    eval_dataset = split["test"]

    print(f"训练集: {len(train_dataset)} 样本")
    print(f"验证集: {len(eval_dataset)} 样本")

    return train_dataset, eval_dataset


def create_model(vocab_size):
    """创建GPT2模型"""
    config = GPT2Config(
        vocab_size=vocab_size,
        n_positions=MODEL_CONFIG["n_positions"],
        n_ctx=MODEL_CONFIG["n_positions"],
        n_embd=MODEL_CONFIG["n_embd"],
        n_layer=MODEL_CONFIG["n_layer"],
        n_head=MODEL_CONFIG["n_head"],
        bos_token_id=1,
        eos_token_id=2,
        pad_token_id=0,
    )

    model = GPT2LMHeadModel(config)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"模型参数量: {total_params / 1e6:.1f}M")

    return model


def evaluate(model, eval_loader, device):
    """评估模型"""
    model.eval()
    total_loss = 0
    total_steps = 0

    with torch.no_grad():
        for batch in eval_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels
            )

            total_loss += outputs.loss.item()
            total_steps += 1

    return total_loss / total_steps


def train():
    print("=" * 60)
    print("情感音乐生成模型训练")
    print("=" * 60)

    # 检查设备
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"\nGPU: {torch.cuda.get_device_name(0)}")
        print(f"显存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    else:
        device = torch.device("cpu")
        print("\n警告: 未检测到GPU，使用CPU训练")

    # 加载tokenizer
    print("\n[1/4] 加载Tokenizer")
    tokenizer = load_tokenizer()
    vocab_size = len(tokenizer)
    pad_id = tokenizer["PAD_None"]
    print(f"词汇表大小: {vocab_size}")

    # 准备数据
    print("\n[2/4] 准备数据")
    train_dataset, eval_dataset = prepare_data()

    train_loader = DataLoader(
        train_dataset,
        batch_size=TRAIN_CONFIG["batch_size"],
        shuffle=True,
        collate_fn=lambda b: collate_fn(b, pad_id, MODEL_CONFIG["n_positions"]),
        num_workers=0,  # Windows下设为0避免问题
        pin_memory=True if device.type == "cuda" else False,
    )

    eval_loader = DataLoader(
        eval_dataset,
        batch_size=TRAIN_CONFIG["batch_size"],
        shuffle=False,
        collate_fn=lambda b: collate_fn(b, pad_id, MODEL_CONFIG["n_positions"]),
        num_workers=0,
    )

    # 创建模型
    print("\n[3/4] 创建模型")
    model = create_model(vocab_size)
    model.to(device)

    # 优化器和调度器
    optimizer = torch.optim.AdamW(model.parameters(), lr=TRAIN_CONFIG["learning_rate"], weight_decay=0.01)

    total_steps = len(train_loader) * TRAIN_CONFIG["num_epochs"] // TRAIN_CONFIG["gradient_accumulation_steps"]
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=TRAIN_CONFIG["warmup_steps"],
        num_training_steps=total_steps
    )

    # 混合精度
    scaler = torch.cuda.amp.GradScaler() if TRAIN_CONFIG["fp16"] and device.type == "cuda" else None

    # 训练
    print("\n[4/4] 开始训练")
    print("=" * 60)
    print(f"Batch: {TRAIN_CONFIG['batch_size']} x {TRAIN_CONFIG['gradient_accumulation_steps']} = {TRAIN_CONFIG['batch_size'] * TRAIN_CONFIG['gradient_accumulation_steps']}")
    print(f"Epochs: {TRAIN_CONFIG['num_epochs']}")
    print(f"学习率: {TRAIN_CONFIG['learning_rate']}")
    print(f"总步数: {total_steps}")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    global_step = 0
    best_eval_loss = float('inf')
    start_time = time.time()

    for epoch in range(TRAIN_CONFIG["num_epochs"]):
        model.train()
        epoch_loss = 0
        optimizer.zero_grad()

        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{TRAIN_CONFIG['num_epochs']}")

        for step, batch in enumerate(pbar):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            # 前向传播
            if scaler:
                with torch.cuda.amp.autocast():
                    outputs = model(
                        input_ids=input_ids,
                        attention_mask=attention_mask,
                        labels=labels
                    )
                    loss = outputs.loss / TRAIN_CONFIG["gradient_accumulation_steps"]
                scaler.scale(loss).backward()
            else:
                outputs = model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    labels=labels
                )
                loss = outputs.loss / TRAIN_CONFIG["gradient_accumulation_steps"]
                loss.backward()

            epoch_loss += outputs.loss.item()

            # 梯度累积
            if (step + 1) % TRAIN_CONFIG["gradient_accumulation_steps"] == 0:
                if scaler:
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), TRAIN_CONFIG["max_grad_norm"])
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), TRAIN_CONFIG["max_grad_norm"])
                    optimizer.step()

                scheduler.step()
                optimizer.zero_grad()
                global_step += 1

                # 日志
                if global_step % TRAIN_CONFIG["log_every_n_steps"] == 0:
                    avg_loss = epoch_loss / (step + 1)
                    pbar.set_postfix({"loss": f"{avg_loss:.4f}", "lr": f"{scheduler.get_last_lr()[0]:.2e}"})

                # 评估
                if global_step % TRAIN_CONFIG["eval_every_n_steps"] == 0:
                    eval_loss = evaluate(model, eval_loader, device)
                    print(f"\n[Step {global_step}] Eval Loss: {eval_loss:.4f}")

                    if eval_loss < best_eval_loss:
                        best_eval_loss = eval_loss
                        save_path = OUTPUT_DIR / "best_model"
                        model.save_pretrained(str(save_path))
                        print(f"保存最佳模型到 {save_path}")

                    model.train()

                # 定期保存
                if global_step % TRAIN_CONFIG["save_every_n_steps"] == 0:
                    save_path = OUTPUT_DIR / f"checkpoint-{global_step}"
                    model.save_pretrained(str(save_path))

        # 每个epoch结束打印
        avg_epoch_loss = epoch_loss / len(train_loader)
        elapsed = time.time() - start_time
        print(f"\nEpoch {epoch+1} 完成 | Loss: {avg_epoch_loss:.4f} | 耗时: {elapsed/60:.1f}分钟")

    # 保存最终模型
    final_path = OUTPUT_DIR / "final_model"
    model.save_pretrained(str(final_path))

    # 同时保存tokenizer配置
    tokenizer.save(str(final_path / "tokenizer.json"))

    print("\n" + "=" * 60)
    print("训练完成!")
    print(f"最终模型: {final_path}")
    print(f"最佳验证Loss: {best_eval_loss:.4f}")
    print(f"总耗时: {(time.time() - start_time)/60:.1f} 分钟")
    print("=" * 60)


if __name__ == "__main__":
    train()