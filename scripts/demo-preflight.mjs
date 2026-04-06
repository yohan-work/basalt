#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const envPath = resolve(cwd, '.env.local');
const args = process.argv.slice(2);

const targetUrlArg = args.find((arg) => arg.startsWith('--target-url='));
const targetUrl = targetUrlArg ? targetUrlArg.slice('--target-url='.length) : null;

function parseDotEnv(content) {
  const map = new Map();
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    map.set(key, value);
  }
  return map;
}

function resultLine(status, title, detail) {
  return `${status} ${title}${detail ? ` - ${detail}` : ''}`;
}

async function checkHttpJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 240),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const lines = [];
  let failCount = 0;
  let warnCount = 0;

  lines.push('Basalt demo preflight');
  lines.push(`- cwd: ${cwd}`);
  lines.push(`- env: ${envPath}`);
  if (targetUrl) lines.push(`- target-url: ${targetUrl}`);
  lines.push('');

  if (!existsSync(envPath)) {
    lines.push(resultLine('FAIL', '.env.local', '파일이 없습니다.'));
    failCount += 1;
  }

  const envMap = existsSync(envPath)
    ? parseDotEnv(readFileSync(envPath, 'utf8'))
    : new Map();

  const requiredEnvKeys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'OLLAMA_BASE_URL',
    'FAST_MODEL',
    'SMART_MODEL',
    'CODING_MODEL',
  ];

  for (const key of requiredEnvKeys) {
    const value = envMap.get(key);
    if (!value) {
      lines.push(resultLine('FAIL', key, '값이 비어있거나 누락되었습니다.'));
      failCount += 1;
    } else {
      lines.push(resultLine('PASS', key, value));
    }
  }

  const basaltUrl = 'http://localhost:3000';
  const basaltCheck = await checkHttpJson(basaltUrl);
  if (basaltCheck.ok) {
    lines.push(resultLine('PASS', 'Basalt dev server', `${basaltUrl} (${basaltCheck.status})`));
  } else {
    lines.push(resultLine('WARN', 'Basalt dev server', `응답 없음 (${basaltCheck.body})`));
    warnCount += 1;
  }

  const ollamaBaseUrl = envMap.get('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434';
  const ollamaCheck = await checkHttpJson(`${ollamaBaseUrl.replace(/\/$/, '')}/api/tags`);
  if (ollamaCheck.ok) {
    lines.push(resultLine('PASS', 'Ollama /api/tags', `${ollamaBaseUrl} (${ollamaCheck.status})`));
  } else {
    lines.push(resultLine('WARN', 'Ollama /api/tags', `응답 없음 (${ollamaCheck.body})`));
    warnCount += 1;
  }

  if (targetUrl) {
    const targetCheck = await checkHttpJson(targetUrl);
    if (targetCheck.ok) {
      lines.push(resultLine('PASS', 'Target dev server', `${targetUrl} (${targetCheck.status})`));
    } else {
      lines.push(resultLine('WARN', 'Target dev server', `응답 없음 (${targetCheck.body})`));
      warnCount += 1;
    }
  } else {
    lines.push(resultLine('WARN', 'Target dev server', '--target-url=<http://localhost:3001> 옵션을 주면 점검합니다.'));
    warnCount += 1;
  }

  const agentBrowser = spawnSync('agent-browser', ['--version'], { encoding: 'utf8' });
  if (agentBrowser.status === 0) {
    lines.push(resultLine('PASS', 'agent-browser', (agentBrowser.stdout || '').trim()));
  } else {
    lines.push(resultLine('WARN', 'agent-browser', 'PATH에서 찾지 못했습니다. 검수 스크린샷은 선택 증빙으로 진행하세요.'));
    warnCount += 1;
  }

  lines.push('');
  lines.push(`Summary: FAIL=${failCount}, WARN=${warnCount}`);
  if (failCount > 0) {
    lines.push('결론: 필수 항목 실패가 있어 발표 전 수정이 필요합니다.');
    console.error(lines.join('\n'));
    process.exit(1);
  }

  if (warnCount > 0) {
    lines.push('결론: 필수 항목은 통과했지만 경고가 있습니다. 데모 백업 대본을 준비하세요.');
  } else {
    lines.push('결론: 발표 데모 진행 준비가 완료되었습니다.');
  }
  console.log(lines.join('\n'));
}

main();
