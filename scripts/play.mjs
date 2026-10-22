// テストプレイ用 CLI（ゲームの見え方を文字で再現する）
// 使い方:
//   node scripts/play.mjs --state <path.json> list
//   node scripts/play.mjs --state <path.json> show <id> [候補番号 ...]
//   node scripts/play.mjs --state <path.json> send <id> [候補番号 ...]
//   node scripts/play.mjs --state <path.json> zukan <id>
// 番号は1始まり。state は {found:{id:[e...]}, learned:[...]}（無ければ新規作成）

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const die = m => { console.error("エラー: " + m); process.exit(1); };
const argv = process.argv.slice(2);
const si = argv.indexOf("--state");
if (si < 0 || !argv[si + 1]) die("--state <path.json> を指定してください");
const statePath = argv[si + 1];
const [cmd, id, ...nums] = argv.filter((_, i) => i !== si && i !== si + 1);

const { order, words = [] } = JSON.parse(readFileSync(join(root, "data/stages.json"), "utf8"));
const STAGES = order.map(i => JSON.parse(readFileSync(join(root, "data/stages", `${i}.json`), "utf8")));

let state = { found: {}, learned: [] };
if (existsSync(statePath)) { try { state = { ...state, ...JSON.parse(readFileSync(statePath, "utf8")) }; } catch (e) { die("state ファイルが読めません: " + e.message); } }
state.found ||= {}; state.learned ||= [];
const learned = new Set(state.learned);
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 1));
const no = i => "END " + String(i + 1).padStart(2, "0");
const candsOf = n => (n.c || []).filter(c => !c[2] || learned.has(c[2])); // index.html と同じフィルタ
const stageOf = sid => STAGES.find(s => s.id === sid) || die(`ステージ「${sid}」がありません（${order.join(", ")}）`);

// 番号列をたどって現在のノードを返す
function walk(S, nums) {
  let key = "s";
  const shown = [];
  for (const raw of nums) {
    const cs = candsOf(S.nodes[key]);
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > cs.length) die(`候補番号 ${raw} は範囲外です（今は 1〜${cs.length}）`);
    shown.push(cs[n - 1][0]);
    key = cs[n - 1][1];
  }
  return { key, node: S.nodes[key] };
}

function showState(S, node) {
  console.log(`${S.who}「${S.ask}」（${S.askAt}）`);
  console.log(`入力中: ${node.t ? node.t + "|" : "（空）"}`);
  const cs = candsOf(node);
  if (!cs.length) console.log("候補: これ以上の候補はありません");
  else { console.log("候補:"); cs.forEach((c, i) => console.log(`  ${i + 1}. ${c[0]}${c[2] ? " 【学習】" : ""}`)); }
  console.log(node.e != null && node.t ? "（この文で送信できます）" : "（まだ送信できません）");
}

if (cmd === "list") {
  STAGES.forEach(S => {
    const n = (state.found[S.id] || []).length;
    console.log(`${S.id}｜${S.who}「${S.ask}」 ${n}/${S.endings.length}`);
  });
  console.log(`スマホの学習: ${learned.size}個`);
} else if (cmd === "show") {
  const S = stageOf(id);
  showState(S, walk(S, nums).node);
} else if (cmd === "send") {
  const S = stageOf(id), { node } = walk(S, nums);
  if (!node.t || node.e == null) die("まだ文が空なので送信できません");
  const e = S.endings[node.e];
  const F = new Set(state.found[S.id] || []);
  const isNew = !F.has(node.e);
  F.add(node.e);
  state.found[S.id] = [...F].sort((a, b) => a - b);
  const newWords = words.filter(w => !learned.has(w) && node.t.includes(w));
  newWords.forEach(w => learned.add(w));
  state.learned = [...learned];
  save();
  console.log(`${S.who}「${S.ask}」（${S.askAt}）`);
  console.log(`自分: ${node.t}（既読 ${S.sentAt}）`);
  console.log(`${S.who}: ${e.reply}`);
  console.log(`${no(node.e)}｜${e.title}｜${isNew ? "NEW" : "発見済み"}`);
  console.log(`一言: ${e.comment}`);
  console.log(`図鑑 ${F.size}/${S.endings.length}`);
  if (newWords.length) console.log(`📱 スマホが${newWords.map(w => "「" + w + "」").join("")}を覚えた`);
} else if (cmd === "zukan") {
  const S = stageOf(id), F = new Set(state.found[S.id] || []);
  console.log(`${S.who}の図鑑 ${F.size}/${S.endings.length}`);
  S.endings.forEach((e, i) => console.log(F.has(i) ? `${no(i)}｜${e.title}` : `${no(i)}｜？？？｜ヒント: ${e.hint}${e.hidden ? " 【学習】" : ""}`));
} else die("コマンドは list / show / send / zukan のどれかです");
