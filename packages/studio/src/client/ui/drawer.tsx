"use client";

import type * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "./cn";

const Drawer = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root data-slot="drawer" {...props} />
);

const DrawerTrigger = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) => (
  <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
);

const DrawerPortal = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) => (
  <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
);

const DrawerClose = ({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) => (
  <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
);

const DrawerOverlay = ({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) => (
  <DrawerPrimitive.Overlay
    className={cn(
      "data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-black/80 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs",
      className
    )}
    data-slot="drawer-overlay"
    {...props}
  />
);

const DrawerContent = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) => (
  <DrawerPortal data-slot="drawer-portal">
    <DrawerOverlay />
    <DrawerPrimitive.Content
      className={cn(
        "group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-4 text-popover-foreground text-sm before:absolute before:inset-2 before:-z-10 before:rounded-4xl before:border before:border-border before:bg-popover data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
        className
      )}
      data-slot="drawer-content"
      {...props}
    >
      <div className="mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
);

const DrawerHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
      className
    )}
    data-slot="drawer-header"
    {...props}
  />
);

const DrawerFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    data-slot="drawer-footer"
    {...props}
  />
);

const DrawerTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) => (
  <DrawerPrimitive.Title
    className={cn(
      "font-heading font-medium text-base text-foreground",
      className
    )}
    data-slot="drawer-title"
    {...props}
  />
);

const DrawerDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) => (
  <DrawerPrimitive.Description
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="drawer-description"
    {...props}
  />
);

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
