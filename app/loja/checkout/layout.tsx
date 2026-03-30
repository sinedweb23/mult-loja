/** Checkout usa searchParams e dados do cliente; não pode ser pré-renderizado estaticamente. */
export const dynamic = 'force-dynamic'

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
