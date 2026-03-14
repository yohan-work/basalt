export interface VoiceConfig {
    voice: string;
    rate?: string;
    pitch?: string;
}

const AGENT_VOICE_MAP: Record<string, VoiceConfig> = {
    'product-manager': {
        voice: 'ko-KR-SunHiNeural',
        rate: '+0%',
        pitch: '+0Hz',
    },
    'main-agent': {
        voice: 'ko-KR-HyunsuMultilingualNeural',
        rate: '-5%',
        pitch: '-2Hz',
    },
    'software-engineer': {
        voice: 'ko-KR-InJoonNeural',
        rate: '+5%',
        pitch: '+0Hz',
    },
    'designer': {
        voice: 'ko-KR-SunHiNeural',
        rate: '+0%',
        pitch: '+5Hz',
    },
    'style-architect': {
        voice: 'ko-KR-SunHiNeural',
        rate: '+0%',
        pitch: '+5Hz',
    },
    'qa': {
        voice: 'ko-KR-InJoonNeural',
        rate: '-3%',
        pitch: '-3Hz',
    },
    'devops-engineer': {
        voice: 'ko-KR-HyunsuMultilingualNeural',
        rate: '+3%',
        pitch: '+2Hz',
    },
    'technical-writer': {
        voice: 'ko-KR-SunHiNeural',
        rate: '-5%',
        pitch: '-3Hz',
    },
    'database-administrator': {
        voice: 'ko-KR-InJoonNeural',
        rate: '+0%',
        pitch: '+3Hz',
    },
    'git-manager': {
        voice: 'ko-KR-HyunsuMultilingualNeural',
        rate: '+5%',
        pitch: '+0Hz',
    },
};

const DEFAULT_VOICE: VoiceConfig = {
    voice: 'ko-KR-SunHiNeural',
    rate: '+0%',
    pitch: '+0Hz',
};

export function getVoiceForAgent(agentRole: string): VoiceConfig {
    const role = agentRole.toLowerCase();

    if (AGENT_VOICE_MAP[role]) return AGENT_VOICE_MAP[role];

    if (role.includes('lead') || role.includes('main')) return AGENT_VOICE_MAP['main-agent'];
    if (role.includes('dev') || role.includes('software')) return AGENT_VOICE_MAP['software-engineer'];
    if (role.includes('design') || role.includes('style')) return AGENT_VOICE_MAP['designer'];
    if (role.includes('pm') || role.includes('product')) return AGENT_VOICE_MAP['product-manager'];

    return DEFAULT_VOICE;
}
