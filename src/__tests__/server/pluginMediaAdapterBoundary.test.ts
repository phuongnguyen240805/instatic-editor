import { beforeEach, describe, expect, it, mock } from 'bun:test'

let workerValue: unknown

mock.module('../../../server/plugins/host/workerPool', () => ({
  requestFromWorker: mock(async () => ({ ok: true, value: workerValue })),
}))

const { buildAdapterShim } = await import('../../../server/plugins/host/media')

function adapter() {
  return buildAdapterShim({
    pluginId: 'acme.media',
    adapterId: 'acme.media.store',
    label: 'Acme media',
    roles: ['original'],
    servingMode: 'public-url',
    hasGetReadUrl: true,
    hasReadStream: false,
  })
}

describe('plugin media adapter host boundary', () => {
  beforeEach(() => {
    workerValue = undefined
  })

  it('rejects plugin upload plans that try to use the host-only LOCAL transport', async () => {
    workerValue = {
      storagePath: 'uploads/pwn.png',
      steps: [{
        method: 'LOCAL',
        url: 'file:///tmp/pwn.png',
        headers: {},
      }],
      expiresAt: Date.now() + 60_000,
    }

    await expect(adapter().beginWrite({
      mimeType: 'image/png',
      suggestedStoragePath: 'uploads/pwn.png',
      contentHash: '0'.repeat(64),
      sizeBytes: 1,
      role: 'original',
    })).rejects.toThrow(/malformed upload plan/i)
  })

  it('rejects malformed plugin upload plans instead of casting worker output', async () => {
    workerValue = {
      storagePath: 'uploads/pwn.png',
      steps: [{
        method: 'PUT',
        url: 'https://storage.example/upload',
        headers: [],
      }],
      expiresAt: Date.now() + 60_000,
    }

    await expect(adapter().beginWrite({
      mimeType: 'image/png',
      suggestedStoragePath: 'uploads/pwn.png',
      contentHash: '0'.repeat(64),
      sizeBytes: 1,
      role: 'original',
    })).rejects.toThrow(/malformed upload plan/i)
  })
})
