export async function validatePhoto(file) {
  const url = URL.createObjectURL(file)
  try {
    await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error('invalid-image'))
      image.onerror = () => reject(new Error('invalid-image'))
      image.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
