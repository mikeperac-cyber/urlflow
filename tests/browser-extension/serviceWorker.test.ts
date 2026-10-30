import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('browser context-menu capture', () => {
  let installed: () => void;
  let clicked: (info: { menuItemId: string; linkUrl?: string }, tab?: { url?: string; title?: string }) => void;
  let chromeMock: any;

  beforeEach(async () => {
    vi.resetModules();
    chromeMock = {
      runtime: { onInstalled: { addListener: vi.fn((handler) => { installed = handler; }) } },
      contextMenus: {
        create: vi.fn(),
        onClicked: { addListener: vi.fn((handler) => { clicked = handler; }) },
      },
      tabs: { create: vi.fn() },
    };
    vi.stubGlobal('chrome', chromeMock);
    await import('../../browser-extension/service-worker.js');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('registersPageAndLinkMenusWithoutOpeningCapture', () => {
    installed();
    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith({
      id: 'urlflow-capture-page', title: 'Save page to URL Flow', contexts: ['page'],
    });
    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith({
      id: 'urlflow-capture-link', title: 'Save link to URL Flow', contexts: ['link'],
    });
    expect(chromeMock.contextMenus.create).toHaveBeenCalledTimes(2);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it('prefersLinkTargetToTabUrl', () => {
    clicked({ menuItemId: 'urlflow-capture-link', linkUrl: 'https://target.test/?a=1&b=2#part' },
      { url: 'https://active.test/', title: 'Active page title' });
    const capture = new URL(chromeMock.tabs.create.mock.calls[0][0].url);
    expect(capture.searchParams.get('url')).toBe('https://target.test/?a=1&b=2#part');
    expect(capture.searchParams.has('title')).toBe(false);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });

  it('capturesCurrentPageUrlAndTitleAfterClick', () => {
    clicked({ menuItemId: 'urlflow-capture-page' }, { url: 'https://active.test/', title: 'Current title' });
    const capture = new URL(chromeMock.tabs.create.mock.calls[0][0].url);
    expect(capture.searchParams.get('url')).toBe('https://active.test/');
    expect(capture.searchParams.get('title')).toBe('Current title');
  });

  it('ignoresUnknownMenusAndMissingTargets', () => {
    clicked({ menuItemId: 'other' }, { url: 'https://active.test/' });
    clicked({ menuItemId: 'urlflow-capture-page' });
    clicked({ menuItemId: 'urlflow-capture-link' }, { url: 'https://active.test/' });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });
});
