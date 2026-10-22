"use client";
import {
  Download,
  Maximize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import React, { useRef, useState } from "react";
interface VideoPlayerProps {
  src: string;
  poster?: string;
  durationSeconds?: number;
  resolution?: string;
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
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  durationSeconds,
  resolution = "1080p",
  className = "",
  onDownload,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [isMuted, setIsMuted] = useState(false);
  const togglePlay = async () => {
    if (!videoRef.current) {
      return;
    }
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };
  const toggleMute = () => {
    if (!videoRef.current) {
      return;
    }
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (!duration && videoRef.current.duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number.parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };
  const handleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-black/90 shadow-2xl transition-all ${className}`}
    >
      {/* Generated video has no provider transcript; captions cannot be fabricated. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="h-full max-h-[540px] w-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        playsInline
      />

      {/* Center Big Play Button Overlay */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-all hover:bg-black/30"
          aria-label="Воспроизвести"
        >
          <div className="flex size-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-transform group-hover:scale-110">
            <div className="flex size-12 items-center justify-center rounded-full bg-white text-black shadow-lg">
              <Play className="ml-1 size-6 fill-current" />
            </div>
          </div>
        </button>
      )}

      {/* Badges in top-right */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 transition-opacity group-hover:opacity-100">
        <span className="rounded-md bg-black/60 px-2 py-0.5 font-medium text-white text-xs backdrop-blur-md">
          {resolution}
        </span>
        {durationSeconds && (
          <span className="rounded-md bg-black/60 px-2 py-0.5 font-medium text-white text-xs backdrop-blur-md">
            {durationSeconds.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Bottom Control Bar */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Progress Bar */}
        <input
          aria-label="Позиция воспроизведения"
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/30 accent-[#f05138]"
        />

        <div className="mt-2 flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="rounded p-1 hover:bg-white/20"
              title={isPlaying ? "Пауза" : "Воспроизвести"}
            >
              {isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </button>
            <button
              onClick={toggleMute}
              className="rounded p-1 hover:bg-white/20"
              title={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
            <span className="font-mono text-[11px] text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                onClick={onDownload}
                className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/20"
                title="Скачать видео MP4"
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">Скачать</span>
              </button>
            )}
            <button
              onClick={handleFullscreen}
              className="rounded p-1 hover:bg-white/20"
              title="На весь экран"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
