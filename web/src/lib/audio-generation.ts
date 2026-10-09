export const audioVoiceOptions = [
    { value: "alloy", label: "Alloy" },
    { value: "ash", label: "Ash" },
    { value: "ballad", label: "Ballad" },
    { value: "coral", label: "Coral" },
    { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" },
    { value: "nova", label: "Nova" },
    { value: "onyx", label: "Onyx" },
    { value: "sage", label: "Sage" },
    { value: "shimmer", label: "Shimmer" },
    { value: "verse", label: "Verse" },
    { value: "marin", label: "Marin" },
    { value: "cedar", label: "Cedar" },
];

export const openRouterMusicModels = [
    { value: "google/lyria-3-pro-preview", label: "Google: Lyria 3 Pro Preview" },
    { value: "google/lyria-3-clip-preview", label: "Google: Lyria 3 Clip Preview" },
];

export function isOpenRouterMusicModel(value: string | undefined): value is string {
    return openRouterMusicModels.some((model) => model.value === value);
}

type SpeechModelOption = { value: string; label: string; voices?: { value: string; label: string }[] };

export const openRouterSpeechModels: SpeechModelOption[] = [
    { value: "fish-audio/s2.1-pro", label: "Fish Audio: S2.1 Pro" },
];

export function isOpenRouterSpeechModel(value: string | undefined): value is string {
    return openRouterSpeechModels.some((model) => model.value === value);
}

export function speechModelOf(value: string | undefined) {
    return openRouterSpeechModels.find((model) => model.value === value);
}

export function speechVoiceOptions(model: string | undefined) {
    return speechModelOf(model)?.voices || [];
}

export function speechVoiceLabel(model: string | undefined, value: string) {
    const voices = speechVoiceOptions(model);
    return voices.find((item) => item.value === value)?.label || voices[0]?.label || value;
}

export const speechFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "pcm", label: "PCM" },
];

export function speechAudioFormat(value: string) {
    return normalizeAudioFormatValue(value) === "pcm" ? "pcm" : "mp3";
}

export const audioFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "wav", label: "WAV" },
    { value: "opus", label: "Opus" },
    { value: "aac", label: "AAC" },
    { value: "flac", label: "FLAC" },
    { value: "pcm", label: "PCM" },
];

export function normalizeAudioVoiceValue(value: string) {
    return audioVoiceOptions.some((item) => item.value === value) ? value : "alloy";
}

export function normalizeAudioFormatValue(value: string) {
    return audioFormatOptions.some((item) => item.value === value) ? value : "mp3";
}

export const musicFormatOptions = [
    { value: "mp3", label: "MP3" },
    { value: "wav", label: "WAV" },
    { value: "flac", label: "FLAC" },
    { value: "opus", label: "Opus" },
    { value: "pcm", label: "PCM" },
];

export function musicAudioFormat(value: string) {
    const format = normalizeAudioFormatValue(value);
    if (format === "pcm") return "pcm16";
    if (format === "aac") return "mp3";
    return format;
}

export function normalizeAudioSpeedValue(value: string) {
    const speed = Number(value);
    if (!Number.isFinite(speed)) return "1";
    return String(Math.max(0.25, Math.min(4, Number(speed.toFixed(2)))));
}

export function audioVoiceLabel(value: string) {
    const voice = normalizeAudioVoiceValue(value);
    return audioVoiceOptions.find((item) => item.value === voice)?.label || voice;
}

export function audioFormatLabel(value: string) {
    const format = normalizeAudioFormatValue(value);
    return audioFormatOptions.find((item) => item.value === format)?.label || format;
}

export function audioSpeedLabel(value: string) {
    return `${normalizeAudioSpeedValue(value)}x`;
}

export function audioMimeType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "flac") return "audio/flac";
    if (format === "pcm") return "audio/pcm";
    return "audio/mpeg";
}
