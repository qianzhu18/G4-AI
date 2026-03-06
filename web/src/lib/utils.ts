export function normalizeAiName(name: string): string {
    const lower = name.toLowerCase()
    const aliases: Record<string, string> = {
        'openai': 'chatgpt',
        'xai': 'grok',
        'x.ai': 'grok',
    }
    return aliases[lower] || lower
}
