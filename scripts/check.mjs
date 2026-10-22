// ステージデータの自動チェック
// 使い方: node scripts/check.mjs
// 問題があれば一覧を出して終了コード1で終わる。

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const errors = [];
const warnings = [];
const err = (stage, msg) => errors.push(`[${stage}] ${msg}`);
const warn = (stage, msg) => warnings.push(`[${stage}] ${msg}`);

const { order, words = [] } = JSON.parse(readFileSync(join(dataDir, "stages.json"), "utf8"));
const files = readdirSync(join(dataDir, "stages")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));

for (const f of files) if (!order.includes(f)) warn(f, "data/stages.json の order に入っていないため、ゲームに出ません");

const seenIds = new Set();
const MAX_CANDS = 7;
const learnable = {}; // 言葉 → 学習候補を通らずに送れる文があるステージ id の配列
const learnCands = {}; // ステージ id → 学習候補の数
const learnIn = {}; // 言葉 → その言葉を学習候補に持つステージ id の配列
words.forEach(w => { learnable[w] = []; learnIn[w] = []; });
for (const id of order) {
  let d;
  try {
    d = JSON.parse(readFileSync(join(dataDir, "stages", `${id}.json`), "utf8"));
  } catch (e) {
    err(id, `ファイルが読めないか、JSONの書き方が間違っています: ${e.message}`);
    continue;
  }

  // 基本項目
  if (d.id !== id) err(id, `ファイル名と id が違います（id: ${d.id}）`);
  if (seenIds.has(d.id)) err(id, "id が他のステージと重複しています");
  seenIds.add(d.id);
  for (const k of ["tab", "who", "color", "ask", "askAt", "sentAt"]) if (!d[k]) err(id, `${k} がありません`);

  // エンディング
  const E = d.endings || [];
  if (!E.length) err(id, "endings が空です");
  E.forEach((e, i) => {
    for (const k of ["title", "reply", "comment", "hint"]) if (!e[k]) err(id, `END ${i + 1} に ${k} がありません`);
  });
  const titles = E.map(e => e.title);
  titles.forEach((t, i) => { if (titles.indexOf(t) !== i) warn(id, `エンディング名「${t}」が重複しています`); });
  if (!E.some(e => e.good)) warn(id, "good: true（普通に伝わるエンディング）がありません");

  // 分岐
  const N = d.nodes || {};
  if (!N.s) { err(id, "スタート地点のノード s がありません"); continue; }
  if (N.s.t !== "") err(id, "ノード s の t は空文字にしてください");
  for (const [k, n] of Object.entries(N)) {
    if (typeof n.t !== "string") err(id, `ノード ${k} に t（入力中の文）がありません`);
    if (k !== "s" && n.e == null) err(id, `ノード ${k} に e（送信したときのエンディング番号）がありません`);
    if (n.e != null && !(Number.isInteger(n.e) && n.e >= 0 && n.e < E.length)) err(id, `ノード ${k} の e=${n.e} は存在しないエンディングです（0〜${E.length - 1}）`);
    if (!n.c?.length && n.e == null) err(id, `ノード ${k} は候補も送信先もない行き止まりです`);
    const labels = new Set();
    const normal = new Set((n.c || []).filter(c => Array.isArray(c) && c[2] == null).map(c => c[0]));
    for (const c of n.c || []) if (Array.isArray(c) && c[2] != null && normal.has(c[0])) err(id, `ノード ${k} の学習候補「${c[0]}」が通常候補と表示名が重複しています`);
    if ((n.c || []).length > MAX_CANDS) err(id, `ノード ${k} の候補が ${(n.c || []).length}個あります（全部覚えた状態で ${MAX_CANDS}個まで）`);
    for (const c of n.c || []) {
      if (!Array.isArray(c) || (c.length !== 2 && c.length !== 3)) { err(id, `ノード ${k} の候補の形が [表示, 行き先] か [表示, 行き先, 学習する言葉] になっていません`); continue; }
      const [label, next, need] = c;
      if (need != null) {
        learnCands[id] = (learnCands[id] || 0) + 1;
        if (!words.includes(need)) err(id, `ノード ${k} の学習候補「${label}」の言葉「${need}」が stages.json の words にありません`);
        else if (!learnIn[need].includes(id)) learnIn[need].push(id);
      }
      if (!N[next]) err(id, `ノード ${k} の候補「${label}」の行き先 ${next} がありません`);
      if (labels.has(label)) warn(id, `ノード ${k} に同じ候補「${label}」が2つあります`);
      labels.add(label);
      if (N[next] && typeof N[next].t === "string" && !N[next].t.startsWith(n.t)) warn(id, `ノード ${k}→${next}: 行き先の文「${N[next].t}」が「${n.t}」の続きになっていません`);
    }
  }

  // たどり着けるか（学習候補も通る）。plain＝学習候補を通らずに行けるノード
  const walk = skipLearn => {
    const seen = new Set(["s"]);
    const stack = ["s"];
    while (stack.length) {
      const k = stack.pop();
      for (const [, next, need] of N[k]?.c || []) if (N[next] && !seen.has(next) && !(skipLearn && need != null)) { seen.add(next); stack.push(next); }
    }
    return seen;
  };
  const reached = walk(false), plain = walk(true);
  // 学習の元になる文：学習候補を通らずに送れて、e を持つノードの t に含まれる言葉
  for (const k of plain) if (N[k].e != null && typeof N[k].t === "string") for (const w of words) if (N[k].t.includes(w) && !learnable[w].includes(id)) learnable[w].push(id);
  const plainE = new Set([...plain].map(k => N[k].e).filter(e => e != null));
  for (const k of Object.keys(N)) if (!reached.has(k)) warn(id, `ノード ${k} にはどこからもたどり着けません`);
  const hit = new Set([...reached].map(k => N[k].e).filter(e => e != null));
  E.forEach((e, i) => {
    if (!hit.has(i)) err(id, `END ${i + 1}「${e.title}」にたどり着く方法がありません`);
    else if (e.hidden && plainE.has(i)) warn(id, `END ${i + 1}「${e.title}」は hidden ですが、学習候補を通らなくても行けます`);
    else if (!e.hidden && !plainE.has(i)) warn(id, `END ${i + 1}「${e.title}」は hidden ではないのに、学習候補を通らないと行けません`);
  });

  console.log(`✓ ${id}: エンディング ${E.length}個 / ノード ${Object.keys(N).length}個`);
}

// 学習（言葉ごと）
for (const w of words) {
  if (!learnable[w].length) err("学習", `「${w}」を学べる文（学習候補を通らずに送れて、その言葉を含む文）がどのステージにもありません`);
  else if (learnIn[w].length && !learnable[w].some(s => !learnIn[w].includes(s))) warn("学習", `「${w}」は学習候補があるステージ（${learnIn[w].join("、")}）でしか学べません`);
}
console.log("\n学習できる場所:");
for (const w of words) console.log(`  ${w}: ${learnable[w].join("、") || "（なし）"}${learnIn[w].length ? ` / 学習候補あり: ${learnIn[w].join("、")}` : ""}`);
console.log("学習候補の数: " + order.map(id => `${id} ${learnCands[id] || 0}`).join(" / "));
console.log("");

for (const w of warnings) console.log("注意 " + w);
for (const e of errors) console.log("エラー " + e);
if (errors.length) { console.log(`\nエラー ${errors.length}件`); process.exit(1); }
console.log(`\nOK（注意 ${warnings.length}件）`);
