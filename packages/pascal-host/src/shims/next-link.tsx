import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode
} from 'react'

type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string }
  children?: ReactNode
}

/** Browser/Electron facade for the small next/link surface Pascal consumes. */
const NextLink = forwardRef<HTMLAnchorElement, NextLinkProps>(
  ({ href, ...props }, ref) => (
    <a
      {...props}
      ref={ref}
      href={typeof href === 'string' ? href : (href.pathname ?? '#')}
    />
  )
)

NextLink.displayName = 'UniLabNextLinkShim'

export default NextLink
