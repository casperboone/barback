import { cn } from "@/lib/utils";

// A Google profile photo, or the first letter when there's none (yet).
export function UserAvatar({
  name,
  email,
  image,
  className,
}: {
  name: string | null;
  email: string;
  image: string | null;
  className?: string;
}) {
  const label = name ?? email;
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground uppercase",
        className,
      )}
    >
      {image ? (
        // Google's photos refuse requests that carry another site as referrer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        label.charAt(0)
      )}
    </span>
  );
}
