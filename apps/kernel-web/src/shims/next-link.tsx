import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode
} from 'react'

type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string }
  children?: ReactNode
}

/** Vite equivalent of the small next/link surface used by Pascal Editor. */
const NextLink = forwardRef<HTMLAnchorElement, NextLinkProps>(
  ({ href, ...props }, ref) => (
    <a
      {...props}
      ref={ref}
      href={typeof href === 'string' ? href : (href.pathname ?? '#')}
    />
  )
)

NextLink.displayName = 'ViteNextLinkShim'

export default NextLink
