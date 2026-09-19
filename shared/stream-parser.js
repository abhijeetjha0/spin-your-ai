/**
 * Parses Server-Sent Events (SSE) stream commonly used by OpenAI-compatible APIs.
 * Yields parsed JSON chunks.
 */
export async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last partial line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty lines and comments

        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.substring(6).trim();
          
          if (dataStr === '[DONE]') {
            return;
          }

          try {
            const data = JSON.parse(dataStr);
            yield data;
          } catch (e) {
            console.error('Error parsing SSE data:', e, 'Data:', dataStr);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
