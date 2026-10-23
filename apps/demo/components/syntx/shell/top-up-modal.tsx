"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { formatRub } from "./syntx-format";
export const TopUpModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const user = useSyntxStore((state) => state.user);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Баланс студии</DialogTitle>
          <DialogDescription>
            Для пополнения или изменения доступа обратитесь к администратору
            сервиса. Если фактическая стоимость RouterAI превысила резерв,
            отрицательный доступный баланс показывает сумму, которую нужно
            пополнить.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 py-4 text-sm">
          <div className="flex justify-between">
            <dt>Общий баланс</dt>
            <dd>{formatRub(Number(user?.balanceRub ?? 0))}</dd>
          </div>
          <div className="flex justify-between">
            <dt>В резерве заданий</dt>
            <dd>{formatRub(Number(user?.reservedRub ?? 0))}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Доступно</dt>
            <dd>{formatRub(Number(user?.availableRub ?? 0))}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Перед запуском показывается оценка и резерв. После завершения
          списывается фактическая стоимость RouterAI; если она не вернула
          стоимость, списание помечается как оценочное. До погашения
          отрицательного баланса новые генерации недоступны.
        </p>
      </DialogContent>
    </Dialog>
  );
};
