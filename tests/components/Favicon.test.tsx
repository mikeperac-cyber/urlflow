import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Favicon } from '../../src/components/Favicon';

const { readFavicon } = vi.hoisted(() => ({ readFavicon: vi.fn() }));
vi.mock('../../src/lib/api', () => ({ api: { readFavicon } }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('Favicon', () => {
  it('fallsBackWhenCachedIconCannotBeRead', async () => {
    readFavicon.mockResolvedValue(null);
    const { container } = render(<Favicon url="https://example.com/article" faviconKey={'a'.repeat(64)} />);
    await act(async () => {});
    expect(screen.getByText('EX')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('fallsBackWhenCachedIconRejectsOrIsNotAnImageDataUrl', async () => {
    readFavicon.mockRejectedValueOnce(new Error('missing')).mockResolvedValueOnce('https://remote.test/icon.png');
    const { container, rerender } = render(<Favicon url="https://example.com" faviconKey="first" />);
    await act(async () => {});
    expect(screen.getByText('EX')).toBeTruthy();
    rerender(<Favicon url="https://second.test" faviconKey="second" />);
    await act(async () => {});
    expect(screen.getByText('SE')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('fallsBackWhenTheImageCannotDecode', async () => {
    readFavicon.mockResolvedValue('data:image/png;base64,aWNvbg==');
    const { container } = render(<Favicon url="https://example.com" faviconKey="first" />);
    await act(async () => {});
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,aWNvbg==');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('EX')).toBeTruthy();
  });

  it('ignoresAReadForThePreviousKey', async () => {
    let resolveOld!: (value: string) => void;
    readFavicon.mockReturnValueOnce(new Promise<string>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce('data:image/gif;base64,bmV3');
    const { container, rerender } = render(<Favicon url="https://old.test" faviconKey="old" />);
    rerender(<Favicon url="https://new.test" faviconKey="new" />);
    await act(async () => {});
    await act(async () => { resolveOld('data:image/png;base64,b2xk'); });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/gif;base64,bmV3');
    rerender(<Favicon url="https://new.test" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('NE')).toBeTruthy();
  });
});
