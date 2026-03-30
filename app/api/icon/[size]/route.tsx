import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: raw } = await params
  const size = (raw ?? '').startsWith('512') ? 512 : 192

  const res = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#16a34a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: size >= 512 ? 64 : 24,
          fontSize: size * 0.45,
          fontWeight: 700,
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        E
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': 'image/png',
      },
    }
  )
  return res
}
