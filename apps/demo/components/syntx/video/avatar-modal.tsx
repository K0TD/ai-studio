"use client";
import { X, Upload, Trash2, Check, User, Loader2 } from "lucide-react";
import React, { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";

import type { AvatarProfile } from "@/lib/store/k0td-store";
interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  avatarToEdit: AvatarProfile | null;
  onSave: (avatarData: {
    name: string;
    role: string;
    url: string;
    voiceId: string;
  }) => void;
  onDelete?: (id: string) => void;
}
const HEYGEN_VOICE_OPTIONS = [
  {
    desc: "Чистый женский дикторский голос для русской и мультиязычной речи",
    id: "80441555167a467e967ab9487d844a30",
    name: "Kore (Женский, RU / Multi)",
  },
  {
    desc: "Уверенный мужской дикторский тембр для презентаций на русском",
    id: "3097f9a8fd3b4340b6bbe913177b378f",
    name: "Orus (Мужской, RU / Multi)",
  },
  {
    desc: "Естественный американский женский голос",
    id: "16a09e4706f74997ba4ed05ea11470f6",
    name: "Cassidy (Женский, English)",
  },
  {
    desc: "Профессиональный дикторский мужской тембр",
    id: "6be73833ef9a4eb0aeee399b8fe9d62b",
    name: "Andrew (Мужской, English)",
  },
];
const PRESET_PORTRAITS = [
  {
    title: "Бизнес Леди",
    url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
  },
  {
    title: "IT Эксперт",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
  },
  {
    title: "Ведущая",
    url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80",
  },
  {
    title: "Спикер",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
  },
  {
    title: "Менеджер",
    url: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80",
  },
  {
    title: "Креатор",
    url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80",
  },
];
export const AvatarModal: React.FC<AvatarModalProps> = ({
  isOpen,
  onClose,
  avatarToEdit,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");
  const [voiceId, setVoiceId] = useState(HEYGEN_VOICE_OPTIONS[0].id);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (avatarToEdit) {
      setName(avatarToEdit.name);
      setRole(avatarToEdit.role);
      setUrl(avatarToEdit.url);
      setVoiceId(avatarToEdit.voiceId || HEYGEN_VOICE_OPTIONS[0].id);
    } else {
      setName("");
      setRole("");
      setUrl(PRESET_PORTRAITS[0].url);
      setVoiceId(HEYGEN_VOICE_OPTIONS[0].id);
    }
    setShowDeleteConfirm(false);
  }, [avatarToEdit, isOpen]);
  if (!isOpen) {
    return null;
  }
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Пожалуйста, выберите изображение (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл слишком большой. Максимальный размер 10 МБ");
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => {
        const result = z
          .string()
          .startsWith("data:image/")
          .safeParse(reader.result);
        if (!result.success) {
          setIsUploading(false);
          toast.error("Ошибка при чтении файла");
          return;
        }
        setUrl(result.data);
        if (!name) {
          const defaultName = file.name.replace(/\.[^/.]+$/u, "");
          setName(defaultName.slice(0, 30));
        }
        setIsUploading(false);
        toast.success("Фото аватара готово к сохранению");
      },
      { once: true }
    );
    reader.addEventListener(
      "error",
      () => {
        setIsUploading(false);
        toast.error("Ошибка при чтении файла");
      },
      { once: true }
    );
    reader.readAsDataURL(file);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Введите имя аватара");
      return;
    }
    if (!url.trim()) {
      toast.error("Укажите изображение или загрузите фото аватара");
      return;
    }
    onSave({
      name: name.trim(),
      role: role.trim() || "Спикер",
      url: url.trim(),
      voiceId,
    });
    toast.success(
      avatarToEdit
        ? `Аватар «${name.trim()}» обновлен`
        : `Аватар «${name.trim()}» успешно добавлен`
    );
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans">
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card p-5 shadow-2xl">
        {/* Заголовок */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#f05138]/10 text-[#f05138]">
              <User className="size-4" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              {avatarToEdit ? "Редактировать аватара" : "Добавить аватара"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {/* Предпросмотр и загрузка фото */}
          <div className="flex items-center gap-3.5 rounded-xl border border-border/60 bg-background/50 p-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border-2 border-[#f05138]/30 shadow-xs">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt="Предпросмотр аватара"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                  <User className="size-6" />
                </div>
              )}
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <span className="font-medium text-xs text-foreground">
                Фото аватара (портрет)
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-[#f05138] hover:text-[#f05138] transition-colors"
                >
                  <Upload className="size-3" />
                  Загрузить фото
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                Рекомендуется чёткое фото лица анфас
              </span>
            </div>
          </div>

          {/* Быстрые образцы фото */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              Или выберите готовый портрет:
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {PRESET_PORTRAITS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  title={p.title}
                  onClick={() => setUrl(p.url)}
                  className={`group relative aspect-square overflow-hidden rounded-lg border transition-all ${
                    url === p.url
                      ? "border-[#f05138] ring-2 ring-[#f05138]/40 scale-105"
                      : "border-border/60 hover:border-border"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.title}
                    className="size-full object-cover transition-transform group-hover:scale-110"
                  />
                  {url === p.url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#f05138]/20">
                      <Check className="size-3.5 text-white stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Имя аватара */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="avatar-name"
              className="font-medium text-xs text-foreground"
            >
              Имя аватара <span className="text-[#f05138]">*</span>
            </label>
            <input
              id="avatar-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Елена, Михаил, Ведущий"
              maxLength={40}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#f05138] focus:outline-none"
            />
          </div>

          {/* Роль / Описание */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="avatar-role"
              className="font-medium text-xs text-foreground"
            >
              Роль или стиль
            </label>
            <input
              id="avatar-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Например: Деловой спикер, IT-эксперт, Новости"
              maxLength={40}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#f05138] focus:outline-none"
            />
          </div>

          {/* Голос озвучки по умолчанию */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="avatar-voice"
              className="font-medium text-xs text-foreground"
            >
              Голос озвучки HeyGen
            </label>
            <select
              id="avatar-voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:border-[#f05138] focus:outline-none"
            >
              {HEYGEN_VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Прямой URL изображения (опционально) */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="avatar-url"
              className="font-medium text-[11px] text-muted-foreground"
            >
              Прямая ссылка на фото (URL)
            </label>
            <input
              id="avatar-url"
              type="url"
              value={url.startsWith("data:") ? "" : url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://.../photo.jpg"
              className="w-full rounded-lg border border-border/80 bg-background/50 px-2.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-[#f05138] focus:outline-none"
            />
          </div>

          {/* Подтверждение удаления */}
          {avatarToEdit && showDeleteConfirm && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <p className="font-medium text-destructive">
                Удалить аватара «{avatarToEdit.name}»?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDelete?.(avatarToEdit.id);
                    toast.success(`Аватар «${avatarToEdit.name}» удален`);
                    onClose();
                  }}
                  className="rounded-lg bg-destructive px-2.5 py-1 font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  Да, удалить
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1 font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Кнопки действий */}
          <div className="mt-1 flex items-center justify-between pt-2 border-t border-border/60">
            {avatarToEdit && !showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              >
                <Trash2 className="size-3.5" />
                Удалить
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f05138] px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-[#e24a33] transition-all"
              >
                <Check className="size-3.5" />
                Сохранить
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
