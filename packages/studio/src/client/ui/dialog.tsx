"use client";

import { IconX } from "@tabler/icons-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";

import { Button } from "./button";
import { cn } from "./cn";

const Dialog = ({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root data-slot="dialog" {...props} />
);

const DialogTrigger = ({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) => (
  <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
);

const DialogPortal = ({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) => (
  <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
);

const DialogClose = ({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) => (
  <DialogPrimitive.Close data-slot="dialog-close" {...props} />
);

const DialogOverlay = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    className={cn(
      "data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/80 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs",
      className
    )}
    data-slot="dialog-overlay"
    {...props}
  />
);

const DialogContent = ({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn(
        "data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-popover-foreground text-sm outline-none ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-md",
        className
      )}
      data-slot="dialog-content"
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild data-slot="dialog-close">
          <Button
            className="absolute top-4 right-4"
            size="icon-sm"
            variant="ghost"
          >
            <IconX />
            <span className="sr-only">Close</span>
          </Button>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
);

const DialogHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("flex flex-col gap-2", className)}
    data-slot="dialog-header"
    {...props}
  />
);

const DialogFooter = ({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    data-slot="dialog-footer"
    {...props}
  >
    {children}
    {showCloseButton && (
      <DialogPrimitive.Close asChild>
        <Button variant="outline">Close</Button>
      </DialogPrimitive.Close>
    )}
  </div>
);

const DialogTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    className={cn("font-heading font-medium text-base leading-none", className)}
    data-slot="dialog-title"
    {...props}
  />
);

const DialogDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    className={cn(
      "text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
      className
    )}
    data-slot="dialog-description"
    {...props}
  />
);

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
