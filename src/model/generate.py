"""
generate.py - 测试音乐生成效果
"""
import torch
from pathlib import Path
from transformers import GPT2LMHeadModel
from miditok import REMI

# 路径配置
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
MODEL_PATH = PROJECT_ROOT / "checkpoints" / "best_model"
TOKENIZER_PATH = PROJECT_ROOT / "data" / "processed" / "tokenizer.json"
OUTPUT_DIR = PROJECT_ROOT / "outputs"

# 情感标签
EMOTIONS = ["BATTLE", "PEACEFUL", "SAD", "HAPPY", "MYSTERIOUS", "EPIC"]


def load_model():
    """加载模型和tokenizer"""
    print("加载模型...")
    model = GPT2LMHeadModel.from_pretrained(str(MODEL_PATH))
    model.eval()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    print(f"设备: {device}")

    print("加载Tokenizer...")
    tokenizer = REMI(params=str(TOKENIZER_PATH))

    return model, tokenizer, device


def generate_music(model, tokenizer, device, emotion="HAPPY", max_length=512, temperature=1.0, top_p=0.95):
    """生成音乐"""
    # 构建起始序列: [BOS, EMOTION]
    bos_id = tokenizer["BOS_None"]
    emotion_id = tokenizer[f"{emotion}_None"]

    input_ids = torch.tensor([[bos_id, emotion_id]], dtype=torch.long).to(device)

    # 自回归生成
    with torch.no_grad():
        for _ in range(max_length - 2):
            outputs = model(input_ids)
            logits = outputs.logits[:, -1, :] / temperature

            # Top-p采样
            sorted_logits, sorted_indices = torch.sort(logits, descending=True)
            cumulative_probs = torch.cumsum(torch.softmax(sorted_logits, dim=-1), dim=-1)

            # 移除累积概率超过top_p的token
            sorted_indices_to_remove = cumulative_probs > top_p
            sorted_indices_to_remove[:, 1:] = sorted_indices_to_remove[:, :-1].clone()
            sorted_indices_to_remove[:, 0] = 0

            indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
            logits[indices_to_remove] = float('-inf')

            # 采样
            probs = torch.softmax(logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1)

            input_ids = torch.cat([input_ids, next_token], dim=-1)

            # 遇到EOS停止
            if next_token.item() == tokenizer["EOS_None"]:
                break

    return input_ids[0].tolist()


def tokens_to_midi(tokenizer, token_ids, output_path):
    """将token序列转换为MIDI文件"""
    # 移除特殊token (BOS, EOS, 情感标签)
    special_tokens = {"BOS_None", "EOS_None", "PAD_None", "MASK_None"}
    special_tokens.update(f"{e}_None" for e in EMOTIONS)
    special_tokens.add("UNKNOWN_None")

    special_ids = set()
    for token in special_tokens:
        try:
            special_ids.add(tokenizer[token])
        except:
            pass

    # 过滤掉特殊token
    music_ids = [t for t in token_ids if t not in special_ids]

    if len(music_ids) < 10:
        print(f"  有效token太少: {len(music_ids)}")
        return False

    # miditok 3.0.6 的decode方式
    try:
        midi = tokenizer.decode(music_ids)
        midi.dump_midi(str(output_path))
        return True
    except Exception as e:
        print(f"  转换失败: {e}")
        return False


def main():
    print("=" * 60)
    print("情感音乐生成测试")
    print("=" * 60)

    # 加载
    model, tokenizer, device = load_model()

    # 创建输出目录
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 为每种情感生成一首
    print("\n开始生成...")
    print("-" * 60)

    for emotion in EMOTIONS:
        print(f"\n生成 {emotion} 风格音乐...")

        # 生成
        token_ids = generate_music(
            model, tokenizer, device,
            emotion=emotion,
            max_length=512,
            temperature=0.9,
            top_p=0.92
        )

        print(f"  生成了 {len(token_ids)} 个token")

        # 保存MIDI
        output_path = OUTPUT_DIR / f"generated_{emotion.lower()}.mid"
        success = tokens_to_midi(tokenizer, token_ids, output_path)

        if success:
            print(f"  保存到: {output_path}")
        else:
            print(f"  保存失败")

    print("\n" + "=" * 60)
    print("生成完成!")
    print(f"文件保存在: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()