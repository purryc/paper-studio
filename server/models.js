export function modelCatalog(tools = {}) {
  return {
    capture: {
      preferredSources: [
        'MacBook Pro Desk View Camera',
        'che iphone Desk View Camera',
        'che iphone Camera',
        'MacBook Pro Camera',
        'upload',
      ],
      cleanup: {
        providerId: 'opencv',
        available: Boolean(tools.opencv?.available),
      },
    },
    image: [
      {
        providerId: 'libtv',
        label: 'LibTV image',
        role: 'default',
        available: Boolean(tools.libtv?.available),
        confirmRequired: true,
      },
    ],
    video: [
      {
        providerId: 'libtv',
        label: 'LibTV video',
        role: 'default',
        available: Boolean(tools.libtv?.available),
        confirmRequired: true,
      },
    ],
    deck: [
      {
        providerId: 'gemini-cli',
        label: 'Gemini CLI planner',
        role: 'default',
        available: Boolean(tools.gemini?.available && tools.slidev?.available),
        confirmRequired: true,
        exportFormats: ['web', 'pptx'],
      },
      {
        providerId: 'codex-slidev',
        label: 'Codex CLI + slidev skill',
        role: 'fallback',
        available: Boolean(tools.codex?.available && tools.slidev?.available),
        confirmRequired: true,
        exportFormats: ['web', 'pptx'],
      },
    ],
  };
}
