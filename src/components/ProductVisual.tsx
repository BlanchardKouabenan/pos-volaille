import { useState } from 'react'
import { decodeLibImage, isLibImage } from '@/lib/imageLibrary'

interface ProductVisualProps {
  imageUrl?: string
  categoryEmoji?: string
  categoryColor?: string
  className?: string
  emojiSize?: string
}

// Rendu unique pour les 3 cas : lib://, file://, aucune image
export default function ProductVisual({
  imageUrl,
  categoryEmoji = '📦',
  categoryColor = '#3b82f6',
  className = 'w-full h-full',
  emojiSize = 'text-4xl'
}: ProductVisualProps) {
  const [imgError, setImgError] = useState(false)

  if (imageUrl && isLibImage(imageUrl)) {
    const lib = decodeLibImage(imageUrl)
    if (lib) {
      return (
        <div
          className={`${className} flex items-center justify-center`}
          style={{
            background: `linear-gradient(135deg, ${lib.couleur}28 0%, ${lib.couleur}10 100%)`
          }}
        >
          <span className={emojiSize} style={{ lineHeight: 1 }}>{lib.emoji}</span>
        </div>
      )
    }
  }

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`${className} object-cover`}
        onError={() => setImgError(true)}
      />
    )
  }

  // Fallback : icône catégorie
  return (
    <div
      className={`${className} flex items-center justify-center`}
      style={{ backgroundColor: categoryColor + '18' }}
    >
      <span className={emojiSize} style={{ lineHeight: 1 }}>{categoryEmoji}</span>
    </div>
  )
}
