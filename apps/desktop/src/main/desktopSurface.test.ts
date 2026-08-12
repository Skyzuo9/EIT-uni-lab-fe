import { describe, expect, it } from 'vitest'

import {
  isDesktopSurfaceNavigationAllowed,
  resolveDesktopSurfaceConfig,
  shouldPromptForRendererUnload,
  shouldQuitWhenAllDesktopWindowsClose
} from './desktopSurface'

describe('shared Electron desktop surface', () => {
  it('preserves Kernel Web as the default desktop renderer', () => {
    expect(resolveDesktopSurfaceConfig({
      environment: {},
      isDevelopment: true
    })).toEqual({
      kind: 'kernel',
      title: 'Lab PC Client',
      rendererUrl: null,
      openDevTools: true,
      window: {
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600
      }
    })
  })

  it('loads Workbench in the existing shell without opening devtools by default', () => {
    expect(resolveDesktopSurfaceConfig({
      environment: {
        UNILAB_DESKTOP_SURFACE: 'workbench',
        UNILAB_DESKTOP_RENDERER_URL:
          'http://127.0.0.1:3110/?workflowUuid=workflow-1#/workspace'
      },
      isDevelopment: true
    })).toMatchObject({
      kind: 'workbench',
      title: 'UniLab Authoring Workbench',
      rendererUrl:
        'http://127.0.0.1:3110/?workflowUuid=workflow-1#/workspace',
      openDevTools: false,
      window: {
        width: 1600,
        height: 1000,
        minWidth: 1024,
        minHeight: 720
      }
    })
  })

  it('allows explicit Workbench devtools on the trusted local renderer', () => {
    expect(resolveDesktopSurfaceConfig({
      environment: {
        UNILAB_DESKTOP_SURFACE: 'workbench',
        UNILAB_DESKTOP_RENDERER_URL: 'http://127.0.0.1:3110/',
        UNILAB_DESKTOP_OPEN_DEVTOOLS: '1'
      },
      isDevelopment: false
    }).openDevTools).toBe(true)
  })

  it('accepts only the launcher-owned welcome file renderer', () => {
    const welcomeUrl = 'file:///Applications/UniLab.app/Contents/Resources/welcome.html'
    const config = resolveDesktopSurfaceConfig({
      environment: {
        UNILAB_DESKTOP_SURFACE: 'workbench',
        UNILAB_DESKTOP_RENDERER_URL: welcomeUrl,
        UNILAB_DESKTOP_WELCOME_URL: welcomeUrl
      },
      isDevelopment: false
    })

    expect(config.rendererUrl).toBe(welcomeUrl)
    expect(isDesktopSurfaceNavigationAllowed(config, welcomeUrl)).toBe(true)
    expect(isDesktopSurfaceNavigationAllowed(
      config,
      'file:///tmp/welcome.html'
    )).toBe(false)
  })

  it.each([
    {},
    { UNILAB_DESKTOP_RENDERER_URL: 'https://127.0.0.1:3110/' },
    { UNILAB_DESKTOP_RENDERER_URL: 'http://localhost:3110/' },
    { UNILAB_DESKTOP_RENDERER_URL: 'http://example.com/' },
    { UNILAB_DESKTOP_RENDERER_URL: 'http://user:secret@127.0.0.1:3110/' }
  ])('rejects an absent or untrusted Workbench renderer: %o', (environment) => {
    expect(() => resolveDesktopSurfaceConfig({
      environment: {
        UNILAB_DESKTOP_SURFACE: 'workbench',
        ...environment
      },
      isDevelopment: true
    })).toThrow()
  })

  it('rejects renderer overrides outside Workbench mode', () => {
    expect(() => resolveDesktopSurfaceConfig({
      environment: {
        UNILAB_DESKTOP_RENDERER_URL: 'http://127.0.0.1:3110/'
      },
      isDevelopment: true
    })).toThrow('只能用于 workbench')
  })

  it('keeps the privileged Workbench renderer on its original origin', () => {
    const config = resolveDesktopSurfaceConfig({
      environment: {
        UNILAB_DESKTOP_SURFACE: 'workbench',
        UNILAB_DESKTOP_RENDERER_URL: 'http://127.0.0.1:3110/'
      },
      isDevelopment: true
    })

    expect(isDesktopSurfaceNavigationAllowed(
      config,
      'http://127.0.0.1:3110/editor#/workspace'
    )).toBe(true)
    expect(isDesktopSurfaceNavigationAllowed(
      config,
      'http://127.0.0.1:3111/'
    )).toBe(false)
    expect(isDesktopSurfaceNavigationAllowed(
      config,
      'https://example.com/'
    )).toBe(false)
    expect(isDesktopSurfaceNavigationAllowed(config, 'not a URL'))
      .toBe(false)
  })

  it('does not reopen a stale macOS Workbench plugin session', () => {
    expect(shouldQuitWhenAllDesktopWindowsClose('darwin', 'workbench'))
      .toBe(true)
    expect(shouldQuitWhenAllDesktopWindowsClose('darwin', 'kernel'))
      .toBe(false)
    expect(shouldQuitWhenAllDesktopWindowsClose('win32', 'kernel'))
      .toBe(true)
  })

  it('prompts Workbench unload only for explicitly dirty workflow authoring', () => {
    expect(shouldPromptForRendererUnload('workbench', false)).toBe(false)
    expect(shouldPromptForRendererUnload('workbench', true)).toBe(true)
    expect(shouldPromptForRendererUnload('kernel', false)).toBe(true)
  })
})
