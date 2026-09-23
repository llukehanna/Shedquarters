import { GateForm } from '@/components/GateForm'

export default async function Gate({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite } = await searchParams
  return <GateForm staleInvite={invite === 'stale'} />
}
