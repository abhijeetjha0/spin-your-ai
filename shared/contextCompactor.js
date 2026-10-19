/**
 * contextCompactor.js — Compacting chat history to save tokens and improve performance.
 * Preserves the most recent N turns verbatim while condensing older turns into a structured summary.
 */

export const PRESERVED_RECENT_TURNS = 4;
export const AUTO_COMPACT_MIN_TURNS = 10;
export const AUTO_COMPACT_TOKEN_THRESHOLD = 6000;

/**
 * Fast heuristic token estimation (~4 characters per token).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimates total tokens in a chat history array.
 */
export function estimateHistoryTokens(history) {
  if (!history || !Array.isArray(history)) return 0;
  return history.reduce((sum, item) => sum + estimateTokens(item.text), 0);
}

/**
 * Deterministic, zero-latency context summarizer.
 * Extracts user queries, page references, and key assistant findings without extra LLM latency.
 */
export function generateDeterministicSummary(items) {
  const bullets = [];
  const urlsReferenced = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = item.text || '';

    // Extract page URL or titles if present
    const urlMatches = text.match(/URL:\s*(https?:\/\/[^\s\n]+)/g);
    if (urlMatches) {
      for (const m of urlMatches) {
        urlsReferenced.add(m.replace(/^URL:\s*/, '').trim());
      }
    }

    if (item.role === 'user') {
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '[Code snippet provided]')
        .replace(/Here is the context of the webpage[\s\S]*?\[Content was truncated[\s\S]*?\]/g, '[Page context]')
        .trim();

      const firstLine = cleanText.split('\n')[0].substring(0, 140).trim();
      if (firstLine) {
        bullets.push(`- User queried/instructed: "${firstLine}${cleanText.length > 140 ? '...' : ''}"`);
      }
    } else if (item.role === 'assistant') {
      const headings = text.match(/^#{1,3}\s+(.+)$/gm);
      if (headings && headings.length > 0) {
        const keyPoints = headings.slice(0, 2).map(h => h.replace(/^#{1,3}\s+/, '').trim()).join('; ');
        bullets.push(`  - Assistant addressed: ${keyPoints}`);
      } else {
        const firstNonEmpty = text.split('\n').find(l => l.trim().length > 0 && !l.startsWith('>')) || '';
        const snippet = firstNonEmpty.substring(0, 120).trim();
        if (snippet) {
          bullets.push(`  - Assistant outcome: "${snippet}..."`);
        }
      }
    }
  }

  let urlSummary = '';
  if (urlsReferenced.size > 0) {
    urlSummary = `\nWebpages referenced earlier: ${Array.from(urlsReferenced).map(u => `\`${u}\``).join(', ')}`;
  }

  return `[COMPACTED CONTEXT SUMMARY - ${items.length} EARLIER TURNS]\n` +
    `The following summary condenses earlier turns to minimize tokens while preserving conversational continuity:\n` +
    bullets.join('\n') +
    urlSummary +
    `\n[END COMPACTED CONTEXT SUMMARY]`;
}

/**
 * Compacts older turns in chat history.
 */
export async function compactHistory(history, providerInstance = null, modelId = null) {
  if (!history || history.length <= PRESERVED_RECENT_TURNS) {
    return {
      summary: '',
      compactedCount: 0,
      savedTokens: 0,
      remainingHistory: history || []
    };
  }

  const splitIndex = history.length - PRESERVED_RECENT_TURNS;
  const olderItems = history.slice(0, splitIndex);
  const remainingHistory = history.slice(splitIndex);

  const priorTokens = estimateHistoryTokens(olderItems);
  let summary = '';

  // Optional AI-generated summary if provider instance is available
  if (providerInstance && modelId && typeof providerInstance.streamChat === 'function') {
    try {
      summary = await generateAiSummary(olderItems, providerInstance, modelId);
    } catch (_e) {
      summary = generateDeterministicSummary(olderItems);
    }
  } else {
    summary = generateDeterministicSummary(olderItems);
  }

  const summaryTokens = estimateTokens(summary);
  const savedTokens = Math.max(0, priorTokens - summaryTokens);

  return {
    summary,
    compactedCount: olderItems.length,
    savedTokens,
    remainingHistory
  };
}

async function generateAiSummary(items, providerInstance, modelId) {
  const transcript = items.map(item => `${item.role.toUpperCase()}: ${(item.text || '').substring(0, 800)}`).join('\n\n');
  const prompt = `Condense the following conversation history into a dense, high-utility context brief under 250 words:
1. User goals and queries
2. Decisions finalized or web context analyzed
3. Technical state or outcomes

Conversation:
${transcript}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  let result = '';
  try {
    const stream = providerInstance.streamChat(
      [{ role: 'user', content: prompt }],
      modelId,
      controller.signal
    );

    for await (const chunk of stream) {
      if (chunk.text) result += chunk.text;
    }
  } finally {
    clearTimeout(timer);
  }

  if (!result.trim()) {
    throw new Error('Empty summary from model');
  }

  return `[COMPACTED CONTEXT SUMMARY - ${items.length} EARLIER TURNS]\n` +
    result.trim() +
    `\n[END COMPACTED CONTEXT SUMMARY]`;
}
