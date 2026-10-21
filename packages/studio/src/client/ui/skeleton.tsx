import { cn } from "./cn";

const Skeleton = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("animate-pulse rounded-xl bg-muted", className)}
    data-slot="skeleton"
    {...props}
  />
);

export { Skeleton };
