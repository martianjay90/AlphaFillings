import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Tailwind CSS 클래스 병합 유틸리티
 * Shadcn UI 호환
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
