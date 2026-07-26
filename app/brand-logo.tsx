import Image from "next/image";

export function BrandLogo({ className }: { className: string }) {
  return (
    <Image
      className={className}
      src="/icon.svg"
      alt=""
      width={34}
      height={34}
      aria-hidden="true"
    />
  );
}
