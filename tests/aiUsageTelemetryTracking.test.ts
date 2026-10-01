import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { StorageAiUsageLog } from '../src/server/storage/types';

function createMockStorageWithAiLogs(initialSettings: Record<string, any> = {}) {
  let settings: Record<string, any> = { ...initialSettings };
  const aiLogs: StorageAiUsageLog[] = [];
  const items: any[] = [
    {
      id: 'item_cold_brew',
      pool_id: 'pool_test',
      name: 'Stumptown Nitro Cold Brew',
      category: 'Coffee & Tea',
      stock: 10,
      min_stock: 4,
      cost_per_unit: 3.50
    }
  ];

  return {
    getSystemSettings: async () => ({ ...settings }),
    saveSystemSettings: async (newSettings: Record<string, any>) => {
      settings = { ...settings, ...newSettings };
    },
    listItemsByPool: async (poolId: string) => items.filter(i => i.pool_id === poolId),
    getPoolById: async (poolId: string) => ({
      id: poolId,
      name: 'Test Breakroom',
      champion_id: 'usr_admin'
    }),
    getPoolMember: async () => ({ role: 'champion' }),
    getUserById: async (userId: string) => ({
      id: userId,
      email: 'admin@pantrypool.com',
      system_role: 'superadmin'
    }),
    logAiUsage: async (log: StorageAiUsageLog) => {
      aiLogs.push({ ...log, created_at: new Date().toISOString() });
    },
    logAiAppliedItems: async (scanLogId: string, appliedJson: string) => {
      const entry = aiLogs.find(l => l.id === scanLogId);
      if (entry) {
        entry.applied_items_json = appliedJson;
      }
    },
    getAiUsageStats: async (envModel = 'gemini-2.5-flash') => {
      const totalScans = aiLogs.length;
      const totalPromptTokens = aiLogs.reduce((acc, curr) => acc + (curr.prompt_tokens || 0), 0);
      const totalCompletionTokens = aiLogs.reduce((acc, curr) => acc + (curr.completion_tokens || 0), 0);
      const totalTokens = aiLogs.reduce((acc, curr) => acc + (curr.total_tokens || 0), 0);
      const totalEstimatedCostUsd = aiLogs.reduce((acc, curr) => acc + (curr.estimated_cost_usd || 0), 0);
      const avgCostPerScan = totalScans > 0 ? totalEstimatedCostUsd / totalScans : 0.00017;

      const modelMap = new Map<string, { scanCount: number; tokens: number; costUsd: number }>();
      for (const log of aiLogs) {
        const cur = modelMap.get(log.model) || { scanCount: 0, tokens: 0, costUsd: 0 };
        cur.scanCount += 1;
        cur.tokens += (log.total_tokens || 0);
        cur.costUsd += (log.estimated_cost_usd || 0);
        modelMap.set(log.model, cur);
      }

      const modelBreakdown = Array.from(modelMap.entries()).map(([model, data]) => ({
        model,
        scanCount: data.scanCount,
        tokens: data.tokens,
        costUsd: Number(data.costUsd.toFixed(6))
      }));

      const recentLogs = [...aiLogs].reverse().map(l => ({
        id: l.id,
        userId: l.user_id,
        userEmail: l.user_email || 'anonymous',
        poolId: l.pool_id,
        model: l.model,
        activity: l.activity,
        promptTokens: l.prompt_tokens || 0,
        completionTokens: l.completion_tokens || 0,
        totalTokens: l.total_tokens || 0,
        estimatedCostUsd: Number((l.estimated_cost_usd || 0).toFixed(6)),
        status: l.status || 'success',
        parsedItems: l.parsed_items_json ? JSON.parse(l.parsed_items_json) : [],
        appliedItems: l.applied_items_json ? JSON.parse(l.applied_items_json) : [],
        createdAt: l.created_at
      }));

      return {
        summary: {
          totalScans,
          totalPromptTokens,
          totalCompletionTokens,
          totalTokens,
          totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
          avgCostPerScanUsd: Number(avgCostPerScan.toFixed(6)),
          activePrimaryModel: envModel
        },
        modelBreakdown,
        recentLogs
      };
    },
    _getRawAiLogs: () => aiLogs
  } as any;
}

describe('AI Usage & Cost Telemetry Ledger Tracking', () => {
  const jwtSecret = 'secret_test_jwt_telemetry_tracking_1234567890';
  let adminToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.TYPESAFE_API_KEY = 'apikey_test_valid_key_1234567890';
    process.env.GEMINI_API_KEY = 'gemini_test_valid_key_1234567890';
    adminToken = await createUniversalToken(
      { userId: 'usr_admin', email: 'admin@pantrypool.com', name: 'Admin', systemRole: 'superadmin' },
      jwtSecret
    );
  });

  it('records Gemini OCR scan with token counts, sub-cent cost, and returns scanLogId', async () => {
    const storage = createMockStorageWithAiLogs({ typesafe_ai_enabled: 'false' });
    const app = createUniversalApi(storage, jwtSecret);

    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  storeName: 'Costco Wholesale',
                  date: '2026-09-24',
                  subtotal: 24.00,
                  taxAmount: 0.00,
                  totalAmount: 24.00,
                  items: [
                    {
                      name: 'Kirkland Sparkling Water',
                      category: 'Beverages',
                      quantity: 24,
                      costPerUnit: 1.00,
                      totalCost: 24.00,
                      unitName: 'can'
                    }
                  ]
                })
              }
            ]
          }
        }
      ],
      usageMetadata: {
        promptTokenCount: 1200,
        candidatesTokenCount: 350,
        totalTokenCount: 1550
      }
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => mockGeminiResponse
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const res = await app.request('/api/parse-receipt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool_test',
        imageBase64: 'data:image/jpeg;base64,dGVzdF9pbWFnZV9ieXRlcw=='
      })
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.scanLogId).toBeDefined();
    expect(body.scanLogId).toMatch(/^ai-\d+-[a-z0-9]+/);
    expect(body.aiUsage).toBeDefined();
    expect(body.aiUsage.promptTokens).toBe(1200);
    expect(body.aiUsage.completionTokens).toBe(350);
    expect(body.aiUsage.totalTokens).toBe(1550);
    // Cost: 1200 * 0.000000075 + 350 * 0.00000030 = 0.00009 + 0.000105 = 0.000195
    expect(body.aiUsage.estimatedCostUsd).toBe(0.000195);

    // Verify written to storage
    const rawLogs = storage._getRawAiLogs();
    expect(rawLogs.length).toBe(1);
    expect(rawLogs[0].id).toBe(body.scanLogId);
    expect(rawLogs[0].activity).toBe('receipt_ocr');
    expect(rawLogs[0].user_email).toBe('admin@pantrypool.com');
    expect(rawLogs[0].pool_id).toBe('pool_test');
    expect(rawLogs[0].estimated_cost_usd).toBe(0.000195);
  });

  it('records TypeSafe usage and sub-cent cost at $0.042/Mtok for natural language hauls', async () => {
    const storage = createMockStorageWithAiLogs({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(storage, jwtSecret);

    const mockTypeSafeResponse = {
      model: 'jev-1.13.0',
      answers: {
        cat_0: {
          type: 'choice',
          choice: 'Beverages',
          confidence: 0.98,
          probabilities: { Beverages: 0.98 }
        },
        is_item_0: {
          type: 'noul',
          noul: 0.99
        }
      },
      usage: {
        input_tokens: 450,
        output_tokens: 30
      }
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('api.typesafe.ai')) {
        return {
          ok: true,
          json: async () => mockTypeSafeResponse
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const res = await app.request('/api/parse-receipt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool_test',
        textInput: 'brought in 6 bottles of cold brew coffee for $18'
      })
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.aiSource).toBe('typesafe');
    expect(body.scanLogId).toBeDefined();
    expect(body.aiUsage).toBeDefined();
    expect(body.aiUsage.model).toBe('jev-latest');
    expect(body.aiUsage.promptTokens).toBeGreaterThanOrEqual(450);
    // 450 input tokens * $0.000000042 = $0.0000189
    expect(body.aiUsage.estimatedCostUsd).toBeGreaterThan(0);

    // Verify stored in ai_usage_logs
    const rawLogs = storage._getRawAiLogs();
    expect(rawLogs.length).toBeGreaterThanOrEqual(1);
    const tsLog = rawLogs.find((l: StorageAiUsageLog) => l.model === 'jev-latest');
    expect(tsLog).toBeDefined();
    expect(tsLog.activity).toBe('receipt_text_parse');
    expect(tsLog.prompt_tokens).toBeGreaterThanOrEqual(450);
  });

  it('records TypeSafe usage during SKU deduplication match-candidate calls', async () => {
    const storage = createMockStorageWithAiLogs({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(storage, jwtSecret);

    const mockTypeSafeResponse = {
      model: 'jev-1.13.0',
      answers: {
        match: {
          type: 'choice',
          choice: 'item_cold_brew',
          confidence: 0.96
        }
      },
      usage: {
        input_tokens: 320,
        output_tokens: 15
      }
    };

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (typeof url === 'string' && url.includes('api.typesafe.ai')) {
        return {
          ok: true,
          json: async () => mockTypeSafeResponse
        } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    const res = await app.request('/api/items/match-candidate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool_test',
        candidateName: 'Stumptown Cold Brew Cans'
      })
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.strategy).toBe('typesafe');
    expect(body.matchedItem.id).toBe('item_cold_brew');

    const rawLogs = storage._getRawAiLogs();
    expect(rawLogs.length).toBe(1);
    expect(rawLogs[0].activity).toBe('catalog_deduplication');
    expect(rawLogs[0].prompt_tokens).toBe(320);
    // 320 * 0.000000042 = 0.00001344 -> 0.000013
    expect(rawLogs[0].estimated_cost_usd).toBe(0.000013);
  });

  it('links confirmed applied items back to the scan log via POST /api/ai-log-applied', async () => {
    const storage = createMockStorageWithAiLogs();
    const app = createUniversalApi(storage, jwtSecret);

    // Initial scan log entry
    const scanLogId = 'ai-scan-test-12345';
    await storage.logAiUsage({
      id: scanLogId,
      user_id: 'usr_admin',
      user_email: 'admin@pantrypool.com',
      pool_id: 'pool_test',
      model: 'gemini-2.5-flash',
      activity: 'receipt_ocr',
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      estimated_cost_usd: 0.000135,
      status: 'success',
      parsed_items_json: JSON.stringify([{ name: 'Apples', quantity: 5, costPerUnit: 1.00 }])
    });

    // Confirmation applied
    const appliedRes = await app.request('/api/ai-log-applied', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scanLogId,
        storeName: 'Safeway',
        totalAmount: 5.00,
        appliedItems: [{ name: 'Apples', quantity: 5, costPerUnit: 1.00, totalCost: 5.00 }]
      })
    });

    expect(appliedRes.status).toBe(200);
    const body: any = await appliedRes.json();
    expect(body.success).toBe(true);

    const rawLogs = storage._getRawAiLogs();
    const updatedLog = rawLogs.find((l: StorageAiUsageLog) => l.id === scanLogId);
    expect(updatedLog.applied_items_json).toBeDefined();
    const parsedApplied = JSON.parse(updatedLog.applied_items_json);
    expect(parsedApplied.storeName).toBe('Safeway');
    expect(parsedApplied.items.length).toBe(1);
    expect(parsedApplied.items[0].name).toBe('Apples');
  });

  it('aggregates Gemini and TypeSafe metrics on GET /api/admin/ai-usage', async () => {
    const storage = createMockStorageWithAiLogs({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(storage, jwtSecret);

    // Seed one Gemini OCR scan
    await storage.logAiUsage({
      id: 'ai-ocr-1',
      model: 'gemini-2.5-flash',
      activity: 'receipt_ocr',
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      estimated_cost_usd: 0.000135,
      status: 'success'
    });

    // Seed one TypeSafe judgment
    await storage.logAiUsage({
      id: 'ts-eval-1',
      model: 'jev-latest',
      activity: 'typesafe_haul_enrichment',
      prompt_tokens: 500,
      completion_tokens: 40,
      total_tokens: 540,
      estimated_cost_usd: 0.000021,
      status: 'success'
    });

    const res = await app.request('/api/admin/ai-usage', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary.totalScans).toBe(2);
    expect(data.summary.totalTokens).toBe(1740);
    expect(data.summary.totalEstimatedCostUsd).toBe(0.000156);

    // Verify model breakdown includes both Gemini and TypeSafe
    expect(data.modelBreakdown).toHaveLength(2);
    const geminiStat = data.modelBreakdown.find((m: any) => m.model === 'gemini-2.5-flash');
    const typesafeStat = data.modelBreakdown.find((m: any) => m.model === 'jev-latest');
    expect(geminiStat).toBeDefined();
    expect(geminiStat.scanCount).toBe(1);
    expect(typesafeStat).toBeDefined();
    expect(typesafeStat.scanCount).toBe(1);
    expect(typesafeStat.tokens).toBe(540);
    expect(typesafeStat.costUsd).toBe(0.000021);

    // Verify recent logs includes both
    expect(data.recentLogs).toHaveLength(2);
    expect(data.recentLogs[0].id).toBe('ts-eval-1');
    expect(data.recentLogs[1].id).toBe('ai-ocr-1');
  });
});
