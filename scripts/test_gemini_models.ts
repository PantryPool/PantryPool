/**
 * ⚡ PantryPool — Automated AI Model Benchmark & Discovery Suite
 *
 * Runs non-destructive probes against candidate and newly released Google Gemini models
 * to verify model availability, token latency, and JSON parsing fidelity.
 *
 * Usage:
 *   npm run test:ai
 *   TARGET_URL=https://pantrypool.com npm run test:ai
 */

import dotenv from 'dotenv';
dotenv.config();

const TARGET_URL = process.env.TARGET_URL || 'https://pantrypool.com';
const API_KEY = process.env.GEMINI_API_KEY;

const CANDIDATE_MODELS = [
  { model: 'gemini-2.5-flash-lite', thinkingBudget: 0, label: 'Gemini 2.5 Flash Lite (Target Default)' },
  { model: 'gemini-3.5-flash-lite', thinkingBudget: 0, label: 'Gemini 3.5 Flash Lite (Fallback Option)' },
  { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Standard Fallback)' },
  { model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Deprecated Check)' },
  { model: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Legacy Check)' }
];

// 1x1 test pixel
const SAMPLE_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface ProbeResult {
  model: string;
  label: string;
  status: 'ONLINE' | 'THROTTLED' | 'DEPRECATED' | 'OFFLINE';
  totalLatencyMs: number;
  apiLatencyMs: number;
  tokens: number;
  costUsd: number;
  notes: string;
}

async function discoverGoogleModels(apiKey?: string): Promise<string[]> {
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.includes('PLACEHOLDER')) {
    return [];
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`);
    if (!res.ok) return [];
    const data: any = await res.json();
    const models: any[] = data.models || [];
    return models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((name) => name.toLowerCase().includes('flash'));
  } catch {
    return [];
  }
}

async function runModelBenchmark() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           🤖 PantryPool AI Model Availability & Latency Benchmark            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget Gateway : ${TARGET_URL}/api/parse-receipt`);
  console.log(`Active Time    : ${new Date().toISOString()}`);

  if (API_KEY && API_KEY !== 'MY_GEMINI_API_KEY') {
    const discovered = await discoverGoogleModels(API_KEY);
    if (discovered.length > 0) {
      console.log(`\n🔍 Discovered ${discovered.length} Flash models in Google API catalog:`);
      console.log(`   ${discovered.slice(0, 8).join(', ')}${discovered.length > 8 ? '...' : ''}`);
    }
  }

  console.log('\nBenchmarking candidate models...\n');

  const results: ProbeResult[] = [];

  for (const item of CANDIDATE_MODELS) {
    const start = Date.now();
    try {
      const res = await fetch(`${TARGET_URL.replace(/\/+$/, '')}/api/parse-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: item.model,
          thinkingBudget: item.thinkingBudget,
          imageBase64: SAMPLE_IMAGE,
          mimeType: 'image/png'
        })
      });

      const totalLatency = Date.now() - start;
      const data: any = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        results.push({
          model: item.model,
          label: item.label,
          status: 'ONLINE',
          totalLatencyMs: totalLatency,
          apiLatencyMs: data.aiUsage?.latencyMs || totalLatency,
          tokens: data.aiUsage?.totalTokens || 0,
          costUsd: data.aiUsage?.estimatedCostUsd || 0,
          notes: totalLatency < 2000 ? '⚡ Ultra-Fast (<2s)' : '🐢 High Latency (>2s)'
        });
      } else if (res.status === 429 || data.error?.toLowerCase().includes('rate limit') || data.error?.toLowerCase().includes('too many requests')) {
        results.push({
          model: item.model,
          label: item.label,
          status: 'THROTTLED',
          totalLatencyMs: totalLatency,
          apiLatencyMs: 0,
          tokens: 0,
          costUsd: 0,
          notes: '429 Rate limited'
        });
      } else if (data.error?.toLowerCase().includes('no longer available') || res.status === 404) {
        results.push({
          model: item.model,
          label: item.label,
          status: 'DEPRECATED',
          totalLatencyMs: totalLatency,
          apiLatencyMs: 0,
          tokens: 0,
          costUsd: 0,
          notes: 'Deprecated by Google'
        });
      } else {
        results.push({
          model: item.model,
          label: item.label,
          status: 'OFFLINE',
          totalLatencyMs: totalLatency,
          apiLatencyMs: 0,
          tokens: 0,
          costUsd: 0,
          notes: data.error?.slice(0, 40) || `HTTP ${res.status}`
        });
      }
    } catch (err: any) {
      results.push({
        model: item.model,
        label: item.label,
        status: 'OFFLINE',
        totalLatencyMs: Date.now() - start,
        apiLatencyMs: 0,
        tokens: 0,
        costUsd: 0,
        notes: err.message?.slice(0, 40) || 'Network error'
      });
    }

    // Brief delay to prevent bursting against quota
    await new Promise((r) => setTimeout(r, 600));
  }

  // Print Formatted Report Table
  console.log('┌──────────────────────────────────────────────┬────────────┬───────────┬──────────────┬─────────────────────────┐');
  console.log('│ Model / Configuration                        │ Status     │ Total RTT │ Model Cost   │ Performance Assessment  │');
  console.log('├──────────────────────────────────────────────┼────────────┼───────────┼──────────────┼─────────────────────────┤');

  for (const r of results) {
    const padName = r.label.padEnd(44).slice(0, 44);
    const statusFormatted = (r.status === 'ONLINE' ? '🟢 ONLINE ' : r.status === 'THROTTLED' ? '🟡 LIMIT  ' : '🔴 DEAD   ').padEnd(10);
    const latencyFormatted = r.status === 'ONLINE' ? `${(r.totalLatencyMs / 1000).toFixed(2)}s`.padStart(9) : '   ---   ';
    const costFormatted = r.status === 'ONLINE' ? `$${r.costUsd.toFixed(6)}`.padStart(12) : '     ---    ';
    const notesFormatted = r.notes.padEnd(23).slice(0, 23);

    console.log(`│ ${padName} │ ${statusFormatted} │ ${latencyFormatted} │ ${costFormatted} │ ${notesFormatted} │`);
  }

  console.log('└──────────────────────────────────────────────┴────────────┴───────────┴──────────────┴─────────────────────────┘');

  const fastOnline = results.filter((r) => r.status === 'ONLINE').sort((a, b) => a.totalLatencyMs - b.totalLatencyMs);
  if (fastOnline.length > 0) {
    console.log(`\n🏆 Recommended Primary Model: ${fastOnline[0].model} (${(fastOnline[0].totalLatencyMs / 1000).toFixed(2)}s round-trip)`);
  }
}

runModelBenchmark().catch(console.error);
