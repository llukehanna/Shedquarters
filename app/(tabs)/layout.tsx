import { TabBar } from '@/components/ui/TabBar'
import { SportProvider } from '@/components/SportContext'
import { currentSport } from '@/lib/sport-cookie'
import { getLiveSports } from '@/lib/session'

export default async function TabsLayout({ children }: LayoutProps<'/'>) {
  // Read once here for every client component under the tabs that needs them:
  // the pill in the top bar shows which sport this phone is on and whether the
  // other one has a night going.
  const [sport, liveSports] = await Promise.all([currentSport(), getLiveSports()])
  return (
    <SportProvider sport={sport} liveSports={liveSports}>
      {/* Phone-width column; the bottom padding keeps content clear of the fixed tab bar. */}
      <div className="mx-auto w-full max-w-md px-4 pt-2 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <TabBar />
    </SportProvider>
  )
}
