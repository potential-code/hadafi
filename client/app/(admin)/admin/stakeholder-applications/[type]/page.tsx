import StakeholderApplicationsView from '@/views/admin/StakeholderApplications'

interface Props {
  params: Promise<{ type: string }>
}

export default async function Page({ params }: Props) {
  const { type } = await params
  return <StakeholderApplicationsView type={type} />
}
