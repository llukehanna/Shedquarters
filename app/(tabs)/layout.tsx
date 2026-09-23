import { TabBar } from '@/components/ui/TabBar'

export default function TabsLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      {/* Phone-width column; the bottom padding keeps content clear of the fixed tab bar. */}
      <div className="mx-auto w-full max-w-md px-4 pt-2 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <TabBar />
    </>
  )
}
