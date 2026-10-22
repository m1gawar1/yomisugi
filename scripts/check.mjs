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

const { order } = JSON.parse(readFileSync(join(dataDir, "stages.json"), "utf8"));
const files = readdirSync(join(dataDir, "stages")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));

for (const f of files) if (!order.includes(f)) warn(f, "data/stages.json の order に入っていないため、ゲームに出ません");

const seenIds = new Set();
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
    for (const c of n.c || []) {
      if (!Array.isArray(c) || c.length !== 2) { err(id, `ノード ${k} の候補の形が [表示, 行き先] になっていません`); continue; }
      const [label, next] = c;
      if (!N[next]) err(id, `ノード ${k} の候補「${label}」の行き先 ${next} がありません`);
      if (labels.has(label)) warn(id, `ノード ${k} に同じ候補「${label}」が2つあります`);
      labels.add(label);
      if (N[next] && typeof N[next].t === "string" && !N[next].t.startsWith(n.t)) warn(id, `ノード ${k}→${next}: 行き先の文「${N[next].t}」が「${n.t}」の続きになっていません`);
    }
  }

  // たどり着けるか
  const reached = new Set(["s"]);
  const stack = ["s"];
  while (stack.length) {
    const k = stack.pop();
    for (const [, next] of N[k]?.c || []) if (N[next] && !reached.has(next)) { reached.add(next); stack.push(next); }
  }
  for (const k of Object.keys(N)) if (!reached.has(k)) warn(id, `ノード ${k} にはどこからもたどり着けません`);
  const hit = new Set([...reached].map(k => N[k].e).filter(e => e != null));
  E.forEach((e, i) => { if (!hit.has(i)) err(id, `END ${i + 1}「${e.title}」にたどり着く方法がありません`); });

  console.log(`✓ ${id}: エンディング ${E.length}個 / ノード ${Object.keys(N).length}個`);
}

for (const w of warnings) console.log("注意 " + w);
for (const e of errors) console.log("エラー " + e);
if (errors.length) { console.log(`\nエラー ${errors.length}件`); process.exit(1); }
console.log(`\nOK（注意 ${warnings.length}件）`);
