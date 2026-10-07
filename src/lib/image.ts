function readImage(file: File): Promise<{ img: HTMLImageElement; done: () => void }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve({ img: i, done: () => URL.revokeObjectURL(url) })
    i.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    i.src = url
  })
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/webp', 0.85),
  )
}

/** Reduce una imagen a un cuadrado de "size" px en formato WebP */
export async function resizeImage(file: File, size: number): Promise<Blob> {
  const { img, done } = await readImage(file)
  try {
    const side = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
    return await toWebp(canvas)
  } finally {
    done()
  }
}

/** Reduce una imagen para que su lado mayor mida como mucho "max" px, sin recortarla */
export async function shrinkImage(file: File, max: number): Promise<Blob> {
  const { img, done } = await readImage(file)
  try {
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await toWebp(canvas)
  } finally {
    done()
  }
}
