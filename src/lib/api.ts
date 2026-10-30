import type { FlowApi } from '../../shared/types';
import { browserApi } from './browserApi';

export const api: FlowApi = typeof window !== 'undefined' && window.flow ? window.flow : browserApi;

export const isDesktop = typeof window !== 'undefined' && Boolean(window.flow);

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Something went wrong');
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
  return cleaned || 'Something went wrong';
}
