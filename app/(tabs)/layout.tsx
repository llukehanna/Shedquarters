import { TabBar } from '@/components/ui/TabBar'
import { Sidebar } from '@/components/ui/Sidebar'
import { SportProvider } from '@/components/SportContext'
import { SwipeTabs } from '@/components/SwipeTabs'
import { currentSport } from '@/lib/sport-cookie'
import { getLiveSports } from '@/lib/session'

export default async function TabsLayout({ children }: LayoutProps<'/'>) {
  // Read once here for every client component under the tabs that needs them:
  // the pill in the top bar shows which sport this phone is on and whether the
  // other one has a night going.
  const [sport, liveSports] = await Promise.all([currentSport(), getLiveSports()])
  return (
    <SportProvider sport={sport} liveSports={liveSports}>
      {/* Desktop only: the glow the rail's glass blurs. */}
      <div aria-hidden="true" className="ambient hidden lg:block" />
      <Sidebar />
      {/* A phone-width column with room at the bottom for the floating tab bar.
          From lg up the rail floats on the left and the content fills the
          width beside it, left-aligned and capped for ultrawide screens.
          Swiping sideways moves between tabs on a phone. */}
      <SwipeTabs className="mx-auto w-full max-w-md px-4 pt-2 pb-[calc(var(--tabbar-top)+1rem)] lg:mx-0 lg:ml-[328px] lg:w-auto lg:max-w-[1200px] lg:pt-8 lg:pr-12 lg:pb-16 lg:pl-0">
        {children}
      </SwipeTabs>
      <TabBar />
    </SportProvider>
  )
}
