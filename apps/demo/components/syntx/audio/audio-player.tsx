"use client";
import { Download, Pause, Play, Volume2, VolumeX } from "lucide-react";
import React, { useRef, useState } from "react";
interface AudioPlayerProps {
  src: string;
  title?: string;
  subtitle?: string;
  className?: string;
  onDownload?: () => void;
}
const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
};
export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title,
  subtitle,
  className = "",
  onDownload,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const togglePlay = async () => {
    if (!audioRef.current) {
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };
  const toggleMute = () => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!duration && audioRef.current.duration) {
        setDuration(audioRef.current.duration);
      }
    }
  };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number.parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border border-black/5 bg-black/5 p-3.5 backdrop-blur-md dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      {/* Generated audio has no provider transcript; captions cannot be fabricated. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Header Info */}
      {(title || subtitle) && (
        <div className="flex items-center justify-between text-xs">
          <div>
            {title && (
              <div className="font-semibold text-foreground">{title}</div>
            )}
            {subtitle && (
              <div className="text-[11px] text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}

      {/* Controls & Scrubber */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f05138] text-white shadow-md transition-transform hover:scale-105 active:scale-95"
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {isPlaying ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="ml-0.5 size-4 fill-current" />
          )}
        </button>

        {/* Timeline Scrubber */}
        <input
          aria-label="Позиция воспроизведения"
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-black/10 accent-[#f05138] dark:bg-white/20"
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleMute}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={isMuted ? "Включить звук" : "Выключить звук"}
          >
            {isMuted ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Скачать аудио"
            >
              <Download className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
