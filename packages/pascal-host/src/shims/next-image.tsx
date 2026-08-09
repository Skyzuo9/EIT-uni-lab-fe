import {
  forwardRef,
  type ImgHTMLAttributes
} from 'react'

type StaticImageData = {
  src: string
  height?: number
  width?: number
}

type NextImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'height' | 'src' | 'width'
> & {
  src: string | StaticImageData
  alt: string
  fill?: boolean
  height?: number | `${number}`
  priority?: boolean
  unoptimized?: boolean
  width?: number | `${number}`
}

/** Browser/Electron facade for the small next/image surface Pascal consumes. */
const NextImage = forwardRef<HTMLImageElement, NextImageProps>(
  (
    {
      src,
      fill,
      height,
      priority,
      style,
      unoptimized: _unoptimized,
      width,
      ...props
    },
    ref
  ) => (
    <img
      {...props}
      ref={ref}
      src={typeof src === 'string' ? src : src.src}
      height={fill ? undefined : height}
      width={fill ? undefined : width}
      loading={priority ? 'eager' : props.loading}
      style={fill
        ? {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            ...style
          }
        : style}
    />
  )
)

NextImage.displayName = 'UniLabNextImageShim'

export default NextImage
