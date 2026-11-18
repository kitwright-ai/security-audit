"use client";

export function Flag({ name }: { name: string }) {
  return <span>{process.env[`NEXT_PUBLIC_FLAG_${name}`]}</span>;
}
