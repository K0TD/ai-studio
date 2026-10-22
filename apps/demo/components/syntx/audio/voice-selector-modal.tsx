"use client";
import { Check, Play, Search, Star, Volume2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { ELEVENLABS_VOICES } from "@/lib/routerai/models-catalog";
import { useSyntxStore } from "@/lib/store/syntx-store";
interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}
export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { audioSettings, updateAudioSettings } = useSyntxStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedAge, setSelectedAge] = useState<string>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const previewVoice = ELEVENLABS_VOICES.find(
    (voice) => voice.id === playingVoiceId
  );
  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) {
      return;
    }
    if (!isOpen || !playingVoiceId) {
      audio.pause();
      return;
    }
    audio.currentTime = 0;
    const playPreview = async () => {
      try {
        await audio.play();
      } catch {
        setPlayingVoiceId(null);
      }
    };
    playPreview();
  }, [isOpen, playingVoiceId]);
  if (!isOpen) {
    return null;
  }
  const filteredVoices = ELEVENLABS_VOICES.filter((voice) => {
    const matchesSearch =
      voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.accent.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGender =
      selectedGender === "all" || voice.gender === selectedGender;
    const matchesAge = selectedAge === "all" || voice.age === selectedAge;
    return matchesSearch && matchesGender && matchesAge;
  });
  const handleSelectVoice = (voiceId: string) => {
    updateAudioSettings({ voiceId });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      {/* Voice previews have no supplied transcript. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        className="hidden"
        onEnded={() => setPlayingVoiceId(null)}
        ref={previewAudioRef}
        src={previewVoice?.previewUrl}
      />
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="font-semibold text-foreground text-base">
              Каталог голосов ElevenLabs
            </h3>
            <p className="text-muted-foreground text-xs">
              Выберите дикторский голос или персонажа для озвучивания текста
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Search & Filters Bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Фильтр: Имя, акцент или стиль..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-1.5 pr-3 pl-9 text-xs focus:border-[#f05138] focus:outline-none"
            />
          </div>

          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="all">Любой пол</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
          </select>

          <select
            value={selectedAge}
            onChange={(e) => setSelectedAge(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="all">Любой возраст</option>
            <option value="Young">Молодой</option>
            <option value="Adult">Взрослый</option>
            <option value="Middle-Aged">Зрелый</option>
          </select>
        </div>

        {/* Voice List */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-3">
            {filteredVoices.map((voice) => {
              const isSelected = audioSettings.voiceId === voice.id;
              const isPlaying = playingVoiceId === voice.id;
              return (
                <div
                  key={voice.id}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 transition-all ${
                    isSelected
                      ? "border-[#f05138] bg-[#f05138]/5 shadow-xs dark:bg-[#f05138]/10"
                      : "border-border/70 bg-card hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayingVoiceId(isPlaying ? null : voice.id);
                        }}
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 ${
                          isPlaying
                            ? "bg-[#f05138] text-white"
                            : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                        title="Прослушать сэмпл"
                      >
                        {isPlaying ? (
                          <Volume2 className="size-4 animate-pulse" />
                        ) : (
                          <Play className="ml-0.5 size-3.5 fill-current" />
                        )}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectVoice(voice.id)}
                            aria-pressed={isSelected}
                            className="font-semibold text-foreground text-sm underline-offset-4 hover:underline"
                          >
                            {voice.name}
                          </button>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {voice.accent}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {voice.age}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Star className="size-4 text-muted-foreground/40 hover:text-amber-500" />
                      {isSelected && (
                        <div className="flex size-5 items-center justify-center rounded-full bg-[#f05138] text-white">
                          <Check className="size-3" />
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-10.5">
                    {voice.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3.5 bg-muted/20">
          <span className="text-muted-foreground text-xs">
            Выбран голос:{" "}
            <strong className="text-foreground">
              {ELEVENLABS_VOICES.find((v) => v.id === audioSettings.voiceId)
                ?.name || audioSettings.voiceId}
            </strong>
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-[#f05138] px-5 py-2 font-medium text-white text-xs shadow-md transition-all hover:bg-[#e24a33] active:scale-95"
          >
            Выбрать голос
          </button>
        </div>
      </div>
    </div>
  );
};
